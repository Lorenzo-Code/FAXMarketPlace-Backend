const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
require("dotenv").config();
const { getAsync, setAsync } = require("../utils/redisClient");
const { parseStringPromise } = require("xml2js");

router.get("/", async (req, res) => {
  const { lat, lon } = req.query;
  const userKey = req.user?.id || req.sessionID || "guest"; // ✅ moved inside

  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing lat/lon parameters" });
  }

  const cacheKey = `schoolinfo:${userKey}:${lat}:${lon}`;
  try {
    const cached = await getAsync(cacheKey);
    if (cached) return res.json({ fromCache: true, schools: JSON.parse(cached) });

    const url = `https://api.greatschools.org/schools/nearby?key=${process.env.GREATSCHOOLS_API_KEY}&lat=${lat}&lon=${lon}&limit=5`;

    const response = await fetch(url);
    const xml = await response.text();
    const json = await parseStringPromise(xml, { explicitArray: false });
    const schools = json.schools?.school || [];

    await setAsync(cacheKey, schools, 3600); // 1 hour cache
    res.json({ fromCache: false, schools });
  } catch (err) {
    console.error("❌ GreatSchools API error:", err);
    res.status(500).json({ error: "Failed to fetch school info" });
  }
});

module.exports = router;
