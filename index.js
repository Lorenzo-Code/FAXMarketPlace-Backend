require('dotenv').config();

const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;

const tokenPricesRoute = require('./routes/tokenPrices');
const aiSearchRoute = require('./routes/aiSearch');

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/token-prices', tokenPricesRoute);
app.use('/api/ai-search', aiSearchRoute);

// Optional test route
app.get('/', (req, res) => {
  res.send('FractionaX Backend API is live ✅');
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
