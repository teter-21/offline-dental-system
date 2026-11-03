const path = require("node:path");
const Database = require("better-sqlite3");

const databasePath = path.resolve(__dirname, "data", "dental_offline.db");

let db;

try {
  db = new Database(databasePath, {
    fileMustExist: true,
    timeout: 5000,
  });

  console.log("Database opened.");

  const result = db.pragma("wal_checkpoint(TRUNCATE)");
  console.log("Checkpoint result:", result);

  if (result.some((row) => Number(row.busy) !== 0)) {
    throw new Error("Checkpoint is busy. Another process may be using SQLite.");
  }

  const integrity = db.pragma("quick_check", {
    simple: true,
  });

  if (integrity !== "ok") {
    throw new Error("Database integrity check failed.");
  }

  console.log("Database integrity: OK");
} catch (error) {
  console.error("Checkpoint failed:", error.message);
  process.exitCode = 1;
} finally {
  if (db?.open) {
    db.close();
    console.log("SQLite connection closed.");
  }
}
