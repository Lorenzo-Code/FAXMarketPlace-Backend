require("dotenv").config();
const axios = require("axios");
const redis = require("redis");
const pLimit = require("p-limit");

const redisClient = redis.createClient(); // default: localhost:6379

redisClient.on("error", (err) =>
  console.error("❌ Redis Connection Error:", err)
);

const ensureRedisConnected = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("✅ Redis connected");
  }
};

// Async cache helpers
const getAsync = async (key) => {
  await ensureRedisConnected();
  return await redisClient.get(key);
};

const setAsync = async (key, value, ttl = 86400) => {
  await ensureRedisConnected();
  await redisClient.set(key, value, { EX: ttl });
};

// Caching layer
const zpidCache = new Map();

// Limit concurrency to 2 req/sec for paid Zillow API
const limit = pLimit(2);
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Get ZPID from full address string.
 */
async function getZpidFromAddress(address) {
  console.log(`📬 Fetching Zillow ZPID for: ${address}`);
  try {
    const response = await axios.get("https://zillow-com1.p.rapidapi.com/property", {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": process.env.RAPIDAPI_HOST,
      },
      params: { address },
    });

    const zpid = response.data?.zpid;
    if (!zpid) throw new Error("No ZPID found");
    return zpid;
  } catch (err) {
    console.error("❌ ZPID Lookup Error:", err.message);
    return null;
  }
}

/**
 * Get Zillow image URLs using ZPID.
 */
async function getImagesByZpid(zpid) {
  console.log(`🖼 Getting images for ZPID: ${zpid}`);
  try {
    const response = await axios.get("https://zillow-com1.p.rapidapi.com/images", {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": process.env.RAPIDAPI_HOST,
      },
      params: { zpid },
    });

    return response.data?.images || [];
  } catch (err) {
    console.error("❌ Image Fetch Error:", err.message);
    return [];
  }
}

/**
 * Main function: Fetch Zillow images by address and zip.
 */
async function fetchZillowPhotos(addressLine, zip) {
  const fullAddress = `${addressLine}, Houston, TX ${zip}`;
  const normalized = fullAddress.replace(/\s+/g, "").toLowerCase();
  const cacheKey = `zillow:${normalized}`;

  // Check Redis cache
  const cachedImage = await getAsync(cacheKey);
  if (cachedImage) {
    console.log(`⚡ Redis Cache Hit: ${normalized}`);
    return [{ address: fullAddress, imgSrc: cachedImage, zpid: null }];
  }

  // Check in-memory ZPID cache
  let zpid = zpidCache.get(fullAddress);
  if (!zpid) {
    await delay(300); // buffer spacing
    zpid = await limit(() => getZpidFromAddress(fullAddress));
    if (zpid) {
      zpidCache.set(fullAddress, zpid);
      console.log(`📦 ZPID cached in-memory for: ${fullAddress}`);
    }
  }

  if (!zpid) {
    console.warn(`❌ No matching Zillow property found for: ${fullAddress}`);
    return [];
  }

  await delay(300); // spacing before next API
  const images = await limit(() => getImagesByZpid(zpid));
  console.log(`📸 Zillow Images Returned: ${images.length}`);

  if (images.length > 0) {
    console.log(`🔗 Sample Image: ${images[0]}`);
    await setAsync(cacheKey, images[0], 86400); // Cache for 1 day
  }

  return images.map((url) => ({
    address: fullAddress,
    imgSrc: url,
    zpid,
  }));
}

module.exports = {
  fetchZillowPhotos,
};
