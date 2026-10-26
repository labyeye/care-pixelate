const express = require("express");
const asyncHandler = require("express-async-handler");
const { protect } = require("../middleware/auth");
const User = require("../models/User");
const terms = require("../utils/terms");

const router = express.Router();

const view = (u) => ({
  version: terms.VERSION,
  required: terms.required(u),
  accepted: terms.accepted(u),
  acceptedAt: terms.accepted(u) ? u.termsAcceptedAt : null,
});

router.get("/status", protect, (req, res) => res.json({ success: true, data: view(req.user) }));

router.post(
  "/accept",
  protect,
  asyncHandler(async (req, res) => {
    const set = {
      termsVersion: terms.VERSION,
      termsAcceptedAt: new Date(),
      termsAcceptedIp: String(req.ip || "").slice(0, 64),
      termsAcceptedAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    };
    await User.updateOne({ _id: req.user._id }, { $set: set });
    res.json({ success: true, data: view({ ...req.user.toObject(), ...set }) });
  }),
);

module.exports = router;
