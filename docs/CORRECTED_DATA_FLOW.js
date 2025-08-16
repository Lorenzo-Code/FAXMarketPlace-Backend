/**
 * 🏠 CORRECTED REAL ESTATE DATA FLOW - Based on Your Requirements
 * 
 * FLOW 1: General Search ("find me a house under 300k in houston, tx")
 * User Query → OpenAI (parse intent) → Zillow Discovery (24hr cache) → User clicks listing → CoreLogic Details (30-day cache)
 * 
 * FLOW 2: Address Search ("123 Main St, Houston, TX")
 * Address → Google Verification → Zillow + CoreLogic (parallel) → Single property response (30-day cache)
 * 
 * FLOW 3: Listing Detail Click
 * Property ID → Check Cache → CoreLogic Premium Details → Enhanced property data
 */

const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const fetch = require("node-fetch");

// Services and utilities
const { getAsync, setAsync } = require("../../../utils/redisClient");
const SearchCache = require("../../../models/SearchCache");
const { CoreLogicSuperClient } = require('../../../utils/coreLogicSuperClient');
const { fetchZillowPhotos } = require('../../../services/fetchZillow');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 🔍 MAIN SEARCH ENDPOINT - Corrected Flow
 */
router.post("/", async (req, res) => {
  const { query, type } = req.body;
  
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Missing or invalid query" });
  }

  console.log(`🔍 Search Request: "${query}" (Type: ${type || 'auto-detect'})`);

  // 📍 STEP 1: Determine search type
  const isAddressSearch = isSpecificAddress(query);
  
  if (isAddressSearch) {
    return await handleAddressSearch(query, req, res);
  } else {
    return await handleGeneralSearch(query, req, res);
  }
});

/**
 * 🏠 ADDRESS SEARCH FLOW
 * Address → Google Verification → Zillow + CoreLogic (parallel) → Single property
 */
