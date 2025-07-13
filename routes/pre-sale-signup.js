const express = require("express");
const router = express.Router();
const axios = require("axios");

// 🛡️ Optional DB import if used
let db;
try {
  db = require("../config/db");
} catch (e) {
  console.warn("⚠️ No DB connected — proceeding without local storage.");
}

// POST /api/pre-sale-signup
router.post("/", async (req, res) => {
  const { email, wallet } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }

  try {
    // ✅ Send to ConvertKit (optional)
    await axios.post(`https://api.convertkit.com/v3/tags/${process.env.CONVERTKIT_PRESALE_TAG_ID}/subscribe`, {
      api_key: process.env.CONVERTKIT_API_KEY,
      email,
    });

    // ✅ Store locally if db is connected
    if (db && db.collection) {
      await db.collection("presale_signups").insertOne({
        email,
        wallet: wallet || null,
        createdAt: new Date(),
      });
    }

    return res.status(200).json({ message: "Presale interest recorded" });
  } catch (err) {
    console.error("Presale signup error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

// 5555555555