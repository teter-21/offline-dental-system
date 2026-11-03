const { getSQLite } = require("../config/sqlite");

const VALID_CONDITIONS = [
  "Healthy",
  "Cavity",
  "Filled",
  "Missing",
  "Extracted",
  "Cracked",
  "Impacted",
  "Root Canal",
  "Crown",
  "Other",
];

const validToothNumber = (value) =>
  /^(1[1-8]|2[1-8]|3[1-8]|4[1-8])$/.test(String(value));

function validPatientId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
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

// GET DENTAL CHART
exports.getDentalChart = (req, res) => {
  const patientId = validPatientId(req.params.patient_id);

  if (!patientId) {
    return res.status(400).json({
      message: "Invalid patient ID.",
    });
  }

  try {
    const rows = getSQLite()
      .prepare(
        `
      SELECT
        id,
        patient_id,
        tooth_number,
        condition_name,
        notes,
        updated_at
      FROM dental_chart
      WHERE patient_id = ?
      ORDER BY tooth_number ASC
    `,
      )
      .all(patientId);

    return res.json(rows);
  } catch (error) {
    console.error("SQLite dental chart lookup failed:", error);

    return res.status(500).json({
      message: "Unable to load dental chart.",
    });
  }
};

// SAVE OR UPDATE TOOTH CONDITION
exports.saveToothCondition = (req, res) => {
  const patientId = validPatientId(req.params.patient_id);
  const toothNumber = String(req.params.tooth_number);

  const conditionName = String(req.body?.condition_name || "").trim();

  const notes = String(req.body?.notes || "").trim() || null;

  if (!patientId || !validToothNumber(toothNumber)) {
    return res.status(400).json({
      message: "Invalid patient or tooth number.",
    });
  }

  if (!VALID_CONDITIONS.includes(conditionName)) {
    return res.status(400).json({
      message: "Invalid dental condition.",
    });
  }

  try {
    const db = getSQLite();

    const saveCondition = db.transaction(() => {
      const patient = db
        .prepare(
          `
        SELECT id
        FROM patients
        WHERE id = ?
      `,
        )
        .get(patientId);

      if (!patient) {
        return false;
      }

      const existing = db
        .prepare(
          `
        SELECT id
        FROM dental_chart
        WHERE patient_id = ?
          AND tooth_number = ?
        LIMIT 1
      `,
        )
        .get(patientId, toothNumber);

      if (existing) {
        db.prepare(
          `
          UPDATE dental_chart
          SET
            condition_name = ?,
            notes = ?,
            updated_at = ?
          WHERE id = ?
        `,
        ).run(conditionName, notes, clinicTimestamp(), existing.id);
      } else {
        db.prepare(
          `
          INSERT INTO dental_chart (
            patient_id,
            tooth_number,
            condition_name,
            notes
          )
          VALUES (?, ?, ?, ?)
        `,
        ).run(patientId, toothNumber, conditionName, notes);
      }

      return true;
    });

    const saved = saveCondition.immediate();

    if (!saved) {
      return res.status(404).json({
        message: "Patient not found.",
      });
    }

    return res.json({
      message: `Tooth #${toothNumber} updated successfully.`,
      tooth: {
        patient_id: patientId,
        tooth_number: toothNumber,
        condition_name: conditionName,
        notes,
      },
    });
  } catch (error) {
    console.error("SQLite dental chart save failed:", error);

    return res.status(500).json({
      message: "Unable to save dental chart.",
    });
  }
};

// CLEAR TOOTH CONDITION
exports.clearToothCondition = (req, res) => {
  const patientId = validPatientId(req.params.patient_id);
  const toothNumber = String(req.params.tooth_number);

  if (!patientId || !validToothNumber(toothNumber)) {
    return res.status(400).json({
      message: "Invalid patient or tooth number.",
    });
  }

  try {
    getSQLite()
      .prepare(
        `
      DELETE FROM dental_chart
      WHERE patient_id = ?
        AND tooth_number = ?
    `,
      )
      .run(patientId, toothNumber);

    return res.json({
      message: `Tooth #${toothNumber} cleared successfully.`,
    });
  } catch (error) {
    console.error("SQLite dental chart clear failed:", error);

    return res.status(500).json({
      message: "Unable to clear tooth condition.",
    });
  }
};
