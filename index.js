require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const session = require("express-session");
const path = require("path");

const { verifyToken } = require("./middleware/auth");
const { initRateLimiters } = require("./middleware/rateLimiterRedis");
const { ensureConnected } = require("./utils/redisClient");

const app = express();
const PORT = process.env.PORT || 5000;

// 🔐 CORS Configuration
const allowedOrigins = ['http://localhost:5173', 'https://fractionax.io'];
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

// ✅ Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(morgan("combined"));

// ✅ Rate Limiting
app.set("trust proxy", 1);
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ✅ Request Logger
app.use((req, res, next) => {
  console.log(`🌐 Incoming request: ${req.method} ${req.originalUrl}`);
  next();
});

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("📦 Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard_cat',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 86400000,
    secure: false,
    httpOnly: true,
  }
}));

// ✅ Static Uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Route Imports
app.use("/api/auth", require('./routes/auth'));
app.use("/api/admin", require('./routes/admin'));
app.use("/api/blogs", require('./routes/api/blog'));
app.use("/api/email", require('./routes/api/emailCollection'));
app.use("/api/cache/stats", require('./routes/cacheStats'));
app.use("/api/schools", require('./routes/schoolInfo'));
app.use("/api/attom-data", require('./routes/attomData'));
app.use("/api/token-prices", require('./routes/tokenPrices'));
app.use("/api/uploads", require('./routes/api/uploads'));
app.use("/api/properties", require('./routes/api/properties'));
app.use("/api/test", require('./routes/api/testRedis'));
app.use("/api/suggested", require("./routes/api/suggestedRoutes"));


// ✅ AI Routes
const searchRouter = require('./routes/api/ai/search');
const pipelineRouter = require('./routes/api/ai/pipeline');
app.use("/api/ai", searchRouter);                                 // POST /api/ai - Main AI search endpoint
app.use("/api/ai", pipelineRouter);                              // POST /api/ai/pipeline + POST /api/ai/reset
app.use("/api/ai/full-comp", require("./routes/api/ai/fullComp")); // POST /api/ai/full-comp - Full property report
app.use("/api/ai/fast-comp", require('./routes/api/ai/fastComp')); // GET /api/ai/fast-comp - Lightweight property details
app.use("/api/ai/smart-search", require('./routes/api/ai/smartSearch')); // GET /api/ai/smart-search - Smart AI search

// ✅ Health Check
app.get("/", (req, res) => {
  res.status(200).json({ status: "✅ FractionaX Backend API is live" });
});

// ✅ Protected Test
app.get("/api/protected", verifyToken, (req, res) => {
  res.json({ msg: `Hello, ${req.user.email}`, user: req.user });
});

// ❌ 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.originalUrl}` });
});

// ✅ Startup Sequence
(async () => {
  try {
    await ensureConnected();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("🛑 Startup error:", err);
    process.exit(1);
  }
})();
