const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL_ID = "ft:gpt-3.5-turbo-1106:fractionax:fractionax-v2:Bi9tiB78";
const BASE_API_URL = process.env.BASE_API_URL || "http://localhost:5000";

// Clear session memory
router.post("/reset", (req, res) => {
  req.session.chat_history = [];
  res.status(200).json({ message: "🧠 Session memory cleared." });
});

// Main AI pipeline
router.post("/", async (req, res) => {
  const { prompt } = req.body;
  const sessionId = req.sessionID;

  if (!prompt) {
    return res.status(400).json({ error: "❌ Missing prompt." });
  }

  try {
    // 1. Retrieve chat memory (if any)
    const chatHistory = req.session.chat_history || [];

    // 2. Construct message payload
    const messages = [
      {
        role: "system",
        content: "You are a smart real estate assistant. Return structured JSON for property searches. Remember previous context unless reset."
      },
      ...chatHistory,
      { role: "user", content: prompt }
    ];

    // 3. Query OpenAI model
    const completion = await openai.chat.completions.create({
      model: MODEL_ID,
      messages,
      temperature: 0.3
    });

    const assistantReply = completion.choices[0].message.content;
    const structuredData = JSON.parse(assistantReply);

    // 4. Validate model output
    if (!structuredData.address || !structuredData.zip_code) {
      return res.status(422).json({
        error: "❌ Model returned incomplete data (missing address or zip_code)",
        model_output: structuredData
      });
    }

    // 5. Save updated session memory
    req.session.chat_history = [
      ...chatHistory,
      { role: "user", content: prompt },
      { role: "assistant", content: assistantReply }
    ];

    // 6. Forward to Attom API (via internal route)
    const attomResponse = await axios.post(`${BASE_API_URL}/api/attom-data`, {
      address: structuredData.address,
      zip_code: structuredData.zip_code,
      data_required: structuredData.data_required || ["basic_profile", "avm"]
    });

    // 7. Return final response
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
