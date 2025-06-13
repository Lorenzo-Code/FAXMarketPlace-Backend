require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 5000;

// Import routes
const tokenPricesRoute = require('./routes/tokenPrices');
const aiSearchRoute = require('./routes/aiSearch');
const schoolInfoRoute = require('./routes/schoolInfo'); // ✅ Include this if it exists

// 🔐 CORS: Allow local dev and production
const allowedOrigins = ['http://localhost:3000', 'https://fractionax.io'];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

// 🚀 Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // ✅ Handles preflight requests

app.use(helmet());
app.use(express.json());
app.use(morgan("combined"));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// API Routes
app.use("/api/token-prices", tokenPricesRoute);
app.use("/api/ai-search", aiSearchRoute);
app.use("/api/schools", schoolInfoRoute); // ✅ Include your school data route


// Health Check
app.get("/", (req, res) => {
  res.status(200).send("✅ FractionaX Backend API is live");
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
