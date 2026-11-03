const path = require("node:path");

// Load .env from the main project directory:
// Magno-Dental-Desktop/.env
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const express = require("express");
const cors = require("cors");

const { initializeSQLite, getSQLite, closeSQLite } = require("./config/sqlite");

// Verify JWT_SECRET before loading security modules.
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  new Set(process.env.JWT_SECRET).size < 8 ||
  /^(replace|your[-_]|changeme)/i.test(process.env.JWT_SECRET)
) {
  throw new Error(
    "JWT_SECRET must be a strong secret of at least 32 characters.",
  );
}

// SQLite development database.
const databasePath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.resolve(__dirname, "data", "dental_offline.db");

// Open SQLite before handling requests.
initializeSQLite(databasePath);

// Only import routes already converted to SQLite.
const authRoutes = require("./routes/authRoutes");
const patientRoutes = require("./routes/patientRoutes");
const queueRoutes = require("./routes/queueRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const visitRoutes = require("./routes/visitRoutes");
const dentalChartRoutes = require("./routes/dentalChartRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const reportRoutes = require("./routes/reportRoutes");

const auth = require("./middleware/authMiddleware");

const { getPatientImage, maskImages } = require("./services/privateImages");

const { securityHeaders } = require("./middleware/securityMiddleware");

const app = express();

app.disable("x-powered-by");
app.use(securityHeaders);

// Allow the local React development frontend.
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

// Prevent caching private API responses.
app.use((req, res, next) => {
  if (req.headers.authorization) {
    res.set("Cache-Control", "no-store");
  }

  next();
});

// Request body parsing.
app.use(express.json({ limit: "1mb" }));
app.use(
  express.urlencoded({
    extended: false,
    limit: "1mb",
  }),
);

// Preserve private image masking.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => originalJson(maskImages(body));

  next();
});

// Health checks.
app.get("/health/live", (req, res) => {
  res.json({
    status: "ok",
    database: "sqlite",
  });
});

app.get("/health/ready", (req, res) => {
  try {
    const db = getSQLite();

    db.prepare("SELECT id FROM users LIMIT 1").get();
    db.prepare("SELECT bucket_key FROM security_rate_limits LIMIT 1").get();

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

// Protected patient images.
app.get("/patient-images/:id", auth, getPatientImage);

// Never expose uploaded images through static routes.
app.use("/uploads", (req, res) => {
  return res.status(404).json({
    message: "Not found.",
  });
});

// SQLite-compatible routes.
app.use("/", authRoutes);
app.use("/", patientRoutes);
app.use("/", queueRoutes);
app.use("/", authRoutes);
app.use("/", patientRoutes);
app.use("/", appointmentRoutes);
app.use("/", queueRoutes);
app.use("/", visitRoutes);
app.use("/", dentalChartRoutes);
app.use("/", paymentRoutes);
app.use("/", dashboardRoutes);
app.use("/", reportRoutes);

// Default API response.
app.get("/", (req, res) => {
  res.send("Magno Dental Clinic SQLite API is running.");
});

// Error handling.
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

// Run SQLite backend locally.
const PORT = Number(process.env.PORT || 3001);

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`SQLite backend running at http://127.0.0.1:${PORT}`);
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

// Periodic maintenance.
const maintenance = setInterval(
  () => {
    try {
      const db = getSQLite();

      // Delete expired sessions.
      db.prepare(
        `
      DELETE FROM auth_sessions
      WHERE julianday(expires_at) <= julianday(?)
    `,
      ).run(new Date().toISOString());

      // Delete old rate-limit records.
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

// Graceful shutdown.
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log(`Received ${signal}. Closing SQLite backend...`);

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

  // Close idle HTTP connections if available.
  server.closeIdleConnections?.();
}

process.once("SIGINT", () => shutdown("SIGINT"));

process.once("SIGTERM", () => shutdown("SIGTERM"));
