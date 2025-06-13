// 📍 Put this at the very top of the file
require("dotenv").config();
const OpenAI = require("openai");

// ✅ Set up OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ...your Express route logic follows
