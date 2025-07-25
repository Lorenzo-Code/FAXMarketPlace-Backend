require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const { verifyToken, authorizeAdmin } = require("./middleware/auth");

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

app.get("/api/protected", verifyToken, (req, res) => {
  res.json({ msg: `Hello, ${req.user.email}`, user: req.user });
});


// ✅ Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(morgan("combined"));


// ✅ Rate Limiting
app.set("trust proxy", 1);
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ✅ Request Logger
app.use((req, res, next) => {
  console.log(`🌐 Incoming request: ${req.method} ${req.originalUrl}`);
  next();
});

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
}).then(() => console.log("📦 Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Route Imports
const authRoutes = require('./routes/auth');
const tokenPricesRoute = require('./routes/tokenPrices');
const aiSearchRoute = require('./routes/aiSearch');
const schoolInfoRoute = require('./routes/schoolInfo');
const attomDataRoute = require('./routes/attomData');
const aiPipelineRoute = require('./routes/aiPipeline');
const cacheStatsRoute = require('./routes/cacheStats');
const emailCollectionRoute = require('./routes/api/emailCollection');
const adminRoutes = require("./routes/admin");



// ✅ Health Check
app.get("/", (req, res) => {
  res.status(200).json({ status: "✅ FractionaX Backend API is live" });
});

// ✅ API Routes
app.use("/api/auth", authRoutes); // <<== 👈 NEW AUTH ROUTE
app.use("/api/token-prices", tokenPricesRoute);
app.use("/api/ai-search", aiSearchRoute);
app.use("/api/schools", schoolInfoRoute);
app.use("/api/attom-data", attomDataRoute);
app.use("/api/ai-pipeline", aiPipelineRoute);
app.use("/api/cache/stats", cacheStatsRoute);
app.use("/api/email", emailCollectionRoute);
app.use("/api/admin", adminRoutes);




// ✅ Test route
app.get("/api/test", (req, res) => {
  res.json({ status: "✅ API is live" });
});


// ❌ 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.originalUrl}` });
});

// ✅ Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
