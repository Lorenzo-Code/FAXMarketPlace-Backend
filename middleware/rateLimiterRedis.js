const { RateLimiterRedis } = require("rate-limiter-flexible");
const { client: redisClient } = require("../utils/redisClient");

const isRedisReady = !!redisClient;

const createLimiter = (opts) =>
  isRedisReady
    ? new RateLimiterRedis({
        storeClient: redisClient,
        ...opts,
      })
    : null;

// 💌 Email Subscription Limiter
const emailSubscriptionLimiter = createLimiter({
  keyPrefix: "email_sub",
  keyGenerator: (req) => `email_sub_${req.ip}`,
  points: 1,
  duration: 30,
  blockDuration: 60,
});

// 🤖 AI Search Limiter
const aiSearchLimiter = createLimiter({
  keyPrefix: "ai_search",
  keyGenerator: (req) => `ai_search_${req.ip}_${req.user?._id || "anon"}`,
  points: 10,
  duration: 60,
  blockDuration: 300,
});

// 🏡 Property Search Limiter
const propertySearchLimiter = createLimiter({
  keyPrefix: "prop_search",
  keyGenerator: (req) => `prop_search_${req.ip}`,
  points: 20,
  duration: 60,
  blockDuration: 120,
});

// 🌐 General API Limiter
const apiLimiter = createLimiter({
  keyPrefix: "api",
  keyGenerator: (req) => `api_${req.ip}`,
  points: 100,
  duration: 60,
  blockDuration: 60,
});

// ⚙️ Middleware Factory
const makeLimiterMiddleware = (limiter, label, retryMessage) => {
  return async (req, res, next) => {
    if (!limiter) return next();
    try {
      await limiter.consume(req.ip);
      next();
    } catch (rejRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      res.set("Retry-After", String(secs));
      res.status(429).json({
        error: retryMessage,
        retryAfter: `${secs > 60 ? Math.ceil(secs / 60) + " minutes" : secs + " seconds"}`
      });
    }
  };
};

module.exports = {
  limitEmailSubscription: makeLimiterMiddleware(emailSubscriptionLimiter, "email", "Too many subscription attempts"),
  limitAISearch: makeLimiterMiddleware(aiSearchLimiter, "ai", "Too many AI search requests"),
  limitPropertySearch: makeLimiterMiddleware(propertySearchLimiter, "prop", "Too many property search requests"),
  limitAPI: makeLimiterMiddleware(apiLimiter, "api", "Too many API requests"),

  emailSubscriptionLimiter,
  aiSearchLimiter,
  propertySearchLimiter,
  apiLimiter,
};
