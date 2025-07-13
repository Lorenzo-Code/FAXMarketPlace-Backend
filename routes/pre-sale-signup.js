const express = require("express");
const router = express.Router();
const axios = require("axios");
const db = require("../config/db"); // or wherever your Mongo instance is

router.post("/", async (req, res) => {
  const { email, wallet } = req.body;
  if (!email) return res.status(400).send("Missing email");

  try {
    // Optional: Send to ConvertKit
    await axios.post(`https://api.convertkit.com/v3/tags/${process.env.CONVERTKIT_PRESALE_TAG_ID}/subscribe`, {
      api_key: process.env.CONVERTKIT_API_KEY,
      email,
    });

    // Optional: Store locally
    await db.collection("presale_signups").insertOne({
      email,
      wallet: wallet || null,
      createdAt: new Date(),
    });

    res.status(200).send("Presale interest recorded");
  } catch (err) {
    console.error("Presale signup error:", err.response?.data || err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
