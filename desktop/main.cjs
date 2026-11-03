"use strict";

const { app, BrowserWindow, dialog, session } = require("electron");

const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { spawn } = require("node:child_process");

/* ============================================
   PROJECT PATHS
   ============================================ */

const PROJECT_ROOT = path.resolve(__dirname, "..");

const BACKEND_DIR = path.join(PROJECT_ROOT, "back-end");

const BACKEND_SCRIPT = path.join(BACKEND_DIR, "server-sqlite.js");

const FRONTEND_DIST = path.join(PROJECT_ROOT, "front-end", "dist");

/* ============================================
   APPLICATION CONFIGURATION
   ============================================ */

const BACKEND_PORT = 3001;

const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// IMPORTANT:
// Declare PREVIEW_BUILD before using it.
const PREVIEW_BUILD = process.env.MAGNO_PREVIEW_BUILD === "1";

const FRONTEND_URL = PREVIEW_BUILD ? BACKEND_URL : "http://127.0.0.1:5173";

let mainWindow = null;
let backendProcess = null;
let quitting = false;

console.log("==================================");
console.log("MAGNO DENTAL DESKTOP");
console.log("Preview mode:", PREVIEW_BUILD);
console.log("Frontend URL:", FRONTEND_URL);
console.log("Backend URL:", BACKEND_URL);
console.log("==================================");

/* ============================================
   SINGLE INSTANCE LOCK
   ============================================ */

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });
}

/* ============================================
   PORT AVAILABILITY
   ============================================ */

function checkBackendPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error) => {
      reject(
        new Error(
          `Port ${BACKEND_PORT} is already in use. ` +
            "Close the existing backend before starting Electron. " +
            error.message,
        ),
      );
    });

    server.listen(BACKEND_PORT, "127.0.0.1", () => {
      server.close(resolve);
    });
  });
}

/* ============================================
   START SQLITE BACKEND
   ============================================ */

function startBackend() {
  if (backendProcess) {
    throw new Error("SQLite backend is already running.");
  }

  if (!fs.existsSync(BACKEND_SCRIPT)) {
    throw new Error(`SQLite backend not found:\n${BACKEND_SCRIPT}`);
  }

  console.log("Starting SQLite backend...");

  // DEVELOPMENT IMPLEMENTATION:
  // Uses the Node.js installed on this computer.
  // Production packaging will use Electron's
  // embedded Node runtime.
  const child = spawn("node", [BACKEND_SCRIPT], {
    cwd: BACKEND_DIR,
    windowsHide: true,

    stdio: ["ignore", "pipe", "pipe"],

    env: {
      ...process.env,

      PORT: String(BACKEND_PORT),

      FRONTEND_URL,

      MAGNO_SERVE_BUILT_UI: PREVIEW_BUILD ? "1" : "0",
    },
  });

  backendProcess = child;

  child.stdout.on("data", (data) => {
    console.log("[SQLite backend]", data.toString().trim());
  });

  child.stderr.on("data", (data) => {
    console.error("[SQLite backend error]", data.toString().trim());
  });

  child.on("error", (error) => {
    console.error("Unable to start SQLite backend:", error);
  });

  child.on("exit", (code, signal) => {
    console.log("SQLite backend exited.", "Code:", code, "Signal:", signal);

    if (backendProcess === child) {
      backendProcess = null;
    }

    if (!quitting) {
      dialog.showErrorBox(
        "SQLite Backend Stopped",
        "The local database server stopped unexpectedly. " +
          "The desktop application will now close.",
      );

      app.quit();
    }
  });
}

/* ============================================
   WAIT FOR BACKEND TO START
   ============================================ */

