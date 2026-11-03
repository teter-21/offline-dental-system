const db = require("../config/db");
const bcrypt = require("bcrypt");
const { issueSession } = require("../services/sessionSecurity");
const { passwordError } = require("../services/passwordPolicy");

const DUMMY_LOGIN_HASH = '$2b$12$KM5Hzi8kHwlGBHXGtCUlYOp1CWy3VHRu8tblKyMbkxKsFF3uGd0eC';

/*  LOGIN  */
exports.login = (req, res) => {
  const emailValue = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");

  if (!emailValue || !password || emailValue.length > 100 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({
      message: "Email and password are required.",
    });
  }

  db.query(
    "SELECT * FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1",
    [emailValue],
    async (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          message: "Database error.",
        });
      }

      if (result.length === 0) {
        await bcrypt.compare(password, DUMMY_LOGIN_HASH);
        req.recordLoginFailure?.();
        return res.status(401).json({
          message: "Invalid email or password.",
        });
      }

      const user = result[0];

      try {
        const match = await bcrypt.compare(password, user.password);

        if (!match || user.role !== "admin") {
          req.recordLoginFailure?.();
          return res.status(401).json({
            message: "Invalid email or password.",
          });
        }

        const mustChangePassword = Boolean(passwordError(password));
        const token = await issueSession(user, mustChangePassword);

        req.clearLoginFailures?.();

        res.json({
          token,
          mustChangePassword,
          id: user.id,
          fullname: user.fullname,
        });
      } catch (error) {
        console.error(error);

        res.status(500).json({
          message: "Login failed.",
        });
      }
    },
  );
};

/* Get the logged-in user's account information. */
exports.getMyAccount = (req, res) => {
  const userId = req.user.id;

  db.query(
    `SELECT id, fullname, email
         FROM users
         WHERE id = ?
         LIMIT 1`,
    [userId],
    (err, results) => {
      if (err) {
        console.error("Get account error:", err);
        return res.status(500).json({
          message: "Unable to load account information.",
        });
      }

      if (results.length === 0) {
        return res.status(404).json({
          message: "Account not found.",
        });
      }

      res.json(results[0]);
    },
  );
};

/* Update the account and change the password when a new one is provided. */
exports.updateMyAccount = async (req, res) => {
  const userId = req.user.id;
  const { fullname, email, currentPassword, newPassword } = req.body;

  if (!fullname || !email) {
    return res.status(400).json({
      message: "Full name and email are required.",
    });
  }

  const cleanName = fullname.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail) || cleanEmail.length > 100) return res.status(400).json({ message: "Enter a valid email address." });

  if (!cleanName || !cleanEmail) {
    return res.status(400).json({
      message: "Full name and email are required.",
    });
  }

  if (newPassword && passwordError(newPassword)) {
    return res.status(400).json({
      message: passwordError(newPassword),
    });
  }

  try {
    db.query(
      "SELECT id, password, email FROM users WHERE id = ? LIMIT 1",
      [userId],
      async (err, results) => {
        if (err) {
          console.error("Account lookup error:", err);
          return res.status(500).json({
            message: "Unable to update account.",
          });
        }

        if (results.length === 0) {
          return res.status(404).json({
            message: "Account not found.",
          });
        }

        if (newPassword || cleanEmail !== results[0].email.trim().toLowerCase()) {
          if (!currentPassword) {
            return res.status(400).json({
              message: "Enter your current password before changing your email or password.",
            });
          }

          const passwordMatches = await bcrypt.compare(
            currentPassword,
            results[0].password,
          );

          if (!passwordMatches) {
            return res.status(400).json({
              message: "Current password is incorrect.",
            });
          }
        }

        db.query(
          "SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1",
          [cleanEmail, userId],
          async (emailErr, emailResults) => {
            if (emailErr) {
              console.error("Email check error:", emailErr);
              return res.status(500).json({
                message: "Unable to update account.",
              });
            }

            if (emailResults.length > 0) {
              return res.status(400).json({
                message: "That email address is already in use.",
              });
            }

            let sql;
            let values;

            if (newPassword) {
              const hashedPassword = await bcrypt.hash(newPassword, 12);
              sql = `UPDATE users
                                   SET fullname = ?, email = ?, password = ?
                                   WHERE id = ?`;
              values = [cleanName, cleanEmail, hashedPassword, userId];
            } else {
              sql = `UPDATE users
                                   SET fullname = ?, email = ?
                                   WHERE id = ?`;
              values = [cleanName, cleanEmail, userId];
            }

            db.query(sql, values, (updateErr) => {
              if (updateErr) {
                console.error("Update account error:", updateErr);
                return res.status(500).json({
                  message: "Unable to update account.",
                });
              }

              res.json({
                sessionEnded: Boolean(newPassword),
                message: newPassword
                  ? "Account information and password updated successfully."
                  : "Account information updated successfully.",
              });
            });
          },
        );
      },
    );
  } catch (error) {
    console.error("Account update error:", error);
    res.status(500).json({
      message: "Unable to update account.",
    });
  }
};

exports.logout = async (req, res) => {
  try {
    await db.promise().execute('DELETE FROM auth_sessions WHERE id = ? AND user_id = ?', [req.sessionId, req.user.id]);
    return res.json({ message: 'Logged out.' });
  } catch (error) {
    console.error('Logout failed:', error.code || error.name);
    return res.status(503).json({ message: 'Unable to end the session. Please try again.' });
  }
};
