const { getSQLite } = require("../config/sqlite");

function clinicToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

// DASHBOARD SUMMARY
exports.getDashboardSummary = (req, res) => {
  try {
    const db = getSQLite();

    const patients = db
      .prepare(
        `
      SELECT COUNT(*) AS total FROM patients
    `,
      )
      .get();

    const pending = db
      .prepare(
        `
      SELECT COUNT(*) AS total
      FROM appointments
      WHERE status = 'Pending'
    `,
      )
      .get();

    const today = db
      .prepare(
        `
      SELECT COUNT(*) AS total
      FROM appointments
      WHERE preferred_date = ?
    `,
      )
      .get(clinicToday());

    const revenue = db
      .prepare(
        `
      SELECT COALESCE(SUM(amount_paid), 0) AS total
      FROM visits
    `,
      )
      .get();

    return res.json({
      totalPatients: Number(patients.total),
      pendingAppointments: Number(pending.total),
      todayAppointments: Number(today.total),
      totalRevenue: Number(revenue.total),
    });
  } catch (error) {
    console.error("SQLite dashboard summary failed:", error);

    return res.status(500).json({
      message: "Unable to load dashboard statistics.",
    });
  }
};

// MONTHLY REVENUE - CURRENT MONTH + PREVIOUS FIVE
exports.getMonthlyRevenue = (req, res) => {
  try {
    const today = clinicToday();
    const monthStart = `${today.slice(0, 7)}-01`;

    const firstMonth = new Date(`${monthStart}T00:00:00Z`);

    firstMonth.setUTCMonth(firstMonth.getUTCMonth() - 5);

    const startDate = firstMonth.toISOString().slice(0, 10);

    const rows = getSQLite()
      .prepare(
        `
      SELECT
        CAST(strftime('%Y', visit_date) AS INTEGER) AS year,
        CAST(strftime('%m', visit_date) AS INTEGER) AS month,
        COALESCE(SUM(amount_paid), 0) AS revenue
      FROM visits
      WHERE visit_date >= ?
        AND visit_date <= ?
      GROUP BY
        strftime('%Y', visit_date),
        strftime('%m', visit_date)
      ORDER BY
        year ASC,
        month ASC
    `,
      )
      .all(startDate, today);

    return res.json(
      rows.map((row) => ({
        year: Number(row.year),
        month: Number(row.month),
        revenue: Number(row.revenue || 0),
      })),
    );
  } catch (error) {
    console.error("SQLite monthly revenue failed:", error);

    return res.status(500).json({
      message: "Unable to load monthly revenue.",
    });
  }
};

// TOP PROCEDURES THIS MONTH
exports.getTopProcedures = (req, res) => {
  try {
    const today = clinicToday();
    const monthStart = `${today.slice(0, 7)}-01`;

    const nextMonthDate = new Date(`${monthStart}T00:00:00Z`);

    nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);

    const nextMonth = nextMonthDate.toISOString().slice(0, 10);

    const rows = getSQLite()
      .prepare(
        `
      SELECT
        procedure_name AS name,
        COUNT(*) AS count
      FROM visits
      WHERE procedure_name IS NOT NULL
        AND procedure_name <> ''
        AND visit_date >= ?
        AND visit_date < ?
      GROUP BY procedure_name
      ORDER BY count DESC
      LIMIT 5
    `,
      )
      .all(monthStart, nextMonth);

    const total = rows.reduce((sum, item) => sum + Number(item.count), 0);

    return res.json(
      rows.map((item) => ({
        name: item.name,
        count: Number(item.count),
        percent: total > 0 ? Math.round((Number(item.count) / total) * 100) : 0,
      })),
    );
  } catch (error) {
    console.error("SQLite top procedures failed:", error);

    return res.status(500).json({
      message: "Unable to load procedures.",
    });
  }
};
