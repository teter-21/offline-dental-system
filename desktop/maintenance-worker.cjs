"use strict";

const { parentPort } = process;
const path = require("node:path");

if (!parentPort) {
  throw new Error("Maintenance must run inside an Electron utility process.");
}

const servicesDir = path.resolve(__dirname, "../back-end/services");

parentPort.once("message", async (event) => {
  const command = event.data;

  let response;
  let exitCode = 0;

  try {
    if (!command || typeof command.type !== "string") {
      throw new Error("Invalid maintenance request.");
    }

    if (command.type === "backup") {
      const { createBackup } = require(
        path.join(servicesDir, "backupService.js"),
      );

      const result = await createBackup();

      response = {
        ok: true,
        result,
      };
    } else if (command.type === "verify") {
      const { verifyBackup } = require(
        path.join(servicesDir, "backupService.js"),
      );

      const manifest = await verifyBackup(command.backupPath);

      if (manifest.application !== "Magno Dental Desktop") {
        throw new Error("Invalid application backup.");
      }

      response = {
        ok: true,
        result: {
          createdAt: manifest.createdAt,
          imageCount: manifest.images.length,
        },
      };
    } else if (command.type === "restore") {
      const { restoreBackup } = require(
        path.join(servicesDir, "restoreService.js"),
      );

      const result = await restoreBackup(command.backupPath);

      response = {
        ok: true,
        result,
      };
    } else {
      throw new Error("Unknown maintenance operation.");
    }
  } catch (error) {
    exitCode = 1;

    console.error("Maintenance operation failed:", error);

    response = {
      ok: false,
      error: error.message || "Maintenance failed.",
    };
  }

  parentPort.postMessage(response);

  // Allow the message to reach the parent process.
  // The parent waits for this worker to exit.
  setTimeout(() => {
    process.exit(exitCode);
  }, 100);
});
