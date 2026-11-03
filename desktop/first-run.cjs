"use strict";

const fs = require("node:fs");
const path = require("node:path");

function initializeClinicData(app) {
  const root = path.join(app.getPath("appData"), "MagnoDentalDesktop");

  const databaseDir = path.join(root, "clinic-data", "data");

  const imagesDir = path.join(root, "clinic-data", "storage", "patient-images");

  const databasePath = path.join(databaseDir, "dental_offline.db");

  fs.mkdirSync(databaseDir, {
    recursive: true,
  });

  fs.mkdirSync(imagesDir, {
    recursive: true,
  });

  // Never overwrite an existing clinic database.
  if (fs.existsSync(databasePath)) {
    return {
      databasePath,
      imagesDir,
      firstRun: false,
    };
  }

  // A clean database must be packaged with the app.
  const seedPath = app.isPackaged
    ? path.join(process.resourcesPath, "seed", "clinic_initial.db")
    : path.join(__dirname, "..", "packaging", "seed", "clinic_initial.db");

  if (!fs.existsSync(seedPath)) {
    throw new Error(
      "Clean starter database is missing. " +
        "The application cannot initialize safely.",
    );
  }

  // Exclusive creation prevents replacing live data.
  fs.copyFileSync(seedPath, databasePath, fs.constants.COPYFILE_EXCL);

  return {
    databasePath,
    imagesDir,
    firstRun: true,
  };
}

module.exports = {
  initializeClinicData,
};
