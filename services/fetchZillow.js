require("dotenv").config();
const axios = require("axios");
const pLimit = require("p-limit");

const { getAsync, setAsync, incrementCounter, ensureRedisConnected } = require("../utils/redisClient");
const ZillowImageCache = require("../models/ZillowImageCache");

// Concurrency limiter for API rate limits (updated to 3 requests/second)
const limit = pLimit(3);
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Caches ZPIDs locally
const zpidCache = new Map();

async function getZpidFromaddress1(address1) {
  console.log(`📬 Fetching ZPID for: ${address1}`);
  try {
    const { data } = await axios.get("https://zillow-com1.p.rapidapi.com/property", {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": process.env.RAPIDAPI_HOST,
      },
      params: { address1 },
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


async function fetchZillowPhotos(address1Line, zip, existingZpid = null) {
  // If zip is null, use the full address as is (already formatted)
  const fulladdress1 = zip ? `${address1Line}, ${zip}` : address1Line;
  const requestStartTime = Date.now();
  
  // 💰 Phase 1: Check MongoDB cache first for aggressive cost savings
  console.log('💰 Checking MongoDB cache for Zillow images...');
  const cacheParams = {
    address: fulladdress1,
    zipCode: zip,
    searchType: 'address_search'
  };
  
  try {
    const cachedData = await ZillowImageCache.findCachedImages(cacheParams, { maxTimeMS: 5000 });
    if (cachedData) {
      console.log(`🎉 MongoDB Cache HIT for Zillow images: ${fulladdress1}`);
      await incrementCounter("zillow:stats:hits");
      
      // Return cached images in the expected format
      return cachedData.images.map(image => ({
        address1: fulladdress1,
        imgSrc: image.imgSrc,
        zpid: image.zpid,
        imageType: image.imageType || 'primary'
      }));
    }
  } catch (mongoError) {
    console.warn(`⚠️ MongoDB cache query failed: ${mongoError.message}`);
  }
  
  console.log(`💸 MongoDB Cache MISS for Zillow images: ${fulladdress1}`);
  await incrementCounter("zillow:stats:misses");
  
  // Fallback to Redis for backward compatibility
  try {
    const normalizedKey = `zillow:photo:${fulladdress1.replace(/\s+/g, "").toLowerCase()}`;
    const cached = await getAsync(normalizedKey);
    if (cached) {
      console.log(`⚡ Redis fallback cache hit: ${normalizedKey}`);
      await incrementCounter("zillow:stats:redis_hits");
      return [{ address1: fulladdress1, imgSrc: cached, zpid: existingZpid }];
    }
  } catch (redisError) {
    console.warn(`⚠️ Redis cache query failed: ${redisError.message}`);
  }

  // 💸 Cache Miss - Call expensive Zillow API
  console.log(`🚫 All caches missed, calling Zillow API for: ${fulladdress1}`);

  // Use existing ZPID if provided (more efficient)
  let zpid = existingZpid || zpidCache.get(fulladdress1);
  
  if (!zpid) {
    console.log(`🔍 No existing ZPID, looking up for: ${fulladdress1}`);
    try {
      await delay(300);
      zpid = await limit(() => getZpidFromaddress1(fulladdress1));
      if (zpid) {
        zpidCache.set(fulladdress1, zpid);
        console.log(`✅ Found ZPID: ${zpid} for ${fulladdress1}`);
      }
    } catch (zpidError) {
      console.error(`❌ ZPID lookup failed: ${zpidError.message}`);
    }
  } else {
    console.log(`♻️ Using existing ZPID: ${zpid}`);
  }

  if (!zpid) {
    console.warn(`❌ No ZPID available for: ${fulladdress1}`);
    return [];
  }

  // Fetch images using the ZPID
  let images = [];
  try {
    await delay(300);
    images = await limit(() => getImagesByZpid(zpid));
    console.log(`📸 Fetched ${images.length} images for ZPID: ${zpid}`);
  } catch (imageError) {
    console.error(`❌ Image fetch failed for ZPID ${zpid}: ${imageError.message}`);
    return [];
  }
  
  const responseTime = Date.now() - requestStartTime;
  
  if (images.length > 0) {
    // Cache in Redis for backward compatibility (shorter TTL)
    try {
      const normalizedKey = `zillow:photo:${fulladdress1.replace(/\s+/g, "").toLowerCase()}`;
      await setAsync(normalizedKey, images[0], 3600); // 1 hour
      console.log(`📸 Image cached in Redis for: ${fulladdress1}`);
    } catch (redisError) {
      console.warn(`⚠️ Redis caching failed: ${redisError.message}`);
    }
    
    // 💾 Cache in MongoDB for long-term cost savings (30-day TTL)
    const imageData = {
      images: images.map((imgSrc, index) => ({
        imgSrc,
        zpid,
        imageType: index === 0 ? 'primary' : 'gallery'
      })),
      propertyInfo: {
        zpid,
        address: fulladdress1
      }
    };
    
    const apiMetadata = {
      statusCode: 200,
      responseTime,
      imageCount: images.length,
      dataQuality: images.length > 0 ? 'good' : 'poor',
      estimatedCost: 0.05 // Estimated cost for Zillow RapidAPI call
    };
    
    try {
      await ZillowImageCache.cacheImageResponse(cacheParams, imageData, apiMetadata);
      console.log(`💾 Successfully cached ${images.length} images in MongoDB for: ${fulladdress1}`);
    } catch (cacheError) {
      console.warn('⚠️ Failed to cache images in MongoDB:', cacheError.message);
    }
  }

  // Return all images in the proper format
  return images.map((imgSrc, index) => ({
    address1: fulladdress1,
    imgSrc,
    zpid,
    imageType: index === 0 ? 'primary' : 'gallery'
  }));
}


module.exports = { fetchZillowPhotos };
