const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
require("dotenv").config();

router.get("/", async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing lat/lon parameters" });
  }

  try {
    const url = `https://api.greatschools.org/schools/nearby?key=${process.env.GREATSCHOOLS_API_KEY}&lat=${lat}&lon=${lon}&limit=5`;

    const response = await fetch(url);
    const xml = await response.text();

    // Optional: convert XML to JSON (GreatSchools returns XML by default)
    const { parseStringPromise } = require("xml2js");
    const json = await parseStringPromise(xml, { explicitArray: false });

    res.json({ schools: json.schools.school || [] });
  } catch (err) {
    console.error("❌ GreatSchools API error:", err);
    res.status(500).json({ error: "Failed to fetch school info" });
  }
});

module.exports = router;
