const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { verifyToken, authorizeAdmin } = require("../middleware/auth");

// ✅ Dashboard Route
router.get("/dashboard", verifyToken, authorizeAdmin, (req, res) => {
  console.log("🔐 Admin Access:", req.user);
  res.json({ message: "Welcome to the admin dashboard." });
});

// ✅ Get All Users
router.get("/users", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const users = await User.find().select("_id email role");
    res.json({ users });
  } catch (err) {
    res.status(500).json({ msg: "Failed to fetch users", error: err.message });
  }
});

// ✅ Promote User to Admin
router.post("/users/:id/promote", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { role: "admin" },
      { new: true }
    ).select("_id email role");

    if (!updated) return res.status(404).json({ msg: "User not found" });

    res.json({ msg: "User promoted to admin", user: updated });
  } catch (err) {
    res.status(500).json({ msg: "Promotion failed", error: err.message });
  }
});

const Property = require("../models/Property"); // adjust path if needed

// 🔍 List all properties for review
router.get("/properties", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const properties = await Property.find().sort({ createdAt: -1 });
    res.json({ properties });
  } catch (err) {
    res.status(500).json({ msg: "Failed to fetch properties", error: err.message });
  }
});

// ✅ Approve property
router.post("/properties/:id/approve", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );
    if (!property) return res.status(404).json({ msg: "Property not found" });
    res.json({ msg: "Property approved", property });
  } catch (err) {
    res.status(500).json({ msg: "Approval failed", error: err.message });
  }
});

// ❌ Reject property
router.post("/properties/:id/reject", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );
    if (!property) return res.status(404).json({ msg: "Property not found" });
    res.json({ msg: "Property rejected", property });
  } catch (err) {
    res.status(500).json({ msg: "Rejection failed", error: err.message });
  }
});

router.get("/token-analytics", verifyToken, authorizeAdmin, (req, res) => {
  res.json({
    fctBreakdown: {
      operations: 250000000,
      founders: 200000000,
      employees: 100000000,
      ecosystem: 395000000,
      presale: 35000000,
      liquidity: 20000000,
    },
    dailyVolume: [
      { date: "Jul 1", volume: 1120 },
      { date: "Jul 2", volume: 890 },
      { date: "Jul 3", volume: 1345 },
      { date: "Jul 4", volume: 980 },
      { date: "Jul 5", volume: 1500 },
      { date: "Jul 6", volume: 1225 },
      { date: "Jul 7", volume: 1730 },
    ],
  });
});

const AuditLog = require("../models/AuditLog");

router.get("/audit-logs", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { event, userId, role, limit = 100 } = req.query;

    // Build query dynamically based on filters
    const query = {};
    if (event) query.event = event;
    if (userId) query.user = userId;
    if (role) query.role = role;

    const logs = await AuditLog.find(query)
      .populate("user", "email")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({ logs });
  } catch (err) {
    console.error("❌ Audit log fetch error:", err);
    res.status(500).json({ msg: "Failed to fetch audit logs", error: err.message });
  }
});



module.exports = router;
