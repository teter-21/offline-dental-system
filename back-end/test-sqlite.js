const path = require("path");
const { initializeSQLite, closeSQLite } = require("./config/sqlite");

const dbPath = path.join(__dirname, "data", "dental_offline.db");

try {
  const db = initializeSQLite(dbPath);

  console.log("SQLite connection successful!");

  const tables = db
    .prepare(
      `
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `,
    )
    .all();

  console.log("\nDatabase tables:");
  tables.forEach((table) => console.log("- " + table.name));

  const patients = db.prepare("SELECT COUNT(*) AS total FROM patients").get();

  const visits = db.prepare("SELECT COUNT(*) AS total FROM visits").get();

  const payments = db.prepare("SELECT COUNT(*) AS total FROM payments").get();

  console.log("\nDatabase records:");
  console.log("Patients:", patients.total);
  console.log("Visits:", visits.total);
  console.log("Payments:", payments.total);

  const integrity = db.pragma("integrity_check", {
    simple: true,
  });

  console.log("\nIntegrity check:", integrity);
} catch (error) {
  console.error("SQLite test failed:", error.message);
  process.exitCode = 1;
} finally {
  closeSQLite();
}
