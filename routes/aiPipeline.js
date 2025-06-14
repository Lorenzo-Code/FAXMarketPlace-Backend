const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL_ID = "ft:gpt-3.5-turbo-1106:fractionax:fractionax-v2:Bi9tiB78";
const BASE_API_URL = process.env.BASE_API_URL || "http://localhost:5000";

// Reset memory
router.post("/reset", (req, res) => {
  req.session.chat_history = [];
  res.status(200).json({ message: "🧠 Session memory cleared." });
});

// AI Pipeline Route
router.post("/", async (req, res) => {
  const { prompt } = req.body;
  const sessionId = req.sessionID;

  if (!prompt) {
    return res.status(400).json({ error: "❌ Missing prompt." });
  }

  try {
    // 1. Retrieve session memory
    const chatHistory = req.session.chat_history || [];

    // 2. Construct OpenAI message payload
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

    // 3. Query OpenAI
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
      console.error("❌ Failed to parse assistantReply:", assistantReply);
      return res.status(422).json({
        error: "Model returned invalid JSON.",
        raw_output: assistantReply
      });
    }

    // 4. Apply fallback if address/zip_code missing but location is present
    if (!structuredData.address && structuredData.location) {
      structuredData.address = structuredData.location;
    }
    if (!structuredData.zip_code) {
      structuredData.zip_code = "00000"; // Default fallback; you may replace with inferred zip logic
    }

    // 5. Validate output
    if (!structuredData.address || !structuredData.zip_code) {
      console.log("🧠 Raw OpenAI Output:", assistantReply);
      console.log("📦 Parsed JSON:", structuredData);

      return res.status(422).json({
        error: "❌ Model returned incomplete data (missing address or zip_code)",
        model_output: structuredData
      });
    }

    // 6. Save memory
    req.session.chat_history = [
      ...chatHistory,
      { role: "user", content: prompt },
      { role: "assistant", content: assistantReply }
    ];

    // 7. Forward to internal Attom API
    const attomResponse = await axios.post(`${BASE_API_URL}/api/attom-data`, {
      address: structuredData.address,
      zip_code: structuredData.zip_code,
      data_required: structuredData.data_required || ["basic_profile", "avm"]
    });

    // 8. Return final response
    return res.status(200).json({
      session_id: sessionId,
      input_prompt: prompt,
      parsed_intent: structuredData,
      property_data: attomResponse.data
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
