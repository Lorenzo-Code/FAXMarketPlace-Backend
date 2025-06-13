const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/", async (req, res) => {
  const { query } = req.body;
  let completion;

  try {
    // 🧠 Try fine-tuned model first
    completion = await openai.chat.completions.create({
      model: "ft:gpt-3.5-turbo-0125:fractionax::BhmQVQpg", // ← Your fine-tuned model
      messages: [
        { role: "system", content: "You are a smart real estate assistant." },
        { role: "user", content: query },
      ],
    });
  } catch (err) {
    console.warn("⚠️ Fine-tuned model failed, falling back to base GPT:", err.message);

    // 🔁 Fallback to base GPT if fine-tuned model fails
    completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a smart real estate assistant." },
        { role: "user", content: query },
      ],
    });
  }

  const aiResponse = completion.choices[0].message.content?.trim();
  let parsedFilter = {};

  try {
    const jsonStart = aiResponse.indexOf("{");
    const jsonEnd = aiResponse.lastIndexOf("}");
    const cleanJson = aiResponse.substring(jsonStart, jsonEnd + 1);
    parsedFilter = JSON.parse(cleanJson);
  } catch (err) {
    console.error("❌ Failed to parse JSON from AI response:", aiResponse);
    return res.status(400).json({ error: "Invalid format returned by model" });
  }

  // 📦 At this point, parsedFilter contains structured values like:
  // { city: "Houston", max_price: 300000, min_beds: 2, property_type: "House" }

  return res.status(200).json({
    filters: parsedFilter,
    ai_summary: aiResponse,
  });
});

module.exports = router;
