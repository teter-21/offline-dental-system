"use strict";

const bcrypt = require("bcrypt");
const { createHash } = require("node:crypto");

// New passwords are SHA-256-prehashed before bcrypt. This avoids bcrypt's
// silent 72-byte truncation, including with long Unicode passwords.
// Existing untagged bcrypt hashes still authenticate unchanged.
const PREFIX = "sha256-bcrypt:";
const digest = (password) => createHash("sha256").update(password, "utf8").digest("hex");

async function hashPassword(password) {
  return PREFIX + await bcrypt.hash(digest(password), 12);
}

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string" || !storedHash) return false;
  if (storedHash.startsWith(PREFIX)) {
    return bcrypt.compare(digest(password), storedHash.slice(PREFIX.length));
  }
  // Old passwords were hashed directly, and older login paths rejected >72 bytes.
  // Keep that historical restriction for legacy hashes to avoid truncation aliases.
  if (Buffer.byteLength(password, "utf8") > 72) return false;
  return bcrypt.compare(password, storedHash);
}

module.exports = { hashPassword, verifyPassword };
