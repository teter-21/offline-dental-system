const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

let database = null;

function initializeSQLite(databasePath) {
  if (database) return database;

  if (!databasePath || !path.isAbsolute(databasePath)) {
    throw new Error("An absolute SQLite database path is required.");
  }

  if (!fs.existsSync(databasePath)) {
    throw new Error(`SQLite database not found: ${databasePath}`);
  }

  database = new Database(databasePath, {
    fileMustExist: true,
    timeout: 5000,
  });

  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");

  const integrity = database.pragma("quick_check", {
    simple: true,
  });

  if (integrity !== "ok") {
    database.close();
    database = null;
    throw new Error("SQLite database integrity check failed.");
  }

  return database;
}

function getSQLite() {
  if (!database) {
    throw new Error("SQLite database has not been initialized.");
  }

  return database;
}

function closeSQLite() {
  if (database?.open) {
    database.close();
  }

  database = null;
}

module.exports = {
  initializeSQLite,
  getSQLite,
  closeSQLite,
};
