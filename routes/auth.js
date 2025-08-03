const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");
const {
  loginLimiter,
  registerLimiter,
  limit2FA,
  validatePasswordStrength,
  detectSuspiciousActivity
} = require("../middleware/security");

// POST /api/auth/login
router.post("/login",
  loginLimiter,
  detectSuspiciousActivity,
  authController.login
);

// POST /api/auth/register
router.post("/register",
  registerLimiter,
  validatePasswordStrength,
  detectSuspiciousActivity,
  authController.register
);

// POST /api/auth/setup-2fa
router.post("/setup-2fa", verifyToken, limit2FA, authController.setup2FA);

// POST /api/auth/verify-2fa
router.post("/verify-2fa", verifyToken, limit2FA, authController.verify2FA);

// POST /api/auth/disable-2fa
router.post("/disable-2fa", verifyToken, authController.disable2FA);

// POST /api/auth/generate-backup-codes
router.post("/generate-backup-codes", verifyToken, authController.generateBackupCodes);

module.exports = router;
