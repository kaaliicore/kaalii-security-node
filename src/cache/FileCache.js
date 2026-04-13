"use strict";

const fs = require("fs");
const path = require("path");
const config = require("../config");

class FileCache {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || config.DEFAULT_CACHE_DIR;
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  getFilePath(key) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  get(key, fallback = null) {
    const filePath = this.getFilePath(key);

    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (raw.expiresAt && Date.now() > raw.expiresAt) {
        fs.unlinkSync(filePath);
        return fallback;
      }

      return raw.value;
    } catch (_error) {
      return fallback;
    }
  }

  put(key, value, ttlSeconds) {
    const filePath = this.getFilePath(key);
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    const payload = JSON.stringify({ expiresAt, value }, null, 2);
    fs.writeFileSync(filePath, payload, "utf8");
  }

  forget(key) {
    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = { FileCache };
