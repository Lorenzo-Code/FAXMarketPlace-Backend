// ai/services/summarizer.js
const openai = require("./openaiClient");

async function generateSummary(text) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Summarize this blog post in 1–2 sentences. Return only the summary.",
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.5,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ AI summary generation failed:", err.message);
    return null;
  }
}

module.exports = { generateSummary };
