"use strict";

const { initializeClinicData } = require("./first-run.cjs");

const { getOrCreateJwtSecret } = require("./runtime-secret.cjs");

const {
  app,
  BrowserWindow,
  dialog,
  session,
  utilityProcess,
  ipcMain,
} = require("electron");

const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");

const ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT, "back-end");
const BACKEND_SCRIPT = path.join(BACKEND_DIR, "server-sqlite.js");
const WORKER_SCRIPT = path.join(__dirname, "maintenance-worker.cjs");
const FRONTEND_DIST = path.join(ROOT, "front-end", "dist");

const PORT = 3001;
const BACKEND_URL = `http://127.0.0.1:${PORT}`;

const PREVIEW_BUILD = app.isPackaged || process.env.MAGNO_PREVIEW_BUILD === "1";

const FRONTEND_URL = PREVIEW_BUILD ? BACKEND_URL : "http://127.0.0.1:5173";

let mainWindow = null;
let backendProcess = null;
let quitting = false;
let shutdownStarted = false;
let maintenanceMode = false;
let operationInProgress = false;

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

/* ============================================
   PERSISTENT STORAGE
   ============================================ */

function getClinicPaths() {
  const root = path.join(app.getPath("appData"), "MagnoDentalDesktop");

  const clinicData = path.join(root, "clinic-data");

  return {
    clinicData,
    database: path.join(clinicData, "data", "dental_offline.db"),
    images: path.join(clinicData, "storage", "patient-images"),
    backups: path.join(root, "backups"),
  };
}

function backendEnv() {
  const paths = getClinicPaths();

  return {
    ...process.env,

    // Unique secret persisted for this installation.
    JWT_SECRET: getOrCreateJwtSecret(app),

    PORT: String(PORT),
    FRONTEND_URL,

    MAGNO_DESKTOP_MODE: "1",

    MAGNO_SERVE_BUILT_UI: PREVIEW_BUILD ? "1" : "0",

    SQLITE_DB_PATH: paths.database,
    PATIENT_IMAGES_DIR: paths.images,
    MAGNO_BACKUP_DIR: paths.backups,
  };
}

/* ============================================
   BACKEND STARTUP
   ============================================ */

function checkPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();

    probe.once("error", () => {
      reject(new Error(`Port ${PORT} is already in use.`));
    });

    probe.listen(PORT, "127.0.0.1", () => {
      probe.close(resolve);
    });
  });
}

function startBackend() {
  if (backendProcess) {
    throw new Error("Backend is already running.");
  }

  const paths = getClinicPaths();

  if (!fs.existsSync(paths.database)) {
    throw new Error("AppData database not found:\n" + paths.database);
  }

  if (!fs.existsSync(BACKEND_SCRIPT)) {
    throw new Error("Backend script is missing.");
  }

  const child = utilityProcess.fork(BACKEND_SCRIPT, [], {
    cwd: app.getPath("userData"),
    stdio: "pipe",
    serviceName: "Magno Dental SQLite Backend",
    env: backendEnv(),
  });

  backendProcess = child;

  child.stdout?.on("data", (data) => {
    console.log("[Backend]", data.toString().trim());
  });

  child.stderr?.on("data", (data) => {
    console.error("[Backend error]", data.toString().trim());
  });

  child.on("error", (error) => {
    console.error("Backend process error:", error);
  });

  child.on("exit", (code) => {
    console.log("Backend exited:", code);

    if (backendProcess === child) {
      backendProcess = null;
    }

    if (!quitting && !maintenanceMode) {
      dialog.showErrorBox(
        "Backend stopped",
        "The database service stopped unexpectedly.",
      );
      app.quit();
    }
  });
}

