const express = require("express");
const router = express.Router();
const axios = require("axios");

// Optional DB connection
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
    return res.status(400).json({ error: "Invalid email address." });
  }

  try {
    // ✅ Send to MailerLite v3
    const mlResponse = await axios.post(
      "https://connect.mailerlite.com/api/subscribers",
      {
        email,
        fields: {
          wallet_address: wallet || "",
        },
        groups: [process.env.MAILERLITE_PRESALE_GROUP_ID]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    // ✅ Optional: store locally in DB
    if (db && db.collection) {
      await db.collection("presale_signups").insertOne({
        email,
        wallet: wallet || null,
        createdAt: new Date(),
      });
    }

    return res.status(200).json({
      message: "Presale interest recorded",
      ml_subscriber_id: mlResponse.data?.data?.id,
    });
  } catch (err) {
    console.error("❌ Presale signup error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Server error during pre-sale signup." });
  }
});

module.exports = router;
