"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const BACKEND_DIR = path.resolve(__dirname, "..");

const SOURCE_DB = path.join(BACKEND_DIR, "data", "dental_offline.db");

const SOURCE_IMAGES = path.join(BACKEND_DIR, "storage", "patient-images");

if (process.platform !== "win32" || !process.env.APPDATA) {
  throw new Error("This migration script requires Windows APPDATA.");
}

const APP_DIR = path.join(process.env.APPDATA, "MagnoDentalDesktop");

const TARGET_ROOT = path.join(APP_DIR, "clinic-data");

const TARGET_DB = path.join(TARGET_ROOT, "data", "dental_offline.db");

const TARGET_IMAGES = path.join(TARGET_ROOT, "storage", "patient-images");

const VALID_IMAGE =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/i;

function exists(filePath) {
  return fs.existsSync(filePath);
}

async function hash(filePath) {
  const contents = await fsp.readFile(filePath);

  return crypto.createHash("sha256").update(contents).digest("hex");
}

async function verifyDatabase(dbPath, imagesPath) {
  const db = new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    if (db.pragma("integrity_check", { simple: true }) !== "ok") {
      throw new Error("Database integrity check failed.");
    }

    const foreignKeyErrors = db.pragma("foreign_key_check");

    if (foreignKeyErrors.length > 0) {
      throw new Error("Database foreign key validation failed.");
    }

    const requiredTables = [
      "patients",
      "users",
      "visits",
      "payments",
      "appointments",
      "queue",
      "dental_chart",
      "auth_sessions",
    ];

    for (const table of requiredTables) {
      const found = db
        .prepare(
          `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
      `,
        )
        .get(table);

      if (!found) {
        throw new Error(`Required table is missing: ${table}`);
      }
    }

    const imageReferences = db
      .prepare(
        `
      SELECT image
      FROM patients
      WHERE image LIKE 'local-private:%'
    `,
      )
      .all();

    for (const patient of imageReferences) {
      const filename = String(patient.image).slice("local-private:".length);

      if (!VALID_IMAGE.test(filename)) {
        throw new Error("Invalid patient image reference.");
      }

      if (!exists(path.join(imagesPath, filename))) {
        throw new Error(`Referenced patient image is missing: ${filename}`);
      }
    }

    return {
      patients: db.prepare("SELECT COUNT(*) AS total FROM patients").get()
        .total,

      visits: db.prepare("SELECT COUNT(*) AS total FROM visits").get().total,

      payments: db.prepare("SELECT COUNT(*) AS total FROM payments").get()
        .total,

      referencedImages: imageReferences.length,
    };
  } finally {
    db.close();
  }
}

async function copyImages(source, destination) {
  await fsp.mkdir(destination, { recursive: true });

  const entries = await fsp.readdir(source, {
    withFileTypes: true,
  });

  let copied = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !VALID_IMAGE.test(entry.name)) {
      throw new Error(`Unexpected file in patient image folder: ${entry.name}`);
    }

    const sourceFile = path.join(source, entry.name);
    const destinationFile = path.join(destination, entry.name);

    await fsp.copyFile(sourceFile, destinationFile, fs.constants.COPYFILE_EXCL);

    if ((await hash(sourceFile)) !== (await hash(destinationFile))) {
      throw new Error(`Image verification failed: ${entry.name}`);
    }

    copied++;
  }

  return copied;
}

async function migrate() {
  console.log("Magno Dental AppData Migration");
  console.log("Source DB:", SOURCE_DB);
  console.log("Target DB:", TARGET_DB);

  if (!exists(SOURCE_DB)) {
    throw new Error("Original SQLite database does not exist.");
  }

  // Never replace an existing clinic database.
  if (exists(TARGET_ROOT)) {
    throw new Error(
      "AppData clinic-data already exists. " +
        "Migration was cancelled to protect existing records.",
    );
  }

  const sourceImagesExist = exists(SOURCE_IMAGES);

  // A missing image directory is acceptable only
  // when the database has no referenced images.
  const sourceDb = new Database(SOURCE_DB, {
    readonly: true,
    fileMustExist: true,
  });

  let imageReferences;

  try {
    imageReferences = sourceDb
      .prepare(
        `
      SELECT image
      FROM patients
      WHERE image LIKE 'local-private:%'
    `,
      )
      .all();
  } finally {
    sourceDb.close();
  }

  if (!sourceImagesExist && imageReferences.length > 0) {
    throw new Error(
      "Patient photographs are referenced but " +
        "the original image directory is missing.",
    );
  }

  await fsp.mkdir(APP_DIR, { recursive: true });

  // Stage everything beside the destination.
  // Rename the complete folder only after validation.
  const staging = path.join(
    APP_DIR,
    `.clinic-data-migrating-${crypto.randomUUID()}`,
  );

  const stagedDb = path.join(staging, "data", "dental_offline.db");

  const stagedImages = path.join(staging, "storage", "patient-images");

  await fsp.mkdir(path.dirname(stagedDb), {
    recursive: true,
  });

  await fsp.mkdir(stagedImages, {
    recursive: true,
  });

  try {
    // SQLite's backup API handles committed WAL data.
    const original = new Database(SOURCE_DB, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      await original.backup(stagedDb);
    } finally {
      original.close();
    }

    const copiedImages = sourceImagesExist
      ? await copyImages(SOURCE_IMAGES, stagedImages)
      : 0;

    const summary = await verifyDatabase(stagedDb, stagedImages);

    // Recheck so that existing destination data
    // will never be intentionally overwritten.
    if (exists(TARGET_ROOT)) {
      throw new Error("Destination appeared during migration. Cancelled.");
    }

    await fsp.rename(staging, TARGET_ROOT);

    console.log("\nMigration completed successfully.");
    console.log("Patients:", summary.patients);
    console.log("Visits:", summary.visits);
    console.log("Payments:", summary.payments);
    console.log("Photos copied:", copiedImages);
    console.log("Referenced photos verified:", summary.referencedImages);
    console.log("Database:", TARGET_DB);
    console.log("Images:", TARGET_IMAGES);
    console.log("\nThe original project database and photos were preserved.");
  } catch (error) {
    await fsp
      .rm(staging, {
        recursive: true,
        force: true,
      })
      .catch(() => {});

    throw error;
  }
}

migrate().catch((error) => {
  console.error("\nMigration failed:", error.message);

  process.exitCode = 1;
});
