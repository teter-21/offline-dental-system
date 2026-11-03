const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const controller = require("../controllers/appointmentController");
router.get("/appointments", auth, controller.getAppointments);
router.post("/appointments", auth, controller.createManualAppointment);
router.put(
  "/appointments/:id/status",
  auth,
  controller.updateAppointmentStatus,
);
router.put(
  "/appointments/:id/reschedule",
  auth,
  controller.rescheduleAppointment,
);
module.exports = router;
