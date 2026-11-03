const { uploadLimit } = require("../middleware/persistentLimits");
const { validateImage } = require("../services/privateImages");
const express = require("express");
const router = express.Router();
const controller = require("../controllers/patientController");
const auth = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
router.get("/patients", auth, controller.getPatients);
router.get("/recent-patients", auth, controller.getRecentPatients);
router.post(
  "/add-patient",
  auth,
  uploadLimit,
  upload.single("image"),
  validateImage,
  controller.addPatient,
);
router.put(
  "/update-patient/:id",
  auth,
  uploadLimit,
  upload.single("image"),
  validateImage,
  controller.updatePatient,
);
module.exports = router;
