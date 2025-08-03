const express = require("express");
const { OpenAI } = require("openai");
const { fetchZillowPhotos } = require("../../../services/fetchZillow");
const { getPropertyInfoFromCoreLogic } = require("../../../utils/coreLogicClientV2");
const { CoreLogicSuperClient } = require("../../../utils/coreLogicSuperClient");
const { getAsync, setAsync } = require("../../../utils/redisClient");

const Property = require("../../../models/Property");
const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL_ID = "ft:gpt-3.5-turbo-1106:fractionax:fractionax-v3:BiLkkGbl";

// Utility
const toTitleCase = (str) =>
  str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Initialize Super Client
const superClient = new CoreLogicSuperClient();

// 🧹 Reset chat session memory
router.post("/reset", (req, res) => {
  req.session.chat_history = [];
  res.status(200).json({ message: "🧠 Session memory cleared." });
});


// 🧠 POST /api/ai/pipeline - Cached version of AI search (saves structured result in Redis)
// This is a cached version of the AI search. It saves the structured result in Redis to avoid repeating the same API calls for repeated searches.
router.post("/pipeline", async (req, res) => {
  const { prompt, limit = 30 } = req.body;
  const sessionId = req.sessionID;

  if (!prompt) return res.status(400).json({ error: "❌ Missing prompt." });

  try {
    const chatHistory = req.body.chat_history || [];

    const messages = [
      {
        role: "system",
        content: `You are a smart real estate assistant. Always return only valid structured JSON like:
{
  "address1": "123 Main St",
  "postalcode": "77002",
  ...
}`
      },
      ...chatHistory,
      { role: "user", content: prompt }
    ];

    const completion = await openai.chat.completions.create({
      model: MODEL_ID,
      messages,
      temperature: 0.3
    });

    const assistantReply = completion.choices[0].message.content;
    let structuredData;

    try {
      structuredData = JSON.parse(assistantReply);
    } catch (err) {
      return res.status(422).json({ error: "Invalid JSON from model.", raw_output: assistantReply });
    }

    const { address1, city, state, postalcode, lat, lng, latitude, longitude } = structuredData;
    
    // Handle different coordinate field names from AI model
    const finalLat = lat || latitude;
    const finalLng = lng || longitude;

    if (!address1 || !postalcode || !finalLat || !finalLng) {
      return res.status(422).json({ error: "❌ Missing address1, postalcode, lat/latitude, or lng/longitude", model_output: structuredData });
    }

    // 💾 Save updated chat history
    req.session.chat_history = [
      ...chatHistory,
      { role: "user", content: prompt },
      { role: "assistant", content: assistantReply }
    ];

    // 📍 Enrich via CoreLogic + Zillow
    const [coreData, zillowImages] = await Promise.all([
      getPropertyInfoFromCoreLogic({ address1, city, state, postalcode, lat: finalLat, lng: finalLng }),
      fetchZillowPhotos(address1, postalcode)
    ]);

    const enrichedData = {
      corelogic: {
        parcelId: coreData.parcelId,
        structure: coreData.structure,
        valuation: coreData.valuation
      },
      zillowImage: zillowImages?.[0]?.imgSrc || null
    };

    res.status(200).json({
      session_id: sessionId,
      input_prompt: prompt,
      parsed_intent: structuredData,
      enriched_data: enrichedData
    });

  } catch (err) {
    console.error("❌ AI Pipeline Error:", err.response?.data || err.message);
    res.status(500).json({ error: "AI pipeline failed", details: err.message });
  }
});

