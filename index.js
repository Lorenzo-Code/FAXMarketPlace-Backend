require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const session = require("express-session"); // ✅ Add this
const subscribeRoute = require('./routes/subscribe');
const redisClient = require("./utils/redisClient");



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


// Use env vars to support local vs production
const redis = require("redis");
const client = redis.createClient({
  url: process.env.REDIS_URL,
});

client.on("connect", () => {
  console.log("✅ Connected to Redis");
});

client.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

client.connect().catch((err) => {
  console.error("❌ Redis Connection Failed:", err);
});

module.exports = client;



// ✅ Add session middleware BEFORE routes
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fractionax-default-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Change to true if using HTTPS
      maxAge: 1000 * 60 * 60 // 1 hour
    }
  })
);

// ✅ Rate limiter after session (optional)
app.set("trust proxy", 1); // trust first proxy
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use((req, res, next) => {
  console.log(`🌐 Incoming request: ${req.method} ${req.originalUrl}`);
  next();
});


// ✅ Import routes
const tokenPricesRoute = require('./routes/tokenPrices');
const aiSearchRoute = require('./routes/aiSearch');
const schoolInfoRoute = require('./routes/schoolInfo');
const attomDataRoute = require('./routes/attomData');
const aiPipelineRoute = require('./routes/aiPipeline');
const preSaleSignupRoute = require('./routes/pre-sale-signup');
const cacheStatsRoute = require('./routes/cacheStats');

// ✅ Health Check route FIRST
app.get("/", (req, res) => {
  res.status(200).json({ status: "✅ FractionaX Backend API is live" });
});


// ✅ API Routes
app.use("/api/token-prices", tokenPricesRoute);
app.use("/api/ai-search", aiSearchRoute);
app.use("/api/schools", schoolInfoRoute);
app.use("/api/attom-data", attomDataRoute);
app.use("/api/ai-pipeline", aiPipelineRoute);
app.use("/api/subscribe", subscribeRoute);
app.use("/api/pre-sale-signup", preSaleSignupRoute);
app.use("/api/cache/stats", cacheStatsRoute);
app.get("/api/test", (req, res) => {
  res.json({ status: "✅ API is live" });
});

// ❌ 404 handler LAST
app.use((req, res, next) => {
  res.status(404).json({ error: `Route not found: ${req.originalUrl}` });
});

app.listen(5000, '0.0.0.0', () => {
  console.log("Server running on port 5000");
});

