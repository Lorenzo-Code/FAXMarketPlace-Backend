require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const session = require("express-session"); // ✅ Add this
const subscribeRoute = require('./routes/subscribe');



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

// ✅ Import routes
const tokenPricesRoute = require('./routes/tokenPrices');
const aiSearchRoute = require('./routes/aiSearch');
const schoolInfoRoute = require('./routes/schoolInfo');
const attomDataRoute = require('./routes/attomData');
const aiPipelineRoute = require('./routes/aiPipeline');
const preSaleSignupRoute = require('./routes/pre-sale-signup');

// ✅ API Routes
app.use("/api/token-prices", tokenPricesRoute);
app.use("/api/ai-search", aiSearchRoute);
app.use("/api/schools", schoolInfoRoute);
app.use("/api/attom-data", attomDataRoute);
app.use("/api/ai-pipeline", aiPipelineRoute);
app.use("/api/subscribe", subscribeRoute);
app.use("/api/pre-sale-signup", preSaleSignupRoute);


// ✅ Health Check
app.get("/", (req, res) => {
  res.status(200).send("✅ FractionaX Backend API is live");
});

// ✅ Start Server
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`);
// });

app.listen(5000, '0.0.0.0', () => {
  console.log("Server running on port 5000");
});