async function waitForBackend() {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    if (!backendProcess) {
      throw new Error("Backend exited during startup.");
    }

    try {
      const response = await fetch(`${BACKEND_URL}/health/ready`, {
        signal: AbortSignal.timeout(1000),
      });

      if (response.ok) {
        const result = await response.json();

        if (result.status === "ready" && result.database === "sqlite") {
          return;
        }
      }
    } catch {
      // The backend is still initializing.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Backend did not become ready.");
}

/* ============================================
   GRACEFUL SQLITE SHUTDOWN
   ============================================ */

function stopBackend() {
  const child = backendProcess;

  if (!child) {
    return Promise.resolve(false);
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
      console.error("Backend shutdown timed out.");
      child.kill();
      finish(false);
    }, 25000);

    child.once("exit", (code) => {
      if (backendProcess === child) {
        backendProcess = null;
      }
      finish(code === 0);
    });

    try {
      child.postMessage({ type: "shutdown" });
    } catch (error) {
      console.error("Shutdown message failed:", error);
      child.kill();
      finish(false);
    }
  });
}

/* ============================================
   MAINTENANCE WORKER
   ============================================ */

function runWorker(type, options = {}, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(WORKER_SCRIPT, [], {
      cwd: BACKEND_DIR,
      stdio: "pipe",
      serviceName: "Magno Dental Maintenance",
      env: {
        ...backendEnv(),
        ...overrides,
      },
    });

    let response = null;

    child.stdout?.on("data", (data) => {
      console.log("[Maintenance]", data.toString().trim());
    });

    child.stderr?.on("data", (data) => {
      console.error("[Maintenance error]", data.toString().trim());
    });

    child.on("message", (message) => {
      response = message;
    });

    child.once("spawn", () => {
      child.postMessage({ type, ...options });
    });

    child.once("exit", (code) => {
      if (response?.ok && code === 0) {
        resolve(response.result);
      } else {
        reject(
          new Error(
            response?.error || `Maintenance worker stopped with code ${code}.`,
          ),
        );
      }
    });

    child.on("error", (error) => {
      console.error("Maintenance process error:", error);
    });
  });
}

/* ============================================
   IPC SENDER AND ADMIN VERIFICATION
   ============================================ */

function validateSender(event) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    return false;
  }

  try {
    return (
      new URL(event.senderFrame.url).origin === new URL(FRONTEND_URL).origin
    );
  } catch {
    return false;
  }
}

