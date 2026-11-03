"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function getOrCreateJwtSecret(app) {
  const directory = path.join(
    app.getPath("appData"),
    "MagnoDentalDesktop",
    "config",
  );

  const secretPath = path.join(directory, "jwt-secret");

  fs.mkdirSync(directory, {
    recursive: true,
    mode: 0o700,
  });

  let secret;

  try {
    secret = fs.readFileSync(secretPath, "utf8").trim();
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    // Generate a high-entropy, per-installation secret.
    const newSecret = crypto.randomBytes(48).toString("hex");

    try {
      // Never overwrite an existing secret.
      fs.writeFileSync(secretPath, newSecret, {
        flag: "wx",
        mode: 0o600,
      });

      secret = newSecret;
    } catch (writeError) {
      // Handle another process creating it first.
      if (writeError.code !== "EEXIST") {
        throw writeError;
      }

      secret = fs.readFileSync(secretPath, "utf8").trim();
    }
  }

  if (secret.length < 64 || !/^[a-f0-9]+$/i.test(secret)) {
    throw new Error(
      "Stored JWT secret is invalid. " +
        "Do not delete it without reviewing " +
        "existing authentication sessions.",
    );
  }

  return secret;
}

module.exports = {
  getOrCreateJwtSecret,
};
