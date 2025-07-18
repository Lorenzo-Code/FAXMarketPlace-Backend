// utils/helpscoutClient.js
const axios = require("axios");
const HELPSCOUT_API_KEY = process.env.HELPSCOUT_API_KEY;

exports.sendHelpScoutReply = async (ticketId, { message, customerEmail }) => {
  try {
    const url = `https://api.helpscout.net/v2/conversations/${ticketId}/notes`;
    const headers = {
      Authorization: `Basic ${Buffer.from(HELPSCOUT_API_KEY + ":").toString("base64")}`,
      "Content-Type": "application/json",
    };

    const body = {
      text: message,
      user: { email: customerEmail }, // Optional
    };

    await axios.post(url, body, { headers });
  } catch (err) {
    console.error("HelpScout reply failed:", err.message);
  }
};