async function waitForBackend() {
  const timeoutMilliseconds = 20000;

  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (!backendProcess) {
      throw new Error("SQLite backend stopped during startup.");
    }

    try {
      const response = await fetch(`${BACKEND_URL}/health/ready`, {
        signal: AbortSignal.timeout(1000),
      });

      if (response.ok) {
        const result = await response.json();

        if (result.status === "ready" && result.database === "sqlite") {
          console.log("SQLite backend is ready.");

          return;
        }
      }
    } catch {
      // Backend may still be initializing.
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(
    "SQLite backend failed to become ready within 20 seconds. " +
      "Check the backend console logs.",
  );
}

/* ============================================
   ELECTRON WINDOW
   ============================================ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,

    minWidth: 1024,
    minHeight: 700,

    show: false,

    title: "Magno Dental Clinic Management System",

    backgroundColor: "#f4f8fb",

    autoHideMenuBar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),

      contextIsolation: true,

      nodeIntegration: false,

      sandbox: true,

      webSecurity: true,
    },
  });

  /* ------------------------------------------
     Block new windows
     ------------------------------------------ */

  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: "deny",
  }));

  /* ------------------------------------------
     Restrict navigation
     ------------------------------------------ */

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    try {
      const allowedOrigin = new URL(FRONTEND_URL).origin;

      const targetOrigin = new URL(targetUrl).origin;

      if (targetOrigin !== allowedOrigin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  /* ------------------------------------------
     Show window when ready
     ------------------------------------------ */

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  /* ------------------------------------------
     Load React application
     ------------------------------------------ */

  console.log("Loading React frontend:", FRONTEND_URL);

  mainWindow.loadURL(FRONTEND_URL).catch((error) => {
    console.error("React frontend failed to load:", error);

    const errorMessage = PREVIEW_BUILD
      ? "Unable to load the compiled React frontend.\n\n" +
        "Make sure you have:\n" +
        "1. Run npm run build:ui:desktop\n" +
        "2. Added the React static-serving block " +
        "to server-sqlite.js"
      : "Unable to connect to the Vite development server.\n\n" +
        "Start Vite using:\n" +
        "cd front-end\nnpm run dev";

    dialog.showErrorBox("Frontend Loading Error", errorMessage);

    app.quit();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ============================================
   DESKTOP STARTUP
   ============================================ */

async function startDesktop() {
  // The packaged installer is not enabled yet.
  if (app.isPackaged) {
    throw new Error(
      "Production packaging is not configured. " +
        "Complete the backend and AppData setup first.",
    );
  }

  app.setAppUserModelId("com.magno.dental.desktop");

  /* ------------------------------------------
     Validate production-preview build
     ------------------------------------------ */

  if (PREVIEW_BUILD) {
    const indexFile = path.join(FRONTEND_DIST, "index.html");

    if (!fs.existsSync(indexFile)) {
      throw new Error(
        "Compiled React frontend not found.\n\n" +
          "Run:\nnpm run build:ui:desktop",
      );
    }
  }

  /* ------------------------------------------
     Ensure backend port is available
     ------------------------------------------ */

  await checkBackendPort();

  /* ------------------------------------------
     Start backend and wait for readiness
     ------------------------------------------ */

  startBackend();

  await waitForBackend();

  /* ------------------------------------------
     Restrict permissions
     ------------------------------------------ */

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      let allowed = false;

      try {
        const currentOrigin = new URL(webContents.getURL()).origin;

        const allowedOrigin = new URL(FRONTEND_URL).origin;

        allowed = permission === "media" && currentOrigin === allowedOrigin;
      } catch {
        allowed = false;
      }

      callback(allowed);
    },
  );

  /* ------------------------------------------
     Create desktop window
     ------------------------------------------ */

  createWindow();
}

/* ============================================
   APP READY
   ============================================ */

if (hasSingleInstanceLock) {
  app
    .whenReady()
    .then(startDesktop)
    .catch((error) => {
      console.error("Desktop startup failed:", error);

      dialog.showErrorBox("Magno Dental Startup Error", error.message);

      app.quit();
    });
}

/* ============================================
   MACOS / WINDOW REACTIVATION
   ============================================ */

app.on("activate", () => {
  if (
    hasSingleInstanceLock &&
    !quitting &&
    backendProcess &&
    BrowserWindow.getAllWindows().length === 0
  ) {
    createWindow();
  }
});

/* ============================================
   APPLICATION SHUTDOWN
   ============================================ */

app.on("before-quit", () => {
  quitting = true;

  if (backendProcess) {
    console.log("Stopping SQLite backend...");

    backendProcess.kill();

    backendProcess = null;
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
