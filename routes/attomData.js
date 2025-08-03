const express = require('express');
const router = express.Router();
const attom = require('../services/attom');
const { getAsync, setAsync } = require('../utils/redisClient'); // 👈 Make sure the path is correct

router.post('/', async (req, res) => {
  const { address1, postalcode, city, state, data_required = [] } = req.body;

  if (!address1 || !postalcode || !Array.isArray(data_required)) {
    return res.status(400).json({
      error: "Request must include address1, postalcode, and data_required[]"
    });
  }

  // 🔁 1. Check Redis Cache First
  const cacheKey = `api:attom:${address1}:${postalcode}:${data_required.join(',')}`;
  try {
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log(`📦 Cache hit: ${cacheKey}`);
      return res.json({ fromCache: true, ...JSON.parse(cached) });
    }
  } catch (err) {
    console.warn(`⚠️ Redis read failed: ${err.message}`);
  }

  // 🆔 2. Lookup ATTOM ID
  let attomid;
  try {
    attomid = await attom.getAttomId(address1, city, state, postalcode);
    if (!attomid) {
      return res.status(404).json({
        error: "ATTOM ID not found for this address.",
        input: { address1, city, state, postalcode }
      });
    }
  } catch (err) {
    return res.status(500).json({
      error: "Failed to resolve ATTOM ID",
      details: err.message
    });
  }

  // 📊 3. Fetch all requested data
  const results = {};
  const errors = [];

  for (const type of data_required) {
    try {
      switch (type) {
        case "property_detail":
          results.property_detail = await attom.getPropertyDetail(attomid);
          break;
        case "basic_profile":
          results.basic_profile = await attom.getBasicProfile(attomid);
          break;
        case "assessment":
          results.assessment = await attom.getAssessmentDetail(attomid);
          break;
        case "sale_history":
          results.sale_history = await attom.getSaleHistory(attomid);
          break;
        case "avm":
          results.avm = await attom.getAvmDetail(attomid);
          break;
        case "flood":
          results.flood = await attom.getFloodData(attomid);
          break;
        case "crime":
          results.crime = await attom.getCrimeData(postalcode);
          break;
        default:
          errors.push(`Unknown data type: ${type}`);
      }
    } catch (err) {
      errors.push(`Failed to fetch ${type}: ${err.message}`);
    }
  }

  // 💾 4. Save to Redis Cache
  const responseData = {
    address1,
    postalcode,
    attomid,
    requested: data_required,
    results,
    ...(errors.length ? { errors } : {})
  };

  try {
    await setAsync(cacheKey, responseData, 3600); // 1 hour TTL
  } catch (err) {
    console.warn(`⚠️ Redis write failed: ${err.message}`);
  }

  // 📤 5. Return to client
  res.status(200).json({ fromCache: false, ...responseData });
});

module.exports = router;
