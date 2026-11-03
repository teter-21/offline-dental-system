const {
  loginIpLimit,
  loginAccountLimit,
  resetLimit,
} = require("../middleware/persistentLimits");
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");
const {
  loginLimiter,
  resetLimiter,
} = require("../middleware/securityMiddleware");
router.post(
  "/login",
  loginIpLimit,
  loginAccountLimit,
  loginLimiter,
  authController.login,
);
router.get("/account", auth, authController.getMyAccount);
router.put("/account", auth, authController.updateMyAccount);
router.post("/logout", auth, authController.logout);
module.exports = router;
