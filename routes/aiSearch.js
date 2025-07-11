const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const fetch = require("node-fetch");
require("dotenv").config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/", async (req, res) => {
  const { query } = req.body;
  let completion;

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Missing or invalid query" });
  }

  try {
    completion = await openai.chat.completions.create({
      model: "ft:gpt-3.5-turbo-1106:fractionax:fractionax-v2:Bi9tiB78",
      messages: [
        { role: "system", content: "You are a smart real estate assistant." },
        { role: "user", content: query }, // ✅ dynamic input
      ],
    });
  } catch (err) {
    console.warn("⚠️ Fine-tuned model failed, falling back to base GPT:", err.message);
    completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a smart real estate assistant. Return structured JSON with clear city names or ZIP codes." },
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

  const originalCity = parsedFilter.location || parsedFilter.city || "Houston";
  const normalizedCity =
    originalCity.toLowerCase().includes("downtown") || originalCity.length < 3
      ? "Houston"
      : originalCity;

  const zip_code = parsedFilter.zip_code || "77024";
  const max_price = Number(parsedFilter.max_price) || 150000;
  const min_beds = parsedFilter.min_beds || "1";
  const property_type = parsedFilter.property_type || "Houses";


  // 🔍 Zillow API
  const zillowParams = new URLSearchParams({
    location: normalizedCity,
    priceMax: max_price,
    bedsMin: min_beds,
    home_type: property_type,
    status_type: "ForSale",
  });

  const zillowUrl = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${zillowParams.toString()}`;

  const zillowResponse = await fetch(zillowUrl, {
    method: "GET",
    headers: {
      "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
    },
  });

  const zillowData = await zillowResponse.json();
  const rawListings = zillowData.props || [];
  const filteredListings = rawListings
    .filter(p => Number(p.price) > 0 && Number(p.price) <= max_price)
    .map(p => ({
      ...p,
      fullAddress:
        p.address?.streetAddress && p.address?.city && p.address?.zipcode
          ? `${p.address.streetAddress}, ${p.address.city}, ${p.address.zipcode}`
          : "Address Not Available",
    }));


  const { getPropertyDetail } = require("../utils/attom");

  const attomData = await getPropertyDetail(parsedFilter.address || "N/A", zip_code);


  // 📍 Coordinates for GreatSchools
  const firstListing = rawListings[0];
  const lat = firstListing?.latitude || "29.7604";
  const lon = firstListing?.longitude || "-95.3698";

  // 🏫 GreatSchools API (deprecated for now)
  let schoolData = { raw: "Deprecated API" };

  // 🧠 AI Summary
  let aiSummary = "";
  try {
    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Summarize the buyer’s preferences from this JSON:" },
        { role: "user", content: JSON.stringify(parsedFilter) },
      ],
    });

    aiSummary = summaryResponse.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.warn("⚠️ Summary generation failed:", err.message);
  }

  return res.status(200).json({
    filters: parsedFilter,
    listings: filteredListings,
    attom_data: attomData,
    schools: schoolData,
    ai_summary: aiSummary,
  });
});

module.exports = router;
