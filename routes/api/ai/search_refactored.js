const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const fetch = require("node-fetch");
const crypto = require("crypto");
require("dotenv").config();

// Import freemium rate limiting and data limiting
const { freemiumRateLimit, addLimitsToResponse } = require("../../../middleware/freemiumRateLimit");
const { applyTierLimitsMiddleware } = require("../../../utils/freemiumDataLimiter");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getAsync, setAsync, getUserKey } = require("../../../utils/redisClient");
const SearchCache = require("../../../models/SearchCache");

/**
 * 🏠 PROPERTY SEARCH COST OPTIMIZATION REFACTOR
 * 
 * NEW APPROACH:
 * 1. Search/List Views: Zillow API ONLY (images, price, summary) - NO CoreLogic calls
 * 2. Address Normalization: Create canonical keys for caching and reuse  
 * 3. Detail Views: CoreLogic on-demand only when user opens detail view
 * 4. High-cost features: Move to button/tab triggers with FXCT confirmation
 * 5. Comprehensive caching with appropriate TTLs for cost control
 */

/**
 * 📍 Address Normalization & Canonical Key Creation
 * Creates consistent address keys for caching and data reuse
 */
function normalizeAddress(address, city, state, zip) {
  try {
    // Normalize components
    const normalizedAddress = address?.toString().trim().toLowerCase()
      .replace(/\b(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|court|ct|place|pl|way|pkwy|parkway)\b/g, (match) => {
        const shortcuts = {
          'street': 'st', 'avenue': 'ave', 'boulevard': 'blvd', 'road': 'rd',
          'drive': 'dr', 'lane': 'ln', 'court': 'ct', 'place': 'pl', 'way': 'way',
          'parkway': 'pkwy', 'pkwy': 'pkwy'
        };
        return shortcuts[match] || match;
      })
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');

    const normalizedCity = city?.toString().trim().toLowerCase().replace(/\s+/g, '');
    const normalizedState = state?.toString().trim().toUpperCase();
    const normalizedZip = zip?.toString().trim().replace(/[^\d]/g, '').slice(0, 5);

    return {
      address: normalizedAddress,
      city: normalizedCity, 
      state: normalizedState,
      zip: normalizedZip,
      fullAddress: `${normalizedAddress}, ${normalizedCity}, ${normalizedState} ${normalizedZip}`
    };
  } catch (error) {
    console.warn('⚠️ Address normalization failed:', error.message);
    return {
      address: address?.toString() || '',
      city: city?.toString() || '',
      state: state?.toString() || '',
      zip: zip?.toString() || '',
      fullAddress: `${address}, ${city}, ${state} ${zip}`
    };
  }
}

/**
 * 🔑 Create Canonical Address Key
 * addr_key = hash(normalized_address + zip)
 */
function createAddressKey(normalized) {
  const keyString = `${normalized.address}_${normalized.city}_${normalized.state}_${normalized.zip}`;
  return crypto.createHash('sha256').update(keyString).digest('hex').slice(0, 16);
}

/**
 * 🔍 Zillow-Only Property Search 
 * No CoreLogic calls for search/list views to minimize costs
 */
