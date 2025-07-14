const express = require("express");
const axios = require("axios");
const router = express.Router();

const MAILERLITE_API_URL = "https://connect.mailerlite.com/api/subscribers";

router.post("/subscribe", async (req, res) => {
  const { email } = req.body;
  const groupId = "159926948262315605"; // Your MailerLite Group ID

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    const response = await axios.post(
      MAILERLITE_API_URL,
      {
        email,
        groups: [groupId],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
        },
      }
    );

    // ✅ Success response only
    res.status(200).json({
      message: "🎉 Subscribed successfully!",
      data: response.data,
    });
  } catch (err) {
    console.error("❌ MailerLite API error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: "Subscription failed.",
      details: err.response?.data || err.message,
    });
  }
});

module.exports = router;