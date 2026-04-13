"use strict";

class KaaliiSecurityModule {
  static register(options = {}) {
    return {
      module: KaaliiSecurityModule,
      providers: [{ provide: "KAALII_SECURITY_OPTIONS", useValue: options }],
      exports: ["KAALII_SECURITY_OPTIONS"]
    };
  }
}

module.exports = { KaaliiSecurityModule };
