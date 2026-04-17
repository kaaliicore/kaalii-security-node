"use strict";

const { createSecurityCheckMiddleware } = require("../middleware/securityCheckMiddleware");

class KaaliiSecurityMiddleware {
  constructor(options = {}) {
    this.middleware = createSecurityCheckMiddleware(options);
  }

  use(req, res, next) {
    return this.middleware(req, res, next);
  }
}

module.exports = {
  KaaliiSecurityMiddleware
};
