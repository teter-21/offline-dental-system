const { getSQLite } = require("../config/sqlite");

const PH_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function clinicNow() {
  const parts = Object.fromEntries(
    PH_TIME.formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}:${parts.second}`;

  return {
    date,
    time,
    datetime: `${date} ${time}`,
  };
}

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

  console.error("SQLite queue error:", error);
  return res.status(500).json({ message: fallback });
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function requireQueue(db, id) {
  const entry = db
    .prepare(
      `
    SELECT * FROM queue WHERE id = ?
  `,
    )
    .get(id);

  if (!entry) {
    throw appError(404, "Queue patient not found.");
  }

  return entry;
}

// Allocate a daily queue number.
// Must be called from inside a write transaction.
function nextQueueNumber(db, queueDate) {
  const highest = db
    .prepare(
      `
    SELECT COALESCE(MAX(queue_number), 0) AS maximum
    FROM queue
    WHERE queue_date = ?
  `,
    )
    .get(queueDate).maximum;

  const current = db
    .prepare(
      `
    SELECT last_number
    FROM queue_daily_sequence
    WHERE queue_date = ?
  `,
    )
    .get(queueDate);

  const number =
    Math.max(Number(highest), Number(current?.last_number || 0)) + 1;

  db.prepare(
    `
    INSERT INTO queue_daily_sequence
      (queue_date, last_number)
    VALUES (?, ?)
    ON CONFLICT(queue_date)
    DO UPDATE SET last_number = excluded.last_number
  `,
  ).run(queueDate, number);

  return number;
}

// GET TODAY'S QUEUE
exports.getTodayQueue = (req, res) => {
  try {
    const rows = getSQLite()
      .prepare(
        `
      SELECT *
      FROM queue
      WHERE queue_date = ?
      ORDER BY
        CASE status
          WHEN 'In Treatment' THEN 1
          WHEN 'Called' THEN 2
          WHEN 'Waiting' THEN 3
          WHEN 'Completed' THEN 4
          WHEN 'Skipped' THEN 5
          WHEN 'Cancelled' THEN 6
          ELSE 7
        END,
        CASE priority
          WHEN 'Urgent' THEN 1
          ELSE 2
        END,
        queue_number ASC
    `,
      )
      .all(clinicNow().date);

    return res.json(rows);
  } catch (error) {
    return sendError(res, error, "Unable to load today's queue.");
  }
};

// CALL NEXT PATIENT
exports.callNextPatient = (req, res) => {
  try {
    const db = getSQLite();
    const now = clinicNow();

    const action = db.transaction(() => {
      const active = db
        .prepare(
          `
        SELECT queue_number, status
        FROM queue
        WHERE queue_date = ?
          AND status IN ('Called', 'In Treatment')
        LIMIT 1
      `,
        )
        .get(now.date);

      if (active) {
        throw appError(
          400,
          `Patient #${active.queue_number} is currently ${active.status}.`,
        );
      }

      const patient = db
        .prepare(
          `
        SELECT *
        FROM queue
        WHERE queue_date = ?
          AND status = 'Waiting'
        ORDER BY
          CASE WHEN priority = 'Urgent' THEN 1 ELSE 2 END,
          queue_number ASC
        LIMIT 1
      `,
        )
        .get(now.date);

      if (!patient) {
        throw appError(404, "There are no waiting patients.");
      }

      const result = db
        .prepare(
          `
        UPDATE queue
        SET status = 'Called',
            called_at = ?
        WHERE id = ?
          AND status = 'Waiting'
      `,
        )
        .run(now.datetime, patient.id);

      if (!result.changes) {
        throw appError(400, "The patient is no longer waiting.");
      }

      return patient;
    });

    const patient = action.immediate();

    return res.json({
      message: "Next patient called successfully.",
      patient: {
        id: patient.id,
        queue_number: patient.queue_number,
        patient_name: patient.patient_name,
        queue_type: patient.queue_type,
        service: patient.service,
        priority: patient.priority,
        status: "Called",
      },
    });
  } catch (error) {
    return sendError(res, error, "Unable to call the next patient.");
  }
};

