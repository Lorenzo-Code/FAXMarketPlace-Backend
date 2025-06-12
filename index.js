require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// Import routes
const tokenPricesRoute = require('./routes/tokenPrices');
const aiSearchRoute = require('./routes/aiSearch');

// 🔐 Security Middleware
app.use(helmet()); // Sets secure HTTP headers
app.use(cors({
  origin: ['https://fractionax.io'], // 🔒 Restrict access to frontend
  credentials: true
}));
app.use(express.json());
app.use(morgan('combined')); // Logs incoming requests for debugging & metrics

// 🚫 Rate Limiting (100 requests per 15 min per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// API Routes
app.use('/api/token-prices', tokenPricesRoute);
app.use('/api/ai-search', aiSearchRoute);

// Health Check
app.get('/', (req, res) => {
  res.status(200).send('✅ FractionaX Backend API is live');
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running securely at https://api.fractionax.io on port ${PORT}`);
});
