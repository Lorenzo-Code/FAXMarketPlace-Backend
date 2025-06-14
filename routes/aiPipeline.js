const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const router = express.Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// POST /api/ai-pipeline

router.post('/reset', (req, res) => {
  req.session.chat_history = [];
  res.status(200).json({ message: "Session memory cleared." });
});

// { prompt: "Find me a house in Houston under $500K with no flood risk and good ROI" }
router.post('/', async (req, res) => {
  const { prompt } = req.body;
  const sessionId = req.sessionID;

  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    // Step 1: Load chat history from session memory (if any)
    const memoryHistory = req.session.chat_history || [];

    // Step 2: Build prompt chain (system + previous + new)
    const messages = [
      {
        role: "system",
        content: "You are a smart real estate assistant. Return structured JSON for property searches. Remember previous context unless the user resets it."
      },
      ...memoryHistory,
      {
        role: "user",
        content: prompt
      }
    ];

    // Step 3: Get structured data from fine-tuned model
    const chatResponse = await openai.chat.completions.create({
      model: "ft:gpt-3.5-turbo-1106:fractionax:fractionax-v2:Bi9tiB78", // Replace with your actual model ID
      messages,
      temperature: 0.3
    });

    const aiMessage = chatResponse.choices[0].message.content;
    const structuredData = JSON.parse(aiMessage);

    // Step 4: Update session memory
    req.session.chat_history = [
      ...memoryHistory,
      { role: "user", content: prompt },
      { role: "assistant", content: aiMessage }
    ];

    // Step 5: Fetch data from Attom
    const attomResponse = await axios.post(`${process.env.BASE_API_URL}/api/attom-data`, {
      address: structuredData.address,
      zip_code: structuredData.zip_code,
      data_required: structuredData.data_required || ["basic_profile", "avm"]
    });

    // Step 6: Return response
    return res.status(200).json({
      session_id: sessionId,
      input_prompt: prompt,
      parsed_intent: structuredData,
      property_data: attomResponse.data
    });

  } catch (err) {
    console.error("❌ AI Pipeline Error:", err.message);
    return res.status(500).json({ error: "AI pipeline failed", details: err.message });
  }
});

module.exports = router;
