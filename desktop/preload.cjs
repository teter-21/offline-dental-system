"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "magnoDesktop",
  Object.freeze({
    isDesktop: true,

    createBackup: ({ token } = {}) => {
      return ipcRenderer.invoke("magno:create-backup", { token });
    },

    restoreBackup: ({ token } = {}) => {
      return ipcRenderer.invoke("magno:restore-backup", { token });
    },

    restoreInputFocus: () => {
      ipcRenderer.send("magno:restore-input-focus");
    },
  }),
);
