const express = require('express');
const axios = require('axios');
const router = express.Router();

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_KEY;

// Test endpoint to check Google Maps API and provide Places Autocomplete
router.get('/test', async (req, res) => {
  try {
    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Google Maps API key not configured',
        hasKey: false 
      });
    }

    // Test with a simple geocoding request
    const testUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
    const response = await axios.get(testUrl, {
      params: {
        address: '1600 Amphitheatre Parkway, Mountain View, CA',
        key: GOOGLE_API_KEY
      }
    });

    res.json({
      success: true,
      hasKey: true,
      keyLength: GOOGLE_API_KEY.length,
      keyPrefix: GOOGLE_API_KEY.substring(0, 10) + '...',
      testResponse: {
        status: response.data.status,
        resultsCount: response.data.results?.length || 0
      }
    });
  } catch (error) {
    console.error('Google Maps API test failed:', error.message);
    res.status(500).json({
      error: 'Google Maps API test failed',
      hasKey: !!GOOGLE_API_KEY,
      message: error.message,
      status: error.response?.data?.status || 'NETWORK_ERROR'
    });
  }
});

// Places Autocomplete endpoint for frontend
router.get('/autocomplete', async (req, res) => {
  try {
    const { input } = req.query;
    
    if (!input) {
      return res.status(400).json({ error: 'Input parameter is required' });
    }

    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
    const response = await axios.get(url, {
      params: {
        input,
        key: GOOGLE_API_KEY,
        types: 'address',
        components: 'country:us' // Restrict to US addresses
      }
    });

    res.json({
      success: true,
      predictions: response.data.predictions,
      status: response.data.status
    });
  } catch (error) {
    console.error('Places Autocomplete failed:', error.message);
    res.status(500).json({
      error: 'Places Autocomplete failed',
      message: error.message,
      status: error.response?.data?.status || 'NETWORK_ERROR'
    });
  }
});

// Get place details endpoint
router.get('/place-details', async (req, res) => {
  try {
    const { place_id } = req.query;
    
    if (!place_id) {
      return res.status(400).json({ error: 'place_id parameter is required' });
    }

    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const url = 'https://maps.googleapis.com/maps/api/place/details/json';
    const response = await axios.get(url, {
      params: {
        place_id,
        key: GOOGLE_API_KEY,
        fields: 'formatted_address,geometry,name,address_components'
      }
    });

    res.json({
      success: true,
      result: response.data.result,
      status: response.data.status
    });
  } catch (error) {
    console.error('Place Details failed:', error.message);
    res.status(500).json({
      error: 'Place Details failed',
      message: error.message,
      status: error.response?.data?.status || 'NETWORK_ERROR'
    });
  }
});

module.exports = router;
