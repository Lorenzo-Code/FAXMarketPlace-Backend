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

// 🆓 Free Tier AI Search Limiter (Very Restrictive)
const freeAISearchLimiter = createLimiter({
  keyPrefix: "free_ai_search",
  keyGenerator: (req) => `free_ai_search_${req.ip}`,
  points: 3, // Only 3 searches per hour for free users
  duration: 3600, // 1 hour
  blockDuration: 7200, // Block for 2 hours if exceeded
});

// 💳 Premium Tier AI Search Limiter (Generous)
const premiumAISearchLimiter = createLimiter({
  keyPrefix: "premium_ai_search",
  keyGenerator: (req) => `premium_ai_search_${req.user?._id || req.ip}`,
  points: 100, // 100 searches per hour for premium users
  duration: 3600, // 1 hour
  blockDuration: 1800, // Block for 30 minutes if exceeded (shorter than free)
});

// 🕐 Daily limit for free users (additional restriction)
const freeDailyLimiter = createLimiter({
  keyPrefix: "free_daily_ai_search",
  keyGenerator: (req) => `free_daily_ai_search_${req.ip}`,
  points: 5, // Only 5 searches per day for free users
  duration: 86400, // 24 hours
  blockDuration: 86400, // Block for 24 hours if exceeded
});

// 🔍 Helper function to determine user subscription status
function getUserSubscriptionStatus(user) {
  // If no user (anonymous), they're free tier
  if (!user) {
    return { tier: 'free', plan: null };
  }

  // Check for subscription fields (future-proofing for when we add them)
  if (user.subscription?.plan === 'premium' && user.subscription?.status === 'active') {
    return { tier: 'premium', plan: 'premium' };
  }
  
  if (user.subscription?.plan === 'pro' && user.subscription?.status === 'active') {
    return { tier: 'premium', plan: 'pro' };
  }

  // Default to free tier for authenticated users without premium subscription
  return { tier: 'free', plan: null };
}

// 📊 Function to get remaining limits for a user/IP
async function getRemainingLimits(req) {
  const subscription = getUserSubscriptionStatus(req.user);
  const results = {
    tier: subscription.tier,
    plan: subscription.plan,
    hourlyRemaining: 0,
    dailyRemaining: 0,
    nextResetHourly: null,
    nextResetDaily: null
  };

  try {
    if (subscription.tier === 'free') {
      // Check hourly limit
      const hourlyRes = await freeAISearchLimiter?.get(req.ip);
      results.hourlyRemaining = hourlyRes ? Math.max(0, 3 - hourlyRes.remainingPoints) : 3;
      results.nextResetHourly = hourlyRes ? new Date(Date.now() + hourlyRes.msBeforeNext) : null;

      // Check daily limit
      const dailyRes = await freeDailyLimiter?.get(req.ip);
      results.dailyRemaining = dailyRes ? Math.max(0, 5 - dailyRes.remainingPoints) : 5;
      results.nextResetDaily = dailyRes ? new Date(Date.now() + dailyRes.msBeforeNext) : null;
    } else {
      // Premium users
      const hourlyRes = await premiumAISearchLimiter?.get(req.user?._id || req.ip);
      results.hourlyRemaining = hourlyRes ? Math.max(0, 100 - hourlyRes.remainingPoints) : 100;
      results.nextResetHourly = hourlyRes ? new Date(Date.now() + hourlyRes.msBeforeNext) : null;
      results.dailyRemaining = null; // No daily limit for premium
    }
  } catch (error) {
    console.warn('⚠️ Error checking rate limits:', error.message);
  }

  return results;
}

