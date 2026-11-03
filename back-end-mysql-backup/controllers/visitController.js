const { getSQLite } = require("../config/sqlite");

function validPatientId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validTime(value) {
  return (
    typeof value === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
  );
}

function money(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const number = Number(value);
  return Number.isFinite(number)
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : NaN;
}

// ADD VISIT
exports.addVisit = (req, res) => {
  const {
    patient_id,
    visit_date,
    visit_time,
    procedure_name,
    complain,
    description,
    amount_paid,
    balance,
  } = req.body || {};

  const patientId = validPatientId(patient_id);
  const procedure =
    typeof procedure_name === "string" ? procedure_name.trim() : "";

  if (
    !patientId ||
    !validDate(visit_date) ||
    !validTime(visit_time) ||
    !procedure ||
    procedure.length > 500
  ) {
    return res.status(400).json({
      message: "Please complete all required fields.",
    });
  }

  const paid = money(amount_paid);
  const remaining = money(balance);

  if (
    !Number.isFinite(paid) ||
    !Number.isFinite(remaining) ||
    paid < 0 ||
    remaining < 0
  ) {
    return res.status(400).json({
      message: "Enter valid non-negative payment amounts.",
    });
  }

  try {
    const db = getSQLite();

    const patient = db
      .prepare(
        `
      SELECT id
      FROM patients
      WHERE id = ?
      LIMIT 1
    `,
      )
      .get(patientId);

    if (!patient) {
      return res.status(404).json({
        message: "Patient not found.",
      });
    }

    const result = db
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
        patientId,
        visit_date,
        visit_time,
        procedure,
        complain || null,
        description || null,
        paid,
        remaining,
      );

    return res.status(201).json({
      message: "Visit Added Successfully",
      visitId: Number(result.lastInsertRowid),
    });
  } catch (error) {
    console.error("SQLite add visit failed:", error);

    return res.status(500).json({
      message: "Unable to add visit.",
    });
  }
};

// GET VISITS OF A PATIENT
exports.getVisits = (req, res) => {
  const patientId = validPatientId(req.params.patient_id);

  if (!patientId) {
    return res.status(400).json({
      message: "Invalid patient ID.",
    });
  }

  try {
    const visits = getSQLite()
      .prepare(
        `
      SELECT *
      FROM visits
      WHERE patient_id = ?
      ORDER BY
        visit_date DESC,
        visit_time DESC,
        id DESC
    `,
      )
      .all(patientId);

    return res.status(200).json(visits);
  } catch (error) {
    console.error("SQLite visits lookup failed:", error);

    return res.status(500).json({
      message: "Unable to retrieve visits.",
    });
  }
};
