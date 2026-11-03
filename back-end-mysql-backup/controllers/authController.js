const { getSQLite } = require("../config/sqlite");
const bcrypt = require("bcrypt");
const { issueSession } = require("../services/sessionSecurity");
const { passwordError } = require("../services/passwordPolicy");

const DUMMY_LOGIN_HASH =
  "$2b$12$KM5Hzi8kHwlGBHXGtCUlYOp1CWy3VHRu8tblKyMbkxKsFF3uGd0eC";

// LOGIN
exports.login = async (req, res) => {
  const emailValue = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  const password = String(req.body?.password || "");

  if (
    !emailValue ||
    !password ||
    emailValue.length > 100 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      message: "Email and password are required.",
    });
  }

  try {
    const db = getSQLite();

    const user = db
      .prepare(
        `
      SELECT *
      FROM users
      WHERE LOWER(TRIM(email)) = ?
      LIMIT 1
    `,
      )
      .get(emailValue);

    const match = await bcrypt.compare(
      password,
      user?.password || DUMMY_LOGIN_HASH,
    );

    if (!user || !match || user.role !== "admin") {
      req.recordLoginFailure?.();

      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const mustChangePassword = Boolean(passwordError(password));

    const token = await issueSession(user, mustChangePassword);

    req.clearLoginFailures?.();

    return res.json({
      token,
      mustChangePassword,
      id: user.id,
      fullname: user.fullname,
    });
  } catch (error) {
    console.error("SQLite login error:", error);

    return res.status(500).json({
      message: "Login failed.",
    });
  }
};

// GET ACCOUNT
exports.getMyAccount = (req, res) => {
  try {
    const user = getSQLite()
      .prepare(
        `
      SELECT id, fullname, email
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
      )
      .get(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Account not found.",
      });
    }

    return res.json(user);
  } catch (error) {
    console.error("SQLite account lookup failed:", error);

    return res.status(500).json({
      message: "Unable to load account information.",
    });
  }
};

// UPDATE ACCOUNT / PASSWORD
exports.updateMyAccount = async (req, res) => {
  const userId = req.user.id;

  const { fullname, email, currentPassword, newPassword } = req.body || {};

  const cleanName = String(fullname || "").trim();
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!cleanName || !cleanEmail) {
    return res.status(400).json({
      message: "Full name and email are required.",
    });
  }

  if (
    cleanName.length > 150 ||
    !/^\S+@\S+\.\S+$/.test(cleanEmail) ||
    cleanEmail.length > 100
  ) {
    return res.status(400).json({
      message: "Enter valid account information.",
    });
  }

  if (
    newPassword !== undefined &&
    newPassword !== null &&
    newPassword !== "" &&
    typeof newPassword !== "string"
  ) {
    return res.status(400).json({
      message: "Invalid password format.",
    });
  }

  const changingPassword =
    typeof newPassword === "string" && newPassword.length > 0;

  if (changingPassword && Buffer.byteLength(newPassword, "utf8") > 72) {
    return res.status(400).json({
      message: "Password is too long.",
    });
  }

  if (changingPassword) {
    const validationError = passwordError(newPassword);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }
  }

  try {
    const db = getSQLite();

    const user = db
      .prepare(
        `
      SELECT id, password, email
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
      )
      .get(userId);

    if (!user) {
      return res.status(404).json({
        message: "Account not found.",
      });
    }

    const changingEmail = cleanEmail !== user.email.trim().toLowerCase();

    if (changingPassword || changingEmail) {
      if (!currentPassword) {
        return res.status(400).json({
          message:
            "Enter your current password before changing your email or password.",
        });
      }

      const matches = await bcrypt.compare(
        String(currentPassword),
        user.password,
      );

      if (!matches) {
        return res.status(400).json({
          message: "Current password is incorrect.",
        });
      }
    }

    const existing = db
      .prepare(
        `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER(?)
        AND id <> ?
      LIMIT 1
    `,
      )
      .get(cleanEmail, userId);

    if (existing) {
      return res.status(400).json({
        message: "That email address is already in use.",
      });
    }

    const hashedPassword = changingPassword
      ? await bcrypt.hash(newPassword, 12)
      : null;

    const updateAccount = db.transaction(() => {
      if (changingPassword) {
        db.prepare(
          `
          UPDATE users
          SET fullname = ?,
              email = ?,
              password = ?
          WHERE id = ?
        `,
        ).run(cleanName, cleanEmail, hashedPassword, userId);

        // Revoke all active sessions after a password change.
        db.prepare(
          `
          DELETE FROM auth_sessions
          WHERE user_id = ?
        `,
        ).run(userId);
      } else {
        db.prepare(
          `
          UPDATE users
          SET fullname = ?, email = ?
          WHERE id = ?
        `,
        ).run(cleanName, cleanEmail, userId);
      }
    });

    updateAccount.immediate();

    return res.json({
      sessionEnded: changingPassword,
      message: changingPassword
        ? "Account information and password updated successfully."
        : "Account information updated successfully.",
    });
  } catch (error) {
    console.error("SQLite account update error:", error);

    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(400).json({
        message: "That email address is already in use.",
      });
    }

    return res.status(500).json({
      message: "Unable to update account.",
    });
  }
};

// LOGOUT
exports.logout = async (req, res) => {
  try {
    getSQLite()
      .prepare(
        `
      DELETE FROM auth_sessions
      WHERE id = ?
        AND user_id = ?
    `,
      )
      .run(req.sessionId, req.user.id);

    return res.json({
      message: "Logged out.",
    });
  } catch (error) {
    console.error("SQLite logout error:", error);

    return res.status(503).json({
      message: "Unable to end the session. Please try again.",
    });
  }
};
