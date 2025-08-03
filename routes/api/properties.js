const express = require("express");
const router = express.Router();
const Property = require("../../models/Property");
const { getAsync, setAsync, getUserKey } = require("../../utils/redisClient");

// ✅ Marketplace: Get all APPROVED properties with per-user caching
router.get("/", async (req, res) => {
  try {
    const userKey = getUserKey(req);
    const queryParams = JSON.stringify(req.query);
    const cacheKey = `properties:marketplace:${userKey}:${queryParams}`;

    // 📥 Check cache first
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log(`📥 Cache hit for properties: ${userKey}`);
      return res.json({ fromCache: true, data: JSON.parse(cached) });
    }

    const filters = { status: "approved" };

    if (req.query.fractionalOnly === "true") {
      filters.isFractional = true;
    }

    if (req.query.aiOnly === "true") {
      filters.isAISuggested = true;
    }

    const properties = await Property.find(filters).sort({ createdAt: -1 });
    
    // 💾 Cache the results for 10 minutes (marketplace data changes frequently)
    await setAsync(cacheKey, properties, 600);
    console.log(`📝 Cached properties for user: ${userKey}`);
    
    res.json({ fromCache: false, data: properties });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
