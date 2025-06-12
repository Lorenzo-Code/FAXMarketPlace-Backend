const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
require('dotenv').config();

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/', async (req, res) => {
    const { query } = req.body;

    try {
        // Step 1: Use OpenAI to extract property filters
        const aiResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a real estate AI. Convert the user’s search query into a JSON object with fields like city, zip_code, max_price, min_beds, property_type. Only return the JSON.',
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
            const jsonStart = rawFilter.indexOf('{');
            const jsonEnd = rawFilter.lastIndexOf('}');
            const cleanJson = rawFilter.substring(jsonStart, jsonEnd + 1);
            parsedFilter = JSON.parse(cleanJson);
        } catch (jsonErr) {
            console.error('❌ Failed to parse JSON from OpenAI:', rawFilter);
            return res.status(400).json({ error: 'Invalid filter format from AI.' });
        }

        const {
            city = 'Houston',
            zip_code = '77024',
            max_price = '500000',
            min_beds = '1',
            property_type = 'Houses',
        } = parsedFilter;

        // Step 2: Fetch Zillow listings
        const zillowParams = new URLSearchParams({
            location: city,
            priceMax: max_price,
            bedsMin: min_beds,
            home_type: property_type,
            status_type: 'ForSale',
        });

        const zillowUrl = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${zillowParams.toString()}`;
        console.log('📡 Zillow URL:', zillowUrl);

        const zillowResponse = await fetch(zillowUrl, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': 'zillow-com1.p.rapidapi.com',
            },
        });

        const zillowData = await zillowResponse.json();

        // Step 3: Fetch property data from Attom
        const attomUrl = `https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail?postalcode=${zip_code}&city=${encodeURIComponent(city)}`;

        const attomResponse = await fetch(attomUrl, {
            method: 'GET',
            headers: {
                apikey: process.env.ATTOM_API_KEY,
            },
        });

        const attomData = await attomResponse.json();

        // Step 4: Return everything to the frontend
        res.json({
            filters: parsedFilter,
            listings: zillowData,
            attom_data: attomData,
        });

    } catch (error) {
        console.error('❌ AI Search Error:', error);
        res.status(500).json({ error: 'AI-powered search failed.' });
    }
});

module.exports = router;
