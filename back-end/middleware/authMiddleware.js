const { getSQLite } = require("../config/sqlite");

const {
  verifySessionToken,
  hashSession,
  credentialsMatch,
} = require("../services/sessionSecurity");

module.exports = async (req, res, next) => {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ") || header.length > 4096) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  let decoded;

  try {
    decoded = verifySessionToken(header.slice(7).trim());
  } catch {
    return res.status(401).json({
      message: "Invalid or expired session.",
    });
  }

  try {
    const db = getSQLite();

    const user = db
      .prepare(
        `
      SELECT u.id, u.password
      FROM users u
      INNER JOIN auth_sessions s
        ON s.user_id = u.id
      WHERE u.id = ?
        AND u.role = 'admin'
        AND s.id = ?
        AND julianday(s.expires_at) > julianday(?)
      LIMIT 1
    `,
      )
      .get(decoded.id, hashSession(decoded.jti), new Date().toISOString());

    if (!user || !credentialsMatch(decoded.credential, user.password)) {
      return res.status(401).json({
        message: "Session ended. Please log in again.",
      });
    }

    req.user = { id: user.id };
    req.sessionId = hashSession(decoded.jti);

    if (
      decoded.passwordUpgradeRequired &&
      !["/account", "/logout"].includes(req.path)
    ) {
      return res.status(403).json({
        code: "PASSWORD_CHANGE_REQUIRED",
        message:
          "Update your password in account settings before using the system.",
      });
    }

    next();
  } catch (error) {
    console.error("Authentication unavailable:", error);

    return res.status(503).json({
      message: "Unable to verify your account. Please try again later.",
    });
  }
};
