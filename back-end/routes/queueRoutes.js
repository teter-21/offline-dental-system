const express = require("express");

const router = express.Router();

const auth = require("../middleware/authMiddleware");

const queueController = require("../controllers/queueController");

/*  ADMIN - GET TODAY'S QUEUE  */

router.get("/queue", auth, queueController.getTodayQueue);

/*  ADMIN - CALL NEXT PATIENT  */

router.post("/queue/call-next", auth, queueController.callNextPatient);

/*  ADMIN - CHECK IN APPOINTMENT  */

router.post("/queue/appointment/:id", auth, queueController.checkInAppointment);

/*  ADMIN - ADD WALK-IN  */

router.post("/queue/walk-in", auth, queueController.addWalkIn);

/*  ADMIN - CALL PATIENT  */

router.put("/queue/:id/call", auth, queueController.callPatient);

/*  ADMIN - START TREATMENT  */

router.put("/queue/:id/start", auth, queueController.startTreatment);

/*  ADMIN - COMPLETE  */

router.put("/queue/:id/complete", auth, queueController.completeQueue);

/*  ADMIN - SKIP  */

router.put("/queue/:id/skip", auth, queueController.skipPatient);

/*  ADMIN - CANCEL  */

router.put("/queue/:id/cancel", auth, queueController.cancelQueue);

/*  ADMIN - COMPLETE TREATMENT + SAVE VISIT  */

router.post(
  "/queue/:id/complete-treatment",
  auth,
  queueController.completeTreatmentWithVisit,
);

module.exports = router;
