const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

router.post('/', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const result = await axios.post(
      `https://api.convertkit.com/v3/forms/${process.env.CONVERTKIT_FORM_ID}/subscribe`,
      {
        api_key: process.env.CONVERTKIT_API_KEY,
        email: email,
      }
    );

    res.status(200).json({ message: 'Subscribed successfully', result: result.data });
  } catch (err) {
    console.error('ConvertKit error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

module.exports = router;
