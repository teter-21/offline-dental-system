"use strict";

const express = require("express");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

const { getSQLite } = require("../config/sqlite");
const { passwordError } = require("../services/passwordPolicy");

const router = express.Router();

/* ============================================
   VERIFY ELECTRON SETUP AUTHORIZATION
   ============================================ */

function verifySetupRequest(req, res, next) {
  const expected = process.env.MAGNO_SETUP_KEY;
  const supplied = req.get("X-Magno-Setup-Key");

  if (
    typeof expected !== "string" ||
    expected.length < 64 ||
    typeof supplied !== "string"
  ) {
    return res.status(403).json({
      message: "Setup authorization denied.",
    });
  }

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(supplied, "utf8");

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({
      message: "Setup authorization denied.",
    });
  }

  next();
}

/* ============================================
   CHECK WHETHER FIRST RUN IS REQUIRED
   ============================================ */

router.post("/desktop/setup/status", verifySetupRequest, (req, res) => {
  try {
    const db = getSQLite();

    const user = db
      .prepare(
        `
        SELECT id
        FROM users
        LIMIT 1
      `,
      )
      .get();

    return res.json({
      setupRequired: !user,
    });
  } catch (error) {
    console.error("First-run status failed:", error);

    return res.status(503).json({
      message: "Unable to check system setup.",
    });
  }
});

/* ============================================
   CREATE THE FIRST ADMINISTRATOR
   ============================================ */

router.post(
  "/desktop/setup/create-admin",
  verifySetupRequest,
  async (req, res) => {
    const { fullname, email, password, confirmPassword } = req.body || {};

    const cleanName = String(fullname || "").trim();

    const cleanEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (
      !cleanName ||
      cleanName.length > 150 ||
      !/^\S+@\S+\.\S+$/.test(cleanEmail) ||
      cleanEmail.length > 100
    ) {
      return res.status(400).json({
        message: "Enter a valid full name and email address.",
      });
    }

    if (typeof password !== "string" || typeof confirmPassword !== "string") {
      return res.status(400).json({
        message: "Enter and confirm your administrator password.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match.",
      });
    }

    const validationError = passwordError(password);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    try {
      const db = getSQLite();

      // Hash the password before the transaction
      // to minimize database lock duration.
      const passwordHash = await bcrypt.hash(password, 12);

      const createFirstAdmin = db.transaction(() => {
        // Recheck inside an IMMEDIATE transaction.
        // This prevents concurrent setup attempts
        // from creating additional administrators.
        const existingUser = db
          .prepare(
            `
          SELECT id
          FROM users
          LIMIT 1
        `,
          )
          .get();

        if (existingUser) {
          return false;
        }

        db.prepare(
          `
          INSERT INTO users (
            fullname,
            email,
            password,
            role
          )
          VALUES (?, ?, ?, 'admin')
        `,
        ).run(cleanName, cleanEmail, passwordHash);

        return true;
      });

      const created = createFirstAdmin.immediate();

      if (!created) {
        return res.status(409).json({
          message: "Administrator setup has already been completed.",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Administrator account created successfully.",
      });
    } catch (error) {
      console.error("First-run administrator setup failed:", error);

      return res.status(500).json({
        message: "Unable to create the administrator account.",
      });
    }
  },
);

module.exports = router;
