"use strict";
const express = require("express");
const auth = require("../middleware/authMiddleware");
const controller = require("../controllers/visitController");
const router = express.Router();

router.post("/add-visit", auth, controller.addVisit);
router.get("/visits/:patient_id", auth, controller.getVisits);
router.put("/visits/:visit_id", auth, controller.updateVisit);
router.get("/treatments/calendar", auth, controller.getTreatmentCalendar);

module.exports = router;
