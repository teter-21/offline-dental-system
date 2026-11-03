"use strict";

/* ============================================
   SECURITY HEADERS
   ============================================ */

const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");

  res.setHeader("X-Frame-Options", "DENY");

  res.setHeader("Referrer-Policy", "no-referrer");

  const isDesktopPreview = process.env.MAGNO_SERVE_BUILT_UI === "1";

  // HSTS is intended for HTTPS deployments,
  // not the local Electron HTTP server.
  if (
    !isDesktopPreview &&
    (process.env.NODE_ENV === "production" || process.env.RENDER) &&
    req.secure
  ) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }

  /* ------------------------------------------
     PERMISSIONS POLICY
     ------------------------------------------ */

  // Camera permission is needed for the
  // Take Photo feature in the desktop frontend.
  //
  // Microphone and geolocation remain disabled.
  const permissionsPolicy = isDesktopPreview
    ? "camera=(self), microphone=(), geolocation=()"
    : "camera=(), microphone=(), geolocation=()";

  res.setHeader("Permissions-Policy", permissionsPolicy);

  /* ------------------------------------------
     CONTENT SECURITY POLICY
     ------------------------------------------ */

  // blob: is required for private patient photos
  // displayed using URL.createObjectURL().
  //
  // data: is permitted for locally generated
  // image previews.
  //
  // All other resource types remain restricted.
  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  res.setHeader("Content-Security-Policy", contentSecurityPolicy);

  next();
};

/* ============================================
   GENERAL RATE LIMITER
   ============================================ */

const createRateLimiter = ({ windowMs, max, message }) => {
  const attempts = new Map();

  setInterval(
    () => {
      const now = Date.now();

      for (const [key, value] of attempts) {
        if (now - value.start >= windowMs) {
          attempts.delete(key);
        }
      }
    },
    Math.min(windowMs, 60_000),
  ).unref();

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";

    const now = Date.now();

    const current = attempts.get(key);

    if (!current || now - current.start >= windowMs) {
      attempts.set(key, {
        start: now,
        count: 1,
      });

      return next();
    }

    current.count += 1;

    if (current.count > max) {
      return res.status(429).json({
        message,
      });
    }

    next();
  };
};

/* ============================================
   FAILED LOGIN RATE LIMITER
   ============================================ */

// Maximum 5 failed attempts per IP + email
// within a 15-minute window.

const failedLoginAttempts = new Map();

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const LOGIN_MAX_FAILURES = 5;

setInterval(() => {
  const now = Date.now();

  for (const [key, value] of failedLoginAttempts) {
    if (now - value.firstAttempt >= LOGIN_WINDOW_MS) {
      failedLoginAttempts.delete(key);
    }
  }
}, 60000).unref();

const getLoginKey = (req) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  const ip = req.ip || req.socket?.remoteAddress || "unknown";

  return `${ip}|${email || "unknown"}`;
};

const loginLimiter = (req, res, next) => {
  const now = Date.now();

  const key = getLoginKey(req);

  const current = failedLoginAttempts.get(key);

  if (current && now - current.firstAttempt >= LOGIN_WINDOW_MS) {
    failedLoginAttempts.delete(key);
  }

  const entry = failedLoginAttempts.get(key);

  if (entry && entry.count >= LOGIN_MAX_FAILURES) {
    const retryAfter = Math.max(
      1,
      Math.ceil((LOGIN_WINDOW_MS - (now - entry.firstAttempt)) / 1000),
    );

    res.set("Retry-After", String(retryAfter));

    return res.status(429).json({
      message: "Too many failed login attempts. " + "Please try again later.",
      retryAfter,
    });
  }

  req.recordLoginFailure = () => {
    const timestamp = Date.now();

    const existing = failedLoginAttempts.get(key);

    if (!existing || timestamp - existing.firstAttempt >= LOGIN_WINDOW_MS) {
      failedLoginAttempts.set(key, {
        count: 1,
        firstAttempt: timestamp,
      });

      return;
    }

    existing.count += 1;
  };

  req.clearLoginFailures = () => {
    failedLoginAttempts.delete(key);
  };

  next();
};

/* ============================================
   PASSWORD RESET LIMITER
   ============================================ */

const resetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many password reset requests. " + "Please try again later.",
});

/* ============================================
   EXPORTS
   ============================================ */

module.exports = {
  securityHeaders,
  loginLimiter,
  resetLimiter,
};
