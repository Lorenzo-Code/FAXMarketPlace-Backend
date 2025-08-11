const express = require("express");
const router = express.Router();
const { getAsync, setAsync, incrementCounter } = require("../../utils/redisClient");

// 📦 Cache test route
router.get("/cache-test", async (req, res) => {
  const key = "fractionax:test";
  try {
    const cached = await getAsync(key);
    if (cached) {
      return res.json({ fromCache: true, data: JSON.parse(cached) });
    }

    const freshData = {
      message: "Freshly generated data",
      timestamp: new Date().toISOString(),
    };

    await setAsync(key, freshData, 60); // Cache for 1 minute
    res.json({ fromCache: false, data: freshData });
  } catch (err) {
    console.error("❌ Redis Test Error:", err);
    res.status(500).json({ error: "Redis cache test failed" });
  }
});

// 🔁 Counter test route
router.get("/increment/:key", async (req, res) => {
  const { key } = req.params;
  try {
    await incrementCounter(key);
    const newCount = await getAsync(key);
    res.json({ key, count: Number(newCount || 0) });
  } catch (err) {
    console.error("❌ Redis Counter Error:", err);
    res.status(500).json({ error: "Redis counter test failed" });
  }
});

// 🧪 Status route
router.get("/status", async (req, res) => {
  try {
    const { client } = require("../../utils/redisClient");
    const status = client?.status || "disconnected";
    const host = client?.options?.host || client?.options?.sentinels?.[0]?.host || "unknown";
    res.json({ redisStatus: status, redisHost: host });
  } catch (err) {
    res.status(500).json({ error: "Unable to fetch Redis status" });
  }
});

module.exports = router;
