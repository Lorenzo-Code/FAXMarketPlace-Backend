require("dotenv").config();
const axios = require("axios");
const pLimit = require("p-limit");
const redisClient = require("../utils/redisClient").redisClient;

const { getAsync, setAsync, incrementCounter, ensureRedisConnected } = require("../utils/redisClient");

// Concurrency limiter for API rate limits
const limit = pLimit(2);
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Caches ZPIDs locally
const zpidCache = new Map();

async function getZpidFromAddress(address) {
  console.log(`📬 Fetching ZPID for: ${address}`);
  try {
    const { data } = await axios.get("https://zillow-com1.p.rapidapi.com/property", {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": process.env.RAPIDAPI_HOST,
      },
      params: { address },
    });

    const zpid = data?.zpid;
    if (!zpid) throw new Error("No ZPID found");
    return zpid;
  } catch (err) {
    console.error("❌ ZPID Lookup Error:", err.message);
    return null;
  }
}

async function getImagesByZpid(zpid) {
  console.log(`🖼 Fetching images for ZPID: ${zpid}`);
  try {
    const { data } = await axios.get("https://zillow-com1.p.rapidapi.com/images", {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": process.env.RAPIDAPI_HOST,
      },
      params: { zpid },
    });

    return data?.images || [];
  } catch (err) {
    console.error("❌ Image Fetch Error:", err.message);
    return [];
  }
}


async function fetchZillowPhotos(addressLine, zip) {
  const fullAddress = `${addressLine}, Houston, TX ${zip}`;
  const normalizedKey = `zillow:photo:${fullAddress.replace(/\s+/g, "").toLowerCase()}`;

  // 📊 Analytics keys
  const hitsKey = "zillow:stats:hits";
  const missesKey = "zillow:stats:misses";

  // ✅ Check Redis
  const cached = await getAsync(normalizedKey);
  if (cached) {
    console.log(`⚡ Redis Cache Hit: ${normalizedKey}`);
    await incrementCounter(hitsKey);
    return [{ address: fullAddress, imgSrc: cached, zpid: null }];
  }

  // ❌ Cache Miss
  console.log(`🚫 Redis Cache Miss: ${normalizedKey}`);
  await incrementCounter(missesKey);

  // Proceed with ZPID lookup and fetch
  let zpid = zpidCache.get(fullAddress);
  if (!zpid) {
    await delay(300);
    zpid = await limit(() => getZpidFromAddress(fullAddress));
    if (zpid) zpidCache.set(fullAddress, zpid);
  }

  if (!zpid) {
    console.warn(`❌ No ZPID found for: ${fullAddress}`);
    return [];
  }

  await delay(300);
  const images = await limit(() => getImagesByZpid(zpid));
  if (images.length > 0) {
    await setAsync(normalizedKey, images[0]); // Cache one image
    console.log(`📸 Image cached for: ${fullAddress}`);
  }

  return images.map((imgSrc) => ({
    address: fullAddress,
    imgSrc,
    zpid,
  }));
}


module.exports = { fetchZillowPhotos };
