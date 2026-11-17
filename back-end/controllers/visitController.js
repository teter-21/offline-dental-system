"use strict";

const { getSQLite } = require("../config/sqlite");

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

function money(value) {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "string" && typeof value !== "number") return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : NaN;
}

function parseVisit(body) {
  const procedure_name = typeof body?.procedure_name === "string" ? body.procedure_name.trim() : "";
  if (!validDate(body?.visit_date) || !validTime(body?.visit_time) || !procedure_name || procedure_name.length > 500) {
    return { error: "Enter a valid date, time, and at least one treatment (up to 500 characters)." };
  }
  const complain = body?.complain ?? "";
  const description = body?.description ?? "";
  if (typeof complain !== "string" || typeof description !== "string" || complain.length > 2000 || description.length > 10000) {
    return { error: "Complaint or treatment notes are too long." };
  }
  const amount_paid = money(body?.amount_paid);
  const balance = money(body?.balance);
  if (!Number.isFinite(amount_paid) || !Number.isFinite(balance) || amount_paid < 0 || balance < 0 || amount_paid > 1e12 || balance > 1e12) {
    return { error: "Enter valid, non-negative payment amounts." };
  }
  return { visit_date: body.visit_date, visit_time: body.visit_time, procedure_name,
    complain: complain || null, description: description || null, amount_paid, balance };
}

function failed(res, error, fallback) {
  if (error.status) return res.status(error.status).json({ message: error.message });
  if (error.code === "SQLITE_BUSY") return res.status(503).json({ message: "Database is busy. Please retry." });
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
}

// POST /add-visit — the patient link is authoritative; queue IDs are never used.
exports.addVisit = (req, res) => {
  const patientId = positiveId(req.body?.patient_id);
  const fields = parseVisit(req.body);
  if (!patientId || fields.error) return res.status(400).json({ message: fields.error || "Invalid patient ID." });
  try {
    const db = getSQLite();
    if (!db.prepare("SELECT id FROM patients WHERE id = ?").get(patientId)) {
      return res.status(404).json({ message: "Patient not found." });
    }
    const result = db.prepare(`
      INSERT INTO visits (patient_id, visit_date, visit_time, procedure_name,
        complain, description, amount_paid, balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(patientId, fields.visit_date, fields.visit_time, fields.procedure_name,
      fields.complain, fields.description, fields.amount_paid, fields.balance);
    return res.status(201).json({ message: "Visit record saved.", visitId: Number(result.lastInsertRowid) });
  } catch (error) { return failed(res, error, "Unable to add visit."); }
};

// GET /visits/:patient_id — returns record IDs needed by Edit.
exports.getVisits = (req, res) => {
  const patientId = positiveId(req.params.patient_id);
  if (!patientId) return res.status(400).json({ message: "Invalid patient ID." });
  try {
    const rows = getSQLite().prepare(`
      SELECT id, patient_id, visit_date, visit_time, procedure_name,
             complain, description, amount_paid, balance
      FROM visits WHERE patient_id = ?
      ORDER BY visit_date DESC, visit_time DESC, id DESC
    `).all(patientId);
    return res.json(rows);
  } catch (error) { return failed(res, error, "Unable to retrieve visits."); }
};

// PUT /visits/:visit_id — edit an existing record, preserving its ID and patient link.
exports.updateVisit = (req, res) => {
  const visitId = positiveId(req.params.visit_id);
  const fields = parseVisit(req.body);
  if (!visitId || fields.error) return res.status(400).json({ message: fields.error || "Invalid visit ID." });
  try {
    const db = getSQLite();
    const update = db.transaction(() => {
      const record = db.prepare("SELECT id FROM visits WHERE id = ?").get(visitId);
      if (!record) return null;

      // A payment entered in Billing is an immutable ledger entry. A correction
      // may not set paid below the total of already-recorded payments.
      const ledger = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total
        FROM payments WHERE visit_id = ?`).get(visitId);
      const paidCents = Math.round(fields.amount_paid * 100);
      const ledgerCents = Math.round(Number(ledger.total || 0) * 100);
      if (paidCents < ledgerCents) {
        const err = new Error("Amount Paid cannot be less than payments already recorded in Billing.");
        err.status = 409;
        throw err;
      }

      db.prepare(`UPDATE visits SET visit_date = ?, visit_time = ?, procedure_name = ?,
        complain = ?, description = ?, amount_paid = ?, balance = ? WHERE id = ?`)
        .run(fields.visit_date, fields.visit_time, fields.procedure_name, fields.complain,
          fields.description, fields.amount_paid, fields.balance, visitId);
      return db.prepare(`SELECT id, patient_id, visit_date, visit_time,
        procedure_name, complain, description, amount_paid, balance
        FROM visits WHERE id = ?`).get(visitId);
    });
    const visit = update.immediate();
    if (!visit) return res.status(404).json({ message: "Visit record not found." });
    return res.json({ message: "Visit record updated.", visit });
  } catch (error) { return failed(res, error, "Unable to update visit."); }
};

// GET /treatments/calendar?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
exports.getTreatmentCalendar = (req, res) => {
  const { start_date, end_date } = req.query || {};
  if (!validDate(start_date) || !validDate(end_date) || start_date > end_date ||
      (Date.parse(`${end_date}T00:00:00Z`) - Date.parse(`${start_date}T00:00:00Z`)) > 62 * 86400000) {
    return res.status(400).json({ message: "Select a valid date range of up to 63 days." });
  }
  try {
    const rows = getSQLite().prepare(`
      SELECT v.id, v.patient_id, p.name AS patient_name, v.visit_date, v.visit_time,
             v.procedure_name, v.complain, v.description, v.amount_paid, v.balance
      FROM visits AS v
      JOIN patients AS p ON p.id = v.patient_id
      WHERE v.visit_date BETWEEN ? AND ?
      ORDER BY v.visit_date ASC, v.visit_time ASC, v.id ASC
    `).all(start_date, end_date);
    return res.json(rows);
  } catch (error) { return failed(res, error, "Unable to load treatment calendar."); }
};
