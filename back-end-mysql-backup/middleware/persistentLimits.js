const crypto = require("node:crypto");
const { getSQLite } = require("../config/sqlite");

const bucketKey = (scope, value) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${scope}:${value}`)
    .digest("hex");

const clientIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";

function consume(scope, value, max, windowMs) {
  const db = getSQLite();

  const now = Date.now();
  const key = bucketKey(scope, value);

  // Atomic SQLite transaction prevents concurrent requests
  // from updating the same counter inconsistently.
  const transaction = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO security_rate_limits
        (bucket_key, window_started, hits, last_seen)
      VALUES (?, ?, 0, ?)
      ON CONFLICT(bucket_key) DO NOTHING
    `,
    ).run(key, now, now);

    const row = db
      .prepare(
        `
      SELECT window_started, hits
      FROM security_rate_limits
      WHERE bucket_key = ?
    `,
      )
      .get(key);

    const expired = now - Number(row.window_started) >= windowMs;

    const start = expired ? now : Number(row.window_started);

    const hits = expired ? 1 : Number(row.hits) + 1;

    db.prepare(
      `
      UPDATE security_rate_limits
      SET window_started = ?,
          hits = ?,
          last_seen = ?
      WHERE bucket_key = ?
    `,
    ).run(start, hits, now, key);

    return {
      allowed: hits <= max,
      retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
    };
  });

  return transaction.immediate();
}

function limit(scope, max, windowMs, key = clientIp) {
  return (req, res, next) => {
    try {
      const result = consume(scope, key(req), max, windowMs);

      if (!result.allowed) {
        res.set("Retry-After", String(result.retryAfter));

        return res.status(429).json({
          message: "Too many requests. Please try again later.",
          retryAfter: result.retryAfter,
        });
      }

      next();
    } catch (error) {
      console.error("Request limiter unavailable:", error);

      return res.status(503).json({
        message: "Service temporarily unavailable. Please try again later.",
      });
    }
  };
}

const loginIpLimit = limit("login-ip", 50, 15 * 60 * 1000);

const loginAccountLimit = limit(
  "login-account-ip",
  10,
  15 * 60 * 1000,
  (req) =>
    `${clientIp(req)}:${String(req.body?.email || "")
      .trim()
      .toLowerCase()
      .slice(0, 100)}`,
);

const resetLimit = limit("password-reset", 5, 15 * 60 * 1000);

const uploadLimit = limit("patient-upload", 20, 15 * 60 * 1000, (req) =>
  String(req.user.id),
);

module.exports = {
  consume,
  limit,
  loginIpLimit,
  loginAccountLimit,
  resetLimit,
  uploadLimit,
};
