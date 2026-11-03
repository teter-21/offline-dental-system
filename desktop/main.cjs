"use strict";

const { app, BrowserWindow, dialog, session } = require("electron");

const path = require("node:path");
const { spawn } = require("node:child_process");
const net = require("node:net");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(PROJECT_ROOT, "back-end");
const BACKEND_SCRIPT = path.join(BACKEND_DIR, "server-sqlite.js");

const FRONTEND_URL = "http://localhost:5173";
const BACKEND_PORT = 3001;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

let mainWindow = null;
let backendProcess = null;
let quitting = false;

// Prevent multiple Electron instances.
const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function checkPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();

    probe.once("error", reject);

    probe.listen(port, "127.0.0.1", () => {
      probe.close(resolve);
    });
  });
}

function startBackend() {
  if (backendProcess) {
    throw new Error("Backend is already running.");
  }

  // Development only: requires Node.js installed
  // on the development laptop.
  backendProcess = spawn("node", [BACKEND_SCRIPT], {
    cwd: BACKEND_DIR,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      FRONTEND_URL,
    },
  });

  const child = backendProcess;

  child.stdout.on("data", (data) => {
    console.log("[SQLite backend]", data.toString().trim());
  });

  child.stderr.on("data", (data) => {
    console.error("[SQLite backend]", data.toString().trim());
  });

  child.on("error", (error) => {
    console.error("Backend failed to start:", error);
  });

  child.on("exit", (code, signal) => {
    console.log("SQLite backend exited:", code, signal);

    if (backendProcess === child) {
      backendProcess = null;
    }

    if (!quitting) {
      dialog.showErrorBox(
        "Backend stopped",
        "The local database service has stopped. " +
          "The desktop application will close.",
      );
      app.quit();
    }
  });
}

async function waitForBackend() {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    if (!backendProcess) {
      throw new Error("SQLite backend exited during startup.");
    }

    try {
      const response = await fetch(`${BACKEND_URL}/health/ready`, {
        signal: AbortSignal.timeout(1000),
      });

      if (response.ok) {
        const body = await response.json();

        if (body.status === "ready" && body.database === "sqlite") {
          return;
        }
      }
    } catch {
      // The backend may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("SQLite backend did not become ready.");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: "Magno Dental Management",
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

  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: "deny",
  }));

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin !== new URL(FRONTEND_URL).origin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.loadURL(FRONTEND_URL).catch((error) => {
    console.error("React frontend failed to load:", error);

    dialog.showErrorBox(
      "Frontend unavailable",
      "Start the React development server with npm run dev.",
    );

    app.quit();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startDesktop() {
  if (app.isPackaged) {
    throw new Error(
      "Production startup is not configured yet. " +
        "Do not build the installer until Step 6.3.",
    );
  }

  app.setAppUserModelId("com.magno.dental.desktop");

  // Explicitly refuse to reuse an already-running
  // service on the backend port.
  await checkPortAvailable(BACKEND_PORT);

  startBackend();
  await waitForBackend();

  // Only grant camera/microphone media access
  // to the local React development application.
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      let allowed = false;

      try {
        allowed =
          permission === "media" &&
          new URL(webContents.getURL()).origin === new URL(FRONTEND_URL).origin;
      } catch {
        allowed = false;
      }

      callback(allowed);
    },
  );

  createWindow();
}

if (hasLock) {
  app
    .whenReady()
    .then(startDesktop)
    .catch((error) => {
      console.error("Desktop startup failed:", error);

      dialog.showErrorBox("Magno Dental startup failed", error.message);

      app.quit();
    });
}

app.on("activate", () => {
  if (
    hasLock &&
    !quitting &&
    backendProcess &&
    BrowserWindow.getAllWindows().length === 0
  ) {
    createWindow();
  }
});

app.on("before-quit", () => {
  quitting = true;

  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
