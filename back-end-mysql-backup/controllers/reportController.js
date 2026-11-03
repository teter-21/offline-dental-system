const { getSQLite } = require("../config/sqlite");
const { Readable, pipeline } = require("node:stream");

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

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

function getDateRange(req) {
  const today = clinicToday();

  if (!req.query.start_date && !req.query.end_date) {
    return {
      startDate: `${today.slice(0, 7)}-01`,
      endDate: today,
    };
  }

  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
    return null;
  }

  return { startDate, endDate };
}

function monthLabel(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, 1));

  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(date);

  return `${monthName} ${year}`;
}

function dayLabel(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function splitServices(value) {
  return String(value || "")
    .split("|")
    .map((service) => service.trim())
    .filter(Boolean);
}

function toNumber(value) {
  return Number(value || 0);
}

function countProcedures(rows) {
  const counts = new Map();

  for (const row of rows) {
    // Count each distinct service only once per visit.
    const unique = new Map();

    for (const service of splitServices(row.procedure_name)) {
      const key = service.toLocaleLowerCase("en-US");

      if (!unique.has(key)) {
        unique.set(key, service);
      }
    }

    for (const [key, name] of unique) {
      const current = counts.get(key);

      if (current) {
        current.value += 1;
      } else {
        counts.set(key, { name, value: 1 });
      }
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 20);
}

// AUTOMATIC REPORT: SUMMARY, CHARTS AND PREVIEW
exports.getReports = (req, res) => {
  const range = getDateRange(req);

  if (!range) {
    return res.status(400).json({
      message: "Enter a valid report date range.",
    });
  }

  const { startDate, endDate } = range;

  const group = req.query.group === "day" ? "day" : "month";

  try {
    const db = getSQLite();

    const summary = db
      .prepare(
        `
      SELECT
        (SELECT COUNT(*) FROM patients)
          AS totalPatients,
        COUNT(*) AS totalVisits,
        COALESCE(SUM(v.amount_paid), 0)
          AS totalRevenue,
        COALESCE(SUM(v.balance), 0)
          AS outstandingBalance
      FROM visits v
      WHERE v.visit_date BETWEEN ? AND ?
    `,
      )
      .get(startDate, endDate);

    const procedureRows = db
      .prepare(
        `
      SELECT id, procedure_name
      FROM visits
      WHERE visit_date BETWEEN ? AND ?
    `,
      )
      .all(startDate, endDate);

    const procedures = countProcedures(procedureRows);

    const groupingExpression =
      group === "day" ? "v.visit_date" : "substr(v.visit_date, 1, 7)";

    const trendRows = db
      .prepare(
        `
      SELECT
        ${groupingExpression} AS period,
        COALESCE(SUM(v.amount_paid), 0) AS value
      FROM visits v
      WHERE v.visit_date BETWEEN ? AND ?
      GROUP BY ${groupingExpression}
      ORDER BY period ASC
    `,
      )
      .all(startDate, endDate);

    const revenue = trendRows.map((row) => ({
      name: group === "day" ? dayLabel(row.period) : monthLabel(row.period),
      value: toNumber(row.value),
    }));

    const detailRows = db
      .prepare(
        `
      SELECT
        v.id,
        v.visit_date,
        v.visit_time,
        v.patient_id,
        COALESCE(p.name, 'Unknown Patient')
          AS patient,
        v.procedure_name,
        v.amount_paid,
        v.balance,
        v.complain,
        v.description
      FROM visits v
      LEFT JOIN patients p
        ON p.id = v.patient_id
      WHERE v.visit_date BETWEEN ? AND ?
      ORDER BY
        v.visit_date DESC,
        v.visit_time DESC,
        v.id DESC
      LIMIT 200
    `,
      )
      .all(startDate, endDate);

    return res.json({
      filters: {
        startDate,
        endDate,
        group,
        procedure: "All Procedures",
      },
      summary: {
        totalPatients: toNumber(summary.totalPatients),
        totalVisits: toNumber(summary.totalVisits),
        totalRevenue: toNumber(summary.totalRevenue),
        outstandingBalance: toNumber(summary.outstandingBalance),
      },
      revenue,
      procedures,
      details: detailRows.map((row) => ({
        ...row,
        amount_paid: toNumber(row.amount_paid),
        balance: toNumber(row.balance),
      })),
      detailLimit: 200,
      detailsTruncated: Number(summary.totalVisits) > detailRows.length,
    });
  } catch (error) {
    console.error("SQLite reports failed:", error);

    return res.status(500).json({
      message: "Unable to generate report.",
    });
  }
};

// AVAILABLE PROCEDURES FOR REPORT FILTER OPTIONS
exports.getReportProcedures = (req, res) => {
  try {
    const db = getSQLite();

    const rows = db
      .prepare(
        `
      SELECT procedure_name
      FROM visits
      WHERE procedure_name IS NOT NULL
        AND TRIM(procedure_name) <> ''
    `,
      )
      .all();

    const services = new Map();

    for (const row of rows) {
      for (const name of splitServices(row.procedure_name)) {
        const key = name.toLocaleLowerCase("en-US");

        if (!services.has(key)) {
          services.set(key, name);
        }
      }
    }

    const result = [...services.values()]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name }));

    return res.json(result);
  } catch (error) {
    console.error("SQLite procedure list failed:", error);

    return res.status(500).json({
      message: "Unable to load procedures.",
    });
  }
};

