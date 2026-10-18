const express = require("express");
const rateLimit = require("express-rate-limit");
const c = require("../controllers/authController");
const { protect, protectAccount } = require("../middleware/auth");

const router = express.Router();

// Tighter cap for endpoints that send messages or accept guessable codes.
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts, please try again later.",
  },
});

router.post("/register", sensitiveLimiter, c.registerAccount);
router.post("/register-tenant", sensitiveLimiter, c.registerTenant);
router.post("/register-patient", sensitiveLimiter, c.registerPatient);
router.get("/clinic/:slug", c.clinicLookup);
router.post("/login", c.login);
router.post("/2fa/verify", sensitiveLimiter, c.verify2FA);
router.post("/refresh", c.refresh);
router.post("/forgot-password", sensitiveLimiter, c.forgotPassword);
router.post("/reset-password/:token", sensitiveLimiter, c.resetPassword);
router.post("/login/otp/send", sensitiveLimiter, c.loginRequestOtp);
router.post("/login/otp/verify", sensitiveLimiter, c.loginVerifyOtp);
router.post("/login/select", sensitiveLimiter, c.loginSelect);

router.get("/me", protectAccount, c.getMe);
router.post("/onboard", protectAccount, c.onboard);
router.post("/logout", protectAccount, c.logout);
router.post("/phone/send-otp", protect, sensitiveLimiter, c.sendPhoneOtp);
router.post("/phone/verify-otp", protect, sensitiveLimiter, c.verifyPhoneOtp);
router.post("/2fa/totp/setup", protect, c.totpSetup);
router.post("/2fa/totp/verify", protect, sensitiveLimiter, c.totpVerifySetup);
router.post("/2fa/totp/disable", protect, sensitiveLimiter, c.totpDisable);

module.exports = router;
