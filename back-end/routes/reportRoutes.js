const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const reportController = require("../controllers/reportController");

/*  ADMIN REPORTS  */
router.get("/reports", auth, reportController.getReports);
router.get("/reports/details", auth, reportController.getReportDetails);
router.get("/reports/export", auth, reportController.exportReports);

router.get("/report-procedures", auth, reportController.getReportProcedures);

module.exports = router;