// INDEPENDENT DETAILED REPORT TABLE
exports.getReportDetails = (req, res) => {
  const range = getDateRange(req);

  if (!range) {
    return res.status(400).json({
      message: "Enter a valid report date range.",
    });
  }

  const page = Math.max(
    1,
    Math.min(1000000, Number.parseInt(req.query.page, 10) || 1),
  );

  const pageSize = 50;

  const search = String(req.query.search || "")
    .trim()
    .slice(0, 120);

  const conditions = ["v.visit_date BETWEEN ? AND ?"];

  const params = [range.startDate, range.endDate];

  if (search) {
    // Escape SQL LIKE wildcard characters so user
    // searches are treated as literal text.
    const escaped = search.replace(/[!%_]/g, (character) => `!${character}`);

    const pattern = `%${escaped}%`;

    conditions.push(`
      (
        p.name LIKE ? ESCAPE '!'
        OR v.procedure_name LIKE ? ESCAPE '!'
        OR v.visit_date LIKE ? ESCAPE '!'
        OR v.complain LIKE ? ESCAPE '!'
      )
    `);

    params.push(pattern, pattern, pattern, pattern);
  }

  const where = conditions.join(" AND ");

  try {
    const db = getSQLite();

    const count = db
      .prepare(
        `
      SELECT COUNT(*) AS total
      FROM visits v
      LEFT JOIN patients p
        ON p.id = v.patient_id
      WHERE ${where}
    `,
      )
      .get(...params);

    const total = Number(count.total || 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));

    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * pageSize;

    const details = db
      .prepare(
        `
      SELECT
        v.id,
        v.visit_date,
        v.visit_time,
        COALESCE(p.name, 'Unknown Patient')
          AS patient,
        v.procedure_name,
        v.amount_paid,
        v.balance
      FROM visits v
      LEFT JOIN patients p
        ON p.id = v.patient_id
      WHERE ${where}
      ORDER BY
        v.visit_date DESC,
        v.visit_time DESC,
        v.id DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(...params, pageSize, offset);

    return res.json({
      details,
      total,
      pages,
      page: safePage,
      pageSize,
    });
  } catch (error) {
    console.error("SQLite detailed reports failed:", error);

    return res.status(500).json({
      message: "Unable to load detailed report records.",
    });
  }
};

// EXPORT ALL MATCHING VISITS AS CSV
exports.exportReports = (req, res) => {
  const range = getDateRange(req);

  if (!range) {
    return res.status(400).json({
      message: "Enter a valid report date range.",
    });
  }

  try {
    const db = getSQLite();

    const statement = db.prepare(`
      SELECT
        v.visit_date,
        v.visit_time,
        p.name AS patient,
        v.procedure_name,
        v.amount_paid,
        v.balance,
        v.complain,
        v.description
      FROM visits v
      LEFT JOIN patients p
        ON p.id = v.patient_id
      WHERE v.visit_date BETWEEN ? AND ?
      ORDER BY
        v.visit_date DESC,
        v.visit_time DESC,
        v.id DESC
    `);

    const keys = [
      "visit_date",
      "visit_time",
      "patient",
      "procedure_name",
      "amount_paid",
      "balance",
      "complain",
      "description",
    ];

    function csvCell(value) {
      let text = String(value ?? "");

      // Protect against spreadsheet formula injection.
      if (/^\s*[=+@-]/.test(text)) {
        text = "'" + text;
      }

      return `"${text.replaceAll('"', '""')}"`;
    }

    function* generateCsv() {
      // UTF-8 BOM helps Excel recognize text encoding.
      yield "\uFEFF";

      yield "Date,Time,Patient,Procedure," +
        "Amount Paid,Balance,Complaint,Description\r\n";

      // Iteration avoids materializing the full
      // export result in JavaScript memory.
      for (const row of statement.iterate(range.startDate, range.endDate)) {
        yield keys.map((key) => csvCell(row[key])).join(",") + "\r\n";
      }
    }

    const filename =
      `magno-dental-report-${range.startDate}` + `-to-${range.endDate}.csv`;

    res.type("text/csv; charset=utf-8");

    res.set("Content-Disposition", `attachment; filename="${filename}"`);

    const stream = Readable.from(generateCsv());

    pipeline(stream, res, (error) => {
      if (error) {
        console.error(
          "SQLite CSV export interrupted:",
          error.code || error.name,
        );
      }
    });
  } catch (error) {
    console.error("SQLite CSV export failed:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Unable to export report.",
      });
    }

    res.destroy(error);
  }
};
