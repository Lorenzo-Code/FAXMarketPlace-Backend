const axios = require("axios");
const { getAsync, setAsync } = require("../utils/redisClient");

const GREAT_SCHOOLS_API_KEY = process.env.GREAT_SCHOOLS_KEY;
const BASE_URL = "https://api.greatschools.org/schools/nearby";

async function getSchoolScores(lat, lng, radius = 5) {
  // 🏫 Create location-based cache key for schools (round to 2 decimals for wider coverage)
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLng = Math.round(lng * 100) / 100;
  const cacheKey = `schools:${roundedLat}:${roundedLng}:${radius}`;
  
  // 📥 Check cache first - school data changes very rarely!
  const cached = await getAsync(cacheKey);
  if (cached) {
    console.log(`📥 Cache hit for school data: ${roundedLat},${roundedLng}`);
    return JSON.parse(cached);
  }

  try {
    const { data } = await axios.get(BASE_URL, {
      params: {
        key: GREAT_SCHOOLS_API_KEY,
        lat,
        lon: lng,
        radius,
        limit: 5
      },
      headers: { Accept: "application/json" }
    });

    const schools = data.schools?.map((s) => ({
      name: s.name,
      gradeRange: s.gradeRange,
      rating: s.rating,
      schoolType: s.type,
      city: s.city
    })) || [];
    
    // 💾 Cache for 7 days - school data changes very rarely
    await setAsync(cacheKey, schools, 604800);
    console.log(`📝 Cached school data for: ${roundedLat},${roundedLng}`);
    
    return schools;
  } catch (err) {
    console.error("❌ GreatSchools API error:", err.message);
    return [];
  }
}

module.exports = { getSchoolScores };
