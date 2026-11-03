const { getSQLite } = require("../config/sqlite");

const {
  validateSchedule,
  checkApprovedConflict,
} = require("../services/appointmentSchedule");

const allowedStatuses = [
  "Pending",
  "Approved",
  "Rescheduled",
  "Completed",
  "Cancelled",
];

function appError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendError(res, error, fallback) {
  if (error.status) {
    return res.status(error.status).json({
      message: error.message,
    });
  }

  if (error.code === "SQLITE_BUSY") {
    return res.status(503).json({
      message: "The appointment schedule is busy. Please try again.",
    });
  }

  console.error("SQLite appointment error:", error);

  return res.status(500).json({
    message: fallback,
  });
}

function validId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// CREATE MANUAL APPOINTMENT
exports.createManualAppointment = (req, res) => {
  const patientId = validId(req.body?.patient_id);

  const date = req.body?.preferred_date;
  const time = req.body?.preferred_time;

  const service = String(req.body?.service || "").trim();
  const reason = String(req.body?.reason || "").trim();

  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  if (
    !patientId ||
    !service ||
    service.length > 500 ||
    reason.length > 1000 ||
    email.length > 100 ||
    (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
  ) {
    return res.status(400).json({
      message:
        "Choose a registered patient and enter valid appointment details.",
    });
  }

  const invalid = validateSchedule(date, time);

  if (invalid) {
    return res.status(400).json({
      message: invalid,
    });
  }

  try {
    const db = getSQLite();

    const createAppointment = db.transaction(() => {
      const patient = db
        .prepare(
          `
        SELECT id, name, phone
        FROM patients
        WHERE id = ?
        LIMIT 1
      `,
        )
        .get(patientId);

      if (!patient) {
        throw appError(
          404,
          "Patient not found. Add the patient in Patient Management first.",
        );
      }

      const conflict = checkApprovedConflict(db, date, time);

      if (conflict) {
        throw appError(409, conflict);
      }

      const result = db
        .prepare(
          `
        INSERT INTO appointments (
          patient_id,
          fullname,
          email,
          phone,
          preferred_date,
          preferred_time,
          service,
          reason,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved')
      `,
        )
        .run(
          patient.id,
          patient.name,
          email,
          patient.phone || "",
          date,
          time,
          service,
          reason || null,
        );

      return Number(result.lastInsertRowid);
    });

    const appointmentId = createAppointment.immediate();

    return res.status(201).json({
      message: "Appointment scheduled successfully.",
      appointmentId,
    });
  } catch (error) {
    return sendError(res, error, "Unable to schedule appointment.");
  }
};

// GET APPOINTMENTS
exports.getAppointments = (req, res) => {
  const start = req.query.start_date;
  const end = req.query.end_date;

  const filtered = Boolean(start || end);

  if (
    filtered &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(start || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end || "") ||
      start > end)
  ) {
    return res.status(400).json({
      message: "A valid date range is required.",
    });
  }

  try {
    const conditions = [];
    const parameters = [];

    if (filtered) {
      conditions.push("preferred_date BETWEEN ? AND ?");

      parameters.push(start, end);
    }

    if (req.query.active_only === "true") {
      conditions.push(`
        status IN ('Pending', 'Rescheduled', 'Approved')
      `);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const clinicNowParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());

    const parts = Object.fromEntries(
      clinicNowParts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    const currentDateTime =
      `${parts.year}-${parts.month}-${parts.day} ` +
      `${parts.hour}:${parts.minute}:${parts.second}`;

    const rows = getSQLite()
      .prepare(
        `
      SELECT *
      FROM appointments
      ${where}
      ORDER BY
        (
          datetime(preferred_date || ' ' || preferred_time)
          >= datetime(?)
        ) DESC,
        preferred_date ASC,
        preferred_time ASC,
        id ASC
    `,
      )
      .all(...parameters, currentDateTime);

    return res.json(rows);
  } catch (error) {
    return sendError(res, error, "Unable to retrieve appointments.");
  }
};

// SHARED STATUS / RESCHEDULE HANDLER
function updateAppointment(req, res, isReschedule) {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: "Invalid appointment ID.",
    });
  }

  const status = isReschedule ? "Rescheduled" : req.body?.status;

  if (
    !allowedStatuses.includes(status) ||
    (!isReschedule && status === "Rescheduled")
  ) {
    return res.status(400).json({
      message: "Invalid status. Use Reschedule to change the appointment time.",
    });
  }

  if (isReschedule) {
    const invalid = validateSchedule(
      req.body?.preferred_date,
      req.body?.preferred_time,
    );

    if (invalid) {
      return res.status(400).json({
        message: invalid,
      });
    }
  }

  try {
    const db = getSQLite();

    const update = db.transaction(() => {
      const appointment = db
        .prepare(
          `
        SELECT *
        FROM appointments
        WHERE id = ?
        LIMIT 1
      `,
        )
        .get(id);

      if (!appointment) {
        throw appError(404, "Appointment not found.");
      }

      const date = isReschedule
        ? req.body.preferred_date
        : String(appointment.preferred_date).slice(0, 10);

      const time = isReschedule
        ? req.body.preferred_time
        : String(appointment.preferred_time).slice(0, 5);

      if (appointment.status === status && !isReschedule) {
        return {
          message: "No change needed.",
        };
      }

      if (isReschedule || status === "Approved") {
        const invalid = validateSchedule(date, time);

        if (invalid) {
          throw appError(400, invalid);
        }

        const conflict = checkApprovedConflict(db, date, time, id);

        if (conflict) {
          throw appError(409, conflict);
        }
      }

      db.prepare(
        `
        UPDATE appointments
        SET
          status = ?,
          preferred_date = ?,
          preferred_time = ?
        WHERE id = ?
      `,
      ).run(status, date, time, id);

      return {
        message: isReschedule
          ? "Appointment rescheduled successfully."
          : `Appointment marked as ${status}.`,
        patientId: appointment.patient_id,
      };
    });

    const result = update.immediate();

    return res.json(result);
  } catch (error) {
    return sendError(res, error, "Unable to update appointment.");
  }
}

// UPDATE STATUS
exports.updateAppointmentStatus = (req, res) => {
  return updateAppointment(req, res, false);
};

// RESCHEDULE
exports.rescheduleAppointment = (req, res) => {
  return updateAppointment(req, res, true);
};