async function authorize(event, token) {
  if (!validateSender(event)) {
    throw new Error("Unauthorized desktop request.");
  }

  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    throw new Error("Please log in again.");
  }

  const response = await fetch(`${BACKEND_URL}/desktop/authorize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(
      "Administrator session verification failed. " + "Please log in again.",
    );
  }

  const result = await response.json();

  if (result.authorized !== true) {
    throw new Error("Administrator authorization denied.");
  }
}

/* ============================================
   BACKUP / RESTORE HELPERS
   ============================================ */

function isInside(parent, target) {
  const relative = path.relative(parent, target);

  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      !path.isAbsolute(relative))
  );
}

async function runWithStoppedBackend(operation) {
  maintenanceMode = true;
  let stoppedCleanly = false;
  let result;
  let failure = null;

  try {
    stoppedCleanly = await stopBackend();

    if (!stoppedCleanly) {
      throw new Error(
        "SQLite did not confirm a clean shutdown. " +
          "The operation was cancelled to protect your records.",
      );
    }

    result = await operation();
  } catch (error) {
    failure = error;
  }

  // Always attempt to restart the backend if
  // the previous process has stopped.
  if (!backendProcess && !quitting) {
    try {
      startBackend();
      await waitForBackend();
    } catch (restartError) {
      console.error("Backend restart failed:", restartError);

      failure = new Error(
        (failure ? failure.message + "\n\n" : "") +
          "The backend could not restart. " +
          "Close the application and inspect its logs before " +
          "performing any other maintenance operation.",
      );
    }
  }

  maintenanceMode = false;

  if (failure) throw failure;

  return result;
}

/* ============================================
   BACKUP BUTTON
   ============================================ */

ipcMain.handle("magno:create-backup", async (event, input) => {
  if (operationInProgress) {
    throw new Error("Another maintenance operation is running.");
  }

  operationInProgress = true;

  try {
    await authorize(event, input?.token);

    const selection = await dialog.showOpenDialog(mainWindow, {
      title: "Select a folder for your clinic backup",
      buttonLabel: "Save Backup Here",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: app.getPath("documents"),
    });

    if (selection.canceled || !selection.filePaths.length) {
      return { cancelled: true };
    }

    const destination = selection.filePaths[0];
    const paths = getClinicPaths();

    if (isInside(paths.clinicData, destination)) {
      throw new Error(
        "Choose a backup location outside the live clinic-data folder.",
      );
    }

    const result = await runWithStoppedBackend(() =>
      runWorker("backup", {}, { MAGNO_BACKUP_DIR: destination }),
    );

    return {
      success: true,
      location: result.backupPath,
    };
  } finally {
    operationInProgress = false;
  }
});

/* ============================================
   RESTORE BUTTON
   ============================================ */

ipcMain.handle("magno:restore-backup", async (event, input) => {
  if (operationInProgress) {
    throw new Error("Another maintenance operation is running.");
  }

  operationInProgress = true;

  try {
    await authorize(event, input?.token);

    const paths = getClinicPaths();

    const selection = await dialog.showOpenDialog(mainWindow, {
      title: "Select a Magno Dental backup folder",
      buttonLabel: "Select Backup",
      properties: ["openDirectory"],
      defaultPath: paths.backups,
    });

    if (selection.canceled || !selection.filePaths.length) {
      return { cancelled: true };
    }

    const backupPath = selection.filePaths[0];

    if (isInside(paths.clinicData, backupPath)) {
      throw new Error(
        "The live clinic-data folder cannot be used as a backup.",
      );
    }

    // Validate before shutting down the backend.
    const backupInfo = await runWorker("verify", { backupPath });

    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Confirm Database Restore",
      message: "Replace the current clinic records?",
      detail:
        `Backup date: ${backupInfo.createdAt}\n` +
        `Patient photographs: ${backupInfo.imageCount}\n\n` +
        "Current records will be replaced with the " +
        "selected backup. Changes made after that " +
        "backup may be lost.\n\n" +
        "The previous database and images will be " +
        "preserved for recovery.",
      buttons: ["Cancel", "Restore Backup"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });

    if (confirmation.response !== 1) {
      return { cancelled: true };
    }

    // Reverify after confirmation and immediately
    // before the restore operation, in the worker.
    const result = await runWithStoppedBackend(() =>
      runWorker("restore", { backupPath }),
    );

    return {
      success: result.restored === true,
      message: "Backup restored successfully.",
    };
  } finally {
    operationInProgress = false;
  }
});

/* ============================================
   NATIVE DIALOG INPUT-FOCUS FIX
   ============================================ */

ipcMain.on("magno:restore-input-focus", (event) => {
  if (!validateSender(event)) return;
  if (process.platform !== "win32") return;

  setTimeout(() => {
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      mainWindow.isMinimized() ||
      !mainWindow.isVisible()
    ) {
      return;
    }

    mainWindow.blur();
    mainWindow.focus();
    mainWindow.webContents.focus();
  }, 50);
});

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
    console.error("Frontend failed to load:", error);
    dialog.showErrorBox(
      "Frontend Error",
      "Unable to load the Magno Dental interface.",
    );
    app.quit();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ============================================
   APP STARTUP
   ============================================ */

async function startDesktop() {
  app.setAppUserModelId("com.magno.dental.desktop");

  if (PREVIEW_BUILD && !fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
    throw new Error("React build missing. Run npm run build:ui:desktop.");
  }

  // Initialize a first-time installation,
  // or reuse the existing AppData database.
  const clinicState = initializeClinicData(app);

  console.log(
    clinicState.firstRun
      ? "New clinic database initialized."
      : "Existing clinic database found.",
  );

  await checkPort();

  startBackend();
  await waitForBackend();

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
      console.error("Startup failed:", error);

      dialog.showErrorBox("Magno Dental Startup Error", error.message);

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

/* ============================================
   APPLICATION SHUTDOWN
   ============================================ */

app.on("before-quit", (event) => {
  if (shutdownStarted) return;

  if (operationInProgress) {
    event.preventDefault();
    return;
  }

  event.preventDefault();

  shutdownStarted = true;
  quitting = true;

  stopBackend()
    .catch((error) => {
      console.error("Shutdown error:", error);
    })
    .finally(() => {
      app.quit();
    });
});

app.on("window-all-closed", () => {
  app.quit();
});
