const express = require("express");
const router = express.Router();
const { verifyToken, authorizeAdmin } = require("../middleware/auth");

// Protected route (any authenticated user)
router.get("/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

// Admin-only route
router.post("/admin/data", verifyToken, authorizeAdmin, (req, res) => {
  res.json({ message: "Welcome Admin!" });
});
