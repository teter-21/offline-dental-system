const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const {
  verifyBackup,
  DATABASE_PATH,
  IMAGE_DIRECTORY,
} = require("./backupService");

const { COPYFILE_EXCL } = require("node:fs").constants;

async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function copyImages(source, target) {
  await fs.mkdir(target, { recursive: true });

  if (!(await exists(source))) return;

  for (const name of await fs.readdir(source)) {
    if (!/^[a-f0-9-]{36}\.jpg$/.test(name)) {
      throw new Error("Unsafe image filename.");
    }

    const sourceFile = path.join(source, name);
    const stat = await fs.lstat(sourceFile);

    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("Unsafe image file.");
    }

    await fs.copyFile(sourceFile, path.join(target, name), COPYFILE_EXCL);
  }
}

function inspectDatabase(filename) {
  const db = new Database(filename, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    if (db.pragma("integrity_check", { simple: true }) !== "ok") {
      throw new Error("Database integrity check failed.");
    }

    if (db.pragma("foreign_key_check").length) {
      throw new Error("Database foreign-key check failed.");
    }
  } finally {
    db.close();
  }
}

async function restoreBackup(backupPath) {
  if (!path.isAbsolute(backupPath)) {
    throw new Error("An absolute backup folder path is required.");
  }

  const manifest = await verifyBackup(backupPath);

  if (manifest.application !== "Magno Dental Desktop") {
    throw new Error("Invalid application backup.");
  }

  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (await exists(DATABASE_PATH + suffix)) {
      throw new Error(
        "SQLite journal files are present. Do not restore until the database is safely closed.",
      );
    }
  }

  const id = crypto.randomBytes(8).toString("hex");
  const databaseParent = path.dirname(DATABASE_PATH);
  const imageParent = path.dirname(IMAGE_DIRECTORY);

  await fs.mkdir(databaseParent, { recursive: true });
  await fs.mkdir(imageParent, { recursive: true });

  // Staging and recovery paths are next to their live
  // destinations so renames stay on the same filesystem.
  const stagedDb = path.join(databaseParent, `.restore-stage-${id}.db`);
  const oldDb = path.join(databaseParent, `.restore-previous-${id}.db`);
  const stagedImages = path.join(imageParent, `.restore-images-stage-${id}`);
  const oldImages = path.join(imageParent, `.restore-images-previous-${id}`);

  let dbMoved = false;
  let imagesMoved = false;
  let dbInstalled = false;
  let imagesInstalled = false;
  let switchStarted = false;

  try {
    // Prepare the new data without touching live records.
    await fs.copyFile(
      path.join(backupPath, "dental_offline.db"),
      stagedDb,
      COPYFILE_EXCL,
    );

    await copyImages(path.join(backupPath, "patient-images"), stagedImages);

    inspectDatabase(stagedDb);

    // Validate the exact staged contents too.
    const stagedImageNames = await fs.readdir(stagedImages);

    if (stagedImageNames.length !== manifest.images.length) {
      throw new Error("Incomplete staged patient images.");
    }

    // The application MUST already be stopped.
    switchStarted = true;

    if (await exists(DATABASE_PATH)) {
      await fs.rename(DATABASE_PATH, oldDb);
      dbMoved = true;
    }

    if (await exists(IMAGE_DIRECTORY)) {
      await fs.rename(IMAGE_DIRECTORY, oldImages);
      imagesMoved = true;
    }

    await fs.rename(stagedDb, DATABASE_PATH);
    dbInstalled = true;

    await fs.rename(stagedImages, IMAGE_DIRECTORY);
    imagesInstalled = true;

    inspectDatabase(DATABASE_PATH);

    // Keep previous files for manual recovery.
    return {
      restored: true,
      backupDate: manifest.createdAt,
      previousDatabase: dbMoved ? oldDb : null,
      previousImages: imagesMoved ? oldImages : null,
    };
  } catch (error) {
    if (switchStarted) {
      try {
        if (dbInstalled) {
          await fs.rm(DATABASE_PATH, { force: true });
        }

        if (imagesInstalled) {
          await fs.rm(IMAGE_DIRECTORY, {
            recursive: true,
            force: true,
          });
        }

        if (dbMoved && (await exists(oldDb))) {
          await fs.rename(oldDb, DATABASE_PATH);
        }

        if (imagesMoved && (await exists(oldImages))) {
          await fs.rename(oldImages, IMAGE_DIRECTORY);
        }
      } catch (rollbackError) {
        console.error(
          "ROLLBACK FAILED. Preserve the recovery files:",
          oldDb,
          oldImages,
          rollbackError,
        );

        throw new Error(
          "Restore and automatic rollback failed. Do not restart the application until the data is manually recovered.",
        );
      }
    }

    throw error;
  } finally {
    // Clean unused staging files. Do not delete the
    // previous data copies, even after success.
    await fs.rm(stagedDb, { force: true }).catch(() => {});
    await fs
      .rm(stagedImages, {
        recursive: true,
        force: true,
      })
      .catch(() => {});
  }
}

module.exports = { restoreBackup };
