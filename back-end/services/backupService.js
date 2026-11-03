const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

// Same locations used by the SQLite backend.
const BACKEND_DIR = path.resolve(__dirname, "..");

const DATABASE_PATH = path.join(BACKEND_DIR, "data", "dental_offline.db");

const IMAGE_DIRECTORY = path.resolve(
  process.env.PATIENT_IMAGES_DIR ||
    path.join(BACKEND_DIR, "storage", "patient-images"),
);

const BACKUP_DIRECTORY = path.join(BACKEND_DIR, "backups");

function validImageFilename(filename) {
  return /^[a-f0-9-]{36}\.jpg$/.test(filename);
}

async function sha256(filePath) {
  const contents = await fs.readFile(filePath);

  return crypto.createHash("sha256").update(contents).digest("hex");
}

async function copyPatientImages(destination) {
  await fs.mkdir(destination, { recursive: true });

  let filenames = [];

  try {
    filenames = await fs.readdir(IMAGE_DIRECTORY);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const copied = [];

  for (const filename of filenames) {
    if (!validImageFilename(filename)) {
      continue;
    }

    const source = path.join(IMAGE_DIRECTORY, filename);

    const stats = await fs.lstat(source);

    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Unsafe image entry encountered: ${filename}`);
    }

    const destinationFile = path.join(destination, filename);

    await fs.copyFile(
      source,
      destinationFile,
      require("node:fs").constants.COPYFILE_EXCL,
    );

    copied.push({
      filename,
      size: stats.size,
      sha256: await sha256(destinationFile),
    });
  }

  return copied;
}

async function verifyBackup(backupPath) {
  const manifestPath = path.join(backupPath, "manifest.json");

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.images) ||
    !/^[a-f0-9]{64}$/.test(manifest.databaseSha256)
  ) {
    throw new Error("Invalid backup manifest.");
  }

  const backupDatabase = path.join(backupPath, "dental_offline.db");

  if ((await sha256(backupDatabase)) !== manifest.databaseSha256) {
    throw new Error("Database checksum verification failed.");
  }

  const db = new Database(backupDatabase, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    const integrity = db.pragma("integrity_check", {
      simple: true,
    });

    if (integrity !== "ok") {
      throw new Error("SQLite integrity check failed.");
    }

    const foreignKeyErrors = db.pragma("foreign_key_check");

    if (foreignKeyErrors.length > 0) {
      throw new Error("SQLite foreign key validation failed.");
    }

    const requiredTables = [
      "patients",
      "users",
      "appointments",
      "queue",
      "visits",
      "payments",
      "dental_chart",
    ];

    for (const table of requiredTables) {
      const exists = db
        .prepare(
          `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
      `,
        )
        .get(table);

      if (!exists) {
        throw new Error(`Missing database table: ${table}`);
      }
    }

    // Ensure every local image referenced by a patient
    // is included in the backup.
    const references = db
      .prepare(
        `
      SELECT image
      FROM patients
      WHERE image LIKE 'local-private:%'
    `,
      )
      .all();

    const backedUpImages = new Set(
      manifest.images.map((item) => item.filename),
    );

    for (const row of references) {
      const filename = String(row.image).slice("local-private:".length);

      if (!validImageFilename(filename) || !backedUpImages.has(filename)) {
        throw new Error(
          "A patient image referenced by the database is missing.",
        );
      }
    }
  } finally {
    db.close();
  }

  for (const image of manifest.images) {
    if (
      !validImageFilename(image.filename) ||
      !/^[a-f0-9]{64}$/.test(image.sha256)
    ) {
      throw new Error("Invalid image entry in backup manifest.");
    }

    const imagePath = path.join(backupPath, "patient-images", image.filename);

    if ((await sha256(imagePath)) !== image.sha256) {
      throw new Error(`Image checksum verification failed: ${image.filename}`);
    }
  }

  return manifest;
}

async function createBackup() {
  await fs.mkdir(BACKUP_DIRECTORY, {
    recursive: true,
    mode: 0o700,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const backupPath = path.join(
    BACKUP_DIRECTORY,
    `backup-${timestamp}-${crypto.randomBytes(4).toString("hex")}`,
  );

  await fs.mkdir(backupPath, {
    recursive: false,
    mode: 0o700,
  });

  try {
    const destinationDatabase = path.join(backupPath, "dental_offline.db");

    const sourceDatabase = new Database(DATABASE_PATH, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      // Uses SQLite's native backup API.
      // Correctly copies committed records even when
      // the source database uses WAL journaling.
      await sourceDatabase.backup(destinationDatabase);
    } finally {
      sourceDatabase.close();
    }

    const images = await copyPatientImages(
      path.join(backupPath, "patient-images"),
    );

    const manifest = {
      version: 1,
      application: "Magno Dental Desktop",
      createdAt: new Date().toISOString(),
      databaseSha256: await sha256(destinationDatabase),
      images,
    };

    await fs.writeFile(
      path.join(backupPath, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      },
    );

    await verifyBackup(backupPath);

    return {
      backupPath,
      imageCount: images.length,
      verified: true,
    };
  } catch (error) {
    // An incomplete backup should not appear valid.
    await fs.rm(backupPath, {
      recursive: true,
      force: true,
    });

    throw error;
  }
}

module.exports = {
  createBackup,
  verifyBackup,
  DATABASE_PATH,
  IMAGE_DIRECTORY,
  BACKUP_DIRECTORY,
};
