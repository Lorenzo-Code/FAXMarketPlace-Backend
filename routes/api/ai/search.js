const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const fetch = require("node-fetch");
require("dotenv").config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getPropertyDetail, getAttomId, fetchMultipleProperties } = require("../../../services/attom");
const { getAsync, setAsync, getUserKey } = require("../../../utils/redisClient");


// 🤖 POST AI Search - Main endpoint as per data map
// This endpoint uses OpenAI to understand a user's search prompt and return structured real estate search data.
// It pulls CoreLogic property data and Zillow photos to enrich the results.
router.post("/", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Missing or invalid query" });
  }

  // 🔍 Ask GPT to extract structured filters
  let parsedFilter = {};
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a smart real estate assistant. Extract search criteria and return ONLY valid JSON. For bedroom requests:\n" +
            "- '3 bedroom' or '3 bed' = {\"exact_beds\": 3}\n" +
            "- 'at least 2 bedrooms' = {\"min_beds\": 2}\n" +
            "- 'under $300k' = {\"max_price\": 300000}\n" +
            "- '300k or less' = {\"max_price\": 300000}\n" +
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

    console.log("🔍 Parsed filter from AI:", parsedFilter);
  } catch (err) {
    console.error("❌ Failed to parse GPT filter:", err.message);
    return res.status(400).json({ error: "Invalid AI response", details: err.message });
  }

  // 💾 Add per-user caching for personalized search results
  const userKey = getUserKey(req);
  const searchCacheKey = `ai:fullSearch:${userKey}:${JSON.stringify(parsedFilter)}`;
  const cached = await getAsync(searchCacheKey);
  if (cached) {
    console.log(`📥 Cache hit for AI search: ${userKey}`);
    try {
      return res.status(200).json({ fromCache: true, ...JSON.parse(cached) });
    } catch (parseError) {
      console.warn(`⚠️ Failed to parse cached search data, fetching fresh data:`, parseError.message);
      // Clear the corrupted cache entry and continue with fresh search
      const { deleteAsync } = require("../../../utils/redisClient");
      await deleteAsync(searchCacheKey);
    }
  }

  // 🔧 Normalize values
  const originalCity = parsedFilter.location || parsedFilter.city || "Houston";
  const normalizedCity =
    originalCity.toLowerCase().includes("downtown") || originalCity.length < 3
      ? "Houston"
      : originalCity;

  const postalcode = parsedFilter.postalcode || "77024";
  const max_price = Number(parsedFilter.max_price) || 500000; // Increased default to be more reasonable
  const min_beds = parsedFilter.min_beds || parsedFilter.beds || "1";
  const max_beds = parsedFilter.max_beds || null; // New: handle exact bedroom requests
  const exact_beds = parsedFilter.exact_beds || parsedFilter.bedrooms || null; // New: handle "3 bedroom" requests
  const property_type = (parsedFilter.property_type || "house").toLowerCase();
  
  console.log("🎯 Search criteria:", {
    city: normalizedCity,
    max_price,
    min_beds,
    max_beds,
    exact_beds,
    property_type
  });

  // 🏠 Zillow Search with Enhanced Caching
  const zillowParams = new URLSearchParams({
    location: normalizedCity,
    priceMax: max_price,
    bedsMin: min_beds,
    home_type: property_type,
    status_type: "ForSale",
  });

  // 💾 Create specific cache key for Zillow search results
  const zillowCacheKey = `zillow:search:${normalizedCity}:${max_price}:${min_beds}:${property_type}`;
  
  let zillowData;
  
  // 📥 Check cache first - this saves expensive Zillow API calls!
  const cachedZillow = await getAsync(zillowCacheKey);
  if (cachedZillow) {
    console.log(`📥 Cache hit for Zillow search: ${normalizedCity}`);
    try {
      zillowData = JSON.parse(cachedZillow);
    } catch (parseError) {
      console.warn(`⚠️ Failed to parse cached Zillow data, fetching fresh data:`, parseError.message);
      // Clear the corrupted cache entry
      const { deleteAsync } = require("../../../utils/redisClient");
      await deleteAsync(zillowCacheKey);
      // Fall through to fetch fresh data
    }
  }
  
  if (!zillowData) {
    // 🔍 Make API call if not cached
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
        const text = await zillowResponse.text();
        return res.status(502).json({ error: "Zillow API failed", details: text });
      }

      zillowData = await zillowResponse.json();
      
      // 💾 Cache Zillow search results for 15 minutes (property listings change frequently)
      await setAsync(zillowCacheKey, zillowData, 900);
      console.log(`📝 Cached Zillow search results for: ${normalizedCity}`);
      
    } catch (err) {
      return res.status(502).json({ error: "Zillow API unreachable", details: err.message });
    }
  }

  const rawListings = zillowData.props || [];
  console.log(`📦 Found ${rawListings.length} listings from Zillow`);

  // 🧠 Enhanced property data processing with comprehensive validation and fallbacks
  let enrichedListings = [];
  let attomSuccessCount = 0;
  let attomErrorCount = 0;
  let dataQualityStats = {
    totalProcessed: 0,
    addressParsed: 0,
    hasImages: 0,
    hasPrice: 0,
    hasCoordinates: 0,
    hasBedsAndBaths: 0
  };
  
  console.log(`📊 Starting to process ${rawListings.length} raw listings from Zillow`);
  
  for (const [index, p] of rawListings.slice(0, 10).entries()) {
    dataQualityStats.totalProcessed++;
    let street, city, state, zip;
    
    console.log(`\n🏠 Processing property ${index + 1}/${Math.min(rawListings.length, 10)}`);
    console.log(`📍 Raw property data keys:`, Object.keys(p));
    console.log(`📍 Raw address:`, p.address);
    console.log(`💰 Raw price:`, p.price);
    console.log(`🖼️ Raw image data:`, p.imgSrc ? 'Present' : 'Missing');
    console.log(`📐 Raw coordinates:`, { lat: p.latitude, lng: p.longitude });
    console.log(`🛏️ Raw bed/bath data:`, { beds: p.bedrooms, baths: p.bathrooms });
    
    // Enhanced address parsing with multiple fallback strategies
    try {
      const address = p.address?.trim();
      if (!address || address === '' || address === 'undefined') {
        console.warn(`⚠️ No valid address found for listing ${index}`);
        console.warn(`   Raw address value:`, JSON.stringify(p.address));
        
        // Try alternative address fields from Zillow
        const altAddress = p.streetAddress || p.formattedChip || p.addressStreet;
        if (altAddress) {
          console.log(`🔄 Found alternative address field:`, altAddress);
          // Continue with alternative address
        } else {
          enrichedListings.push({
            ...p,
            id: p.zpid || `property_${index}`,
            fulladdress1: 'Address unavailable',
            address: { oneLine: 'Address unavailable' },
            location: {
              latitude: p.latitude || null,
              longitude: p.longitude || null
            },
            price: p.price || null,
            beds: p.bedrooms || null,
            baths: p.bathrooms || null,
            sqft: p.livingArea || null,
            zillowImage: p.imgSrc || null,
            attomData: null,
            dataQuality: 'poor'
          });
          continue;
        }
      }

      // Parse address components with enhanced regex patterns
      const addressToParse = address || altAddress;
      const parts = addressToParse.split(",").map(s => s.trim());
      
      console.log(`🔍 Address parts:`, parts);
      
      if (parts.length >= 3) {
        street = parts[0];
        city = parts[1];
        
        // Enhanced state/ZIP parsing with multiple patterns
        const stateZipPart = parts[2];
        console.log(`🏛️ State/ZIP part:`, stateZipPart);
        
        // Try multiple regex patterns for state/zip
        const patterns = [
          /^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/, // "TX 77088"
          /^([A-Z]{2})\s+(\d{5})/, // "TX 77088" (ignore extension)
          /([A-Z]{2}).*?(\d{5})/, // Extract state and zip from any format
        ];
        
        let matched = false;
        for (const pattern of patterns) {
          const match = stateZipPart.match(pattern);
          if (match) {
            state = match[1];
            zip = match[2];
            matched = true;
            console.log(`✅ Matched pattern, state: ${state}, zip: ${zip}`);
            break;
          }
        }
        
        if (!matched) {
          // Last resort: extract any 5-digit number as ZIP
          const zipMatch = stateZipPart.match(/\d{5}/);
          if (zipMatch) {
            zip = zipMatch[0];
            state = "TX"; // Default for Houston searches
            console.log(`🔄 Fallback extraction - zip: ${zip}, default state: ${state}`);
          }
        }
      } else if (parts.length === 1) {
        // Handle single-part addresses (might be just street)
        street = parts[0];
        city = "Houston"; // Default for search context
        state = "TX";
        console.log(`🔄 Single-part address, using defaults`);
      }
      
      if (street && city && state) {
        dataQualityStats.addressParsed++;
      }
      
    } catch (err) {
      console.error(`❌ Address parsing error for listing ${index}:`, err.message);
      console.error(`   Stack trace:`, err.stack);
    }

    // Comprehensive data validation and enrichment
    const processedProperty = {
      ...p,
      id: p.zpid || `property_${index}`,
      price: parseFloat(p.price) || null,
      beds: parseInt(p.bedrooms) || null,
      baths: parseFloat(p.bathrooms) || null,
      sqft: parseInt(p.livingArea) || null,
      zillowImage: p.imgSrc || null,
      location: {
        latitude: parseFloat(p.latitude) || null,
        longitude: parseFloat(p.longitude) || null
      }
    };
    
    // Update data quality stats
    if (processedProperty.zillowImage) dataQualityStats.hasImages++;
    if (processedProperty.price) dataQualityStats.hasPrice++;
    if (processedProperty.location.latitude && processedProperty.location.longitude) dataQualityStats.hasCoordinates++;
    if (processedProperty.beds && processedProperty.baths) dataQualityStats.hasBedsAndBaths++;

    // Validate required fields with detailed logging
    if (!street || !city || !state) {
      console.warn(`⚠️ Missing critical address components for listing ${index}:`);
      console.warn(`   Street: ${street || 'MISSING'}`);
      console.warn(`   City: ${city || 'MISSING'}`);
      console.warn(`   State: ${state || 'MISSING'}`);
      console.warn(`   ZIP: ${zip || 'MISSING'}`);
      console.warn(`   Original address: "${p.address}"`);
      console.warn(`   Alternative fields checked: streetAddress=${p.streetAddress}, formattedChip=${p.formattedChip}`);
      
      // Create comprehensive address string from available data
      const addressParts = [street, city, state, zip].filter(Boolean);
      const fallbackAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Address unavailable';
      
      enrichedListings.push({
        ...processedProperty,
        fulladdress1: fallbackAddress,
        address: { oneLine: fallbackAddress },
        attomData: null,
        dataQuality: addressParts.length >= 2 ? 'partial' : 'poor'
      });
      continue;
    }

    console.log(`✅ Successfully parsed address: ${street}, ${city}, ${state} ${zip}`);

    // Enhanced Attom lookup with better error categorization
    let attomData = null;
    try {
      console.log(`🔍 Initiating Attom lookup for: ${street}, ${city}, ${state}, ${zip}`);
      const attomid = await getAttomId(street, city, state, zip);
      
      if (attomid) {
        console.log(`✅ Found Attom ID: ${attomid}`);
        attomData = await getPropertyDetail(attomid);
        console.log(`✅ Successfully retrieved property details from Attom`);
        console.log(`   Attom data keys:`, Object.keys(attomData || {}));
        attomSuccessCount++;
      } else {
        console.warn(`⚠️ No Attom ID found for ${street}, ${city}, ${state}, ${zip}`);
        console.warn(`   This may indicate the property is not in Attom's database`);
      }
    } catch (err) {
      const errorMessage = err.message || String(err);
      attomErrorCount++;
      
      console.error(`❌ Attom lookup failed for ${street}, ${city}, ${state}, ${zip}`);
      console.error(`   Error type: ${err.constructor.name}`);
      console.error(`   Error message: ${errorMessage}`);
      
      // Categorize and handle different error types
      if (errorMessage.includes('Invalid Parameter')) {
        console.error(`   🔧 Fix: Check address format and components`);
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        console.error(`   ⏰ Rate limited - consider implementing exponential backoff`);
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        console.error(`   🔑 Authentication issue - check API credentials`);
      } else if (errorMessage.includes('timeout')) {
        console.error(`   ⏱️ Request timeout - Attom API may be slow`);
      } else {
        console.error(`   ❓ Unexpected error type: ${errorMessage}`);
      }
      
      console.info(`⏭️ Continuing without Attom data for this property`);
    }

    // Determine property source for better frontend display
    let propertySource = {
      name: 'Zillow',
      type: 'zillow',
      url: processedProperty.zpid ? `https://www.zillow.com/homedetails/${processedProperty.zpid}_zpid/` : 'https://www.zillow.com'
    };
    
    // Check for other potential sources based on data patterns
    if (processedProperty.mlsId || processedProperty.mls) {
      propertySource = {
        name: 'MLS',
        type: 'mls',
        url: 'https://www.har.com' // Default to HAR for Texas properties
      };
    }
    
    // Check if it's specifically from Texas HAR
    if (state === 'TX' || city === 'Houston' || city === 'Dallas' || city === 'Austin' || city === 'San Antonio') {
      propertySource.harEligible = true;
    }

    // Create final enriched property object
    const enrichedProperty = {
      ...processedProperty,
      fulladdress1: `${street}, ${city}, ${zip}`,
      address: { 
        oneLine: `${street}, ${city}, ${state} ${zip}`,
        street,
        city,
        state,
        zip
      },
      propertySource,
      attomData,
      dataQuality: attomData ? 'excellent' : (zip ? 'good' : 'partial')
    };
    
    console.log(`✅ Final enriched property:`);
    console.log(`   ID: ${enrichedProperty.id}`);
    console.log(`   Address: ${enrichedProperty.address.oneLine}`);
    console.log(`   Price: $${enrichedProperty.price?.toLocaleString() || 'N/A'}`);
    console.log(`   Beds/Baths: ${enrichedProperty.beds || 'N/A'}/${enrichedProperty.baths || 'N/A'}`);
    console.log(`   Image: ${enrichedProperty.zillowImage ? 'Present' : 'Missing'}`);
    console.log(`   Coordinates: ${enrichedProperty.location.latitude ? 'Present' : 'Missing'}`);
    console.log(`   Attom Data: ${enrichedProperty.attomData ? 'Present' : 'Missing'}`);
    console.log(`   Data Quality: ${enrichedProperty.dataQuality}`);

    enrichedListings.push(enrichedProperty);
  }
  
  // 🎯 Post-process filtering to ensure results match search criteria
  let filteredListings = enrichedListings;
  const originalCount = enrichedListings.length;
  
  // Filter by price
  if (max_price && max_price > 0) {
    filteredListings = filteredListings.filter(property => {
      const price = property.price;
      return !price || price <= max_price;
    });
    console.log(`💰 Price filter (≤$${max_price.toLocaleString()}): ${filteredListings.length}/${originalCount} properties remain`);
  }
  
  // Filter by exact bedrooms if specified
  if (exact_beds && exact_beds > 0) {
    filteredListings = filteredListings.filter(property => {
      const beds = property.beds;
      return beds && beds == exact_beds;
    });
    console.log(`🛏️ Exact bedroom filter (${exact_beds} beds): ${filteredListings.length}/${originalCount} properties remain`);
  } else {
    // Filter by bedroom range
    if (min_beds && min_beds > 0) {
      filteredListings = filteredListings.filter(property => {
        const beds = property.beds;
        return !beds || beds >= min_beds;
      });
      console.log(`🛏️ Min bedroom filter (≥${min_beds} beds): ${filteredListings.length}/${originalCount} properties remain`);
    }
    
    if (max_beds && max_beds > 0) {
      filteredListings = filteredListings.filter(property => {
        const beds = property.beds;
        return !beds || beds <= max_beds;
      });
      console.log(`🛏️ Max bedroom filter (≤${max_beds} beds): ${filteredListings.length}/${originalCount} properties remain`);
    }
  }
  
  console.log(`🎯 Final filtered results: ${filteredListings.length}/${originalCount} properties match criteria`);
  
  // Update enrichedListings to be the filtered version
  const enrichedListings_original = enrichedListings;
  enrichedListings = filteredListings;
  
  // 📊 Comprehensive data quality reporting
  console.log(`\n📊 DATA QUALITY REPORT`);
  console.log(`==========================================`);
  console.log(`Total Properties Processed: ${dataQualityStats.totalProcessed}`);
  console.log(`Addresses Successfully Parsed: ${dataQualityStats.addressParsed}/${dataQualityStats.totalProcessed} (${Math.round(dataQualityStats.addressParsed/dataQualityStats.totalProcessed*100)}%)`);
  console.log(`Properties with Images: ${dataQualityStats.hasImages}/${dataQualityStats.totalProcessed} (${Math.round(dataQualityStats.hasImages/dataQualityStats.totalProcessed*100)}%)`);
  console.log(`Properties with Prices: ${dataQualityStats.hasPrice}/${dataQualityStats.totalProcessed} (${Math.round(dataQualityStats.hasPrice/dataQualityStats.totalProcessed*100)}%)`);
  console.log(`Properties with Coordinates: ${dataQualityStats.hasCoordinates}/${dataQualityStats.totalProcessed} (${Math.round(dataQualityStats.hasCoordinates/dataQualityStats.totalProcessed*100)}%)`);
  console.log(`Properties with Bed/Bath Info: ${dataQualityStats.hasBedsAndBaths}/${dataQualityStats.totalProcessed} (${Math.round(dataQualityStats.hasBedsAndBaths/dataQualityStats.totalProcessed*100)}%)`);
  console.log(`Attom Enrichment: ${attomSuccessCount} successful, ${attomErrorCount} failed`);
  console.log(`==========================================`);
  
  // Identify and log data quality issues
  const qualityIssues = [];
  const excellentQuality = enrichedListings.filter(p => p.dataQuality === 'excellent').length;
  const goodQuality = enrichedListings.filter(p => p.dataQuality === 'good').length;
  const partialQuality = enrichedListings.filter(p => p.dataQuality === 'partial').length;
  const poorQuality = enrichedListings.filter(p => p.dataQuality === 'poor').length;
  
  console.log(`\n🏆 PROPERTY QUALITY BREAKDOWN:`);
  console.log(`Excellent (with Attom data): ${excellentQuality}`);
  console.log(`Good (complete Zillow data): ${goodQuality}`);
  console.log(`Partial (missing some fields): ${partialQuality}`);
  console.log(`Poor (major data missing): ${poorQuality}`);
  
  if (dataQualityStats.hasImages / dataQualityStats.totalProcessed < 0.5) {
    qualityIssues.push('More than 50% of properties are missing images');
  }
  if (dataQualityStats.addressParsed / dataQualityStats.totalProcessed < 0.8) {
    qualityIssues.push('More than 20% of addresses could not be parsed properly');
  }
  if (attomErrorCount > attomSuccessCount) {
    qualityIssues.push('Attom API calls are failing more often than succeeding');
  }
  
  if (qualityIssues.length > 0) {
    console.log(`\n⚠️ DATA QUALITY CONCERNS:`);
    qualityIssues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue}`);
    });
  }

  // 🎓 Optional school data
  const schoolData = { raw: "Deprecated API" };

  // 🧠 Generate enhanced buyer summary with data quality context
  let aiSummary = "";
  try {
    const summaryPrompt = {
      searchCriteria: parsedFilter,
      resultsFound: enrichedListings.length,
      dataQuality: {
        excellentQuality,
        goodQuality,
        partialQuality,
        poorQuality,
        totalProcessed: dataQualityStats.totalProcessed
      }
    };
    
    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [
        { 
          role: "system", 
          content: "You are a helpful real estate assistant. Summarize the search results and buyer preferences. Mention data quality if there are any issues. Keep it conversational and helpful." 
        },
        { role: "user", content: JSON.stringify(summaryPrompt) },
      ],
    });

    aiSummary = summaryResponse.choices?.[0]?.message?.content || "Here are your search results.";
    console.log(`\n🤖 Generated AI Summary: ${aiSummary}`);
  } catch (err) {
    console.warn("⚠️ Summary generation failed:", err.message);
    aiSummary = `Found ${enrichedListings.length} properties matching your criteria in ${normalizedCity}.`;
  }

  // 💾 Enhanced response payload with metadata
  const responsePayload = {
    filters: parsedFilter,
    listings: enrichedListings,
    attom_data: null,
    schools: schoolData,
    ai_summary: aiSummary,
    metadata: {
      searchQuery: query,
      normalizedCity,
      totalFound: rawListings.length,
      totalProcessed: dataQualityStats.totalProcessed,
      dataQuality: {
        stats: dataQualityStats,
        breakdown: {
          excellent: excellentQuality,
          good: goodQuality,
          partial: partialQuality,
          poor: poorQuality
        },
        issues: qualityIssues
      },
      enrichmentStats: {
        attomSuccess: attomSuccessCount,
        attomErrors: attomErrorCount,
        attomSuccessRate: attomSuccessCount / (attomSuccessCount + attomErrorCount) * 100
      },
      timestamp: new Date().toISOString()
    }
  };

  console.log(`\n💾 Caching response payload with ${enrichedListings.length} properties`);
  await setAsync(searchCacheKey, responsePayload, 1800); // Cache for 30 mins

  console.log(`\n✅ Search completed successfully. Returning ${enrichedListings.length} properties to client.`);
  res.status(200).json({ fromCache: false, ...responsePayload });
});

module.exports = router;
