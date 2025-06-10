const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
require('dotenv').config();

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/', async (req, res) => {
    const { query } = req.body;

    try {
        // Step 1: Send query to OpenAI to turn it into filter JSON
        const aiResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a real estate AI. Convert the user’s search query into a JSON object with fields like city, max_price, min_beds, property_type. Only return the JSON.',
                },
                {
                    role: 'user',
                    content: query,
                },
            ],
        });

        const rawFilter = aiResponse.choices?.[0]?.message?.content?.trim();
        let parsedFilter = {};

        try {
            // Strip anything before/after the actual JSON block
            const jsonStart = rawFilter.indexOf('{');
            const jsonEnd = rawFilter.lastIndexOf('}');
            const cleanJson = rawFilter.substring(jsonStart, jsonEnd + 1);

            parsedFilter = JSON.parse(cleanJson);
        } catch (jsonErr) {
            console.error('❌ Failed to parse JSON from OpenAI:', rawFilter);
            return res.status(400).json({ error: 'Invalid filter format from AI.' });
        }


        // Step 2: Build Zillow API URL with filters from AI
        const params = new URLSearchParams({
            location: parsedFilter.city || 'Houston',
            priceMax: parsedFilter.max_price || '500000',
            bedsMin: parsedFilter.min_beds || '1',
            home_type: parsedFilter.property_type || 'Houses',
            status_type: 'ForSale',
        });

        const url = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${params.toString()}`;
        console.log('📡 Zillow URL:', url);

        // Step 3: Fetch listings from Zillow
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': 'zillow-com1.p.rapidapi.com',
            },
        });

        const data = await response.json();
        res.json({ listings: data });
    } catch (error) {
        console.error('❌ AI Search Error:', error);
        res.status(500).json({ error: 'AI-powered search failed.' });
    }
});

module.exports = router;
