const DUPLICATE_WARNING =
  "This time and date already has an appointment. Please choose another time and date.";

const OVERLAP_WARNING =
  "Appointments must be at least 1 hour apart. Please choose another time and date.";

function seconds(time) {
  const [h, m, s = 0] = String(time).split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function clinicToday(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

function validateSchedule(date, time, now = Date.now()) {
  if (
    typeof date !== "string" ||
    typeof time !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)
  ) {
    return "Enter a valid appointment date and time.";
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    return "Enter a valid appointment date.";
  }

  if (date < clinicToday(now)) {
    return "Appointment date cannot be in the past.";
  }

  if (parsed.getUTCDay() === 0) {
    return "Appointments are available Monday to Saturday only. Please choose another date.";
  }

  if (seconds(time) < 36000 || seconds(time) > 64800) {
    return "Appointment start times must be between 10:00 AM and 6:00 PM.";
  }

  return null;
}

// SQLite version.
// Call inside the same IMMEDIATE transaction as the scheduling write.
function checkApprovedConflict(db, date, time, excludeId = null) {
  const rows = db
    .prepare(
      `
    SELECT preferred_time
    FROM appointments
    WHERE status IN ('Approved', 'Rescheduled')
      AND preferred_date = ?
      AND (? IS NULL OR id <> ?)
  `,
    )
    .all(date, excludeId, excludeId);

  const differences = rows.map((row) =>
    Math.abs(seconds(row.preferred_time) - seconds(time)),
  );

  if (differences.includes(0)) {
    return DUPLICATE_WARNING;
  }

  return differences.some((difference) => difference < 3600)
    ? OVERLAP_WARNING
    : null;
}

module.exports = {
  validateSchedule,
  checkApprovedConflict,
  DUPLICATE_WARNING,
  OVERLAP_WARNING,
};
