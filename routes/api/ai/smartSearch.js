const express = require("express");
const { OpenAI } = require("openai");
const router = express.Router();

// Import freemium rate limiting and data limiting
const { freemiumRateLimit, addLimitsToResponse } = require("../../../middleware/freemiumRateLimit");
const { applyTierLimitsMiddleware } = require("../../../utils/freemiumDataLimiter");

// Import existing search handlers
const { fetchZillowPhotos } = require("../../../services/fetchZillow");
const { getPropertyInfoFromCoreLogic } = require("../../../utils/coreLogicClientV2");
const { CoreLogicSuperClient } = require("../../../utils/coreLogicSuperClient");
const { getAsync, setAsync } = require("../../../utils/redisClient");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const superClient = new CoreLogicSuperClient();

// Import existing search logic (we'll extract these)
const fetch = require("node-fetch");

/**
 * 🧠 Smart AI Search Router
 * 
 * Routes intelligently based on user input:
 * - Address/Property = Property Comparables (comprehensive data)
 * - Search criteria = Property Listings (Zillow search)
 */

// Utility function to determine search intent
function analyzeSearchIntent(query) {
  const addressIndicators = [
    // Street address patterns
    /\d+\s+[A-Za-z\s]+(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|pl|place|way|pkwy|parkway)\b/i,
    // Full address with city/state
    /\d+\s+[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}/i,
    // Address with zip
    /\d+\s+[A-Za-z\s]+,?\s*\d{5}/i,
    // Simple address pattern
    /^\d+\s+[A-Za-z\s]+$/i
  ];

  const searchCriteriaIndicators = [
    /under\s*\$?\d+/i,
    /below\s*\$?\d+/i,
    /less than\s*\$?\d+/i,
    /max\s*\$?\d+/i,
    /budget\s*\$?\d+/i,
    /\d+\s*(bed|bedroom)/i,
    /\d+\s*(bath|bathroom)/i,
    /(house|home|condo|apartment|townhome)/i,
    /(for sale|buy|purchase|looking for)/i,
    /(neighborhood|area|district)/i,
    /(pool|garage|yard)/i
  ];

  // Check for address patterns
  const hasAddress = addressIndicators.some(pattern => pattern.test(query));
  
  // Check for search criteria patterns
  const hasSearchCriteria = searchCriteriaIndicators.some(pattern => pattern.test(query));

  // Address takes priority (more specific)
  if (hasAddress) {
    return {
      type: 'PROPERTY_COMP',
      confidence: hasSearchCriteria ? 0.7 : 0.9, // Lower confidence if mixed signals
      reason: 'Detected specific address in query'
    };
  }

  if (hasSearchCriteria) {
    return {
      type: 'LISTINGS_SEARCH', 
      confidence: 0.8,
      reason: 'Detected search criteria without specific address'
    };
  }

  // Default to listings search for ambiguous queries
  return {
    type: 'LISTINGS_SEARCH',
    confidence: 0.5,
    reason: 'Ambiguous query, defaulting to listings search'
  };
}

// Property Comparables Handler (for specific addresses)
async function handlePropertyComp(query, sessionId) {
  console.log('🏠 Handling as Property Comparables request');

  // Use AI to parse the address
  const messages = [
    {
      role: "system",
      content: `Extract address components from the user query. Return only valid JSON:
{
  "streetAddress": "123 Main St",
  "city": "Houston",
  "state": "TX",
  "zipCode": "77002"
}`
    },
    { role: "user", content: query }
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4-1106-preview",
    messages,
    temperature: 0.3
  });

  const aiResponse = completion.choices[0].message.content?.trim();
  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse address from query");
  
  const addressData = JSON.parse(jsonMatch[0]);
  const { streetAddress, city, state, zipCode } = addressData;

  if (!streetAddress || !city || !state) {
    throw new Error("Missing required address components");
  }

  console.log(`📍 Parsed address: ${streetAddress}, ${city}, ${state} ${zipCode || ''}`);

  // Use Super Client for comprehensive property intelligence
  const comprehensiveResult = await superClient.searchAndEnrich({
    streetAddress,
    city,
    state,
    zipCode
  });

  // Get Zillow images in parallel
  const zillowImages = await fetchZillowPhotos(streetAddress, zipCode);

  return {
    searchType: 'PROPERTY_COMP',
    query,
    sessionId,
    address: addressData,
    clip: comprehensiveResult.clip,
    propertyIntelligence: comprehensiveResult.intelligence,
    searchResult: comprehensiveResult.searchResult,
    zillowImages,
    timestamp: new Date().toISOString()
  };
}

