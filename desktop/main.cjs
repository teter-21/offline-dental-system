"use strict";

const {
  app,
  BrowserWindow,
  dialog,
  session,
  utilityProcess,
} = require("electron");

const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(PROJECT_ROOT, "back-end");
const BACKEND_SCRIPT = path.join(BACKEND_DIR, "server-sqlite.js");

const FRONTEND_DIST = path.join(PROJECT_ROOT, "front-end", "dist");

const BACKEND_PORT = 3001;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

const PREVIEW_BUILD = process.env.MAGNO_PREVIEW_BUILD === "1";

const FRONTEND_URL = PREVIEW_BUILD ? BACKEND_URL : "http://127.0.0.1:5173";

let mainWindow = null;
let backendProcess = null;
let quitting = false;
let shutdownStarted = false;

console.log("================================");
console.log("Magno Dental Desktop");
console.log("Production preview:", PREVIEW_BUILD);
console.log("Frontend:", FRONTEND_URL);
console.log("Backend:", BACKEND_URL);
console.log("================================");

/* ============================================
   SINGLE INSTANCE
   ============================================ */

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
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
   APPDATA PATHS
   ============================================ */

function getClinicPaths() {
  const root = path.join(app.getPath("appData"), "MagnoDentalDesktop");

  const clinicData = path.join(root, "clinic-data");

  return {
    database: path.join(clinicData, "data", "dental_offline.db"),

    images: path.join(clinicData, "storage", "patient-images"),

    backups: path.join(root, "backups"),
  };
}

/* ============================================
   CHECK BACKEND PORT
   ============================================ */

function checkBackendPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", () => {
      reject(
        new Error(
          `Port ${BACKEND_PORT} is already in use. ` +
            "Close the previous backend first.",
        ),
      );
    });

    server.listen(BACKEND_PORT, "127.0.0.1", () => server.close(resolve));
  });
}

/* ============================================
   START EMBEDDED BACKEND
   ============================================ */

function startBackend() {
  if (backendProcess) {
    throw new Error("Backend is already running.");
  }

  if (!fs.existsSync(BACKEND_SCRIPT)) {
    throw new Error(`Backend script not found: ${BACKEND_SCRIPT}`);
  }

  const paths = getClinicPaths();

  if (!fs.existsSync(paths.database)) {
    throw new Error(
      "AppData clinic database not found:\n" +
        paths.database +
        "\n\nComplete Step 6.3C migration first.",
    );
  }

  console.log("Starting Electron utility backend...");
  console.log("Using database:", paths.database);

  const child = utilityProcess.fork(BACKEND_SCRIPT, [], {
    cwd: BACKEND_DIR,

    stdio: "pipe",

    serviceName: "Magno Dental SQLite Backend",

    env: {
      ...process.env,

      PORT: String(BACKEND_PORT),

      FRONTEND_URL,

      MAGNO_SERVE_BUILT_UI: PREVIEW_BUILD ? "1" : "0",

      SQLITE_DB_PATH: paths.database,

      PATIENT_IMAGES_DIR: paths.images,

      MAGNO_BACKUP_DIR: paths.backups,
    },
  });

  backendProcess = child;

  child.stdout?.on("data", (data) => {
    console.log("[SQLite backend]", data.toString().trim());
  });

  child.stderr?.on("data", (data) => {
    console.error("[SQLite backend error]", data.toString().trim());
  });

  child.on("error", (error) => {
    console.error("Utility process error:", error);
  });

  child.on("exit", (code) => {
    console.log("SQLite utility process exited with code:", code);

    if (backendProcess === child) {
      backendProcess = null;
    }

    if (!quitting) {
      dialog.showErrorBox(
        "Backend Stopped",
        "The SQLite backend stopped unexpectedly. " +
          "Check the terminal for errors.",
      );

      app.quit();
    }
  });
}

/* ============================================
   WAIT FOR SQLITE
   ============================================ */

async function waitForBackend() {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    if (!backendProcess) {
      throw new Error("SQLite backend exited during startup.");
    }

    try {
      const response = await fetch(`${BACKEND_URL}/health/ready`, {
        signal: AbortSignal.timeout(1000),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.status === "ready" && data.database === "sqlite") {
          console.log("SQLite backend ready.");
          return;
        }
      }
    } catch {
      // Wait for backend initialization.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    "SQLite backend did not become ready. " +
      "Check native module compatibility and backend logs.",
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

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

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
    if (quitting) return;

    console.error("React frontend failed to load:", error);

    dialog.showErrorBox(
      "Frontend Error",
      "Unable to load the React application.",
    );

    app.quit();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ============================================
   START DESKTOP
   ============================================ */

async function startDesktop() {
  if (app.isPackaged) {
    throw new Error(
      "Installer configuration is not complete. " +
        "Complete the production packaging step first.",
    );
  }

  app.setAppUserModelId("com.magno.dental.desktop");

  if (PREVIEW_BUILD) {
    const index = path.join(FRONTEND_DIST, "index.html");

    if (!fs.existsSync(index)) {
      throw new Error(
        "React build missing. " + "Run npm run build:ui:desktop.",
      );
    }
  }

  await checkBackendPort();

  startBackend();

  await waitForBackend();

  // Allow the patient camera feature only
  // from the application's local origin.
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

/* ============================================
   GRACEFUL BACKEND SHUTDOWN
   ============================================ */

function stopBackend() {
  const child = backendProcess;

  if (!child) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let finished = false;

    const finish = (clean) => {
      if (finished) return;

      finished = true;
      clearTimeout(timeout);

      resolve(clean);
    };

    const timeout = setTimeout(() => {
      console.error(
        "Backend shutdown timed out. " + "Forcing utility-process termination.",
      );

      child.kill();
      finish(false);
    }, 20000);

    child.once("exit", (code) => {
      if (backendProcess === child) {
        backendProcess = null;
      }

      finish(code === 0);
    });

    try {
      console.log("Requesting graceful SQLite shutdown...");

      child.postMessage({
        type: "shutdown",
      });
    } catch (error) {
      console.error("Shutdown message failed:", error);

      child.kill();
      finish(false);
    }
  });
}

/* ============================================
   ELECTRON STARTUP
   ============================================ */

if (hasLock) {
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
   WINDOW REACTIVATION
   ============================================ */

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

/* ============================================
   APPLICATION QUIT
   ============================================ */

app.on("before-quit", (event) => {
  if (shutdownStarted) return;

  event.preventDefault();

  shutdownStarted = true;
  quitting = true;

  stopBackend()
    .then((clean) => {
      if (clean) {
        console.log("SQLite backend closed successfully.");
      } else {
        console.error("Backend did not confirm a clean shutdown.");
      }

      app.quit();
    })
    .catch((error) => {
      console.error("Application shutdown error:", error);

      app.quit();
    });
});

app.on("window-all-closed", () => {
  app.quit();
});
