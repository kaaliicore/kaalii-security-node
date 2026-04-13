"use strict";

const { createSecurityCheckMiddleware } = require("./src/middleware/securityCheckMiddleware");
const { CheckService } = require("./src/services/CheckService");
const { createNextMiddleware } = require("./src/adapters/next");
const { KaaliiSecurityMiddleware } = require("./src/adapters/nest");
const { KaaliiSecurityModule } = require("./src/adapters/nestModule");
const config = require("./src/config");

module.exports = {
  CheckService,
  KaaliiSecurityMiddleware,
  KaaliiSecurityModule,
  config,
  createNextMiddleware,
  createSecurityCheckMiddleware
};
