require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// Routes
const tokenPricesRoute = require('./routes/tokenPrices');
const aiSearchRoute = require('./routes/aiSearch');

// 🔐 Secure CORS Setup
const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? ['https://fractionax.io']
    : ['http://localhost:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('❌ CORS blocked:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// 🧱 Global Middleware
app.use(helmet()); // Secure HTTP headers
app.use(express.json());
app.use(morgan('combined')); // Request logging

// 🚫 Basic Rate Limiting (100 reqs / 15 min)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// 📡 Routes
app.use('/api/token-prices', tokenPricesRoute);
app.use('/api/ai-search', aiSearchRoute);

// ✅ Health Check
app.get('/', (req, res) => {
  res.status(200).send('✅ FractionaX Backend API is live');
});

// 🚀 Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
