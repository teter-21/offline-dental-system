const db = require("../config/db");
const {
  uploadPrivateImage: uploadLocalImage,
} = require("../services/privateImages");

/* =========================================================
   GET ALL PATIENTS
========================================================= */

exports.getPatients = async (req, res) => {
  // Keep the legacy array response for older consumers; new screens request pages.
  const paginated = req.query.page !== undefined;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const size = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.page_size, 10) || 10),
  );
  const search = String(req.query.search || "")
    .trim()
    .slice(0, 150);
  const conditions = [];
  const params = [];
  if (search) {
    conditions.push(
      "(name LIKE ? OR CAST(id AS CHAR) LIKE ? OR occupation LIKE ?)",
    );
    params.push(...Array(3).fill(`%${search}%`));
  }
  const ages = {
    "under-18": "age < 18",
    "18-30": "age BETWEEN 18 AND 30",
    "31-50": "age BETWEEN 31 AND 50",
    "51-65": "age BETWEEN 51 AND 65",
    "66-plus": "age >= 66",
  };
  if (Object.hasOwn(ages, req.query.age)) conditions.push(ages[req.query.age]);
  const sorts = {
    "name-az": "name ASC, id ASC",
    "name-za": "name DESC, id DESC",
    "registration-oldest": "created_at ASC, id ASC",
    "registration-newest": "created_at DESC, id DESC",
  };
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sort = Object.hasOwn(sorts, req.query.sort)
    ? sorts[req.query.sort]
    : "id DESC";
  try {
    if (!paginated) {
      const [rows] = await db
        .promise()
        .query(
          `SELECT p.*, COALESCE((SELECT NULLIF(TRIM(v.complain), '') FROM visits v WHERE v.patient_id = p.id AND NULLIF(TRIM(v.complain), '') IS NOT NULL ORDER BY v.visit_date DESC, v.visit_time DESC, v.id DESC LIMIT 1), p.complain) AS complain FROM patients p ${where} ORDER BY ${sort}`,
          params,
        );
      return res.json(rows);
    }
    const [[count]] = await db
      .promise()
      .query(`SELECT COUNT(*) AS total FROM patients ${where}`, params);
    const total = Number(count.total);
    const pages = Math.max(1, Math.ceil(total / size));
    const effectivePage = Math.min(page, pages);
    const columns = req.query.compact === "true" ? "p.id, p.name" : "p.*";
    const latestComplaint =
      req.query.compact === "true"
        ? ""
        : ", COALESCE((SELECT NULLIF(TRIM(v.complain), '') FROM visits v WHERE v.patient_id = p.id AND NULLIF(TRIM(v.complain), '') IS NOT NULL ORDER BY v.visit_date DESC, v.visit_time DESC, v.id DESC LIMIT 1), p.complain) AS complain";
    const [items] = await db
      .promise()
      .query(
        `SELECT ${columns}${latestComplaint} FROM patients p ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`,
        [...params, size, (effectivePage - 1) * size],
      );
    return res.json({ items, total, page: effectivePage, totalPages: pages });
  } catch (error) {
    console.error("Patient list failed:", error.code);
    return res.status(500).json({ message: "Unable to retrieve patients." });
  }
};

/* =========================================================
   GET RECENT PATIENTS

   Returns the 5 most recently registered patients.
========================================================= */

exports.getRecentPatients = (req, res) => {
  const sql = `
    SELECT
      p.id,
      p.name,
      p.age,
      p.status,
      p.image,
      MAX(v.visit_date) AS last_visit

    FROM patients p

    LEFT JOIN visits v
      ON p.id = v.patient_id

    GROUP BY
      p.id,
      p.name,
      p.age,
      p.status,
      p.image

    ORDER BY p.id DESC

    LIMIT 5
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Recent patients error:", err);

      return res.status(500).json({
        message: "Unable to load recent patients.",
      });
    }

    res.json(result);
  });
};

/* =========================================================
   ADD PATIENT
========================================================= */

exports.addPatient = async (req, res) => {
  const { name, age, phone, occupation, status, complain, address } = req.body;

  /*
   * Validate required fields.
   */
  if (!name || !age || !phone || !occupation || !complain || !address) {
    return res.status(400).json({
      message: "Please complete all required fields.",
    });
  }

  const civilStatus = status || "Single";

  try {
    /*
     * Default image value.
     */
    let image = null;

    /*
     * If the user selected an image,
     * save it locally.
     */
    if (req.file) {
      image = await uploadLocalImage(req.file.buffer);
    }

    /*
     * Save patient information.
     *
     * The image column now stores the private local file reference.
     */
    const sql = `
      INSERT INTO patients
      (
        name,
        address,
        phone,
        age,
        occupation,
        status,
        complain,
        image
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [name, address, phone, age, occupation, civilStatus, complain, image],
      (err, result) => {
        if (err) {
          console.error("Add patient database error:", err);

          return res.status(500).json({
            message: "Unable to add patient.",
          });
        }

        res.status(201).json({
          message: "Patient Added Successfully",
          patientId: result.insertId,
          image: image,
        });
      },
    );
  } catch (error) {
    console.error("Local image upload error:", error);

    return res.status(500).json({
      message: "Unable to upload patient image.",
    });
  }
};

/* =========================================================
   UPDATE PATIENT
========================================================= */

exports.updatePatient = async (req, res) => {
  const { id } = req.params;

  const { name, age, occupation, address, phone, gender, status, complain } =
    req.body;

  /*
   * Patient name is required.
   */
  if (!name) {
    return res.status(400).json({
      message: "Patient name is required.",
    });
  }

  try {
    /*
     * No image by default.
     *
     * If no new image is uploaded,
     * the existing image remains unchanged.
     */
    let image = null;

    /*
     * Upload a new image only if one was selected.
     */
    if (req.file) {
      image = await uploadLocalImage(req.file.buffer);
    }

    /*
     * Patient fields to update.
     */
    const fields = [
      "name = ?",
      "age = ?",
      "occupation = ?",
      "address = ?",
      "phone = ?",
      "gender = ?",
      "status = ?",
      "complain = ?",
    ];

    const values = [
      name,
      age || null,
      occupation || null,
      address || null,
      phone || null,
      gender || null,
      status || null,
      complain || null,
    ];

    /*
     * Only update the image column
     * if the user uploaded a new image.
     */
    if (image) {
      fields.push("image = ?");
      values.push(image);
    }

    /*
     * Patient ID for WHERE clause.
     */
    values.push(id);

    const sql = `
      UPDATE patients
      SET ${fields.join(", ")}
      WHERE id = ?
    `;

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("Update patient error:", err);

        return res.status(500).json({
          message: "Unable to update patient.",
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Patient not found.",
        });
      }

      res.json({
        message: "Patient updated successfully.",
        image: image,
      });
    });
  } catch (error) {
    console.error("Local image upload error:", error);

    return res.status(500).json({
      message: "Unable to upload patient image.",
    });
  }
};
