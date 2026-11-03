"use strict";

const path = require("node:path");
const fs = require("node:fs");

/* ============================================
   ENVIRONMENT VARIABLES
   ============================================ */

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const express = require("express");
const cors = require("cors");

const { initializeSQLite, getSQLite, closeSQLite } = require("./config/sqlite");

/* ============================================
   ENVIRONMENT VALIDATION
   ============================================ */

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  new Set(process.env.JWT_SECRET).size < 8 ||
  /^(replace|your[-_]|changeme)/i.test(process.env.JWT_SECRET)
) {
  throw new Error(
    "JWT_SECRET must be a strong secret " + "of at least 32 characters.",
  );
}

/* ============================================
   APPLICATION CONFIGURATION
   ============================================ */

const PORT = Number(process.env.PORT || 3001);

const SERVE_BUILT_UI = process.env.MAGNO_SERVE_BUILT_UI === "1";

const FRONTEND_DIST = path.resolve(__dirname, "../front-end/dist");

const FRONTEND_INDEX = path.join(FRONTEND_DIST, "index.html");

/* ============================================
   SQLITE DATABASE
   ============================================ */

const databasePath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.resolve(__dirname, "data", "dental_offline.db");

initializeSQLite(databasePath);

/* ============================================
   SQLITE ROUTES
   ============================================ */

const authRoutes = require("./routes/authRoutes");

const patientRoutes = require("./routes/patientRoutes");

const queueRoutes = require("./routes/queueRoutes");

const appointmentRoutes = require("./routes/appointmentRoutes");

const visitRoutes = require("./routes/visitRoutes");

const dentalChartRoutes = require("./routes/dentalChartRoutes");

const paymentRoutes = require("./routes/paymentRoutes");

const dashboardRoutes = require("./routes/dashboardRoutes");

const reportRoutes = require("./routes/reportRoutes");

/* ============================================
   MIDDLEWARE AND SERVICES
   ============================================ */

const auth = require("./middleware/authMiddleware");

const { getPatientImage, maskImages } = require("./services/privateImages");

const { securityHeaders } = require("./middleware/securityMiddleware");

/* ============================================
   EXPRESS APPLICATION
   ============================================ */

const app = express();

app.disable("x-powered-by");

app.use(securityHeaders);

/* ============================================
   CORS CONFIGURATION
   ============================================ */

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin is not allowed."));
    },

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],

    credentials: false,
  }),
);

/* ============================================
   PRIVATE RESPONSE CACHING
   ============================================ */

app.use((req, res, next) => {
  if (req.headers.authorization || req.path.startsWith("/patient-images/")) {
    res.set("Cache-Control", "no-store");
  }

  next();
});

/* ============================================
   REQUEST BODY PARSING
   ============================================ */

app.use(
  express.json({
    limit: "1mb",
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "1mb",
  }),
);

/* ============================================
   PRIVATE IMAGE MASKING
   ============================================ */

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    return originalJson(maskImages(body));
  };

  next();
});

/* ============================================
   HEALTH CHECKS
   ============================================ */

app.get("/health/live", (req, res) => {
  return res.json({
    status: "ok",
    database: "sqlite",
  });
});

app.get("/health/ready", (req, res) => {
  try {
    const db = getSQLite();

    db.prepare("SELECT id FROM users LIMIT 1").get();

    db.prepare(
      "SELECT bucket_key " + "FROM security_rate_limits LIMIT 1",
    ).get();

    return res.json({
      status: "ready",
      database: "sqlite",
    });
  } catch (error) {
    console.error("SQLite health check failed:", error);

    return res.status(503).json({
      status: "unavailable",
    });
  }
});

/* ============================================
   PROTECTED PATIENT IMAGES
   ============================================ */

app.get("/patient-images/:id", auth, getPatientImage);

/* ============================================
   ELECTRON ADMINISTRATOR AUTHORIZATION
   ============================================ */

// Used only by the local Electron application.
// This endpoint does not execute backups,
// restores, or filesystem operations.

if (process.env.MAGNO_DESKTOP_MODE === "1") {
  app.post("/desktop/authorize", auth, (req, res) => {
    return res.json({
      authorized: true,
    });
  });
}

// Never expose private uploads as static files.
app.use("/uploads", (req, res) => {
  return res.status(404).json({
    message: "Not found.",
  });
});

/* ============================================
   SQLITE API ROUTES
   ============================================ */

app.use("/", authRoutes);

app.use("/", patientRoutes);

app.use("/", queueRoutes);

app.use("/", appointmentRoutes);

app.use("/", visitRoutes);

app.use("/", dentalChartRoutes);

app.use("/", paymentRoutes);

app.use("/", dashboardRoutes);

