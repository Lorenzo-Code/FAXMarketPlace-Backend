/**
 * 🎯 FractionaX Future-Ready Search Architecture
 * 
 * Implements the new data flow:
 * - General Search: OpenAI parsing → Discovery (Zillow + future MLS Grid) → MongoDB cache (24hr)
 * - Address Search: Google verification → Parallel fetch (Zillow + CoreLogic) → MongoDB cache (30-day)
 * - Property Details: On-click → CoreLogic details → MongoDB cache (30-day)
 * 
 * Key Features:
 * - Mandatory Google address verification before expensive CoreLogic calls
 * - MongoDB-first caching with proper TTLs
 * - Future-ready for MLS Grid integration
 * - OpenAI as intelligent orchestrator
 */

const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const fetch = require("node-fetch");
require("dotenv").config();

// Import services and middleware
const { freemiumRateLimit, addLimitsToResponse } = require("../../../middleware/freemiumRateLimit");
const { applyTierLimitsMiddleware } = require("../../../utils/freemiumDataLimiter");
const googleVerification = require("../../../services/googleAddressVerification");
const SearchCache = require("../../../models/SearchCache");
const Property = require("../../../models/Property");
const enhancedCache = require("../../../services/enhancedCacheService");
const { DataSourceRouter } = require("../../../services/dataSourceRouter");
const { getAsync, setAsync, getUserKey } = require("../../../utils/redisClient");
const { PropertyBatchProcessor } = require("../../../services/propertyBatchProcessor");
const { performance } = require('perf_hooks');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 🔍 Detect if query is an address search vs general search
 */
