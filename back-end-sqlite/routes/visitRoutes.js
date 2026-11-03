const express = require("express");
const router = express.Router();
const controller = require("../controllers/visitController");
const auth = require("../middleware/authMiddleware");
router.post("/add-visit", auth, controller.addVisit);
router.get("/visits/:patient_id", auth, controller.getVisits);
module.exports = router;
