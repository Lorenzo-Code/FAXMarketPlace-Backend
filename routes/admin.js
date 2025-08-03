const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { verifyToken, authorizeAdmin } = require("../middleware/auth");


// ✅ Dashboard Route
router.get("/dashboard", verifyToken, authorizeAdmin, (req, res) => {
  const userKey = req.user?.id || req.sessionID || "guest";
  console.log("🔐 Admin Access:", req.user, "| Cache/User Key:", userKey);

  // Return mock dashboard data that the frontend expects
  res.json({
    message: "Welcome to the admin dashboard.",
    totalUsers: 150,
    verifiedUsers: 120,
    tokenTransfers: 2450,
    activeSubscriptions: 85,
    userTrends: [
      { week: "Week 1", count: 25 },
      { week: "Week 2", count: 30 },
      { week: "Week 3", count: 35 },
      { week: "Week 4", count: 40 }
    ],
    tokenVolume: [
      { date: "Mon", volume: 1200 },
      { date: "Tue", volume: 1800 },
      { date: "Wed", volume: 1500 },
      { date: "Thu", volume: 2100 },
      { date: "Fri", volume: 1900 }
    ],
    revenueTrends: [
      { month: "Jan", revenue: 15000 },
      { month: "Feb", revenue: 18000 },
      { month: "Mar", revenue: 22000 },
      { month: "Apr", revenue: 25000 }
    ],
    reportUsage: [
      { day: "Mon", reports: 45 },
      { day: "Tue", reports: 52 },
      { day: "Wed", reports: 38 },
      { day: "Thu", reports: 65 },
      { day: "Fri", reports: 58 }
    ],
    activityFeed: [
      { icon: "👤", time: "2 min ago", message: "New user registered: john@example.com" },
      { icon: "💰", time: "5 min ago", message: "Token transfer completed: 1,500 FXCT" },
      { icon: "🏠", time: "10 min ago", message: "Property uploaded for review" },
      { icon: "📊", time: "15 min ago", message: "Weekly report generated" }
    ]
  });
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