// 🛡️ Main Freemium Rate Limiting Middleware
const freemiumRateLimit = async (req, res, next) => {
  // Skip rate limiting if Redis is not available
  if (!isRedisReady) {
    console.warn('⚠️ Redis not available, skipping rate limiting');
    return next();
  }

  try {
    const subscription = getUserSubscriptionStatus(req.user);
    
    console.log(`🔍 AI Search Request - User: ${req.user?.email || 'anonymous'}, Tier: ${subscription.tier}, IP: ${req.ip}`);

    if (subscription.tier === 'free') {
      // For free tier, check both hourly and daily limits
      try {
        // Check daily limit first (more restrictive)
        await freeDailyLimiter.consume(req.ip);
        
        // Then check hourly limit
        await freeAISearchLimiter.consume(req.ip);
        
        console.log(`✅ Free tier request approved for IP: ${req.ip}`);
      } catch (rejRes) {
        const isDaily = rejRes.remainingPoints !== undefined && rejRes.totalHits > 3;
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        const timeUnit = secs > 3600 ? `${Math.ceil(secs / 3600)} hours` : 
                         secs > 60 ? `${Math.ceil(secs / 60)} minutes` : 
                         `${secs} seconds`;
        
        res.set("Retry-After", String(secs));
        
        return res.status(429).json({
          error: "Free tier search limit exceeded",
          tier: "free",
          limitType: isDaily ? "daily" : "hourly",
          message: `Free users are limited to ${isDaily ? '5 searches per day' : '3 searches per hour'}. Upgrade to Premium for unlimited searches.`,
          retryAfter: timeUnit,
          upgradeUrl: "/pricing",
          remainingSearches: 0
        });
      }
    } else {
      // For premium tier, check generous hourly limit
      try {
        await premiumAISearchLimiter.consume(req.user?._id || req.ip);
        console.log(`✅ Premium tier request approved for user: ${req.user?.email || req.ip}`);
      } catch (rejRes) {
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        const timeUnit = secs > 60 ? `${Math.ceil(secs / 60)} minutes` : `${secs} seconds`;
        
        res.set("Retry-After", String(secs));
        
        return res.status(429).json({
          error: "Premium tier rate limit exceeded",
          tier: "premium",
          message: "Even premium users have fair usage limits. Please try again shortly.",
          retryAfter: timeUnit,
          remainingSearches: 0
        });
      }
    }

    // Add subscription info to request for downstream use
    req.subscription = subscription;
    next();

  } catch (error) {
    console.error('❌ Rate limiting error:', error.message);
    // If rate limiting fails, allow the request but log the error
    next();
  }
};

// 🔄 Middleware to add remaining limits info to responses
const addLimitsToResponse = async (req, res, next) => {
  const originalSend = res.json;
  
  res.json = async function(data) {
    try {
      const limits = await getRemainingLimits(req);
      
      // Add limits information to the response
      data.searchLimits = {
        tier: limits.tier,
        plan: limits.plan,
        hourlyRemaining: limits.hourlyRemaining,
        dailyRemaining: limits.dailyRemaining,
        nextResetHourly: limits.nextResetHourly,
        nextResetDaily: limits.nextResetDaily
      };

      // Add upgrade prompts for free users
      if (limits.tier === 'free') {
        data.upgradePrompt = {
          show: limits.hourlyRemaining <= 1 || limits.dailyRemaining <= 1,
          message: limits.dailyRemaining <= 1 ? 
            "You've used most of your daily free searches. Upgrade to Premium for unlimited AI-powered property searches!" :
            "You're close to your hourly search limit. Premium users get 100+ searches per hour!",
          upgradeUrl: "/pricing",
          benefits: [
            "Unlimited AI property searches",
            "Detailed property analytics",
            "Investment scoring & recommendations",
            "Priority customer support",
            "Advanced market insights"
          ]
        };
      }

    } catch (error) {
      console.warn('⚠️ Error adding limits to response:', error.message);
    }
    
    // Call the original json method
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  freemiumRateLimit,
  addLimitsToResponse,
  getRemainingLimits,
  getUserSubscriptionStatus,
  
  // Export limiters for direct use if needed
  freeAISearchLimiter,
  premiumAISearchLimiter,
  freeDailyLimiter
};
