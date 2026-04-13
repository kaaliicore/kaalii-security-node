"use strict";

const { createSecurityCheckMiddleware } = require("../middleware/securityCheckMiddleware");

function createNextMiddleware(options = {}) {
  const middleware = createSecurityCheckMiddleware(options);

  return async function nextMiddleware(req, res, next) {
    return middleware(req, res, next);
  };
}

module.exports = {
  createNextMiddleware
};
