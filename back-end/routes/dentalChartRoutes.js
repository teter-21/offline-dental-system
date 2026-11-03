const express = require("express");
const router = express.Router();

const controller = require("../controllers/dentalChartController");
const auth = require("../middleware/authMiddleware");

router.get("/dental-chart/:patient_id", auth, controller.getDentalChart);

router.put(
  "/dental-chart/:patient_id/:tooth_number",
  auth,
  controller.saveToothCondition,
);

router.delete(
  "/dental-chart/:patient_id/:tooth_number",
  auth,
  controller.clearToothCondition,
);

module.exports = router;
