const express = require("express");

const router = express.Router();

const auth = require("../middleware/authMiddleware");


const dashboardController = require("../controllers/dashboardController");

/*  ADMIN DASHBOARD SUMMARY  */

router.get(
  "/dashboard-summary",
  auth,
  dashboardController.getDashboardSummary,
);

/*  MONTHLY REVENUE  */

router.get(
  "/dashboard-revenue",
  auth,
  dashboardController.getMonthlyRevenue,
);

/*  TOP PROCEDURES  */

router.get(
  "/dashboard-procedures",
  auth,
  dashboardController.getTopProcedures,
);

module.exports = router;
