const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const paymentController = require("../controllers/paymentController");

/* ADMIN - BILLING */
router.get("/billing", auth, paymentController.getBillingRecords);
router.post("/billing/payments", auth, paymentController.recordPayment);
router.get("/billing/summary", auth, paymentController.getBillingSummary);

module.exports = router;
