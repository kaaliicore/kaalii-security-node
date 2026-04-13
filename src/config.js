"use strict";

const path = require("path");

module.exports = {
  BASE_URL: "aHR0cHM6Ly9rYWFsaWkub3llY29kZXJzLmNvbQ==",
  DEFAULT_BLOCK_PAGE_CONTENT:
    "QWNjZXNzIERlbmllZC4gVGhpcyBkb21haW4gaXMgbm90IGFsbG93ZWQu",
  TECH_STACK: "nodejs",
  BASE_VERSION: "1.0.0",
  CURRENT_VERSION: "1.0.0",
  DEFAULT_KEY_FILE_PATH: path.join(process.cwd(), "data", "a2FhbGlp.key"),
  DEFAULT_ENCRYPTED_KEY_FILE_PATH: path.join(process.cwd(), "data", "key.json.enc"),
  DEFAULT_CACHE_DIR: path.join(process.cwd(), "data",  ".core-files-cache")
};