app.use("/", reportRoutes);

/* ============================================
   ELECTRON PRODUCTION FRONTEND
   ============================================ */

if (SERVE_BUILT_UI) {
  if (!fs.existsSync(FRONTEND_INDEX)) {
    throw new Error(
      "React production build is missing. " +
        "Run npm run build:ui:desktop first.",
    );
  }

  console.log("Serving compiled React frontend:", FRONTEND_DIST);

  /* ------------------------------------------
     STATIC FILES
     ------------------------------------------ */

  app.use(
    express.static(FRONTEND_DIST, {
      index: false,
      dotfiles: "deny",
      fallthrough: true,
    }),
  );

  /* ------------------------------------------
     REACT ROUTER FALLBACK
     ------------------------------------------ */

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }

    const requestPath = req.path;

    const excludedPrefixes = [
      "/health",
      "/patient-images",
      "/uploads",
      "/assets",
      "/api",
    ];

    if (
      excludedPrefixes.some(
        (prefix) =>
          requestPath === prefix || requestPath.startsWith(prefix + "/"),
      )
    ) {
      return next();
    }

    if (path.posix.extname(requestPath)) {
      return next();
    }

    if (!req.accepts("html")) {
      return next();
    }

    res.set("Cache-Control", "no-store");

    return res.sendFile(FRONTEND_INDEX);
  });
} else {
  app.get("/", (req, res) => {
    return res.send("Magno Dental Clinic SQLite API is running.");
  });
}

/* ============================================
   NOT FOUND HANDLER
   ============================================ */

app.use((req, res) => {
  return res.status(404).json({
    message: "Endpoint not found.",
  });
});

/* ============================================
   ERROR HANDLING
   ============================================ */

app.use((err, req, res, next) => {
  if (err.message === "CORS origin is not allowed.") {
    return res.status(403).json({
      message: "Request origin is not allowed.",
    });
  }

  if (err.name === "MulterError" || err.message?.includes("Only JPG")) {
    return res.status(400).json({
      message: err.message,
    });
  }

  console.error("SQLite server error:", err.code || err.name);

  return res.status(500).json({
    message: "An unexpected error occurred.",
  });
});

/* ============================================
   START SQLITE BACKEND
   ============================================ */

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`SQLite backend running at ` + `http://127.0.0.1:${PORT}`);

  console.log(
    "Frontend mode:",
    SERVE_BUILT_UI
      ? "Compiled React production build"
      : "API / Vite development",
  );
});

server.on("error", (error) => {
  console.error("Unable to start SQLite backend:", error);

  process.exitCode = 1;

  try {
    closeSQLite();
  } catch (closeError) {
    console.error("SQLite close failed:", closeError);
  }
});

/* ============================================
   PERIODIC MAINTENANCE
   ============================================ */

const maintenance = setInterval(
  () => {
    try {
      const db = getSQLite();

      db.prepare(
        `
      DELETE FROM auth_sessions
      WHERE julianday(expires_at) <= julianday(?)
    `,
      ).run(new Date().toISOString());

      db.prepare(
        `
      DELETE FROM security_rate_limits
      WHERE last_seen < ?
    `,
      ).run(Date.now() - 24 * 60 * 60 * 1000);
    } catch (error) {
      console.error("SQLite maintenance failed:", error.code || error.name);
    }
  },
  15 * 60 * 1000,
);

maintenance.unref();

/* ============================================
   GRACEFUL SHUTDOWN
   ============================================ */

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log(`Received ${signal}. ` + "Closing SQLite backend...");

  clearInterval(maintenance);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timeout exceeded.");

    process.exit(1);
  }, 20000);

  forceExit.unref();

  server.close((error) => {
    if (error) {
      console.error("HTTP server close failed:", error);

      process.exitCode = 1;
    }

    try {
      closeSQLite();

      console.log("SQLite database closed safely.");
    } catch (closeError) {
      console.error("SQLite database close failed:", closeError);

      process.exitCode = 1;
    }

    clearTimeout(forceExit);

    process.exit(process.exitCode || 0);
  });

  server.closeIdleConnections?.();
}

process.once("SIGINT", () => shutdown("SIGINT"));

process.once("SIGTERM", () => shutdown("SIGTERM"));

/* ============================================
   ELECTRON UTILITY PROCESS SHUTDOWN
   ============================================ */

// Electron UtilityProcess provides parentPort.
// Ordinary Node.js execution does not.

if (process.parentPort) {
  process.parentPort.on("message", (event) => {
    if (event.data?.type === "shutdown") {
      console.log("Electron requested a safe backend shutdown.");

      shutdown("ELECTRON_SHUTDOWN");
    }
  });
}
