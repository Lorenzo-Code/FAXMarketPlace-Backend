
const express = require("express");
const router = express.Router();
const SuggestedDeal = require("../../models/SuggestedDeal");
const { verifyToken } = require("../../middleware/auth");

// GET all suggested deals
router.get("/", async (req, res) => {
  try {
    const deals = await SuggestedDeal.find().sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, deals });
  } catch (err) {
    console.error("❌ Failed to fetch suggested deals:", err.message);
    res.status(500).json({ error: "Failed to fetch suggested deals" });
  }
});

// POST a new suggested deal (admin only)
router.post("/", verifyToken, async (req, res) => {
  try {
    const newDeal = new SuggestedDeal({
      ...req.body,
      addedBy: req.user?.id || "system"
    });

    const saved = await newDeal.save();
    res.status(201).json({ success: true, deal: saved });
  } catch (err) {
    console.error("❌ Failed to save suggested deal:", err.message);
    res.status(400).json({ error: "Could not save deal", details: err.message });
  }
});

module.exports = router;