async function searchZillowProperties(searchParams) {
  const { city, maxPrice, minBeds, propertyType, status = "ForSale" } = searchParams;
  
  console.log('🔍 💰 ZILLOW-ONLY SEARCH (Cost Optimized):', searchParams);
  
  const zillowParams = new URLSearchParams({
    location: city,
    priceMax: maxPrice,
    bedsMin: minBeds, 
    home_type: propertyType,
    status_type: status,
  });

  const cacheKey = `zillow:search:v2:${JSON.stringify(searchParams)}`;
  
  // Check cache first 
  const cached = await getAsync(cacheKey);
  if (cached) {
    console.log('💾 Zillow search cache HIT - no API cost incurred');
    try {
      return JSON.parse(cached);
    } catch (parseError) {
      console.warn('⚠️ Failed to parse cached Zillow data, fetching fresh');
      const { deleteAsync } = require("../../../utils/redisClient");
      await deleteAsync(cacheKey);
    }
  }

  // Make fresh API call
  const zillowUrl = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${zillowParams.toString()}`;
  
  try {
    const response = await fetch(zillowUrl, {
      method: "GET",
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
      },
    });

    if (!response.ok) {
      throw new Error(`Zillow API returned status ${response.status}`);
    }

    const data = await response.json();
    
    // Cache results for 15 minutes (property search data changes frequently) 
    await setAsync(cacheKey, data, 900);
    console.log(`💾 Cached Zillow search results - ${data.props?.length || 0} properties`);
    
    return data;
    
  } catch (error) {
    console.error('❌ Zillow API error:', error.message);
    throw error;
  }
}

/**
 * 🏷️ Create Property Cards from Zillow Data
 * Focus on essential display data only - no expensive enrichment
 */
function createPropertyCards(zillowProperties) {
  return zillowProperties.map((prop, index) => {
    // Parse address for normalization
    let addressComponents = {};
    if (prop.address) {
      const addressParts = prop.address.split(',').map(s => s.trim());
      if (addressParts.length >= 3) {
        addressComponents.street = addressParts[0];
        addressComponents.city = addressParts[1];
        const stateZip = addressParts[2];
        const stateZipMatch = stateZip.match(/([A-Z]{2})\s+(\d{5})/);
        if (stateZipMatch) {
          addressComponents.state = stateZipMatch[1];
          addressComponents.zip = stateZipMatch[2];
        }
      }
    }

    // Create normalized address and canonical key
    const normalized = normalizeAddress(
      addressComponents.street || prop.streetAddress,
      addressComponents.city || prop.city,
      addressComponents.state || prop.state,
      addressComponents.zip || prop.zipCode
    );
    const addrKey = createAddressKey(normalized);

    return {
      id: prop.zpid || `zillow_${index}`,
      zpid: prop.zpid,
      address: {
        oneLine: prop.address || `${prop.streetAddress || ''}, ${prop.city || ''}, ${prop.state || ''} ${prop.zipCode || ''}`.trim(),
        street: addressComponents.street || prop.streetAddress,
        city: addressComponents.city || prop.city,
        state: addressComponents.state || prop.state,
        zip: addressComponents.zip || prop.zipCode
      },
      // Essential display properties
      price: prop.price,
      beds: prop.bedrooms || prop.beds,
      baths: prop.bathrooms || prop.baths,
      sqft: prop.livingArea || prop.sqft,
      yearBuilt: prop.yearBuilt,
      propertyType: prop.homeType || prop.propertyType,
      
      // Location data
      location: {
        latitude: prop.latitude,
        longitude: prop.longitude
      },
      
      // Visual content
      imgSrc: prop.imgSrc,
      images: prop.photos || [],
      
      // Data source tracking
      dataSource: 'zillow',
      dataQuality: 'good',
      lastUpdated: new Date().toISOString(),
      
      // Canonical address key for future lookups
      addrKey: addrKey,
      normalizedAddress: normalized,
      
      // Cost optimization flags  
      hasDetailData: false,
      detailsAvailable: true,
      coreLogicLookupRequired: true
    };
  });
}

// 🤖 Main Search Endpoint - Zillow-Only Approach
router.post("/", freemiumRateLimit, addLimitsToResponse, applyTierLimitsMiddleware, async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Missing or invalid query" });
  }

  console.log('🔍 💰 COST-OPTIMIZED SEARCH START:', query);
  console.log('📋 Strategy: Zillow-only for search/list views - NO CoreLogic calls');

  try {
    // 📍 Check if this is a specific address search
    const isAddressSearch = query.includes(',') && 
      (query.match(/\d/) && (query.includes('St') || query.includes('Ave') || query.includes('Dr') || 
       query.includes('Rd') || query.includes('Ct') || query.includes('Ln') || query.includes('Way') ||
       query.includes('Street') || query.includes('Avenue') || query.includes('Drive') || 
       query.includes('Road') || query.includes('Court') || query.includes('Lane')));

    if (isAddressSearch) {
      console.log('🏠 Address search detected - using Zillow direct lookup');
      
      // Extract and clean address
      let cleanedQuery = query.trim();
      const prefixPatterns = [
        /^show me detailed information for the property at\s*/i,
        /^get me information about\s*/i,
        /^find details for\s*/i,
        /^lookup\s*/i,
        /^search for\s*/i
      ];
      
      for (const pattern of prefixPatterns) {
        cleanedQuery = cleanedQuery.replace(pattern, '');
      }

      // Use Zillow search with exact address
      const zillowParams = new URLSearchParams({ location: cleanedQuery });
      const zillowUrl = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${zillowParams.toString()}`;
      
      try {
        const zillowResponse = await fetch(zillowUrl, {
          method: "GET",
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
          },
        });

        if (!zillowResponse.ok) {
          throw new Error(`Zillow API returned status ${zillowResponse.status}`);
        }

        const zillowData = await zillowResponse.json();
        
        if (zillowData.props && zillowData.props.length > 0) {
          const propertyCards = createPropertyCards([zillowData.props[0]]); // Just the first match
          
          return res.status(200).json({
            fromCache: false,
            searchType: 'address',
            filters: { address: query },
            listings: propertyCards,
            metadata: {
              searchQuery: query,
              searchType: 'address_lookup',
              totalFound: 1,
              dataSource: 'zillow_only',
              costOptimized: true,
              timestamp: new Date().toISOString()
            },
            ai_summary: `Found specific address: ${query}. This is a Zillow listing card. Click "View Details" for comprehensive property intelligence.`,
            costSaving: {
              coreLogicCallsAvoided: 8,
              estimatedSavings: '$45-125 per search',
              detailsAvailableOnDemand: true
            }
          });
        } else {
          return res.status(404).json({
            error: "Property not found",
            message: `No property found at address: ${query}`,
            suggestion: "Try searching by city or area instead"
          });
        }
        
      } catch (error) {
        console.error('❌ Address search failed:', error.message);
        return res.status(500).json({ 
          error: "Address search failed",
          details: error.message 
        });
      }
    }

    // 💰 Check MongoDB cache first for non-address searches
    console.log('💾 Checking cache to save API costs...');
    let searchFilters = { limit: req.body.limit || 10 };
    const cachedResults = await SearchCache.findCachedResults(query, searchFilters);
    if (cachedResults) {
      console.log('🎉 Serving cached results - NO API costs incurred!');
      return res.status(200).json({ 
        fromCache: true, 
        ...cachedResults,
        costSaving: {
          message: 'Served from cache - no API costs incurred',
          estimatedSavings: '$5-25 per search'
        }
      });
    }

    // 🧠 Parse search criteria with AI
    console.log('🤖 Parsing search criteria with AI...');
    let parsedFilter = {};
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "Extract real estate search criteria and return ONLY valid JSON:\n" +
              "- 'under $300k' = {\"max_price\": 300000}\n" +
              "- '3 bedroom' or '3 bed' = {\"exact_beds\": 3}\n" +
              "- 'at least 2 bedrooms' = {\"min_beds\": 2}\n" +
              "- 'in Houston' = {\"city\": \"Houston\"}\n\n" +
              "Example response:\n" +
              `{
  "city": "Houston",
  "max_price": 300000,
  "exact_beds": 3,
  "property_type": "House"
}`
          },
          { role: "user", content: query }
        ]
      });

      const aiResponse = completion.choices[0].message.content?.trim();
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in GPT response");
      parsedFilter = JSON.parse(jsonMatch[0]);

      console.log("🎯 Parsed search criteria:", parsedFilter);
    } catch (err) {
      console.error("❌ Failed to parse AI filter:", err.message);
      return res.status(400).json({ error: "Invalid AI response", details: err.message });
    }

    // 🔧 Normalize search parameters
    const searchParams = {
      city: parsedFilter.location || parsedFilter.city || "Houston",
      maxPrice: Number(parsedFilter.max_price) || 500000,
      minBeds: parsedFilter.min_beds || parsedFilter.beds || "1",
      propertyType: (parsedFilter.property_type || "house").toLowerCase(),
      exactBeds: parsedFilter.exact_beds || parsedFilter.bedrooms || null
    };

    // Normalize city name
    if (searchParams.city.toLowerCase().includes("downtown") || searchParams.city.length < 3) {
      searchParams.city = "Houston";
    }

    console.log("🏠 Final search parameters:", searchParams);

    // 💰 Execute Zillow-only search (NO CoreLogic calls)
    console.log('🔍 Executing Zillow-only property search...');
    const zillowData = await searchZillowProperties(searchParams);
    
    if (!zillowData.props || zillowData.props.length === 0) {
      return res.status(404).json({
        error: "No properties found",
        searchParams,
        suggestion: "Try adjusting your search criteria"
      });
    }

    // 🏷️ Create property cards from Zillow data
    console.log(`📦 Creating property cards from ${zillowData.props.length} Zillow listings...`);
    const propertyCards = createPropertyCards(zillowData.props);

    // 🎯 Apply search filters  
    let filteredCards = propertyCards;
    
    // Filter by price
    if (searchParams.maxPrice > 0) {
      filteredCards = filteredCards.filter(prop => 
        !prop.price || prop.price <= searchParams.maxPrice
      );
    }

    // Filter by bedrooms
    if (searchParams.exactBeds) {
      filteredCards = filteredCards.filter(prop => 
        prop.beds && prop.beds == searchParams.exactBeds
      );
    } else if (searchParams.minBeds > 0) {
      filteredCards = filteredCards.filter(prop =>
        !prop.beds || prop.beds >= searchParams.minBeds  
      );
    }

    console.log(`✅ Filtered results: ${filteredCards.length}/${propertyCards.length} properties match criteria`);

    // 🧠 Generate AI summary
    let aiSummary = '';
    try {
      const summaryResponse = await openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        messages: [
          { 
            role: "system", 
            content: "Summarize property search results in a helpful way. Mention that detailed property intelligence is available on-demand." 
          },
          { 
            role: "user", 
            content: `Search: "${query}" returned ${filteredCards.length} properties in ${searchParams.city}. Price range up to $${searchParams.maxPrice.toLocaleString()}, ${searchParams.minBeds}+ bedrooms.` 
          }
        ]
      });
      aiSummary = summaryResponse.choices?.[0]?.message?.content || '';
    } catch (err) {
      console.warn("⚠️ AI summary generation failed:", err.message);
      aiSummary = `Found ${filteredCards.length} properties matching your search in ${searchParams.city}.`;
    }

    // 📊 Build final response
    const response = {
      fromCache: false,
      searchType: 'listings',
      query,
      filters: searchParams,
      listings: filteredCards.slice(0, 30), // Limit to 30 results
      metadata: {
        searchQuery: query,
        searchType: 'property_listings',
        totalFound: filteredCards.length,
        totalProcessed: propertyCards.length,
        dataSource: 'zillow_only',
        costOptimized: true,
        timestamp: new Date().toISOString()
      },
      ai_summary: aiSummary,
      costOptimization: {
        strategy: 'zillow_only_search',
        coreLogicCallsAvoided: propertyCards.length * 8, // Estimated calls avoided
        estimatedSavings: `$${(propertyCards.length * 45).toLocaleString()}-${(propertyCards.length * 125).toLocaleString()}`,
        detailsMessage: 'Click any property for comprehensive CoreLogic intelligence with FXCT cost confirmation',
        addressKeysGenerated: propertyCards.length
      }
    };

    // 💾 Cache successful results
    try {
      await SearchCache.cacheResults(query, searchParams, response, 900); // Cache for 15 minutes
      console.log('💾 Cached search results for future cost savings');
    } catch (cacheError) {
      console.warn('⚠️ Failed to cache results:', cacheError.message);
    }

    console.log('✅ COST-OPTIMIZED SEARCH COMPLETE');
    console.log(`💰 Estimated savings: $${(propertyCards.length * 45)}-${(propertyCards.length * 125)} per search`);
    
    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Search error:", error.message);
    return res.status(500).json({ 
      error: "Search failed", 
      details: error.message,
      fallback: "Try a simpler search query"
    });
  }
});

module.exports = router;
