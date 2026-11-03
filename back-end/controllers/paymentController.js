const { getSQLite } = require("../config/sqlite");

function toMoney(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : NaN;
}

function clinicTimestamp() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return (
    `${parts.year}-${parts.month}-${parts.day} ` +
    `${parts.hour}:${parts.minute}:${parts.second}`
  );
}

function paymentError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// GET BILLING RECORDS
exports.getBillingRecords = (req, res) => {
  const status = req.query.status || "all";
  const search = String(req.query.search || "")
    .trim()
    .slice(0, 150);

  const conditions = ["1 = 1"];
  const params = [];

  if (status === "paid") {
    conditions.push("COALESCE(v.balance, 0) = 0");
  } else if (status === "balance") {
    conditions.push("COALESCE(v.balance, 0) > 0");
  } else if (status === "unpaid") {
    conditions.push(`
      COALESCE(v.amount_paid, 0) = 0
      AND COALESCE(v.balance, 0) > 0
    `);
  } else if (status !== "all") {
    return res.status(400).json({
      message: "Invalid billing status.",
    });
  }

  if (search) {
    conditions.push(`
      (
        p.name LIKE ?
        OR v.procedure_name LIKE ?
        OR CAST(v.id AS TEXT) LIKE ?
      )
    `);

    const term = `%${search}%`;
    params.push(term, term, term);
  }

  try {
    const rows = getSQLite()
      .prepare(
        `
      SELECT
        v.id,
        v.patient_id,
        COALESCE(p.name, 'Unknown Patient') AS patient_name,
        v.visit_date,
        v.visit_time,
        v.procedure_name,
        COALESCE(v.amount_paid, 0) AS amount_paid,
        COALESCE(v.balance, 0) AS balance,
        COALESCE(v.amount_paid, 0) +
          COALESCE(v.balance, 0) AS total_charge,
        CASE
          WHEN COALESCE(v.balance, 0) <= 0 THEN 'Paid'
          WHEN COALESCE(v.amount_paid, 0) <= 0 THEN 'Unpaid'
          ELSE 'Balance Due'
        END AS payment_status
      FROM visits v
      LEFT JOIN patients p
        ON p.id = v.patient_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY
        v.visit_date DESC,
        v.visit_time DESC,
        v.id DESC
      LIMIT 300
    `,
      )
      .all(...params);

    return res.json(
      rows.map((row) => ({
        ...row,
        amount_paid: Number(row.amount_paid || 0),
        balance: Number(row.balance || 0),
        total_charge: Number(row.total_charge || 0),
      })),
    );
  } catch (error) {
    console.error("SQLite billing lookup failed:", error);

    return res.status(500).json({
      message: "Unable to load billing records.",
    });
  }
};

// GET BILLING SUMMARY
exports.getBillingSummary = (req, res) => {
  try {
    const row = getSQLite()
      .prepare(
        `
      SELECT
        COUNT(*) AS totalVisits,
        COALESCE(
          SUM(COALESCE(amount_paid, 0)), 0
        ) AS totalPaid,
        COALESCE(
          SUM(COALESCE(balance, 0)), 0
        ) AS totalBalance,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(balance, 0) <= 0
              THEN 1 ELSE 0
            END
          ), 0
        ) AS paidVisits,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(amount_paid, 0) = 0
                AND COALESCE(balance, 0) > 0
              THEN 1 ELSE 0
            END
          ), 0
        ) AS unpaidVisits
      FROM visits
    `,
      )
      .get();

    return res.json({
      totalVisits: Number(row.totalVisits || 0),
      totalPaid: Number(row.totalPaid || 0),
      totalBalance: Number(row.totalBalance || 0),
      paidVisits: Number(row.paidVisits || 0),
      unpaidVisits: Number(row.unpaidVisits || 0),
    });
  } catch (error) {
    console.error("SQLite billing summary failed:", error);

    return res.status(500).json({
      message: "Unable to load billing summary.",
    });
  }
};

// RECORD PAYMENT
exports.recordPayment = (req, res) => {
  const visitId = Number(req.body?.visit_id);
  const amount = toMoney(req.body?.amount);

  const method = String(req.body?.payment_method || "Cash").trim();

  const reference = String(req.body?.reference_number || "").trim();

  const notes = String(req.body?.notes || "").trim();

  if (!Number.isSafeInteger(visitId) || visitId <= 0) {
    return res.status(400).json({
      message: "A valid visit is required.",
    });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      message: "Payment amount must be greater than zero.",
    });
  }

  if (!["Cash", "GCash", "Card", "Bank Transfer"].includes(method)) {
    return res.status(400).json({
      message: "Invalid payment method.",
    });
  }

  if (method !== "Cash" && !reference) {
    return res.status(400).json({
      message:
        "Reference number is required for GCash, Card, or Bank Transfer payments.",
    });
  }

  if (reference.length > 255 || notes.length > 2000) {
    return res.status(400).json({
      message: "Payment reference or notes are too long.",
    });
  }

  try {
    const db = getSQLite();

    const recordTransaction = db.transaction(() => {
      const visit = db
        .prepare(
          `
        SELECT
          id,
          patient_id,
          COALESCE(amount_paid, 0) AS amount_paid,
          COALESCE(balance, 0) AS balance
        FROM visits
        WHERE id = ?
      `,
        )
        .get(visitId);

      if (!visit) {
        throw paymentError(404, "Visit record not found.");
      }

      const balance = toMoney(visit.balance);

      if (balance <= 0) {
        throw paymentError(400, "This visit has no remaining balance.");
      }

      if (amount > balance) {
        throw paymentError(
          400,
          `Payment cannot exceed the remaining balance of ₱${balance.toFixed(2)}.`,
        );
      }

      const paid = toMoney(Number(visit.amount_paid) + amount);

      const remaining = toMoney(balance - amount);

      db.prepare(
        `
        UPDATE visits
        SET
          amount_paid = ?,
          balance = ?
        WHERE id = ?
      `,
      ).run(paid, remaining, visitId);

      const result = db
        .prepare(
          `
        INSERT INTO payments (
          visit_id,
          patient_id,
          amount,
          payment_method,
          reference_number,
          notes,
          paid_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          visitId,
          visit.patient_id,
          amount,
          method,
          reference || null,
          notes || null,
          clinicTimestamp(),
        );

      return {
        id: Number(result.lastInsertRowid),
        visit_id: visitId,
        amount,
        payment_method: method,
        reference_number: reference || null,
        amount_paid: paid,
        balance: remaining,
      };
    });

    // Acquire SQLite write lock before reading and
    // updating the balance, preventing overpayment races.
    const payment = recordTransaction.immediate();

    return res.status(201).json({
      message: "Payment recorded successfully.",
      payment,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    if (error.code === "SQLITE_BUSY") {
      return res.status(503).json({
        message: "Billing is temporarily busy. Please try again.",
      });
    }

    console.error("SQLite payment transaction failed:", error);

    return res.status(500).json({
      message:
        "Unable to complete the payment. Refresh the visit before retrying.",
    });
  }
};
