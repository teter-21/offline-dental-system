const { getSQLite } = require("../config/sqlite");

const {
  uploadPrivateImage: uploadLocalImage,
} = require("../services/privateImages");

// GET PATIENTS
exports.getPatients = (req, res) => {
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
    conditions.push(`
      (
        p.name LIKE ?
        OR CAST(p.id AS TEXT) LIKE ?
        OR p.occupation LIKE ?
      )
    `);

    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const ages = {
    "under-18": "p.age < 18",
    "18-30": "p.age BETWEEN 18 AND 30",
    "31-50": "p.age BETWEEN 31 AND 50",
    "51-65": "p.age BETWEEN 51 AND 65",
    "66-plus": "p.age >= 66",
  };

  if (Object.hasOwn(ages, req.query.age)) {
    conditions.push(ages[req.query.age]);
  }

  const sorts = {
    "name-az": "p.name ASC, p.id ASC",
    "name-za": "p.name DESC, p.id DESC",
    "registration-oldest": "p.created_at ASC, p.id ASC",
    "registration-newest": "p.created_at DESC, p.id DESC",
  };

  const sort = Object.hasOwn(sorts, req.query.sort)
    ? sorts[req.query.sort]
    : "p.id DESC";

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const latestComplaint = `
    COALESCE(
      (
        SELECT NULLIF(TRIM(v.complain), '')
        FROM visits v
        WHERE v.patient_id = p.id
          AND NULLIF(TRIM(v.complain), '') IS NOT NULL
        ORDER BY
          v.visit_date DESC,
          v.visit_time DESC,
          v.id DESC
        LIMIT 1
      ),
      p.complain
    ) AS complain
  `;

  try {
    const db = getSQLite();

    if (!paginated) {
      const rows = db
        .prepare(
          `
        SELECT p.*, ${latestComplaint}
        FROM patients p
        ${where}
        ORDER BY ${sort}
      `,
        )
        .all(...params);

      return res.json(rows);
    }

    const count = db
      .prepare(
        `
      SELECT COUNT(*) AS total
      FROM patients p
      ${where}
    `,
      )
      .get(...params);

    const total = Number(count.total);
    const pages = Math.max(1, Math.ceil(total / size));
    const effectivePage = Math.min(page, pages);

    const compact = req.query.compact === "true";

    const columns = compact ? "p.id, p.name" : `p.*, ${latestComplaint}`;

    const items = db
      .prepare(
        `
      SELECT ${columns}
      FROM patients p
      ${where}
      ORDER BY ${sort}
      LIMIT ? OFFSET ?
    `,
      )
      .all(...params, size, (effectivePage - 1) * size);

    return res.json({
      items,
      total,
      page: effectivePage,
      totalPages: pages,
    });
  } catch (error) {
    console.error("SQLite patient list error:", error);

    return res.status(500).json({
      message: "Unable to retrieve patients.",
    });
  }
};

// GET RECENT PATIENTS
exports.getRecentPatients = (req, res) => {
  try {
    const patients = getSQLite()
      .prepare(
        `
      SELECT
        p.id,
        p.name,
        p.age,
        p.status,
        p.image,
        MAX(v.visit_date) AS last_visit
      FROM patients p
      LEFT JOIN visits v
        ON v.patient_id = p.id
      GROUP BY
        p.id,
        p.name,
        p.age,
        p.status,
        p.image
      ORDER BY p.id DESC
      LIMIT 5
    `,
      )
      .all();

    return res.json(patients);
  } catch (error) {
    console.error("SQLite recent patients error:", error);

    return res.status(500).json({
      message: "Unable to load recent patients.",
    });
  }
};

// ADD PATIENT
exports.addPatient = async (req, res) => {
  const { name, age, phone, occupation, status, complain, address, gender } =
    req.body || {};

  if (
    !String(name || "").trim() ||
    !String(age || "").trim() ||
    !String(phone || "").trim() ||
    !String(occupation || "").trim() ||
    !String(complain || "").trim() ||
    !String(address || "").trim()
  ) {
    return res.status(400).json({
      message: "Please complete all required fields.",
    });
  }

  const patientAge = Number(age);

  if (!Number.isInteger(patientAge) || patientAge < 0 || patientAge > 120) {
    return res.status(400).json({
      message: "Enter a valid patient age.",
    });
  }

  const civilStatus = status || "Single";

  try {
    const db = getSQLite();

    // The existing route validates and sanitizes
    // uploaded image bytes before this function runs.
    let image = null;

    if (req.file) {
      image = await uploadLocalImage(req.file.buffer);
    }

    const result = db
      .prepare(
        `
      INSERT INTO patients (
        name,
        address,
        phone,
        age,
        occupation,
        gender,
        status,
        complain,
        image
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        String(name).trim(),
        String(address).trim(),
        String(phone).trim(),
        patientAge,
        String(occupation).trim(),
        gender || null,
        civilStatus,
        String(complain).trim(),
        image,
      );

    return res.status(201).json({
      message: "Patient Added Successfully",
      patientId: Number(result.lastInsertRowid),
      image,
    });
  } catch (error) {
    console.error("SQLite add patient error:", error);

    return res.status(500).json({
      message: "Unable to add patient.",
    });
  }
};

// UPDATE PATIENT
exports.updatePatient = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      message: "Invalid patient ID.",
    });
  }

  const { name, age, occupation, address, phone, gender, status, complain } =
    req.body || {};

  if (!String(name || "").trim()) {
    return res.status(400).json({
      message: "Patient name is required.",
    });
  }

  const patientAge =
    age === undefined || age === null || age === "" ? null : Number(age);

  if (
    patientAge !== null &&
    (!Number.isInteger(patientAge) || patientAge < 0 || patientAge > 120)
  ) {
    return res.status(400).json({
      message: "Enter a valid patient age.",
    });
  }

  try {
    const db = getSQLite();

    const existing = db
      .prepare(
        `
      SELECT id
      FROM patients
      WHERE id = ?
    `,
      )
      .get(id);

    if (!existing) {
      return res.status(404).json({
        message: "Patient not found.",
      });
    }

    let image = null;

    if (req.file) {
      image = await uploadLocalImage(req.file.buffer);
    }

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
      String(name).trim(),
      patientAge,
      occupation || null,
      address || null,
      phone || null,
      gender || null,
      status || null,
      complain || null,
    ];

    if (image) {
      fields.push("image = ?");
      values.push(image);
    }

    values.push(id);

    const result = db
      .prepare(
        `
      UPDATE patients
      SET ${fields.join(", ")}
      WHERE id = ?
    `,
      )
      .run(...values);

    if (result.changes === 0) {
      return res.status(404).json({
        message: "Patient not found.",
      });
    }

    return res.json({
      message: "Patient updated successfully.",
      image,
    });
  } catch (error) {
    console.error("SQLite update patient error:", error);

    return res.status(500).json({
      message: "Unable to update patient.",
    });
  }
};