// 🚀 POST /api/ai/comprehensive - Full property intelligence using Super Client
router.post("/comprehensive", async (req, res) => {
  const { prompt, includeClimateRisk = false, includePropensity = true } = req.body;
  const sessionId = req.sessionID;

  console.log('🚀 COMPREHENSIVE ENDPOINT CALLED');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  console.log('🆔 Session ID:', sessionId);

  if (!prompt) {
    console.error('❌ No prompt provided');
    return res.status(400).json({ error: "❌ Missing prompt." });
  }

  try {
    const chatHistory = req.body.chat_history || [];
    console.log('💬 Chat history length:', chatHistory.length);

    // Parse user intent with AI
    const messages = [
      {
        role: "system",
        content: `You are a smart real estate assistant. Always return only valid structured JSON with address details:
{
  "address1": "123 Main St",
  "city": "Houston", 
  "state": "TX",
  "postalcode": "77002"
}`
      },
      ...chatHistory,
      { role: "user", content: prompt }
    ];

    console.log('🤖 Calling OpenAI for intent parsing...');
    console.log('📝 Messages to send:', JSON.stringify(messages, null, 2));
    
    const completion = await openai.chat.completions.create({
      model: MODEL_ID,
      messages,
      temperature: 0.3
    });

    const assistantReply = completion.choices[0].message.content;
    console.log('🤖 OpenAI Response:', assistantReply);
    
    let structuredData;

    try {
      structuredData = JSON.parse(assistantReply);
      console.log('✅ Parsed structured data:', JSON.stringify(structuredData, null, 2));
    } catch (err) {
      console.error('❌ JSON Parse Error:', err.message);
      console.error('🔍 Raw OpenAI output:', assistantReply);
      return res.status(422).json({ error: "Invalid JSON from model.", raw_output: assistantReply });
    }

    const { address1, city, state, postalcode } = structuredData;
    console.log('🏠 Extracted address components:');
    console.log('  - address1:', address1);
    console.log('  - city:', city);
    console.log('  - state:', state);
    console.log('  - postalcode:', postalcode);

    if (!address1 || !city || !state) {
      console.error('❌ Missing required address components');
      return res.status(422).json({ 
        error: "❌ Missing required address components (address1, city, state)", 
        model_output: structuredData 
      });
    }

    console.log(`🔍 Starting comprehensive property search for: ${address1}, ${city}, ${state}`);

    // Use Super Client for comprehensive search and enrichment
    console.log('🌐 Calling superClient.searchAndEnrich...');
    let comprehensiveResult;
    try {
      comprehensiveResult = await superClient.searchAndEnrich({
        streetAddress: address1,
        city,
        state,
        zipCode: postalcode
      });
      console.log('✅ SuperClient searchAndEnrich completed successfully');
      console.log('📋 Comprehensive result keys:', Object.keys(comprehensiveResult));
      console.log('🆔 CLIP ID found:', comprehensiveResult.clip);
    } catch (searchError) {
      console.error('❌ SuperClient searchAndEnrich failed:');
      console.error('  - Error message:', searchError.message);
      console.error('  - Error status:', searchError.response?.status);
      console.error('  - Error data:', JSON.stringify(searchError.response?.data, null, 2));
      
      // Check if it's a "property not found" error
      if (searchError.response?.status === 404) {
        const errorData = searchError.response?.data;
        if (errorData?.messages?.some(msg => msg.message?.includes('Clip not found'))) {
          return res.status(404).json({
            error: "Property not found",
            details: `The address "${address1}, ${city}, ${state}" was not found in our property database. Please verify the address is correct and try again.`,
            parsed_address: structuredData,
            suggestions: [
              "Double-check the street address, city, and state",
              "Try using a different format (e.g., '1234 Main St' instead of '1234 Main Street')",
              "Ensure the property exists and is in our coverage area"
            ]
          });
        }
      }
      
      throw searchError; // Re-throw other errors to be caught by outer try-catch
    }

    // Get Zillow images in parallel
    console.log('🏡 Fetching Zillow images...');
    let zillowImages;
    try {
      zillowImages = await fetchZillowPhotos(address1, postalcode);
      console.log('✅ Zillow images fetched:', zillowImages?.length || 0, 'images');
    } catch (zillowError) {
      console.warn('⚠️ Zillow images fetch failed:', zillowError.message);
      zillowImages = [];
    }

    // Optional: Get climate risk data if requested
    let climateRisk = null;
    if (includeClimateRisk && comprehensiveResult.clip) {
      console.log('🌍 Fetching climate risk analytics...');
      try {
        climateRisk = await superClient.getClimateRiskAnalytics(comprehensiveResult.clip);
        console.log('✅ Climate risk analytics retrieved');
      } catch (error) {
        console.log('⚠️ Climate risk analytics not available:', error.message);
      }
    } else {
      console.log('⏭️ Skipping climate risk (not requested or no CLIP)');
    }

    // Cache this comprehensive result in Redis for 1 hour
    const cacheKey = `comprehensive:${address1}:${city}:${state}:${postalcode}`;
    console.log('💾 Caching result with key:', cacheKey);
    try {
      await setAsync(cacheKey, JSON.stringify({
        ...comprehensiveResult,
        climateRisk,
        zillowImages,
        timestamp: new Date().toISOString()
      }), 'EX', 3600);
      console.log('✅ Comprehensive result cached successfully');
    } catch (cacheError) {
      console.warn('⚠️ Cache warning:', cacheError.message);
    }

    // Update chat history
    req.session.chat_history = [
      ...chatHistory,
      { role: "user", content: prompt },
      { role: "assistant", content: assistantReply }
    ];
    console.log('💬 Chat history updated, new length:', req.session.chat_history.length);

    // Structure comprehensive response
    const response = {
      session_id: sessionId,
      input_prompt: prompt,
      parsed_intent: structuredData,
      clip: comprehensiveResult.clip,
      search_result: comprehensiveResult.searchResult,
      property_intelligence: comprehensiveResult.intelligence,
      zillow_images: zillowImages,
      climate_risk: climateRisk,
      processing_summary: {
        successful_calls: comprehensiveResult.intelligence ? Object.keys(comprehensiveResult.intelligence.data || {}).length : 0,
        error_count: comprehensiveResult.intelligence?.errors ? Object.keys(comprehensiveResult.intelligence.errors).length : 0,
        timestamp: comprehensiveResult.timestamp
      }
    };

    console.log('✅ Comprehensive endpoint completed successfully');
    console.log('📤 Response summary:');
    console.log('  - CLIP:', response.clip);
    console.log('  - Successful calls:', response.processing_summary.successful_calls);
    console.log('  - Error count:', response.processing_summary.error_count);
    console.log('  - Zillow images:', response.zillow_images?.length || 0);
    
    res.status(200).json(response);

  } catch (err) {
    console.error('❌ COMPREHENSIVE PIPELINE ERROR:');
    console.error('  - Error message:', err.message);
    console.error('  - Error name:', err.name);
    console.error('  - Error code:', err.code);
    console.error('  - Response status:', err.response?.status);
    console.error('  - Response headers:', err.response?.headers);
    console.error('  - Response data:', JSON.stringify(err.response?.data, null, 2));
    console.error('  - Full stack:', err.stack);
    
    res.status(500).json({ 
      error: "Comprehensive pipeline failed", 
      details: err.message,
      error_code: err.code,
      response_status: err.response?.status,
      response_data: err.response?.data,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// 🏠 GET /api/ai/property/:clip/details - Get detailed property info by CLIP ID
router.get("/property/:clip/details", async (req, res) => {
  const { clip } = req.params;
  const { includeClimateRisk = false } = req.query;

  if (!clip) {
    return res.status(400).json({ error: "❌ Missing CLIP ID" });
  }

  try {
    console.log(`🏠 Getting property details for CLIP: ${clip}`);
    
    // Check cache first
    const cacheKey = `property-details:${clip}:${includeClimateRisk}`;
    const cached = await getAsync(cacheKey);
    
    if (cached) {
      console.log('💾 Serving cached property details');
      return res.json(JSON.parse(cached));
    }

    // Get comprehensive property intelligence
    const intelligence = await superClient.getComprehensivePropertyIntelligence(clip);

    let climateRisk = null;
    if (includeClimateRisk === 'true') {
      try {
        climateRisk = await superClient.getClimateRiskAnalytics(clip);
        console.log('🌍 Climate risk analytics retrieved');
      } catch (error) {
        console.log('⚠️ Climate risk analytics not available:', error.message);
      }
    }

    const result = {
      clip,
      intelligence,
      climate_risk: climateRisk,
      timestamp: new Date().toISOString()
    };

    // Cache for 30 minutes
    await setAsync(cacheKey, JSON.stringify(result), 'EX', 1800);

    res.json(result);

  } catch (err) {
    console.error("❌ Property Details Error:", err.message);
    res.status(500).json({ 
      error: "Failed to get property details", 
      details: err.message 
    });
  }
});

// 📊 GET /api/ai/property/:clip/comparables - Get property comparables
router.get("/property/:clip/comparables", async (req, res) => {
  const { clip } = req.params;
  const { 
    maxComps = 10, 
    searchDistance = 0.5, 
    monthsBack = 9, 
    sortBy = 'Distance' 
  } = req.query;

  if (!clip) {
    return res.status(400).json({ error: "❌ Missing CLIP ID" });
  }

  try {
    console.log(`📊 Getting comparables for CLIP: ${clip}`);
    
    const options = {
      maxComps: parseInt(maxComps),
      searchDistance: parseFloat(searchDistance),
      monthsBack: parseInt(monthsBack),
      sortBy
    };

    const comparables = await superClient.getComparables(clip, options);

    res.json({
      clip,
      search_options: options,
      comparables,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("❌ Comparables Error:", err.message);
    res.status(500).json({ 
      error: "Failed to get comparables", 
      details: err.message 
    });
  }
});

// 🎯 GET /api/ai/property/:clip/propensity - Get propensity scores
router.get("/property/:clip/propensity", async (req, res) => {
  const { clip } = req.params;

  if (!clip) {
    return res.status(400).json({ error: "❌ Missing CLIP ID" });
  }

  try {
    console.log(`🎯 Getting propensity scores for CLIP: ${clip}`);
    
    // Get all propensity scores in parallel
    const [salePropensity, rentPropensity, refinancePropensity, helocPropensity] = await Promise.allSettled([
      superClient.getSalePropensity(clip),
      superClient.getRentPropensity(clip),
      superClient.getRefinancePropensity(clip),
      superClient.getHelocPropensity(clip)
    ]);

    const propensityScores = {
      sale: salePropensity.status === 'fulfilled' ? salePropensity.value : { error: salePropensity.reason?.message },
      rent: rentPropensity.status === 'fulfilled' ? rentPropensity.value : { error: rentPropensity.reason?.message },
      refinance: refinancePropensity.status === 'fulfilled' ? refinancePropensity.value : { error: refinancePropensity.reason?.message },
      heloc: helocPropensity.status === 'fulfilled' ? helocPropensity.value : { error: helocPropensity.reason?.message }
    };

    res.json({
      clip,
      propensity_scores: propensityScores,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("❌ Propensity Scores Error:", err.message);
    res.status(500).json({ 
      error: "Failed to get propensity scores", 
      details: err.message 
    });
  }
});

// ⌨️ GET /api/ai/typeahead - Address autocomplete
router.get("/typeahead", async (req, res) => {
  const { input } = req.query;

  if (!input || input.length < 3) {
    return res.status(400).json({ error: "❌ Input must be at least 3 characters" });
  }

  try {
    console.log(`⌨️ Getting typeahead suggestions for: ${input}`);
    
    const suggestions = await superClient.getAddressTypeAhead(input);

    res.json({
      input,
      suggestions,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("❌ TypeAhead Error:", err.message);
    res.status(500).json({ 
      error: "Failed to get address suggestions", 
      details: err.message 
    });
  }
});

module.exports = router;
