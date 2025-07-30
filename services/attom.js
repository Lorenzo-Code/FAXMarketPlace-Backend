// utils/attom.js

const axios = require('axios');

const BASE_URL = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0';
const API_KEY = process.env.ATTOM_API_KEY;

const defaultHeaders = {
  apikey: API_KEY,
  Host: 'api.gateway.attomdata.com',
  'User-Agent': 'FractionaX-Agent/1.0',
  Accept: 'application/json',
  'Accept-Encoding': 'gzip',
  Connection: 'keep-alive'
};

// 🔁 Generic Attom request function
async function request(endpoint, params = {}) {
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers: defaultHeaders,
      params
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Attom API Error on ${endpoint}:`, error.response?.data || error.message);
    return { error: `Failed to fetch data from ${endpoint}`, details: error.response?.data || error.message };
  }
}

// 🏘️ Fetch multiple properties using search-based endpoint
async function fetchMultipleProperties({
  city,
  state,
  zip_code,
  max_price,
  min_beds = 1,
  property_type = "sfr",
  sort = "salestransdate",
  page = 1 // ✅ Fix added here
}) {

  // ✅ Robust sort fallback logic for Attom's picky API
  let safeSort = sort;
  const usingPostalOnly = zip_code && !city && !state;
  const knownBadSorts = ["salestransdate", "price", "distance"];

  if (usingPostalOnly && knownBadSorts.includes(sort)) {
    safeSort = undefined; // ⛔ REMOVE sort entirely
    console.warn(`⚠️ Removed sort '${sort}' due to zip-only query. Sort removed for Attom compatibility.`);
  }

  // ✅ Build request params safely
  const params = {
  propertytype: property_type.toLowerCase(),
  maxsaleamt: max_price || 500000,
  minbeds: min_beds,
  page,
  pagesize: 30,
  postalcode: zip_code // keep this!
};


  if (safeSort) {
    params.sort = safeSort;
  }

  if (zip_code) params.postalcode = zip_code;
  if (city) params.city = city;
  if (state) params.state = state;

  console.log("📤 Final Attom Params to Snapshot:", params);

  return request('/property/snapshot', params);
}




// 📍 Export all endpoint helpers
module.exports = {
  fetchMultipleProperties,
  getPropertyDetail: (address, postalcode) =>
    request('/property/detail', { address, postalcode }),

  getBasicProfile: (address, postalcode) =>
    request('/property/basicprofile', { address, postalcode }),

  getAssessmentDetail: (address, postalcode) =>
    request('/assessment/assessmentdetail', { address, postalcode }),

  getSaleHistory: (address, postalcode) =>
    request('/sales/salehistory', { address, postalcode }),

  getAvmDetail: (address, postalcode) =>
    request('/avm/detail', { address, postalcode }),

  getFloodData: (address, postalcode) =>
    request('/flood/detail', { address, postalcode }),

  getCrimeData: (postalcode) =>
    request('/community/crime', { postalcode })
};
