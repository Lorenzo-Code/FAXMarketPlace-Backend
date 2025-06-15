const express = require("express");
const { OpenAI } = require("openai");
const { fetchMultipleProperties } = require("../utils/attom");

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL_ID = "ft:gpt-3.5-turbo-1106:fractionax:fractionax-v3:BiLkkGbl";

router.post("/reset", (req, res) => {
  req.session.chat_history = [];
  res.status(200).json({ message: "🧠 Session memory cleared." });
});

router.post("/", async (req, res) => {
  const { prompt } = req.body;
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

    // ✅ Normalize input
    const city = structuredData.city
      ? structuredData.city.charAt(0).toUpperCase() + structuredData.city.slice(1).toLowerCase()
      : undefined;
    const state = structuredData.state ? structuredData.state.toUpperCase() : undefined;

    // ✅ Define attomParams BEFORE use
    const attomParams = {
  zip_code: structuredData.zip_code,  // ✅ MUST be present
  property_type: structuredData.property_type || 'sfr',
  max_price: structuredData.price,
  min_beds: structuredData.min_beds || 1,
  sort: 'salestransdate'
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

    console.log("✅ Returning enriched listings to frontend.");
    return res.status(200).json({
      session_id: sessionId,
      input_prompt: prompt,
      parsed_intent: structuredData,
      property_data: attomResponse.property || []
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
