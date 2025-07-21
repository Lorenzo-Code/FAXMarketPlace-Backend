const express = require("express");
const axios = require("axios");
const router = express.Router();
const Subscriber = require("../../models/Subscriber");

const MAILERLITE_API_URL = "https://connect.mailerlite.com/api/subscribers";

// ✅ Centralized MailerLite group IDs
const GROUP_IDS = {
  newsletter: "159926948262315605",
  presale: "159929408050693310",
};

// ✅ Only allow predefined contexts
const ALLOWED_CONTEXTS = Object.keys(GROUP_IDS);

// ✅ Subscribe Route
router.post("/subscribe", async (req, res) => {
  const { email, name = "", wallet = "", context = "newsletter" } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "A valid email is required." });
  }

  const safeContext = ALLOWED_CONTEXTS.includes(context) ? context : "newsletter";
  const groupId = GROUP_IDS[safeContext];

  try {
    console.log("📩 Subscribing email:", email, "| Group:", safeContext);

    const mlRes = await axios.post(
      MAILERLITE_API_URL,
      {
        email,
        groups: [groupId],
        type: "unconfirmed",
        fields: {
          name,
          wallet_address: wallet,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
        },
      }
    );

    // ✅ Store in MongoDB using Mongoose
    await Subscriber.create({
      email,
      wallet: wallet ? wallet.toLowerCase() : undefined,
      context: safeContext,
    });

    return res.status(200).json({
      message: "🎉 Confirmation email sent! Please check your inbox.",
      data: mlRes.data,
    });
  } catch (err) {
    console.error("❌ MailerLite API error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: "Subscription failed.",
      details: err.response?.data || err.message,
    });
  }
});

// ✅ Whitelist Checker
router.post("/check-whitelist", async (req, res) => {
  const { wallet } = req.body;

  if (!wallet) {
    return res.status(400).json({ error: "Wallet address is required." });
  }

  try {
    const record = await Subscriber.findOne({
      wallet: wallet.toLowerCase(),
      context: "presale",
    });

    return res.status(200).json({ whitelisted: !!record });
  } catch (err) {
    console.error("❌ MongoDB whitelist check error:", err.message);
    return res.status(500).json({ error: "Whitelist check failed." });
  }
});

module.exports = router;
