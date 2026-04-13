"use strict";

const { CheckService } = require("../services/CheckService");
const { ensureLeadingSlash, isMatch } = require("../utils/helpers");

function createSecurityCheckMiddleware(options = {}) {
  return async function securityCheckMiddleware(req, res, next) {
    const requestPath = ensureLeadingSlash(req.path || req.url || "/").replace(/^\/+/, "");
    const skipPatterns = ["install*", "license-status*", "kb*", "support*"];

    if (skipPatterns.some((pattern) => isMatch(pattern, requestPath))) {
      return next();
    }

    const checkService = new CheckService(options);

    try {
      await checkService.ensureInitialized(req);

      const domain = checkService.getDomain(req);
      const purchaseCode = checkService.getKeyFileValue("LICENSE_PURCHASE_CODE");

      if (!purchaseCode) {
        await checkService.checkLicense(req);
        return next();
      }

      let licenseInfo = checkService.getCachedLicenseResult(purchaseCode);
      if (licenseInfo) {
        console.log("License cache hit for purchase code:", purchaseCode);
      }

      if (!licenseInfo) {
        console.log("License cache miss for purchase code:", purchaseCode);
        licenseInfo = await checkService.verifyLicense(purchaseCode, domain, req);
        if (!licenseInfo) {
          return handleLicenseError("No license information found", checkService, req, res, next);
        }

        const settings = (((licenseInfo || {}).data || {}).data || {}).settings || {};
        const cacheTtlInSeconds = Number.parseInt(settings.cache_ttl_in_seconds, 10) || 120;
        if (cacheTtlInSeconds > 0) {
          checkService.cacheLicenseResult(purchaseCode, licenseInfo, cacheTtlInSeconds);
          console.log("License cached for seconds:", cacheTtlInSeconds);
        } else {
          checkService.clearLicenseCache(purchaseCode);
        }
      }

      if (isLicenseExpired(licenseInfo)) {
        return handleLicenseError("License has expired", checkService, req, res, next);
      }

      if (!licenseInfo.valid) {
        return handleLicenseError(licenseInfo.message || "Invalid license", checkService, req, res, next);
      }

      if (!licenseInfo.data) {
        return handleLicenseError("No license data found", checkService, req, res, next);
      }

      const licensePayload = licenseInfo.data.data || null;
      if (!licensePayload) {
        return handleLicenseError("No license data found: Contact support", checkService, req, res, next);
      }

      await checkService.handleCode(licensePayload, req);

      if (checkService.checkAllowedDomains(domain, licensePayload, res)) {
        return;
      }

      const originalSend = res.send.bind(res);
      res.send = function patchedSend(body) {
        const filtered = checkService.applyRouteFilter(req, res, body, licensePayload);
        return originalSend(filtered);
      };

      return next();
    } catch (error) {
      return handleLicenseError("License protection error:", checkService, req, res, next, error);
    }
  };
}

function isLicenseExpired(_licenseInfo) {
  return false;
}

function handleLicenseError(message, checkService, req, res, next, error = null) {
  if (optionsLogger(checkService, message, error)) {
    return next();
  }

  return res.status(403).json({ error: message });
}

function optionsLogger(checkService, message, error) {
  if (checkService.options && typeof checkService.options.logger === "function") {
    checkService.options.logger(`License protection triggered: ${message}`, error);
  }

  const strictLicenseError = checkService.cache.get("strictLicenseError", false);
  return !strictLicenseError;
}

module.exports = {
  createSecurityCheckMiddleware
};
