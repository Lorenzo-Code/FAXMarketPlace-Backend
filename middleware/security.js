const rateLimit = require("express-rate-limit");
const { RateLimiterRedis } = require("rate-limiter-flexible");
const { client: redisClient, getUserKey } = require("../utils/redisClient");

// Login Rate Limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: "Too many login attempts, please try again later.",
    retryAfter: "15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path !== "/login"
});

// Registration Rate Limiter
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    error: "Too many registration attempts, please try again later.",
    retryAfter: "1 hour"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Optional: Wrap RateLimiterRedis safely
let twoFactorLimiter = null;

try {
  if (redisClient) {
    twoFactorLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "2fa",
      points: 5,
      duration: 300,
      blockDuration: 900,
    });
  } else {
    console.warn("⚠️ Redis client unavailable – skipping 2FA rate limiter setup.");
  }
} catch (err) {
  console.error("❌ Failed to set up RateLimiterRedis:", err.message);
}

// Middleware: Limit 2FA attempts
const limit2FA = async (req, res, next) => {
  if (!twoFactorLimiter) return next();

  try {
    const userKey = getUserKey(req);
    await twoFactorLimiter.consume(`${req.ip}_${userKey}`);
    next();
  } catch (rejRes) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    res.set("Retry-After", String(secs));
    res.status(429).json({
      error: "Too many 2FA attempts",
      retryAfter: `${Math.ceil(secs / 60)} minutes`
    });
  }
};

// Middleware: Password strength validator
const validatePasswordStrength = (req, res, next) => {
  const { password } = req.body;
  if (!password) return next();

  const minLength = 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const errors = [];
  if (password.length < minLength) errors.push(`Password must be at least ${minLength} characters`);
  if (!hasUpper) errors.push("Must contain uppercase letter");
  if (!hasLower) errors.push("Must contain lowercase letter");
  if (!hasNumber) errors.push("Must contain number");
  if (!hasSymbol) errors.push("Must contain special character");

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Password does not meet security requirements",
      requirements: errors,
    });
  }

  next();
};

// Middleware: Suspicious activity detector
const detectSuspiciousActivity = (req, res, next) => {
  const suspicious = [
    req.headers["user-agent"]?.includes("curl"),
    req.headers["user-agent"]?.includes("wget"),
    req.body?.password?.length > 100,
    Object.keys(req.body || {}).length > 20,
  ];

  if (suspicious.some(Boolean)) {
    console.warn(`🚨 Suspicious activity from ${req.ip}:`, {
      agent: req.headers["user-agent"],
      bodyLength: JSON.stringify(req.body).length,
      time: new Date().toISOString()
    });
  }

  next();
};

module.exports = {
  loginLimiter,
  registerLimiter,
  limit2FA,
  validatePasswordStrength,
  detectSuspiciousActivity,
};