async function handleAddressSearch(query, req, res) {
  console.log('🏠 Processing Address Search:', query);
  
  // STEP 1: Verify address with Google Maps
  const googleVerification = await verifyAddressWithGoogle(query);
  if (!googleVerification.valid) {
    return res.status(400).json({
      error: "Address not verified",
      message: "Please use the address autocomplete to ensure accuracy",
      suggestion: "Use Google Places autocomplete for valid addresses"
    });
  }

  const { street, city, state, zip, latitude, longitude } = googleVerification;
  console.log('✅ Google verified address:', { street, city, state, zip });

  // STEP 2: Check MongoDB cache first (30-day cache for addresses)
  const cacheKey = `address_search:${street}_${city}_${state}_${zip}`;
  const cached = await SearchCache.findOne({ cacheKey, type: 'address_search' });
  
  if (cached && !isCacheExpired(cached.createdAt, 30)) {
    console.log('💾 Serving cached address search (30-day cache)');
    return res.json({
      fromCache: true,
      ...cached.responseData,
      cacheInfo: { source: 'mongodb', age: getDaysAge(cached.createdAt) }
    });
  }

  // STEP 3: Parallel fetch from Zillow + CoreLogic (since address is verified)
  console.log('⚡ Fetching from Zillow + CoreLogic in parallel...');
  
  const [zillowData, corelogicData] = await Promise.allSettled([
    fetchZillowByAddress(street, city, state, zip),
    fetchCoreLogicByAddress(street, city, state, zip)
  ]);

  // STEP 4: Combine data sources
  const propertyData = combinePropertyData({
    zillow: zillowData.status === 'fulfilled' ? zillowData.value : null,
    corelogic: corelogicData.status === 'fulfilled' ? corelogicData.value : null,
    google: { latitude, longitude, verifiedAddress: `${street}, ${city}, ${state} ${zip}` }
  });

  // STEP 5: Cache response in MongoDB (30-day TTL)
  await cacheAddressSearch(cacheKey, propertyData);

  return res.json({
    fromCache: false,
    ...propertyData,
    metadata: {
      searchType: 'address',
      dataSource: 'zillow+corelogic',
      googleVerified: true,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * 🔍 GENERAL SEARCH FLOW  
 * Query → OpenAI → Zillow Discovery (24hr cache) → Property listings
 */
async function handleGeneralSearch(query, req, res) {
  console.log('🔍 Processing General Search:', query);

  // STEP 1: Parse intent with OpenAI
  const searchFilters = await parseSearchIntent(query);
  console.log('🤖 OpenAI parsed filters:', searchFilters);

  // STEP 2: Check MongoDB cache (24-hour cache for general searches)
  const cacheKey = generateSearchCacheKey(searchFilters);
  const cached = await SearchCache.findOne({ cacheKey, type: 'general_search' });
  
  if (cached && !isCacheExpired(cached.createdAt, 1)) { // 24 hours = 1 day
    console.log('💾 Serving cached general search (24-hour cache)');
    return res.json({
      fromCache: true,
      ...cached.responseData,
      cacheInfo: { source: 'mongodb', age: getHoursAge(cached.createdAt) }
    });
  }

  // STEP 3: Fetch from Zillow (Discovery Phase)
  console.log('🏠 Fetching property listings from Zillow (Discovery Phase)...');
  const zillowListings = await fetchZillowSearch(searchFilters);

  // STEP 4: Format response for discovery
  const responseData = {
    listings: zillowListings.map(property => ({
      id: property.zpid,
      address: property.address,
      price: property.price,
      beds: property.bedrooms,
      baths: property.bathrooms,
      sqft: property.livingArea,
      images: property.imgSrc ? [property.imgSrc] : [],
      location: {
        latitude: property.latitude,
        longitude: property.longitude
      },
      dataSource: 'zillow_discovery',
      hasDetails: false, // Indicates CoreLogic details available on click
      detailsEndpoint: `/api/ai/property-details/${property.zpid}`
    })),
    filters: searchFilters,
    ai_summary: await generateSearchSummary(query, zillowListings.length)
  };

  // STEP 5: Cache in MongoDB (24-hour TTL)
  await cacheGeneralSearch(cacheKey, responseData);

  return res.json({
    fromCache: false,
    ...responseData,
    metadata: {
      searchType: 'general',
      dataSource: 'zillow_discovery', 
      phase: 'discovery',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * 🏘️ PROPERTY DETAILS ENDPOINT (User clicks on listing)
 * Property ID → CoreLogic Details (30-day cache) → Enhanced property data
 */
router.get("/property-details/:propertyId", async (req, res) => {
  const { propertyId } = req.params;
  console.log('🏘️ Fetching property details for:', propertyId);

  // STEP 1: Check MongoDB cache (30-day cache for property details)
  const cacheKey = `property_details:${propertyId}`;
  const cached = await SearchCache.findOne({ cacheKey, type: 'property_details' });
  
  if (cached && !isCacheExpired(cached.createdAt, 30)) {
    console.log('💾 Serving cached property details (30-day cache)');
    return res.json({
      fromCache: true,
      ...cached.responseData,
      cacheInfo: { source: 'mongodb', age: getDaysAge(cached.createdAt) }
    });
  }

  // STEP 2: Get address from Zillow property ID first
  const zillowProperty = await getZillowPropertyById(propertyId);
  if (!zillowProperty) {
    return res.status(404).json({ error: "Property not found" });
  }

  // STEP 3: Verify address with Google (required for CoreLogic)
  const googleVerification = await verifyAddressWithGoogle(zillowProperty.address);
  if (!googleVerification.valid) {
    return res.status(400).json({
      error: "Address verification failed",
      message: "Cannot fetch detailed data for unverified address"
    });
  }

  // STEP 4: Fetch CoreLogic details (Data Phase)
  console.log('💰 Fetching CoreLogic details (Data Phase)...');
  const corelogicDetails = await fetchCoreLogicDetails(googleVerification);

  // STEP 5: Combine all data sources
  const enhancedProperty = {
    ...zillowProperty,
    corelogicData: corelogicDetails,
    googleVerified: true,
    enhancementOptions: {
      schools: `/api/properties/${propertyId}/schools`,
      walkability: `/api/properties/${propertyId}/walkability`, 
      crime: `/api/properties/${propertyId}/crime`,
      amenities: `/api/properties/${propertyId}/amenities`
    }
  };

  // STEP 6: Cache in MongoDB (30-day TTL)
  await cachePropertyDetails(cacheKey, enhancedProperty);

  return res.json({
    fromCache: false,
    ...enhancedProperty,
    metadata: {
      searchType: 'property_details',
      dataSource: 'zillow+corelogic',
      phase: 'data',
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * 🗺️ GOOGLE ADDRESS VERIFICATION
 */
async function verifyAddressWithGoogle(address) {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_KEY}`
    );
    
    const data = await response.json();
    
    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      const components = result.address_components;
      
      return {
        valid: true,
        street: extractComponent(components, 'street_number') + ' ' + extractComponent(components, 'route'),
        city: extractComponent(components, 'locality'),
        state: extractComponent(components, 'administrative_area_level_1'),
        zip: extractComponent(components, 'postal_code'),
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        formattedAddress: result.formatted_address
      };
    }
    
    return { valid: false };
  } catch (error) {
    console.error('❌ Google verification failed:', error.message);
    return { valid: false };
  }
}

/**
 * 🤖 OPENAI INTENT PARSING
 */
async function parseSearchIntent(query) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4-1106-preview",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: "Extract real estate search criteria and return ONLY valid JSON..."
      },
      { role: "user", content: query }
    ]
  });

  const response = completion.choices[0].message.content?.trim();
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) throw new Error("No JSON found in AI response");
  return JSON.parse(jsonMatch[0]);
}

/**
 * 🏠 ZILLOW API FUNCTIONS
 */
async function fetchZillowSearch(filters) {
  const params = new URLSearchParams({
    location: filters.city || 'Houston',
    priceMax: filters.max_price || 500000,
    bedsMin: filters.min_beds || 1,
    home_type: filters.property_type || 'house',
    status_type: "ForSale"
  });

  const response = await fetch(
    `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${params.toString()}`,
    {
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "zillow-com1.p.rapidapi.com"
      }
    }
  );

  const data = await response.json();
  return data.props || [];
}

async function fetchZillowByAddress(street, city, state, zip) {
  // Similar to fetchZillowSearch but for specific address
  const address = `${street}, ${city}, ${state} ${zip}`;
  const params = new URLSearchParams({ location: address });
  
  // Implementation here...
}

/**
 * 🏢 CORELOGIC API FUNCTIONS  
 */
async function fetchCoreLogicByAddress(street, city, state, zip) {
  const superClient = new CoreLogicSuperClient();
  return await superClient.searchAndEnrich({
    streetAddress: street,
    city,
    state, 
    zipCode: zip
  });
}

async function fetchCoreLogicDetails(addressInfo) {
  const superClient = new CoreLogicSuperClient();
  return await superClient.getComprehensivePropertyIntelligence(addressInfo);
}

/**
 * 💾 CACHING FUNCTIONS
 */
async function cacheAddressSearch(cacheKey, data) {
  await SearchCache.create({
    cacheKey,
    type: 'address_search',
    responseData: data,
    ttlDays: 30,
    createdAt: new Date()
  });
}

async function cacheGeneralSearch(cacheKey, data) {
  await SearchCache.create({
    cacheKey,
    type: 'general_search', 
    responseData: data,
    ttlDays: 1, // 24 hours
    createdAt: new Date()
  });
}

async function cachePropertyDetails(cacheKey, data) {
  await SearchCache.create({
    cacheKey,
    type: 'property_details',
    responseData: data,
    ttlDays: 30,
    createdAt: new Date()
  });
}

/**
 * 🔧 UTILITY FUNCTIONS
 */
function isSpecificAddress(query) {
  return query.includes(',') && 
    query.match(/\d/) && 
    (query.includes('St') || query.includes('Ave') || query.includes('Dr') ||
     query.includes('Street') || query.includes('Avenue') || query.includes('Drive'));
}

function isCacheExpired(createdAt, ttlDays) {
  const ageInDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return ageInDays > ttlDays;
}

function generateSearchCacheKey(filters) {
  return `general_search:${JSON.stringify(filters)}`;
}

function extractComponent(components, type) {
  const component = components.find(c => c.types.includes(type));
  return component ? component.long_name : '';
}

function getDaysAge(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function getHoursAge(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60));
}

module.exports = router;
