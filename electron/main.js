const { app, BrowserWindow, session } = require("electron");

const path = require("node:path");

let mainWindow = null;

const FRONTEND_URL = "http://localhost:5173";

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
      preload: path.join(__dirname, "preload.js"),

      // Prevent React from accessing Node.js directly.
      nodeIntegration: false,

      // Keep the preload isolated from the page.
      contextIsolation: true,

      // Keep Chromium's renderer sandbox enabled.
      sandbox: true,

      webSecurity: true,
    },
  });

  // Reject navigation away from the local development app.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);

      if (target.origin !== new URL(FRONTEND_URL).origin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Do not let pages open arbitrary new windows.
  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: "deny",
  }));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.loadURL(FRONTEND_URL).catch((error) => {
    console.error("Unable to load React frontend:", error);
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Development origin only.
  // Native file picker / backup IPC will be added later.
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const origin = webContents.getURL();

      const fromLocalApp = (() => {
        try {
          return new URL(origin).origin === new URL(FRONTEND_URL).origin;
        } catch {
          return false;
        }
      })();

      // Camera support for patient photographs.
      callback(fromLocalApp && permission === "media");
    },
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