// CHECK IN AN APPROVED APPOINTMENT
exports.checkInAppointment = (req, res) => {
  const appointmentId = validId(req.params.id);

  if (!appointmentId) {
    return res.status(400).json({
      message: "Invalid appointment ID.",
    });
  }

  try {
    const db = getSQLite();
    const now = clinicNow();

    const action = db.transaction(() => {
      const appointment = db
        .prepare(
          `
        SELECT *
        FROM appointments
        WHERE id = ?
      `,
        )
        .get(appointmentId);

      if (!appointment) {
        throw appError(404, "Appointment not found.");
      }

      if (!["Approved", "Rescheduled"].includes(appointment.status)) {
        throw appError(
          400,
          "Only approved or rescheduled appointments can be checked in.",
        );
      }

      if (!appointment.patient_id) {
        throw appError(400, "This appointment has no linked patient record.");
      }

      const patient = db
        .prepare(
          `
        SELECT id
        FROM patients
        WHERE id = ?
      `,
        )
        .get(appointment.patient_id);

      if (!patient) {
        throw appError(400, "Linked patient record not found.");
      }

      const existing = db
        .prepare(
          `
        SELECT id
        FROM queue
        WHERE appointment_id = ?
          AND queue_date = ?
        LIMIT 1
      `,
        )
        .get(appointmentId, now.date);

      if (existing) {
        throw appError(400, "This appointment is already in today's queue.");
      }

      const queueNumber = nextQueueNumber(db, now.date);

      const result = db
        .prepare(
          `
        INSERT INTO queue (
          queue_number,
          patient_id,
          appointment_id,
          patient_name,
          queue_type,
          service,
          reason,
          priority,
          status,
          queue_date,
          check_in_time
        )
        VALUES (?, ?, ?, ?, 'Appointment', ?, ?,
                'Normal', 'Waiting', ?, ?)
      `,
        )
        .run(
          queueNumber,
          appointment.patient_id,
          appointment.id,
          appointment.fullname,
          appointment.service,
          appointment.reason,
          now.date,
          now.datetime,
        );

      return {
        id: Number(result.lastInsertRowid),
        queue_number: queueNumber,
        patient_name: appointment.fullname,
        queue_type: "Appointment",
        status: "Waiting",
      };
    });

    return res.json({
      message: "Patient checked in successfully.",
      queue: action.immediate(),
    });
  } catch (error) {
    return sendError(res, error, "Unable to add appointment to queue.");
  }
};

// ADD WALK-IN
exports.addWalkIn = (req, res) => {
  const { patient_id, patient_name, service, reason, priority } =
    req.body || {};

  const name = String(patient_name || "").trim();
  const selectedService = String(service || "").trim();
  const selectedPriority = priority || "Normal";

  if (!name || name.length > 150) {
    return res.status(400).json({
      message: "Enter a valid patient name.",
    });
  }

  if (!selectedService || selectedService.length > 500) {
    return res.status(400).json({
      message: "Select one or more services (maximum 500 characters).",
    });
  }

  if (!["Normal", "Urgent"].includes(selectedPriority)) {
    return res.status(400).json({
      message: "Invalid queue priority.",
    });
  }

  const patientId = patient_id ? validId(patient_id) : null;

  if (patient_id && !patientId) {
    return res.status(400).json({
      message: "Invalid patient ID.",
    });
  }

  try {
    const db = getSQLite();
    const now = clinicNow();

    const action = db.transaction(() => {
      if (patientId) {
        const exists = db
          .prepare(
            `
          SELECT id FROM patients WHERE id = ?
        `,
          )
          .get(patientId);

        if (!exists) {
          throw appError(404, "Patient record not found.");
        }
      }

      const queueNumber = nextQueueNumber(db, now.date);

      const result = db
        .prepare(
          `
        INSERT INTO queue (
          queue_number,
          patient_id,
          appointment_id,
          patient_name,
          queue_type,
          service,
          reason,
          priority,
          status,
          queue_date,
          check_in_time
        )
        VALUES (?, ?, NULL, ?, 'Walk-in', ?, ?,
                ?, 'Waiting', ?, ?)
      `,
        )
        .run(
          queueNumber,
          patientId,
          name,
          selectedService,
          reason ? String(reason).slice(0, 1000) : null,
          selectedPriority,
          now.date,
          now.datetime,
        );

      return {
        id: Number(result.lastInsertRowid),
        queue_number: queueNumber,
        patient_name: name,
        queue_type: "Walk-in",
        status: "Waiting",
      };
    });

    return res.json({
      message: "Walk-in patient added to queue.",
      queue: action.immediate(),
    });
  } catch (error) {
    return sendError(res, error, "Unable to add walk-in patient.");
  }
};

// CALL A SPECIFIC PATIENT
exports.callPatient = (req, res) => {
  changeStatus(req, res, {
    from: ["Waiting"],
    to: "Called",
    timestamp: "called_at",
    message: "Patient called successfully.",
  });
};

// START TREATMENT
exports.startTreatment = (req, res) => {
  changeStatus(req, res, {
    from: ["Called"],
    to: "In Treatment",
    timestamp: "treatment_started_at",
    message: "Treatment started.",
  });
};

// SKIP PATIENT
exports.skipPatient = (req, res) => {
  changeStatus(req, res, {
    from: ["Waiting", "Called"],
    to: "Skipped",
    message: "Patient skipped.",
  });
};

// CANCEL QUEUE
exports.cancelQueue = (req, res) => {
  changeStatus(req, res, {
    from: ["Waiting", "Called"],
    to: "Cancelled",
    message: "Queue entry cancelled.",
  });
};

