const { validateSchedule, checkApprovedConflict, acquireScheduleLock, releaseScheduleConnection } = require("../services/appointmentSchedule");
const db = require("../config/db");
const allowedStatuses = ["Pending", "Approved", "Rescheduled", "Completed", "Cancelled"];

// The only creation path is authenticated manual entry for an existing clinic patient.
exports.createManualAppointment = async (req, res) => {
  const patientId = Number(req.body.patient_id);
  const date = req.body.preferred_date;
  const time = req.body.preferred_time;
  const service = String(req.body.service || "").trim();
  const reason = String(req.body.reason || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!Number.isSafeInteger(patientId) || patientId < 1 || !service || service.length > 500 || reason.length > 1000
      || email.length > 100 || (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))
    return res.status(400).json({ message: "Choose a registered patient and enter valid appointment details." });
  const invalid = validateSchedule(date, time);
  if (invalid) return res.status(400).json({ message: invalid });
  let connection;
  let locked = false;
  try {
    connection = await db.promise().getConnection();
    await acquireScheduleLock(connection);
    locked = true;
    await connection.beginTransaction();
    const [patients] = await connection.execute('SELECT id, name, phone FROM patients WHERE id = ? LIMIT 1', [patientId]);
    if (!patients.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Patient not found. Add the patient in Patient Management first." });
    }
    const conflict = await checkApprovedConflict(connection, date, time);
    if (conflict) {
      await connection.rollback();
      return res.status(409).json({ message: conflict });
    }
    const patient = patients[0];
    const [result] = await connection.execute(`INSERT INTO appointments
      (patient_id, fullname, email, phone, preferred_date, preferred_time, service, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved')`,
      [patient.id, patient.name, email, patient.phone || '', date, time, service, reason || null]);
    await connection.commit();
    return res.status(201).json({ message: "Appointment scheduled successfully.", appointmentId: result.insertId });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Manual appointment creation failed:', error.code || error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : "Unable to schedule appointment." });
  } finally { await releaseScheduleConnection(connection, locked); }
};

exports.getAppointments = async (req, res) => {
  const { start_date: start, end_date: end } = req.query;
  const filtered = Boolean(start || end);
  if (filtered && (!/^\d{4}-\d{2}-\d{2}$/.test(start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(end || "") || start > end))
    return res.status(400).json({ message: "A valid date range is required." });
  try {
    const conditions = [], parameters = [];
    if (filtered) { conditions.push("preferred_date BETWEEN ? AND ?"); parameters.push(start, end); }
    if (req.query.active_only === "true") conditions.push("status IN ('Pending', 'Rescheduled', 'Approved')");
    const [rows] = await db.promise().execute(`SELECT * FROM appointments ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY (TIMESTAMP(preferred_date, preferred_time) >= NOW()) DESC, preferred_date ASC, preferred_time ASC, id ASC`, parameters);
    return res.json(rows);
  } catch (error) {
    console.error("Appointment list failed:", error.code || error.name);
    return res.status(500).json({ message: "Unable to retrieve appointments." });
  }
};

async function updateAppointment(req, res, isReschedule) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: "Invalid appointment ID." });
  const status = isReschedule ? 'Rescheduled' : req.body.status;
  if (!allowedStatuses.includes(status) || (!isReschedule && status === 'Rescheduled'))
    return res.status(400).json({ message: "Invalid status. Use Reschedule to change the appointment time." });
  if (isReschedule) {
    const invalid = validateSchedule(req.body.preferred_date, req.body.preferred_time);
    if (invalid) return res.status(400).json({ message: invalid });
  }
  let connection, locked = false;
  try {
    connection = await db.promise().getConnection();
    await acquireScheduleLock(connection);
    locked = true;
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ message: "Appointment not found." }); }
    const appointment = rows[0];
    const date = isReschedule ? req.body.preferred_date : appointment.preferred_date instanceof Date
      ? appointment.preferred_date.toISOString().slice(0,10) : String(appointment.preferred_date).slice(0,10);
    const time = isReschedule ? req.body.preferred_time : String(appointment.preferred_time).slice(0,5);
    if (appointment.status === status && !isReschedule) { await connection.rollback(); return res.json({ message: "No change needed." }); }
    if (isReschedule || status === 'Approved') {
      const invalid = validateSchedule(date, time);
      if (invalid) { await connection.rollback(); return res.status(400).json({ message: invalid }); }
      const conflict = await checkApprovedConflict(connection, date, time, id);
      if (conflict) { await connection.rollback(); return res.status(409).json({ message: conflict }); }
    }
    await connection.execute('UPDATE appointments SET status = ?, preferred_date = ?, preferred_time = ? WHERE id = ?', [status, date, time, id]);
    await connection.commit();
    return res.json({ message: isReschedule ? 'Appointment rescheduled successfully.' : `Appointment marked as ${status}.`, patientId: appointment.patient_id });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Appointment update failed:', error.code || error.name);
    return res.status(error.status || 500).json({ message: error.status === 503 ? error.message : 'Unable to update appointment.' });
  } finally { await releaseScheduleConnection(connection, locked); }
}
exports.updateAppointmentStatus = (req, res) => updateAppointment(req, res, false);
exports.rescheduleAppointment = (req, res) => updateAppointment(req, res, true);