function detectSearchType(query) {
  const trimmedQuery = query.trim().toLowerCase();
  
  // First check if it's clearly NOT an address (contains search terms)
  const nonAddressTerms = [
    'bedroom', 'bathroom', 'bed', 'bath', 'under', 'over', 'above', 'below',
    'house', 'home', 'condo', 'apartment', 'townhouse', 'property', 'properties',
    'for sale', 'price', 'budget', 'cheap', 'expensive', 'luxury',
    'sqft', 'square feet', 'acre', 'lot size', 'pool', 'garage'
  ];
  
  // If query contains search terms, it's definitely a general search
  if (nonAddressTerms.some(term => trimmedQuery.includes(term))) {
    return false;
  }
  
  // More precise address patterns - require street number AND street type/name
  const addressIndicators = [
    // Precise format: "123 Main Street" or "456 Oak Dr"
    /^\d+\s+[A-Za-z][A-Za-z\s]*\s+(st|street|ave|avenue|dr|drive|rd|road|ct|court|ln|lane|way|blvd|boulevard|pl|place|ter|terrace|cir|circle)\b/i,
    
    // Full address format: "123 Main St, Houston, TX"
    /^\d+\s+[A-Za-z][A-Za-z\s]*\s+(st|street|ave|avenue|dr|drive|rd|road|ct|court|ln|lane|way|blvd|boulevard|pl|place|ter|terrace|cir|circle),\s*[A-Za-z\s]+,\s*[A-Z]{2}/i,
    
    // Address with unit/apt: "123 Main St Apt 4B"
    /^\d+\s+[A-Za-z][A-Za-z\s]*\s+(st|street|ave|avenue|dr|drive|rd|road|ct|court|ln|lane|way|blvd|boulevard|pl|place|ter|terrace|cir|circle)\s+(apt|apartment|unit|#)\s*[A-Za-z0-9]+/i
  ];
  
  return addressIndicators.some(pattern => pattern.test(trimmedQuery));
}

/**
 * 🎯 Discovery Phase: Search for properties using Zillow (+ future MLS Grid)
 */
async function discoveryPhase(searchCriteria) {
  const startTime = performance.now();
  console.log('🕵️ Discovery Phase: Searching for properties with Zillow');
  
  const { city, state = 'TX', maxPrice, minBeds, exactBeds, propertyType } = searchCriteria;
  
  // Build enhanced cache parameters - use proper parameter structure
  const searchParams = {
    city: city.toLowerCase(),
    state: state.toLowerCase(),
    maxPrice: maxPrice || null,
    minBeds: minBeds || null,
    exactBeds: exactBeds || null,
    propertyType: propertyType || 'any'
  };
  
  // ⚡ Use enhanced cache service with proper parameter structure
  console.log('🔍 Checking enhanced cache for discovery data...');
  
  try {
    const cacheResult = await enhancedCache.get('discovery', searchParams);
    
    if (cacheResult && cacheResult.cached && cacheResult.data) {
      const cacheTime = performance.now() - startTime;
      console.log(`💾 Discovery served from ${cacheResult.source} cache in ${cacheTime.toFixed(2)}ms`);
      
      // ⚠️ IMPORTANT: Apply client-side filtering to cached results to ensure accuracy
      let cachedListings = cacheResult.data.listings || [];
      
      console.log(`🔍 Pre-filter: ${cachedListings.length} cached properties`);
      console.log(`🎯 Applying filters - Max Price: ${maxPrice || 'none'}, Min Beds: ${minBeds || 'none'}, Exact Beds: ${exactBeds || 'none'}, Property Type: ${propertyType || 'any'}`);
      
      // Filter cached results to match current search criteria
      const filteredListings = cachedListings.filter(property => {
        let matches = true;
        
        // Filter by max price
        if (maxPrice && property.price && property.price > maxPrice) {
          matches = false;
        }
        
        // Filter by bedrooms (prefer minBeds over exactBeds for broader results)
        if (exactBeds && property.bedrooms && property.bedrooms !== exactBeds) {
          matches = false;
        } else if (minBeds && property.bedrooms && property.bedrooms < minBeds) {
          matches = false;
        }
        
        // Filter by property type (if not 'any')
        if (propertyType && propertyType !== 'any' && property.propertyType) {
          const normalizedPropType = property.propertyType.toLowerCase();
          if (!normalizedPropType.includes(propertyType)) {
            matches = false;
          }
        }
        
        return matches;
      });
      
      console.log(`✅ Post-filter: ${filteredListings.length} properties match criteria`);
      
      if (filteredListings.length === 0) {
        console.warn(`⚠️ Cache filtered to 0 results - invalidating cache and fetching fresh data`);
        // Clear this cache entry since it doesn't contain relevant results
        // We'll fall through to fresh search
      } else {
        // Return filtered cached data
        return {
          listings: filteredListings,
          fromCache: true,
          source: cacheResult.source + '_filtered',
          cacheMetrics: {
            ...cacheResult.data.metadata,
            originalCount: cachedListings.length,
            filteredCount: filteredListings.length
          },
          performanceMetrics: {
            totalTime: cacheTime,
            cacheHitTime: cacheTime
          }
        };
      }
    }
    
    console.log(`🔄 No enhanced cache hit (source: ${cacheResult?.source || 'none'})`);
  } catch (cacheError) {
    console.warn('⚠️ Enhanced cache error:', cacheError.message);
  }
  
  // Fallback to original MongoDB cache for stability
  console.log('🔍 Checking fallback MongoDB cache...');
  try {
    const mongoCache = await SearchCache.findCachedResults(`discovery_${JSON.stringify(searchCriteria)}`, {
      city, state, maxPrice, minBeds, exactBeds, propertyType
    });
    
    if (mongoCache && mongoCache.listings && Array.isArray(mongoCache.listings)) {
      const cacheTime = performance.now() - startTime;
      console.log(`💾 Discovery served from MongoDB fallback cache in ${cacheTime.toFixed(2)}ms`);
      return {
        listings: mongoCache.listings,
        fromCache: true,
        source: 'mongodb_fallback',
        cacheMetrics: mongoCache.metadata,
        performanceMetrics: {
          totalTime: cacheTime,
          cacheHitTime: cacheTime
        }
      };
    }
  } catch (mongoError) {
    console.warn('⚠️ MongoDB cache fallback error:', mongoError.message);
  }
  
  console.log('🔄 No cache hits, proceeding with fresh search');

  // Build Zillow search parameters
  const zillowParams = new URLSearchParams({
    location: `${city}, ${state}`,
    status_type: "ForSale",
  });
  
  if (maxPrice) zillowParams.append('priceMax', maxPrice);
  if (minBeds) zillowParams.append('bedsMin', minBeds);
  if (exactBeds) zillowParams.append('bedsMin', exactBeds); // Use exactBeds for minimum beds
  if (propertyType && propertyType !== 'any') {
    zillowParams.append('home_type', propertyType);
  }
  
  // 🔍 DEBUG: Log Zillow API parameters
  console.log('🏗️ Zillow API Parameters:');
  console.log(`   📍 Location: ${city}, ${state}`);
  console.log(`   💰 Max Price: ${maxPrice || 'Not set'}`);
  console.log(`   🛏️ Min Beds: ${minBeds || 'Not set'}`);
  console.log(`   🛏️ Exact Beds: ${exactBeds || 'Not set'}`);
  console.log(`   🏠 Property Type: ${propertyType || 'any'}`);
  console.log(`   🔗 Full URL params: ${zillowParams.toString()}`);
  
  // Validate critical parameters
  if (!maxPrice && !minBeds && !exactBeds) {
    console.warn('⚠️ WARNING: No price or bedroom filters set - may return broad results');
  }

  try {
    // ⚡ Use DataSourceRouter for intelligent routing (Zillow preferred for city-wide searches)
    const dataSourceRouter = new DataSourceRouter();
    const routingDecision = await dataSourceRouter.determineOptimalRoute({
      city,
      state,
      maxPrice,
      exactBeds,
      propertyType,
      searchType: 'discovery'
    }, {
      prioritizeSpeed: true,
      prioritizeCost: true
    });
    
    console.log(`🎯 Routing decision: Using ${routingDecision.strategy} (confidence: ${routingDecision.confidence})`);
    
    const zillowStartTime = performance.now();
    console.log('🏠 Calling Zillow API for discovery...');
    const zillowUrl = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${zillowParams.toString()}`;
    
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

    const zillowTime = performance.now() - zillowStartTime;
    console.log(`📡 Zillow API response time: ${zillowTime.toFixed(2)}ms`);

    const data = await response.json();
    
    // Use batch processor for optimized parallel processing
    const batchStartTime = performance.now();
    console.log('🚀 Using batch processor for parallel property enrichment...');
    const rawListings = (data.props || []).map(prop => ({
      ...prop,
      address: prop.address,
      price: prop.price,
      bedrooms: prop.bedrooms,
      bathrooms: prop.bathrooms,
      livingArea: prop.livingArea,
      latitude: prop.latitude,
      longitude: prop.longitude,
      imgSrc: prop.imgSrc,
      zpid: prop.zpid,
      dataSource: 'zillow',
      yearBuilt: prop.yearBuilt,
      propertyType: prop.propertyType
    }));
    
    const batchProcessor = new PropertyBatchProcessor();
    const batchResult = await batchProcessor.processPropertiesBatch(rawListings);
    const listings = batchResult.properties;
    
    const batchTime = performance.now() - batchStartTime;
    console.log(`⚡ Batch processing completed in ${batchTime.toFixed(2)}ms`);
    
    // 💾 Save enriched properties with carouselPhotos to MongoDB for persistent access
    console.log('💾 Saving enriched properties to MongoDB...');
    const saveStartTime = performance.now();
    
    try {
      // Filter properties that have valuable enrichment data (photos, good data quality)
      const worthSavingProperties = listings.filter(prop => 
        prop.dataQuality !== 'poor' && 
        (prop.carouselPhotos?.length > 0 || prop.hasImage)
      );
      
      if (worthSavingProperties.length > 0) {
        const saveResult = await Property.saveBatchEnrichedProperties(worthSavingProperties);
        const saveTime = performance.now() - saveStartTime;
        
        console.log(`💾 MongoDB save completed in ${saveTime.toFixed(2)}ms:`);
        console.log(`   ✅ Saved: ${saveResult.totalSaved} properties`);
        console.log(`   ❌ Errors: ${saveResult.totalErrors}`);
        
        // Log photo statistics
        const propertiesWithPhotos = worthSavingProperties.filter(p => p.carouselPhotos?.length > 0);
        const totalPhotos = propertiesWithPhotos.reduce((sum, p) => sum + (p.carouselPhotos?.length || 0), 0);
        console.log(`   📷 Saved ${propertiesWithPhotos.length} properties with ${totalPhotos} total photos`);
      } else {
        console.log('⚠️ No properties worth saving to database (poor quality or no images)');
      }
    } catch (saveError) {
      console.error('❌ MongoDB save failed:', saveError.message);
      // Continue execution - saving failure shouldn't break the search response
    }

    // ⚡ Cache using enhanced cache service with performance metrics
    const cacheData = {
      listings,
      metadata: {
        searchType: 'discovery',
        totalFound: listings.length,
        timestamp: new Date().toISOString(),
        performanceMetrics: {
          zillowApiTime: zillowTime,
          batchProcessingTime: batchTime,
          totalTime: performance.now() - startTime
        },
        routingDecision
      }
    };
    
    // Store in enhanced cache with 24-hour TTL for discovery data
    await enhancedCache.set(
      'discovery',
      searchParams,
      cacheData,
      {
        customTTL: 24 * 60 * 60, // 24 hours
        priority: 'high',
        estimatedCost: listings.length * 0.02,
        metadata: {
          searchType: 'discovery',
          routingDecision: routingDecision.strategy
        }
      }
    );

    const totalTime = performance.now() - startTime;
    console.log(`✅ Discovery completed in ${totalTime.toFixed(2)}ms: ${listings.length} properties via ${routingDecision.strategy}`);
    
    return {
      listings,
      fromCache: false,
      source: routingDecision.strategy,
      performanceMetrics: {
        totalTime,
        zillowApiTime: zillowTime,
        batchProcessingTime: batchTime
      }
    };

  } catch (error) {
    console.error('❌ Discovery phase failed:', error.message);
    throw error;
  }
}

/**
 * 🏢 Address Search: Verify with Google, then parallel fetch from Zillow + CoreLogic
 */
async function addressSearch(address) {
  const startTime = performance.now();
  console.log(`🏠 Address Search: Processing "${address}"`);
  
  // Step 1: Verify address with Google
  const googleStartTime = performance.now();
  console.log('🗺️ Step 1: Google address verification...');
  const verification = await googleVerification.verifyAndNormalizeAddress(address);
  const googleTime = performance.now() - googleStartTime;
  
  if (!verification.valid) {
    console.log('❌ Address verification failed:', verification.error);
    return {
      error: `Address verification failed: ${verification.error}`,
      suggestion: verification.suggestion,
      fromCache: false
    };
  }

  console.log(`✅ Address verified by Google in ${googleTime.toFixed(2)}ms:`, verification.normalizedAddress);
  
  // Check if address meets requirements for expensive APIs
  if (!googleVerification.isValidForExpensiveAPIs(verification)) {
    console.log('⚠️ Address quality too low for expensive API calls');
    return {
      error: 'Address quality insufficient for detailed property data',
      suggestion: 'Please provide a more specific address',
      addressData: verification,
      fromCache: false
    };
  }

  // Step 2: Check enhanced cache (30-day for address searches)
  const addressParams = {
    normalizedAddress: verification.normalizedAddress
  };
  console.log('🔍 Checking enhanced cache for address data...');
  
  try {
    const cacheResult = await enhancedCache.get('address', addressParams);
    
    if (cacheResult && cacheResult.cached && cacheResult.data) {
      const cacheTime = performance.now() - startTime;
      console.log(`💾 Address search served from ${cacheResult.source} cache in ${cacheTime.toFixed(2)}ms`);
      return {
        ...cacheResult.data,
        fromCache: true,
        verification,
        cacheMetrics: cacheResult.data.metadata
      };
    }
    
    console.log(`🔄 No address cache hit (source: ${cacheResult?.source || 'none'})`);
  } catch (cacheError) {
    console.warn('⚠️ Enhanced address cache error:', cacheError.message);
  }

  console.log('🔄 Step 2: Parallel fetch from Zillow + CoreLogic...');
  
  // Step 3: Parallel fetch from both sources with performance tracking
  const fetchStartTime = performance.now();
  const promises = [];
  
  // Zillow search promise
  promises.push(
    fetch(`https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?location=${encodeURIComponent(verification.zillowFormat)}`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
      }
    }).then(res => res.json()).then(data => ({
      source: 'zillow',
      data: data.props?.[0] || null
    })).catch(error => ({
      source: 'zillow',
      error: error.message
    }))
  );

  // CoreLogic search promise
  promises.push(
    (async () => {
      try {
        const { CoreLogicSuperClient } = require('../../../utils/coreLogicSuperClient');
        const superClient = new CoreLogicSuperClient();
        
        const result = await superClient.searchAndEnrich(verification.coreLogicFormat);
        return {
          source: 'corelogic',
          data: result
        };
      } catch (error) {
        return {
          source: 'corelogic',
          error: error.message
        };
      }
    })()
  );

  const [zillowResult, coreLogicResult] = await Promise.all(promises);
  const fetchTime = performance.now() - fetchStartTime;
  
  console.log('📊 Zillow result:', zillowResult.error ? `Error: ${zillowResult.error}` : 'Success');
  console.log('📊 CoreLogic result:', coreLogicResult.error ? `Error: ${coreLogicResult.error}` : 'Success');

  // Step 4: Merge and enrich data
  let mergedProperty = null;
  
  if (zillowResult.data || coreLogicResult.data) {
    mergedProperty = {
      id: zillowResult.data?.zpid || 'address_property',
      address: { oneLine: verification.normalizedAddress },
      
      // Prioritize CoreLogic for valuation, Zillow for listing data
      price: coreLogicResult.data?.searchResult?.items?.[0]?.assessedValue || 
             zillowResult.data?.price || null,
             
      beds: coreLogicResult.data?.intelligence?.buildings?.bedrooms || 
            zillowResult.data?.bedrooms || null,
            
      baths: coreLogicResult.data?.intelligence?.buildings?.bathrooms || 
             zillowResult.data?.bathrooms || null,
             
      sqft: coreLogicResult.data?.intelligence?.buildings?.squareFeet || 
            zillowResult.data?.livingArea || null,
            
      location: {
        latitude: verification.coordinates.latitude,
        longitude: verification.coordinates.longitude
      },
      
      // Always use Zillow for images - maintain backward compatibility with imgSrc
      imgSrc: zillowResult.data?.imgSrc || null,
      carouselPhotos: zillowResult.data?.carouselPhotos || (zillowResult.data?.imgSrc ? [zillowResult.data.imgSrc] : []),
      zpid: zillowResult.data?.zpid || null,
      photoCount: zillowResult.data?.carouselPhotos?.length || (zillowResult.data?.imgSrc ? 1 : 0),
      
      // Data sources
      dataSource: 'combined',
      dataQuality: 'excellent',
      zillowData: zillowResult.data,
      coreLogicData: coreLogicResult.data,
      verification
    };
  }

  const totalTime = performance.now() - startTime;
  const resultData = {
    listings: mergedProperty ? [mergedProperty] : [],
    metadata: {
      searchQuery: address,
      searchType: 'address',
      totalFound: mergedProperty ? 1 : 0,
      timestamp: new Date().toISOString(),
      performanceMetrics: {
        googleVerificationTime: googleTime,
        parallelFetchTime: fetchTime,
        totalTime
      },
      dataSources: {
        zillow: !!zillowResult.data,
        corelogic: !!coreLogicResult.data,
        google: true
      }
    },
    ai_summary: mergedProperty 
      ? `Found detailed information for ${verification.normalizedAddress}. Data combined from multiple sources for accuracy.`
      : `Address ${verification.normalizedAddress} was verified but no property data is available. The property may not be listed or in our database.`
  };

  // ⚡ Cache using enhanced cache service for 30 days (address searches are stable)
  if (mergedProperty) {
    await enhancedCache.set(
      'address',
      addressParams,
      resultData,
      {
        customTTL: 30 * 24 * 60 * 60, // 30 days
        priority: 'high',
        estimatedCost: 0.10, // Higher cost estimate for parallel API calls
        metadata: {
          searchType: 'address',
          addressVerification: true,
          parallelFetch: true
        }
      }
    );
    
    console.log(`💾 Cached address search result for 30 days`);
  }

  console.log(`✅ Address search completed in ${totalTime.toFixed(2)}ms`);
  return {
    ...resultData,
    fromCache: false,
    verification,
    performanceMetrics: {
      totalTime,
      googleVerificationTime: googleTime,
      parallelFetchTime: fetchTime
    }
  };
}

/**
 * 🎯 Main Search Endpoint
 */
router.post("/", freemiumRateLimit, addLimitsToResponse, applyTierLimitsMiddleware, async (req, res) => {
  const requestStartTime = performance.now();
  const { query } = req.body;
  
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Missing or invalid query" });
  }

  console.log(`🎯 Processing search: "${query}"`);
  console.log(`⏱️ Request started at: ${new Date().toISOString()}`);

  try {
    // ⚡ Performance Phase 1: Search Type Detection
    const detectionStartTime = performance.now();
    const isAddressSearch = detectSearchType(query);
    const detectionTime = performance.now() - detectionStartTime;
    
    console.log(`📍 Search type: ${isAddressSearch ? 'ADDRESS' : 'GENERAL'} (detected in ${detectionTime.toFixed(2)}ms)`);
    console.log(`📈 Phase 1 - Search Detection: ${detectionTime.toFixed(2)}ms`);

    if (isAddressSearch) {
      // ⚡ Performance Phase 2: Address Search
      console.log(`📈 Phase 2 - Starting Address Search`);
      const addressStartTime = performance.now();
      
      const result = await addressSearch(query);
      const addressTime = performance.now() - addressStartTime;
      const totalRequestTime = performance.now() - requestStartTime;
      
      console.log(`📈 Phase 2 - Address Search: ${addressTime.toFixed(2)}ms`);
      console.log(`🏁 Total Request Time: ${totalRequestTime.toFixed(2)}ms`);
      
      if (result.error) {
        return res.status(400).json(result);
      }
      
      return res.status(200).json({
        fromCache: result.fromCache,
        ...result,
        requestMetrics: {
          totalRequestTime,
          detectionTime,
          addressSearchTime: addressTime
        }
      });
    } else {
      // ⚡ Performance Phase 2: OpenAI Intent Parsing
      console.log(`📈 Phase 2 - Starting OpenAI Intent Parsing`);
      const aiParsingStartTime = performance.now();
      console.log('🧠 Step 1: Parse search intent with OpenAI...');
      
      // Parse search intent with OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "You are a smart real estate assistant. Extract search criteria and return ONLY valid JSON. Examples:\n" +
                    "- 'houses under 300k in Houston' = {\"city\": \"Houston\", \"max_price\": 300000, \"property_type\": \"house\"}\n" +
                    "- '3 bedroom homes' = {\"min_beds\": 3}\n" +
                    "- 'exactly 3 bedrooms' = {\"exact_beds\": 3}\n" +
                    "- 'at least 2 bedrooms' = {\"min_beds\": 2}\n\n" +
                    "Always include 'city' if mentioned, default to 'Houston' for Texas searches."
          },
          { role: "user", content: query }
        ]
      });

      const aiResponse = completion.choices[0].message.content?.trim();
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Could not parse search criteria from query");
      }
      
      const searchCriteria = JSON.parse(jsonMatch[0]);
      const aiParsingTime = performance.now() - aiParsingStartTime;
      console.log(`📈 Phase 2 - OpenAI Parsing: ${aiParsingTime.toFixed(2)}ms`);
      console.log("🔍 Parsed search criteria:", searchCriteria);

      // Normalize criteria
      const normalizedCriteria = {
        city: searchCriteria.city || searchCriteria.location || "Houston",
        state: searchCriteria.state || "TX",
        maxPrice: searchCriteria.max_price || searchCriteria.maxPrice,
        minBeds: searchCriteria.min_beds || searchCriteria.minBeds,
        exactBeds: searchCriteria.exact_beds || searchCriteria.exactBeds,
        propertyType: (searchCriteria.property_type || searchCriteria.propertyType || "any").toLowerCase()
      };

      // ⚡ Performance Phase 3: Discovery Phase
      console.log(`📈 Phase 3 - Starting Discovery Phase`);
      const discoveryStartTime = performance.now();
      console.log('🏠 Step 2: Discovery phase...');
      
      const discoveryResult = await discoveryPhase(normalizedCriteria);
      const discoveryTime = performance.now() - discoveryStartTime;
      console.log(`📈 Phase 3 - Discovery: ${discoveryTime.toFixed(2)}ms`);

      // ⚡ Performance Phase 4: AI Summary Generation
      console.log(`📈 Phase 4 - Starting AI Summary Generation`);
      const summaryStartTime = performance.now();
      console.log('🧠 Step 3: Generate AI summary...');
      
      let aiSummary = "";
      
      // Ensure discoveryResult has valid listings array
      const listingsCount = discoveryResult?.listings?.length || 0;
      
      try {
        const summaryResponse = await openai.chat.completions.create({
          model: "gpt-4-1106-preview",
          messages: [
            { 
              role: "system", 
              content: "You are a helpful real estate assistant. Summarize the search results in a conversational way. Be encouraging and helpful." 
            },
            { 
              role: "user", 
              content: `Search query: "${query}"\nCriteria: ${JSON.stringify(normalizedCriteria)}\nResults: ${listingsCount} properties found` 
            }
          ],
        });

        aiSummary = summaryResponse.choices?.[0]?.message?.content || 
                   `Found ${listingsCount} properties matching your search in ${normalizedCriteria.city}.`;
      } catch (summaryError) {
        console.warn("⚠️ AI summary generation failed:", summaryError.message);
        aiSummary = `Found ${listingsCount} properties matching your criteria.`;
      }
      
      const summaryTime = performance.now() - summaryStartTime;
      const totalRequestTime = performance.now() - requestStartTime;
      
      console.log(`📈 Phase 4 - AI Summary: ${summaryTime.toFixed(2)}ms`);
      console.log(`🏁 Total Request Time: ${totalRequestTime.toFixed(2)}ms`);
      
      // Performance summary
      console.log(`\n📈 PERFORMANCE SUMMARY:`);
      console.log(`  Detection: ${detectionTime.toFixed(2)}ms`);
      console.log(`  AI Parsing: ${aiParsingTime.toFixed(2)}ms`);
      console.log(`  Discovery: ${discoveryTime.toFixed(2)}ms`);
      console.log(`  AI Summary: ${summaryTime.toFixed(2)}ms`);
      console.log(`  Total: ${totalRequestTime.toFixed(2)}ms`);

      // Return results with comprehensive performance metrics
      return res.status(200).json({
        fromCache: discoveryResult.fromCache,
        filters: normalizedCriteria,
        listings: discoveryResult.listings || [],
        ai_summary: aiSummary,
        metadata: {
          searchQuery: query,
          searchType: 'general',
          totalFound: listingsCount,
          dataSource: discoveryResult.source,
          timestamp: new Date().toISOString(),
          performanceMetrics: {
            totalRequestTime,
            detectionTime,
            aiParsingTime,
            discoveryTime,
            summaryTime,
            discoveryMetrics: discoveryResult.performanceMetrics
          }
        }
      });
    }

  } catch (error) {
    console.error('❌ Search error:', error.message);
    return res.status(500).json({ 
      error: "Search failed", 
      details: error.message,
      suggestion: "Please try rephrasing your search or contact support"
    });
  }
});

/**
 * 🏠 Property Details Endpoint (for when users click on listings)
 * GET /api/ai/search/details/:id
 */
router.get("/details/:id", async (req, res) => {
  const { id } = req.params;
  const { source } = req.query; // 'zillow', 'corelogic', etc.

  console.log(`🔍 Fetching property details for ID: ${id}, source: ${source}`);

  try {
    // Check cache first (30-day for property details)
    const cacheKey = `property_details:${id}:${source || 'any'}`;
    const cached = await getAsync(cacheKey);
    
    if (cached) {
      console.log('💾 Property details served from cache');
      return res.json({ fromCache: true, ...JSON.parse(cached) });
    }

    let details = null;

    if (source === 'zillow' && id.startsWith('zillow_')) {
      // Fetch from Zillow details API
      console.log('🏠 Fetching Zillow property details...');
      // Implementation for Zillow details API call
    } else {
      // Default to CoreLogic for detailed property intelligence
      console.log('🏢 Fetching CoreLogic property intelligence...');
      
      const { CoreLogicSuperClient } = require('../../../utils/coreLogicSuperClient');
      const superClient = new CoreLogicSuperClient();
      
      // This would need the property address - might need to modify approach
      details = await superClient.getPropertyIntelligence(id);
    }

    if (details) {
      // Cache for 30 days
      await setAsync(cacheKey, JSON.stringify(details), 30 * 24 * 60 * 60);
      
      return res.json({
        fromCache: false,
        propertyDetails: details,
        metadata: {
          propertyId: id,
          source: source || 'corelogic',
          timestamp: new Date().toISOString()
        }
      });
    } else {
      return res.status(404).json({
        error: 'Property details not found',
        propertyId: id
      });
    }

  } catch (error) {
    console.error('❌ Property details error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch property details',
      details: error.message
    });
  }
});

module.exports = router;
