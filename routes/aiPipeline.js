const express = require("express");
const { OpenAI } = require("openai");
const { fetchMultipleProperties } = require("../utils/attom");
const { fetchZillowPhotos } = require('../utils/fetchZillowPhotos');


const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL_ID = "ft:gpt-3.5-turbo-1106:fractionax:fractionax-v3:BiLkkGbl";

router.post("/reset", (req, res) => {
  req.session.chat_history = [];
  res.status(200).json({ message: "🧠 Session memory cleared." });
  
});

router.post("/", async (req, res) => {
  const { prompt, limit = 30 } = req.body;
  const sessionId = req.sessionID;


  if (!prompt) {
    return res.status(400).json({ error: "❌ Missing prompt." });
  }

  try {
    const chatHistory = req.session.chat_history || [];

    const messages = [
      {
        role: "system",
        content: `You are a smart real estate assistant. Always return only valid structured JSON like:
{
  "address": "123 Main St",
  "zip_code": "77002",
  ...
}
If the user query is vague (e.g. "Downtown condos"), infer and include a valid US address and zip code.`
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
      console.log("🤖 Parsed Intent:", structuredData);
    } catch (err) {
      console.error("❌ Failed to parse assistantReply:", assistantReply);
      return res.status(422).json({
        error: "Model returned invalid JSON.",
        raw_output: assistantReply
      });
    }

    // Fallbacks
    if (!structuredData.address && structuredData.location) {
      structuredData.address = structuredData.location;
    }
    if (!structuredData.zip_code) {
      structuredData.zip_code = "00000";
    }
    if (!structuredData.address || !structuredData.zip_code) {
      return res.status(422).json({
        error: "❌ Model returned incomplete data (missing address or zip_code)",
        model_output: structuredData
      });
    }

    req.session.chat_history = [
      ...chatHistory,
      { role: "user", content: prompt },
      { role: "assistant", content: assistantReply }
    ];

    const attomParams = {
      zip_code: structuredData.zip_code,
      property_type: structuredData.property_type || "sfr",
      max_price: structuredData.price,
      min_beds: structuredData.min_beds || 1,
      sort: "salestransdate",
      limit: limit 

    };

    console.log("📤 Final Attom Params to Snapshot:", attomParams);

    let attomResponse = { property: [] };

    try {
      attomResponse = await fetchMultipleProperties(attomParams);
      console.log("🏘️ Attom Raw Response:", JSON.stringify(attomResponse, null, 2));
    } catch (err) {
      console.error("❌ Failed to fetch from Attom:", err.message);
    }

    console.log("🏠 Listings Found:", attomResponse?.property?.length || 0);
    if (!attomResponse.property || attomResponse.property.length === 0) {
      console.warn("⚠️ No Attom listings found with the given filters.");
    }

    // ✅ Zillow Enrichment
    let enrichedListings = attomResponse.property || [];

if (enrichedListings.length) {
  console.log("🖼 Enriching listings with Zillow images...");
console.log("📦 Total listings to enrich:", enrichedListings.length);

const imageMap = new Map();

for (const listing of enrichedListings) {
  const fullAddress = listing.address?.oneLine;
  const zip = listing.address?.postal1;

  if (!fullAddress || !zip) continue;

  console.log("📬 Fetching Zillow images for:", fullAddress);

  try {
    const zillowImages = await fetchZillowPhotos(listing.address.line1, zip);

    if (zillowImages.length) {
      console.log(`📸 Got ${zillowImages.length} images for ${fullAddress}`);
      const normalized = fullAddress.replace(/\s+/g, '').toLowerCase();
      imageMap.set(normalized, zillowImages[0].imgSrc); // grab first image
    } else {
      console.log(`❌ No images found for ${fullAddress}`);
    }
  } catch (err) {
    console.error(`❌ Failed fetching Zillow images for ${fullAddress}:`, err.message);
  }
}

enrichedListings = enrichedListings.map((listing, index) => {
  const oneLine = listing.address?.oneLine || "";
  const normalized = oneLine.replace(/\s+/g, '').toLowerCase();
  const image = imageMap.get(normalized) || null;

  console.log(`🏠 Listing #${index + 1} Address: ${oneLine}`);
  console.log(`🔍 Normalized Address: ${normalized}`);
  console.log(`📸 Matched Image: ${image ? "✅ Found" : "❌ No match found"}`);

  return { ...listing, image };
});

}

    else {
      console.warn("⚠️ No listings found in Attom response.");
    }

    console.log("✅ Returning enriched listings to frontend.");
    console.log("📤 Sample Enriched Listing:", enrichedListings[0]);

    return res.status(200).json({
      session_id: sessionId,
      input_prompt: prompt,
      parsed_intent: structuredData,
      property_data: enrichedListings
    });


  } catch (err) {
    console.error("❌ AI Pipeline Error:", err.response?.data || err.message);
    return res.status(500).json({
      error: "AI pipeline failed",
      details: err.response?.data || err.message
    });
  }
});


module.exports = router;
