const path = require("node:path");

const { initializeSQLite, closeSQLite } = require("./config/sqlite");

const databasePath = path.join(__dirname, "data", "dental_offline.db");

try {
  const db = initializeSQLite(databasePath);

  const patients = db
    .prepare(
      `
    SELECT
      p.id,
      p.name,
      p.age,
      p.phone,
      p.image,
      COALESCE(
        (
          SELECT NULLIF(TRIM(v.complain), '')
          FROM visits v
          WHERE v.patient_id = p.id
            AND NULLIF(TRIM(v.complain), '') IS NOT NULL
          ORDER BY
            v.visit_date DESC,
            v.visit_time DESC,
            v.id DESC
          LIMIT 1
        ),
        p.complain
      ) AS complain
    FROM patients p
    ORDER BY p.id DESC
    LIMIT 10
  `,
    )
    .all();

  console.log("SQLite patient query successful!");
  console.table(patients);

  const admin = db
    .prepare(
      `
    SELECT id, fullname, email, role
    FROM users
    WHERE role = ?
    LIMIT 1
  `,
    )
    .get("admin");

  console.log("Admin account:", admin);
} catch (error) {
  console.error("SQLite query failed:", error);
  process.exitCode = 1;
} finally {
  closeSQLite();
}