// Listings Search Handler (for search criteria)
async function handleListingsSearch(query, sessionId) {
  console.log('🔍 Handling as Listings Search request');

  // Use AI to extract search filters
  const messages = [
    {
      role: "system",
      content: `Extract real estate search criteria. Return only valid JSON:
{
  "postalcode": "77024",
  "city": "Houston",
  "max_price": 300000,
  "min_beds": 2,
  "property_type": "House"
}`
    },
    { role: "user", content: query }
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4-1106-preview",
    messages,
    temperature: 0.3
  });

  const aiResponse = completion.choices[0].message.content?.trim();
  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse search criteria");
  
  const parsedFilter = JSON.parse(jsonMatch[0]);

  // Normalize values
  const originalCity = parsedFilter.location || parsedFilter.city || "Houston";
  const normalizedCity = originalCity.toLowerCase().includes("downtown") || originalCity.length < 3
    ? "Houston" : originalCity;

  const postalcode = parsedFilter.postalcode || "77024";
  const max_price = Number(parsedFilter.max_price) || 150000;
  const min_beds = parsedFilter.min_beds || "1";
  const property_type = (parsedFilter.property_type || "house").toLowerCase();

  // Zillow Search
  const zillowParams = new URLSearchParams({
    location: normalizedCity,
    priceMax: max_price,
    bedsMin: min_beds,
    home_type: property_type,
    status_type: "ForSale",
  });

  // Check cache first
  const zillowCacheKey = `zillow:search:${normalizedCity}:${max_price}:${min_beds}:${property_type}`;
  let zillowData;
  
  const cachedZillow = await getAsync(zillowCacheKey);
  if (cachedZillow) {
    console.log(`💾 Cache hit for Zillow search: ${normalizedCity}`);
    zillowData = cachedZillow;
  } else {
    const zillowUrl = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${zillowParams.toString()}`;
    
    const zillowResponse = await fetch(zillowUrl, {
      method: "GET",
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
      },
    });

    if (!zillowResponse.ok) {
      throw new Error("Zillow API request failed");
    }

    zillowData = await zillowResponse.json();
    
    // Cache for 15 minutes
    await setAsync(zillowCacheKey, zillowData, 900);
    console.log(`💾 Cached Zillow search results for: ${normalizedCity}`);
  }

  const rawListings = zillowData.props || [];
  console.log(`📦 Found ${rawListings.length} listings from Zillow`);

  // Generate AI summary
  let aiSummary = "";
  try {
    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [
        { role: "system", content: "Summarize the buyer's preferences from this JSON:" },
        { role: "user", content: JSON.stringify(parsedFilter) },
      ],
    });
    aiSummary = summaryResponse.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.warn("⚠️ Summary generation failed:", err.message);
  }

  return {
    searchType: 'LISTINGS_SEARCH',
    query,
    sessionId,
    filters: parsedFilter,
    listings: rawListings.slice(0, 30), // Limit to 30 results
    listingCount: rawListings.length,
    aiSummary,
    timestamp: new Date().toISOString()
  };
}

// Main Smart Search Endpoint
router.post("/", freemiumRateLimit, addLimitsToResponse, applyTierLimitsMiddleware, async (req, res) => {
  const { query } = req.body;
  const sessionId = req.sessionID;

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Missing or invalid query" });
  }

  try {
    console.log(`🧠 Smart AI Search: "${query}"`);

    // Analyze search intent
    const intent = analyzeSearchIntent(query);
    console.log(`🎯 Search intent: ${intent.type} (confidence: ${intent.confidence}) - ${intent.reason}`);

    let result;

    if (intent.type === 'PROPERTY_COMP') {
      // Handle as property comparables request
      result = await handlePropertyComp(query, sessionId);
    } else {
      // Handle as listings search request  
      result = await handleListingsSearch(query, sessionId);
    }

    // Add intent analysis to response
    result.intent = intent;

    res.status(200).json(result);

  } catch (error) {
    console.error("❌ Smart Search Error:", error.message);
    res.status(500).json({ 
      error: "Smart search failed", 
      details: error.message 
    });
  }
});

module.exports = router;