function changeStatus(req, res, config) {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: "Invalid queue ID.",
    });
  }

  try {
    const db = getSQLite();
    const now = clinicNow();

    const action = db.transaction(() => {
      const entry = requireQueue(db, id);

      if (
        entry.queue_date !== now.date ||
        !config.from.includes(entry.status)
      ) {
        throw appError(400, "Patient cannot be updated in the current status.");
      }

      if (config.to === "Called") {
        const active = db
          .prepare(
            `
          SELECT id
          FROM queue
          WHERE queue_date = ?
            AND status IN ('Called', 'In Treatment')
            AND id <> ?
          LIMIT 1
        `,
          )
          .get(now.date, id);

        if (active) {
          throw appError(
            400,
            "Another patient is currently called or in treatment.",
          );
        }
      }

      const timestampSql = config.timestamp ? `, ${config.timestamp} = ?` : "";

      const parameters = config.timestamp
        ? [config.to, now.datetime, id]
        : [config.to, id];

      const result = db
        .prepare(
          `
        UPDATE queue
        SET status = ? ${timestampSql}
        WHERE id = ?
      `,
        )
        .run(...parameters);

      if (!result.changes) {
        throw appError(400, "Queue status could not be changed.");
      }
    });

    action.immediate();

    return res.json({ message: config.message });
  } catch (error) {
    return sendError(res, error, "Unable to update queue status.");
  }
}

// COMPLETE QUEUE WITHOUT A NEW VISIT
exports.completeQueue = (req, res) => {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: "Invalid queue ID.",
    });
  }

  try {
    const db = getSQLite();
    const now = clinicNow();

    const action = db.transaction(() => {
      const entry = requireQueue(db, id);

      if (entry.status !== "In Treatment") {
        throw appError(400, "Patient must be in treatment before completing.");
      }

      db.prepare(
        `
        UPDATE queue
        SET status = 'Completed',
            completed_at = ?
        WHERE id = ?
      `,
      ).run(now.datetime, id);

      if (entry.appointment_id) {
        db.prepare(
          `
          UPDATE appointments
          SET status = 'Completed'
          WHERE id = ?
        `,
        ).run(entry.appointment_id);
      }
    });

    action.immediate();

    return res.json({
      message: "Patient treatment completed.",
    });
  } catch (error) {
    return sendError(res, error, "Unable to complete queue.");
  }
};

// COMPLETE TREATMENT AND CREATE VISIT RECORD
exports.completeTreatmentWithVisit = (req, res) => {
  const id = validId(req.params.id);

  if (!id) {
    return res.status(400).json({
      message: "Invalid queue ID.",
    });
  }

  const {
    visit_date,
    visit_time,
    procedure_name,
    complain,
    description,
    amount_paid,
    balance,
  } = req.body || {};

  const procedure = String(procedure_name || "").trim();
  const paid = Number(amount_paid ?? 0);
  const remaining = Number(balance ?? 0);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(visit_date || "")) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(String(visit_time || "")) ||
    !procedure ||
    procedure.length > 500
  ) {
    return res.status(400).json({
      message: "Valid date, time, and at least one service are required.",
    });
  }

  if (
    !Number.isFinite(paid) ||
    paid < 0 ||
    !Number.isFinite(remaining) ||
    remaining < 0
  ) {
    return res.status(400).json({
      message: "Enter valid non-negative payment amounts.",
    });
  }

  try {
    const db = getSQLite();
    const now = clinicNow();

    const action = db.transaction(() => {
      const entry = requireQueue(db, id);

      if (entry.status !== "In Treatment") {
        throw appError(
          400,
          "Patient must be in treatment before the visit can be completed.",
        );
      }

      if (!entry.patient_id) {
        throw appError(
          400,
          "This queue entry is not linked to a patient record.",
        );
      }

      const visitResult = db
        .prepare(
          `
        INSERT INTO visits (
          patient_id,
          visit_date,
          visit_time,
          procedure_name,
          complain,
          description,
          amount_paid,
          balance
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          entry.patient_id,
          visit_date,
          visit_time,
          procedure,
          complain || entry.reason || null,
          description || null,
          paid,
          remaining,
        );

      const queueResult = db
        .prepare(
          `
        UPDATE queue
        SET status = 'Completed',
            completed_at = ?
        WHERE id = ?
          AND status = 'In Treatment'
      `,
        )
        .run(now.datetime, id);

      if (!queueResult.changes) {
        throw appError(400, "The patient is no longer in treatment.");
      }

      if (entry.appointment_id) {
        db.prepare(
          `
          UPDATE appointments
          SET status = 'Completed'
          WHERE id = ?
        `,
        ).run(entry.appointment_id);
      }

      return {
        visit: {
          id: Number(visitResult.lastInsertRowid),
          patient_id: entry.patient_id,
          patient_name: entry.patient_name,
          procedure_name: procedure,
          amount_paid: paid,
          balance: remaining,
        },
        queue: {
          id: entry.id,
          queue_number: entry.queue_number,
          status: "Completed",
        },
      };
    });

    const result = action.immediate();

    return res.json({
      message: "Treatment completed and visit record saved successfully.",
      ...result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to complete treatment and save visit.",
    );
  }
};
