const db = require("../config/db");

/*  ADD VISIT  */
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
  } = req.body;

  if (!patient_id || !visit_date || !visit_time || typeof procedure_name !== "string" || !procedure_name.trim() || procedure_name.length > 500) {
    return res.status(400).json({
      message: "Please complete all required fields.",
    });
  }

  const sql = `
        INSERT INTO visits
        (
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
    `;

  db.query(
    sql,
    [
      patient_id,
      visit_date,
      visit_time,
      procedure_name,
      complain,
      description,
      amount_paid,
      balance,
    ],
    (err, result) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          message: "Unable to add visit.",
        });
      }

      res.status(201).json({
        message: "Visit Added Successfully",
        visitId: result.insertId,
      });
    },
  );
};

/*  GET VISITS OF A PATIENT  */
exports.getVisits = (req, res) => {
  const sql = `
        SELECT *
        FROM visits
        WHERE patient_id = ?
        ORDER BY visit_date DESC, visit_time DESC
    `;

  db.query(sql, [req.params.patient_id], (err, result) => {
    if (err) {
      console.error(err);

      return res.status(500).json({
        message: "Unable to retrieve visits.",
      });
    }

    res.status(200).json(result);
  });
};

/* ==================== PATIENT - VIEW OWN VISIT / TREATMENT HISTORY ==================== */
