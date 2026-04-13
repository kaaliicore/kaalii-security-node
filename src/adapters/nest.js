"use strict";

let NestMiddleware;

try {
  ({ NestMiddleware } = require("@nestjs/common"));
} catch (_error) {
  NestMiddleware = class {};
}

const { createSecurityCheckMiddleware } = require("../middleware/securityCheckMiddleware");

class KaaliiSecurityMiddleware extends NestMiddleware {
  constructor(options = {}) {
    super();
    this.middleware = createSecurityCheckMiddleware(options);
  }

  use(req, res, next) {
    return this.middleware(req, res, next);
  }
}

module.exports = {
  KaaliiSecurityMiddleware
};
