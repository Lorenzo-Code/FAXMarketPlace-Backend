const express = require("express");
const router = express.Router();
const redisClient = require("../utils/redisClient");

router.get("/", async (req, res) => {
  try {
    if (!redisClient.isOpen) await redisClient.connect();

    const hits = await redisClient.get("zillow:stats:hits");
    const misses = await redisClient.get("zillow:stats:misses");

    const hitCount = Number(hits || 0);
    const missCount = Number(misses || 0);
    const total = hitCount + missCount;

    res.json({
      hits: hitCount,
      misses: missCount,
      hitRate: total > 0 ? (hitCount / total).toFixed(2) : null
    });
  } catch (err) {
    console.error("❌ Cache Stats Error:", err);
    res.status(500).json({ error: "Could not retrieve cache stats" });
  }
});

module.exports = router;
