// services/googleNearby.js
const axios = require("axios");
const { getAsync, setAsync } = require("../utils/redisClient");

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_KEY;
const PLACE_TYPES = ["gym", "restaurant", "grocery_or_supermarket", "park"];

async function getNearbyAmenities(lat, lng, radius = 1600) {
  // 📍 Create location-based cache key (round to 3 decimals for nearby locations)
  const roundedLat = Math.round(lat * 1000) / 1000;
  const roundedLng = Math.round(lng * 1000) / 1000;
  const cacheKey = `google:amenities:${roundedLat}:${roundedLng}:${radius}`;
  
  // 📥 Check cache first - amenities don't change often!
  const cached = await getAsync(cacheKey);
  if (cached) {
    console.log(`📥 Cache hit for Google amenities: ${roundedLat},${roundedLng}`);
    return JSON.parse(cached);
  }

  const baseUrl = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
  const results = {};

  for (const type of PLACE_TYPES) {
    try {
      const { data } = await axios.get(baseUrl, {
        params: {
          location: `${lat},${lng}`,
          radius,
          type,
          key: GOOGLE_API_KEY
        }
      });

      results[type] = data.results.map((r) => ({
        name: r.name,
        rating: r.rating,
        vicinity: r.vicinity
      }));
    } catch (err) {
      console.error(`❌ Google Nearby failed for type '${type}':`, err.message);
      results[type] = [];
    }
  }

  // 💾 Cache for 24 hours - amenities don't change frequently
  await setAsync(cacheKey, results, 86400);
  console.log(`📝 Cached Google amenities for: ${roundedLat},${roundedLng}`);

  return results;
}

module.exports = { getNearbyAmenities };
