// Paytm's published checksum algorithm (AES-128-CBC with a fixed IV, salted
// SHA-256) — reimplemented from their official PaytmChecksum.js reference
// since there's no first-party npm package for it. crypto-only, no network.
const crypto = require("crypto");

const IV = "@@@@&&&&####$$$$";

function encrypt(input, key) {
  const cipher = crypto.createCipheriv("aes-128-cbc", key, IV);
  let encrypted = cipher.update(input, "binary", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function decrypt(encrypted, key) {
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, IV);
  let decrypted = decipher.update(encrypted, "base64", "binary");
  decrypted += decipher.final("binary");
  return decrypted;
}

function randomSalt(length = 4) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[crypto.randomInt(chars.length)];
  }
  return out;
}

function paramsToString(params) {
  return Object.keys(params)
    .sort()
    .map((k) => (params[k] === undefined || params[k] === null ? "" : params[k]))
    .join("|");
}

function generateSignature(params, key) {
  const str = typeof params === "string" ? params : paramsToString(params);
  const salt = randomSalt();
  const hash = crypto
    .createHash("sha256")
    .update(str + "|" + salt)
    .digest("hex");
  return encrypt(hash + salt, key);
}

function verifySignature(params, key, checksum) {
  const str = typeof params === "string" ? params : paramsToString(params);
  const decrypted = decrypt(checksum, key);
  const salt = decrypted.slice(-4);
  const hash = decrypted.slice(0, -4);
  const expected = crypto
    .createHash("sha256")
    .update(str + "|" + salt)
    .digest("hex");
  return expected === hash;
}

module.exports = { generateSignature, verifySignature };
