"use strict";

const { contextBridge } = require("electron");

// Development-only desktop identification.
// Privileged Backup and Restore operations
// will be introduced after administrator
// verification and process lifecycle handling.
contextBridge.exposeInMainWorld(
  "magnoDesktop",
  Object.freeze({
    isDesktop: true,
  }),
);
