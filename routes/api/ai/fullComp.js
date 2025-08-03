const express = require("express");
const router = express.Router();
const Property = require("../../../models/Property");
const { verifyToken } = require("../../../middleware/auth");

const { getCoreLogicAccessToken } = require("../../../utils/coreLogicAuth");
const { getPropertyInfoFromCoreLogic } = require("../../../utils/coreLogicClientV2");

const { fetchZillowPhotos } = require("../../../services/fetchZillow");
const { getNearbyAmenities } = require("../../../services/googleNearby");
const { getSchoolScores } = require("../../../services/greatSchools");
const { scoreAmenities } = require("../../../services/amenityScorer");

router.post("/", verifyToken, async (req, res) => {
  const {
    address1,
    city,
    state,
    postalcode,
    lat,
    lng,
    place_id
  } = req.body;

  if (!address1 || !postalcode || !lat || !lng) {
    return res.status(400).json({ error: "Missing required address fields" });
  }

  try {
    const userKey = req.user?.id || req.sessionID || "guest";
    const lowerAddress = address1.trim().toLowerCase();

    // 🔎 Check internal DB
    const propertyMatch = await Property.findOne({
      address1: new RegExp(`^${lowerAddress}$`, "i")
    });

    // 🔁 Fetch CoreLogic + Zillow + external data in parallel
    const [
      coreData,
      zillowImages,
      amenities,
      schoolScores
    ] = await Promise.all([
      getPropertyInfoFromCoreLogic({ address1, city, state, postalcode, lat, lng }),
      fetchZillowPhotos(address1, postalcode),
      getNearbyAmenities(lat, lng),
      getSchoolScores(lat, lng)
    ]);

    const locationScore = scoreAmenities(amenities);

    return res.status(200).json({
      success: true,
      input: { address1, city, state, postalcode, lat, lng, place_id },
      zillowImages,
      corelogic: {
        structure: coreData.structure,
        valuation: coreData.valuation,
        parcelId: coreData.parcelId
      },
      amenities,
      schoolScores,
      locationScore,
      propertyMatch
    });

  } catch (err) {
    console.error("❌ Full Comp Error:", err.message);
    res.status(500).json({
      error: "Full comp lookup failed",
      details: err.message
    });
  }
});

module.exports = router;
