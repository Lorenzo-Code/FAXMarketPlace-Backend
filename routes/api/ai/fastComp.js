const express = require("express");
const router = express.Router();
const  { getPropertyInfoFromCoreLogic } = require("../../../utils/coreLogicClientV2");
const { fetchZillowPhotos } = require("../../../services/fetchZillow");


// GET /api/ai/fast-comp - Lightweight property details (with address and zip as query parameters)
router.get("/", async (req, res) => {
  const { address, zip, city, state, lat, lng, place_id } = req.query;

  if (!address || !zip) {
    return res.status(400).json({ error: "Missing required parameters: address and zip" });
  }

  try {
    // 🎯 Step 1: CoreLogic Full Property + AVM
    const coreData = await getPropertyInfoFromCoreLogic({ 
      address1: address, 
      city, 
      state, 
      postalcode: zip, 
      lat, 
      lng 
    });

    // 🖼 Step 2: Zillow Images via Redis-cached helper
    const zillowImages = await fetchZillowPhotos(address, zip);
    const primaryImage = zillowImages?.[0]?.imgSrc || null;

    // 🔁 Final combined result
    return res.json({
      success: true,
      property: coreData?.structure || {},
      valuation: coreData?.valuation || {},
      location: { address, city, state, zip, lat, lng, place_id },
      zillowImage: primaryImage,
      zillowZpid: zillowImages?.[0]?.zpid || null,
    });
  } catch (err) {
    console.error("🔥 FastComp Error:", err.message || err);
    return res.status(500).json({ error: "FastComp failed to load" });
  }
});

module.exports = router;
