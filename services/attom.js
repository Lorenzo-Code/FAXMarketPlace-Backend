const axios = require("axios");
const { getAsync, setAsync } = require("../utils/redisClient");

const BASE_URL = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";
const API_KEY = process.env.ATTOM_API_KEY;

const defaultHeaders = {
  apikey: API_KEY,
  Host: "api.gateway.attomdata.com",
  "User-Agent": "FractionaX-Agent/1.0",
  Accept: "application/json",
  "Accept-Encoding": "gzip",
  Connection: "keep-alive",
};

// 🔧 Sanitize input
const sanitize = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;

const sanitizeObject = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sanitize(v)]));

// 🧠 Log success/failure to DB (placeholder)
async function logAttomUsage(endpoint, params, result, error) {
  console.log(
    `📊 Logging usage: ${endpoint} | ${error ? "❌ Failed" : "✅ Success"}`
  );
  // TODO: Add DB logging logic here
}

// 🔁 Request wrapper with caching and retry
async function request(endpoint, rawParams = {}) {
  const params = sanitizeObject(rawParams);
  const cacheKey = `attom:${endpoint}:${JSON.stringify(params)}`;

  try {
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log(`📥 Redis cache hit: ${cacheKey}`);
      return JSON.parse(cached);
    }

    const response = await retryRequest(() =>
      axios.get(`${BASE_URL}${endpoint}`, {
        headers: defaultHeaders,
        params,
      })
    );

    await setAsync(cacheKey, response.data, 3600); // 1 hour TTL
    await logAttomUsage(endpoint, params, response.data, null);
    return response.data;
  } catch (error) {
    const errData = error.response?.data || error.message;
    console.error(`❌ Attom API Error on ${endpoint}:`, errData);
    await logAttomUsage(endpoint, params, null, errData);
    return { error: `Failed to fetch ${endpoint}`, details: errData };
  }
}

// 🔁 Retry wrapper for 429 errors
async function retryRequest(fn, retries = 3, delayMs = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && i < retries) {
        const wait = (delayMs + Math.random() * 300) * (i + 1);
        console.warn(`🔁 Rate limited (429). Retrying in ${wait}ms...`);
        await new Promise((res) => setTimeout(res, wait));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Retry limit reached");
}

// 🔍 Lookup Attom ID
// 🔍 Lookup Attom ID (with Redis caching)
async function getAttomId(address1, city = "Houston", state = "TX", postalcode) {
  const params = {
    address1: (address1 || "").trim(),
    city: (city || "Houston").trim(),
    state: (state || "TX").trim(),
    postalcode: (postalcode || "").trim()
  };

  if (!params.address1 || !params.postalcode) {
    console.warn("❌ Missing required fields for ATTOM ID lookup:", params);
    return null;
  }

  const cacheKey = `attom:lookup:${params.address1}:${params.city}:${params.state}:${params.postalcode}`;
  
  try {
    const cachedId = await getAsync(cacheKey);
    if (cachedId) {
      console.log(`📥 Redis hit for ATTOM ID: ${cacheKey}`);
      return cachedId;
    }

    const res = await request("/property/address", params);
    const attomid = res?.property?.[0]?.identifier?.attomid || null;

    if (attomid) {
      await setAsync(cacheKey, attomid, 86400); // Cache for 1 day
    }

    return attomid;
  } catch (err) {
    console.error("❌ ATTOM ID lookup failed:", err.message);
    return null;
  }
}



// ✅ Validate ID
async function validateAttomId(attomid) {
  const detail = await getPropertyDetail(attomid);
  return Array.isArray(detail?.property) && detail.property.length > 0;
}

// 📊 Bulk search (snapshot)
async function fetchMultipleProperties({
  city,
  state,
  postalcode,
  max_price,
  min_beds = 1,
  property_type = "sfr",
  sort = "salestransdate",
  page = 1,
}) {
  const knownBadSorts = ["salestransdate", "price", "distance"];
  const safeSort =
    postalcode && !city && !state && knownBadSorts.includes(sort)
      ? undefined
      : sort;

  const params = sanitizeObject({
    propertytype: property_type.toLowerCase(),
    maxsaleamt: max_price || 500000,
    minbeds: min_beds,
    page,
    pagesize: 30,
    postalcode,
    city,
    state,
    sort: safeSort,
  });

  return request("/property/snapshot", params);
}


// 📊 Detail endpoints
const getPropertyDetail = (attomid) =>
  request("/property/detail", { attomid });
const getAvmDetail = (attomid) => request("/avm/detail", { attomid });
const getAssessmentDetail = (attomid) =>
  request("/assessment/assessmentdetail", { attomid });
const getSaleHistory = (attomid) =>
  request("/sales/salehistory", { attomid });
const getFloodData = (attomid) => request("/flood/detail", { attomid });
const getCrimeData = (postalcode) =>
  request("/community/crime", { postalcode });

module.exports = {
  fetchMultipleProperties,
  getAttomId,
  validateAttomId,
  getPropertyDetail,
  getAvmDetail,
  getAssessmentDetail,
  getSaleHistory,
  getFloodData,
  getCrimeData,
};
