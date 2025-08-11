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

  // 📍 Check if this is a specific address search (from Google Places)
  // Address searches should return exactly one property, not a city-wide search
  const isAddressSearch = query.includes(',') && 
    (query.match(/\d/) && (query.includes('St') || query.includes('Ave') || query.includes('Dr') || 
     query.includes('Rd') || query.includes('Ct') || query.includes('Ln') || query.includes('Way') ||
     query.includes('Street') || query.includes('Avenue') || query.includes('Drive') || 
     query.includes('Road') || query.includes('Court') || query.includes('Lane')));

  if (isAddressSearch) {
    console.log('🏠 Detected specific address search:', query);
    
    // Extract just the address from natural language queries
    let cleanedQuery = query;
    // Remove common natural language prefixes
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
    
    console.log('🧹 Cleaned address query:', cleanedQuery);
    
    // Parse the address components
    const addressParts = cleanedQuery.split(',').map(s => s.trim());
    if (addressParts.length >= 3) {
      const street = addressParts[0];
      const city = addressParts[1];
      const stateZip = addressParts[2];
      
      console.log('📍 Address components:', { street, city, stateZip });
      
      // For address searches, use CoreLogic to get the specific property
      const { CoreLogicSuperClient } = require('../../../utils/coreLogicSuperClient');
      const superClient = new CoreLogicSuperClient();
      
      try {
        const specificProperty = await superClient.searchAndEnrich({
          streetAddress: street,
          city: city,
          state: stateZip.split(' ')[0],
          zipCode: stateZip.split(' ')[1]
        });
        
        if (specificProperty) {
          console.log('✅ Found specific property via CoreLogic');
          console.log('🔍 CoreLogic response structure:', Object.keys(specificProperty));
          console.log('📍 SearchResult:', specificProperty.searchResult?.items?.[0]);
          
          // Extract property data from CoreLogic response
          const property = specificProperty.searchResult?.items?.[0] || {};
          const intelligence = specificProperty.intelligence?.data || {};
          
          // Get coordinates from the search result or site location
          let latitude = null;
          let longitude = null;
          
          // Try to get coordinates from multiple possible locations
          if (property.latitude && property.longitude) {
            latitude = parseFloat(property.latitude);
            longitude = parseFloat(property.longitude);
            console.log('📍 Using coordinates from search result:', { latitude, longitude });
          } else if (intelligence.siteLocation?.coordinates) {
            latitude = parseFloat(intelligence.siteLocation.coordinates.latitude);
            longitude = parseFloat(intelligence.siteLocation.coordinates.longitude);
            console.log('📍 Using coordinates from site location:', { latitude, longitude });
          } else if (intelligence.propertyDetail?.site?.location) {
            const loc = intelligence.propertyDetail.site.location;
            latitude = parseFloat(loc.latitude);
            longitude = parseFloat(loc.longitude);
            console.log('📍 Using coordinates from property detail:', { latitude, longitude });
          } else {
            console.warn('⚠️ No coordinates found in CoreLogic response');
          }
          
          // Try to fetch Zillow images for the property
          let imgSrc = null;
          let zpid = null;
          
          try {
            console.log('🖼️ Attempting to fetch Zillow images for address search...');
            const { fetchZillowPhotos } = require('../../../services/fetchZillow');
            
            // Use the parsed address components for better matching
            const fullAddressForImage = `${street}, ${city}, ${stateZip}`;
            console.log(`📍 Using full address for image search: ${fullAddressForImage}`);
            
            // Call fetchZillowPhotos with the full address
            const zillowImages = await fetchZillowPhotos(fullAddressForImage, null);
              
            if (zillowImages && zillowImages.length > 0) {
              imgSrc = zillowImages[0].imgSrc;
              zpid = zillowImages[0].zpid;
              console.log('✅ Successfully fetched Zillow image for address search');
            } else {
              console.log('⚠️ No Zillow images found for address search');
            }
          } catch (imageError) {
            console.warn('⚠️ Failed to fetch Zillow images for address search:', imageError.message);
          }
          
          const responseData = {
            fromCache: false,
            filters: { address: query },
            listings: [{
              id: property.clip || zpid || 'single_property',
              address: { oneLine: query },
              price: intelligence.taxAssessments?.totalValue || intelligence.propertyDetail?.assessedValue || null,
              beds: intelligence.buildings?.bedrooms || property.bedrooms || null,
              baths: intelligence.buildings?.bathrooms || property.bathrooms || null,
              sqft: intelligence.buildings?.squareFeet || property.squareFeet || null,
              location: {
                latitude: latitude,
                longitude: longitude
              },
              imgSrc: imgSrc,
              zpid: zpid,
              dataSource: 'corelogic',
              dataQuality: 'excellent'
            }],
            metadata: {
              searchQuery: query,
              searchType: 'address',
              totalFound: 1,
              timestamp: new Date().toISOString()
            },
            ai_summary: `Found the specific property at ${query}. This is a detailed view of this exact address.`
          };
          
          console.log('🚀 FINAL RESPONSE DATA:');
          console.log('📄 Full response:', JSON.stringify(responseData, null, 2));
          console.log('🏠 Listing data:', JSON.stringify(responseData.listings[0], null, 2));
          
          return res.status(200).json(responseData);
        }
      } catch (error) {
        console.warn('⚠️ CoreLogic address search failed:', error.message);
        console.log('🔄 Falling back to Zillow for address search...');

        try {
          console.log('🔍 Zillow fallback: Trying multiple search strategies...');
          
          // Strategy 1: Search by full address
          let zillowParams = new URLSearchParams({ location: cleanedQuery });
          let zillowUrl = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${zillowParams.toString()}`;
          console.log('🎆 Strategy 1 - Full address search:', zillowUrl);
          
          let zillowResponse = await fetch(zillowUrl, {
            method: "GET",
            headers: {
              "x-rapidapi-key": process.env.RAPIDAPI_KEY,
              "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
            },
          });

          if (!zillowResponse.ok) {
            throw new Error(`Zillow API returned status ${zillowResponse.status}`);
          }

          let zillowData = await zillowResponse.json();
          console.log('📊 Strategy 1 results:', { totalFound: zillowData.props?.length || 0 });
          
          // Strategy 2: If no results, try searching by city only to get nearby properties
          if (!zillowData.props || zillowData.props.length === 0) {
            console.log('🎆 Strategy 2 - City-based search for nearby properties...');
            zillowParams = new URLSearchParams({ 
              location: `${city}, ${stateZip}`,
              status_type: "ForSale"
            });
            zillowUrl = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${zillowParams.toString()}`;
            console.log('🎆 Strategy 2 URL:', zillowUrl);
            
            zillowResponse = await fetch(zillowUrl, {
              method: "GET",
              headers: {
                "x-rapidapi-key": process.env.RAPIDAPI_KEY,
                "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
              },
            });
            
            if (zillowResponse.ok) {
              zillowData = await zillowResponse.json();
              console.log('📊 Strategy 2 results:', { totalFound: zillowData.props?.length || 0 });
            }
          }
          
          if (zillowData.props && zillowData.props.length > 0) {
            console.log('✅ Found property via Zillow fallback');
            console.log('📄 Raw Zillow property data:', JSON.stringify(zillowData.props[0], null, 2));
            
            const property = zillowData.props[0];

            const listing = {
              id: property.zpid || 'zillow_property',
              address: { oneLine: property.address || query },
              price: property.price || null,
              beds: property.bedrooms || null,
              baths: property.bathrooms || null,
              sqft: property.livingArea || null,
              location: {
                latitude: property.latitude || null,
                longitude: property.longitude || null
              },
              imgSrc: property.imgSrc || null,
              zpid: property.zpid || null,
              dataSource: 'zillow_fallback',
              dataQuality: 'good'
            };
            
            console.log('🚀 Final Zillow fallback listing:', JSON.stringify(listing, null, 2));

            return res.status(200).json({
              fromCache: false,
              filters: { address: query },
              listings: [listing],
              metadata: {
                searchQuery: query,
                searchType: 'address',
                totalFound: 1,
                timestamp: new Date().toISOString()
              },
              ai_summary: `Found property information using Zillow as a fallback for ${query}.`
            });
          } else {
            console.log('🚫 All Zillow search strategies failed');
            throw new Error('No properties found on Zillow for this address.');
          }
        } catch (zillowError) {
          console.warn('⚠️ Zillow fallback also failed:', zillowError.message);
          // Fallback to mock data if both CoreLogic and Zillow fail
          return res.status(200).json({
            fromCache: false,
            filters: { address: query },
            listings: [{
              id: 'address_search_result',
              address: { oneLine: query },
              price: null,
              beds: null,
              baths: null,
              sqft: null,
              location: { latitude: null, longitude: null },
              imgSrc: null,
              dataSource: 'address_search',
              dataQuality: 'partial',
              note: 'Specific address data unavailable - property may not be listed or in our database'
            }],
            metadata: {
              searchQuery: query,
              searchType: 'address',
              totalFound: 1,
              timestamp: new Date().toISOString()
            },
            ai_summary: `This appears to be a search for the specific address: ${query}. However, detailed property information is not currently available in our database. This could mean the property is not currently for sale or not in our data sources.`
          });
        }
      }
    }
  }

  // 🔍 Ask GPT to extract structured filters (for non-address searches)
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

  // 🏆 OPTIMIZED APPROACH: CoreLogic First for Property Intelligence, then Zillow for Images
  // This saves costs by getting reliable property data first, then enhancing with visual content
  
  // 🏠 First: Get comprehensive property search from CoreLogic (CACHED)
  console.log('🎯 Phase 1: Getting comprehensive property intelligence from CoreLogic...');
  const { coreLogicCache } = require('../../../utils/coreLogicCacheWrapper');
  
  let coreLogicProperties = [];
  const coreLogicCacheKey = `corelogic:search:comprehensive:${normalizedCity}:${max_price}:${min_beds}:${property_type}`;
  
  // Check cache for CoreLogic comprehensive search
  const cachedCoreLogic = await getAsync(coreLogicCacheKey);
  if (cachedCoreLogic) {
    console.log(`💰 CoreLogic cache hit - saved expensive API calls!`);
    try {
      coreLogicProperties = JSON.parse(cachedCoreLogic);
    } catch (parseError) {
      console.warn(`⚠️ Failed to parse cached CoreLogic data, fetching fresh:`, parseError.message);
      const { deleteAsync } = require("../../../utils/redisClient");
      await deleteAsync(coreLogicCacheKey);
    }
  }
  
  // If no cached data, use CoreLogic SuperClient to search for properties
  if (!coreLogicProperties || coreLogicProperties.length === 0) {
    console.log('🔥 CoreLogic cache miss - making API call...');
    const { CoreLogicSuperClient } = require('../../../utils/coreLogicSuperClient');
    const superClient = new CoreLogicSuperClient();
    
    try {
      // Use CoreLogic's comprehensive property search
      const searchResult = await coreLogicCache.getCachedPropertySearch({
        city: normalizedCity,
        state: 'TX', // Default to TX since most searches are Houston-based
        maxPrice: max_price,
        minBedrooms: min_beds,
        propertyType: property_type === 'house' ? 'SFR' : property_type.toUpperCase(),
        limit: 20 // Get top 20 properties from CoreLogic
      });
      
      coreLogicProperties = searchResult?.properties || [];
      
      // Cache the results for 30 minutes (property searches change moderately)
      if (coreLogicProperties.length > 0) {
        await setAsync(coreLogicCacheKey, coreLogicProperties, 1800);
        console.log(`📝 Cached ${coreLogicProperties.length} CoreLogic properties`);
      }
      
    } catch (coreLogicError) {
      console.warn('⚠️ CoreLogic search failed, falling back to Zillow-first approach:', coreLogicError.message);
      // Fallback to original Zillow-first approach if CoreLogic fails
      coreLogicProperties = [];
    }
  }
  
  let rawListings = [];
  
  // If we got properties from CoreLogic, use them as the primary source
  if (coreLogicProperties.length > 0) {
    console.log(`✅ Using ${coreLogicProperties.length} properties from CoreLogic as primary data source`);
    rawListings = coreLogicProperties.map(prop => ({
      // Map CoreLogic data to Zillow-like format for compatibility
      address: prop.address?.oneLine || `${prop.address?.street}, ${prop.address?.city}, ${prop.address?.state}`,
      price: prop.valuation?.currentValue || prop.assessedValue || prop.listPrice,
      bedrooms: prop.structure?.bedrooms || prop.beds,
      bathrooms: prop.structure?.bathrooms || prop.baths,
      latitude: prop.location?.latitude,
      longitude: prop.location?.longitude,
      sqft: prop.structure?.squareFeet || prop.structure?.livingArea,
      yearBuilt: prop.structure?.yearBuilt,
      propertyType: prop.structure?.propertyType,
      zpid: null, // Will be populated when we fetch Zillow images
      imgSrc: null, // Will be populated from Zillow
      coreLogicData: prop, // Keep full CoreLogic data for enrichment
      dataSource: 'corelogic'
    }));
  } else {
    // Fallback: Use Zillow search if CoreLogic didn't return results
    console.log('📋 Falling back to Zillow search as CoreLogic returned no results');
    
    const zillowParams = new URLSearchParams({
      location: normalizedCity,
      priceMax: max_price,
      bedsMin: min_beds,
      home_type: property_type,
      status_type: "ForSale",
    });

    const zillowCacheKey = `zillow:search:${normalizedCity}:${max_price}:${min_beds}:${property_type}`;
    let zillowData;
    
    const cachedZillow = await getAsync(zillowCacheKey);
    if (cachedZillow) {
      console.log(`📥 Cache hit for Zillow search: ${normalizedCity}`);
      try {
        zillowData = JSON.parse(cachedZillow);
      } catch (parseError) {
        console.warn(`⚠️ Failed to parse cached Zillow data, fetching fresh data:`, parseError.message);
        const { deleteAsync } = require("../../../utils/redisClient");
        await deleteAsync(zillowCacheKey);
      }
    }
    
    if (!zillowData) {
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
          return res.status(502).json({ error: "Both CoreLogic and Zillow searches failed", details: text });
        }

        zillowData = await zillowResponse.json();
        await setAsync(zillowCacheKey, zillowData, 900);
        console.log(`📝 Cached Zillow search results for: ${normalizedCity}`);
        
      } catch (err) {
        return res.status(502).json({ error: "Both CoreLogic and Zillow APIs unreachable", details: err.message });
      }
    }

    rawListings = (zillowData.props || []).map(prop => ({ 
      ...prop, 
      dataSource: 'zillow' 
    }));
  }
  
  console.log(`📦 Found ${rawListings.length} listings (${rawListings[0]?.dataSource || 'unknown'} source)`);

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
  
  console.log(`📊 Phase 2: Starting to process ${rawListings.length} listings and enhance with Zillow images`);
  
  // 🖼️ If we have CoreLogic properties, enhance them with Zillow images
  if (rawListings.length > 0 && rawListings[0]?.dataSource === 'corelogic') {
    console.log('🎨 Phase 2a: Enhancing CoreLogic properties with Zillow images...');
    const { fetchZillowPhotos } = require('../../../services/fetchZillow');
    
    // Process properties to get Zillow images
    for (const [index, property] of rawListings.slice(0, 5).entries()) {
      try {
        if (property.address && property.coreLogicData?.address?.zip) {
          console.log(`🖼️ Fetching Zillow images for: ${property.address}`);
          const zillowImages = await fetchZillowPhotos(
            property.coreLogicData.address.street || property.address, 
            property.coreLogicData.address.zip
          );
          
          if (zillowImages && zillowImages.length > 0) {
            property.imgSrc = zillowImages[0].imgSrc;
            property.zpid = zillowImages[0].zpid;
            console.log(`✅ Enhanced property ${index + 1} with Zillow image`);
          } else {
            console.log(`⚠️ No Zillow images found for property ${index + 1}`);
          }
        }
      } catch (imageError) {
        console.warn(`⚠️ Failed to fetch Zillow images for property ${index + 1}:`, imageError.message);
      }
      
      // Add small delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('✅ Phase 2a completed: CoreLogic properties enhanced with Zillow images');
  }
  
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
