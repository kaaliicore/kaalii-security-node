"use strict";

const crypto = require("crypto");

function ensureLeadingSlash(value) {
  if (!value) {
    return "/";
  }

  return value.startsWith("/") ? value : `/${value}`;
}

function stripPort(hostname) {
  if (!hostname) {
    return "";
  }

  return String(hostname).split(":")[0];
}

function md5(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex");
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function isMatch(pattern, value) {
  if (pattern === "*") {
    return true;
  }

  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }

  return value === pattern;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

module.exports = {
  ensureLeadingSlash,
  isMatch,
  md5,
  safeJsonParse,
  stripPort,
  timestamp
};
