"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../config");

const REQUIRED_KEYS = [
  "LICENSE_PURCHASE_CODE",
  "PRODUCT_SLUG",
  "API_TOKEN",
  "VERIFICATION_KEY"
];

class KeyStore {
  constructor(options = {}) {
    this.keyFilePath = options.keyFilePath || config.DEFAULT_KEY_FILE_PATH;
    this.encryptedKeyFilePath = options.encryptedKeyFilePath || config.DEFAULT_ENCRYPTED_KEY_FILE_PATH;
    this.encryptionSecret = options.encryptionSecret || process.env.KAALII_KEY_SECRET || "";
  }

  setkeyFileValue(key, value, location) {
    const targetPath = location || this.keyFilePath;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    const data = this.getKeyFileValue(null, targetPath) || {};
    data[key] = value;

    const lines = Object.entries(data).map(([name, item]) => `${name}=${item}`);
    fs.writeFileSync(targetPath, `${lines.join("\n")}\n`, "utf8");
  }

  getKeyFileValue(key = null, location = null) {
    const data = this.readKeys(location);
    if (!key) {
      return data;
    }

    return data[key];
  }

  readKeys(location = null) {
    const envData = this.getEnvData();
    if (Object.keys(envData).length === REQUIRED_KEYS.length) {
      return envData;
    }

    const resolvedPath = location || this.resolveExistingPath();
    if (!resolvedPath) {
      return envData;
    }

    if (resolvedPath.endsWith(".enc")) {
      return this.readEncryptedFile(resolvedPath, envData);
    }

    return this.readIniFile(resolvedPath, envData);
  }

  resolveExistingPath() {
    const candidates = [
      this.keyFilePath,
      path.join(process.cwd(), "app", "Console", "a2FhbGlp.key"),
      path.join(process.cwd(), "a2FhbGlp.key"),
      this.encryptedKeyFilePath
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  getEnvData() {
    const data = {};
    for (const name of REQUIRED_KEYS) {
      if (process.env[name]) {
        data[name] = process.env[name];
      }
    }

    return data;
  }

  readIniFile(filePath, defaults) {
    const content = fs.readFileSync(filePath, "utf8");
    const entries = content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split(/=(.*)/s).slice(0, 2))
      .filter(([name]) => name);

    return Object.assign({}, defaults, Object.fromEntries(entries));
  }

  readEncryptedFile(filePath, defaults) {
    if (!this.encryptionSecret) {
      return defaults;
    }

    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const iv = Buffer.from(payload.iv, "hex");
    const tag = Buffer.from(payload.tag, "hex");
    const encrypted = Buffer.from(payload.data, "hex");
    const key = crypto.createHash("sha256").update(this.encryptionSecret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const content = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");

    return Object.assign({}, defaults, JSON.parse(content));
  }

  writeEncryptedKeyFile(data, location) {
    if (!this.encryptionSecret) {
      throw new Error("KAALII_KEY_SECRET is required to encrypt key.json");
    }

    const targetPath = location || this.encryptedKeyFilePath;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash("sha256").update(this.encryptionSecret).digest();
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
    const payload = {
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      data: encrypted.toString("hex")
    };

    fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf8");
  }
}

module.exports = { KeyStore, REQUIRED_KEYS };
