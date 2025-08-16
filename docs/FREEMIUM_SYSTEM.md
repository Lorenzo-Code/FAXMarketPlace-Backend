# 🆓💎 Freemium Rate Limiting & Data Limiting System

This document describes the comprehensive freemium system implemented for FractionaX AI search endpoints. The system enforces different limits and provides different data access levels based on user subscription tiers.

## 📋 Overview

The freemium system consists of three main components:

1. **Rate Limiting**: Limits the number of AI search requests per time period
2. **Data Limiting**: Restricts the amount and quality of data returned
3. **Upgrade Prompts**: Encourages free users to upgrade with contextual messages

## 🏗️ Architecture

```
Frontend Request → Rate Limiting → Data Limiting → Response Enhancement → User
                      ↓               ↓                    ↓
                 IP/User Based    Result Filtering    Upgrade Prompts
                 Request Limits   Field Sanitization  Usage Statistics
```

## 🎯 Subscription Tiers

### Free Tier (Anonymous & Free Users)
- **Search Limits**: 3 searches per hour, 5 searches per day
- **Result Limits**: Maximum 3 properties per search
- **Data Access**: Limited property data (no advanced analytics)
- **Features**: Basic property info, limited AI summaries, upgrade prompts

### Premium Tier (Paid Subscribers)
- **Search Limits**: 100 searches per hour (generous fair-use limit)
- **Result Limits**: Unlimited properties per search
- **Data Access**: Full property data including analytics and investment insights
- **Features**: Complete AI analysis, detailed market data, no restrictions

## 📁 File Structure

```
middleware/
├── freemiumRateLimit.js     # Rate limiting middleware
└── rateLimiterRedis.js      # Base rate limiting utilities

utils/
└── freemiumDataLimiter.js   # Data limiting and sanitization

models/
└── User.js                  # Updated with subscription fields

routes/api/ai/
├── search.js               # Main AI search with freemium protection
└── smartSearch.js          # Smart search with freemium protection

docs/
├── FREEMIUM_SYSTEM.md     # This documentation
└── test-freemium.js       # Test script
```

## 🔧 Implementation Details

### Rate Limiting (`middleware/freemiumRateLimit.js`)

```javascript
// Free tier: 3/hour, 5/day with 2-hour blocks
const freeAISearchLimiter = createLimiter({
  keyPrefix: "free_ai_search",
  keyGenerator: (req) => `free_ai_search_${req.ip}`,
  points: 3,
  duration: 3600,
  blockDuration: 7200,
});

// Premium tier: 100/hour with 30-minute blocks
const premiumAISearchLimiter = createLimiter({
  keyPrefix: "premium_ai_search", 
  keyGenerator: (req) => `premium_ai_search_${req.user?._id || req.ip}`,
  points: 100,
  duration: 3600,
  blockDuration: 1800,
});
```

### Data Limiting (`utils/freemiumDataLimiter.js`)

```javascript
const FREE_TIER_LIMITS = {
  maxResults: 3,
  hiddenFields: [
    'attomData',        // Advanced property analytics
    'propertySource',   // Data source information  
    'dataQuality',      // Quality metrics
    'coreLogicData',    // Detailed property intelligence
    'zpid'             // Zillow property ID
  ],
  sanitizedFields: {
    'ai_summary': 150,  // Truncate AI analysis
  }
};
```

### User Model Updates (`models/User.js`)

Added comprehensive subscription tracking:

```javascript
subscription: {
  plan: {
    type: String,
    enum: ['free', 'premium', 'pro'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'cancelled', 'past_due', 'trialing'],
    default: 'inactive'
  },
  // ... additional fields for Stripe integration, usage tracking, trials
}
```

## 🚀 Usage

### Applying Middleware to Routes

```javascript
const { freemiumRateLimit, addLimitsToResponse } = require('../../../middleware/freemiumRateLimit');
const { applyTierLimitsMiddleware } = require('../../../utils/freemiumDataLimiter');

router.post("/", 
  freemiumRateLimit,           // Check rate limits
  addLimitsToResponse,         // Add usage info to response
  applyTierLimitsMiddleware,   // Apply data restrictions
  async (req, res) => {
    // Your route handler
  }
);
```

### Response Format

#### Free Tier Response
```json
{
  "listings": [/* max 3 properties with limited fields */],
  "ai_summary": "Limited summary...",
  "hiddenResultsCount": 7,
  "upgradeForMore": {
    "message": "7 more properties available with Premium",
    "upgradeUrl": "/pricing"
  },
  "searchLimits": {
    "tier": "free",
    "hourlyRemaining": 2,
    "dailyRemaining": 3,
    "nextResetHourly": "2024-01-01T15:00:00Z"
  },
  "upgradePrompt": {
    "show": true,
    "message": "Upgrade to Premium for unlimited searches!",
    "benefits": [/* list of premium benefits */]
  }
}
```

#### Premium Tier Response
```json
{
  "listings": [/* unlimited properties with full data */],
  "ai_summary": "Complete detailed analysis...",
  "searchLimits": {
    "tier": "premium",
    "hourlyRemaining": 95,
    "dailyRemaining": null
  },
  "tierInfo": {
    "tier": "premium",
    "limits": {
      "hasFullData": true,
      "hasUnlimitedSearches": true
    }
  }
}
```

## 🧪 Testing

Run the test script to verify functionality:

```bash
node test-freemium.js
```

The test script validates:
- ✅ User subscription status detection
- ✅ Tier limits configuration  
- ✅ Data limiting for free users
- ✅ Full access for premium users
- ✅ Field sanitization
- ✅ Edge cases handling

## 📊 Rate Limiting Logic

### Free Users (IP-based tracking)
1. **Daily Check**: Can't exceed 5 searches per day
2. **Hourly Check**: Can't exceed 3 searches per hour
3. **Block Duration**: 2 hours if limits exceeded
4. **Reset**: Counters reset automatically

### Premium Users (User ID-based tracking)
1. **Hourly Check**: Can't exceed 100 searches per hour (fair use)
2. **Block Duration**: 30 minutes if limits exceeded  
3. **No Daily Limits**: Unlimited daily usage
4. **Reset**: Counters reset automatically

## 🔒 Data Restriction Logic

### Free Tier Restrictions
- **Result Count**: Limited to first 3 properties
- **Field Removal**: Advanced analytics fields stripped out
- **Summary Truncation**: AI summaries limited to 150 characters
- **Upgrade Messages**: Added to each property and response

### Premium Tier Access
- **Full Results**: All found properties returned
- **Complete Data**: All available property fields included
- **Full AI Analysis**: Complete summaries and insights
- **No Restrictions**: Access to all platform features

## 🎨 Frontend Integration

### Handling Upgrade Prompts

```javascript
// Check if upgrade prompt should be shown
if (response.upgradePrompt?.show) {
  showUpgradeModal({
    message: response.upgradePrompt.message,
    benefits: response.upgradePrompt.benefits,
    upgradeUrl: response.upgradePrompt.upgradeUrl
  });
}

// Handle hidden results
if (response.hiddenResultsCount > 0) {
  showHiddenResultsBanner(
    `${response.hiddenResultsCount} more properties available with Premium`
  );
}
```

### Usage Statistics Display

```javascript
// Show remaining searches for free users
if (response.searchLimits?.tier === 'free') {
  updateUsageIndicator({
    hourlyRemaining: response.searchLimits.hourlyRemaining,
    dailyRemaining: response.searchLimits.dailyRemaining,
    nextReset: response.searchLimits.nextResetHourly
  });
}
```

## 🚨 Error Handling

### Rate Limit Exceeded (429 Response)
```json
{
  "error": "Free tier search limit exceeded",
  "tier": "free", 
  "limitType": "daily",
  "message": "Free users are limited to 5 searches per day. Upgrade to Premium for unlimited searches.",
  "retryAfter": "4 hours",
  "upgradeUrl": "/pricing",
  "remainingSearches": 0
}
```

### Frontend Error Handling
```javascript
if (response.status === 429) {
  const errorData = await response.json();
  if (errorData.tier === 'free') {
    showRateLimitModal({
      message: errorData.message,
      retryAfter: errorData.retryAfter,
      upgradeUrl: errorData.upgradeUrl
    });
  }
}
```

## 🔧 Configuration

### Adjusting Limits

To modify rate limits, update the values in `middleware/freemiumRateLimit.js`:

```javascript
// Change free tier limits
const freeAISearchLimiter = createLimiter({
  points: 5,        // searches per period
  duration: 3600,   // period in seconds (1 hour)
  blockDuration: 7200, // block time in seconds (2 hours)
});
```

### Adjusting Data Limits

To modify data restrictions, update `utils/freemiumDataLimiter.js`:

```javascript
const FREE_TIER_LIMITS = {
  maxResults: 5,    // increase max results
  hiddenFields: [   // modify hidden fields
    'attomData',
    // ... other fields
  ]
};
```

## 📈 Monitoring & Analytics

### Key Metrics to Track

1. **Conversion Metrics**:
   - Free-to-premium conversion rate
   - Upgrade prompt click-through rate
   - Search limit hit frequency

2. **Usage Patterns**:
   - Average searches per free user
   - Time between searches
   - Most common search limit exceeded

3. **Performance Impact**:
   - Rate limiting overhead
   - Data sanitization performance
   - Redis cache hit rates

### Redis Keys Used

- `free_ai_search_{IP}` - Free user hourly limits
- `free_daily_ai_search_{IP}` - Free user daily limits  
- `premium_ai_search_{UserID}` - Premium user hourly limits

## 🔮 Future Enhancements

### Planned Features

1. **Dynamic Limits**: Adjust limits based on server load
2. **Geographic Limits**: Different limits by region
3. **Usage Analytics**: Detailed user behavior tracking
4. **A/B Testing**: Test different limit configurations
5. **Trial Periods**: Temporary premium access for new users

### Integration Opportunities

1. **Stripe Webhooks**: Real-time subscription status updates
2. **Analytics Platforms**: Usage data to analytics services
3. **Marketing Automation**: Triggered upgrade campaigns
4. **Customer Support**: Usage context for support tickets

## 🛠️ Troubleshooting

### Common Issues

1. **Rate Limits Not Working**:
   - Check Redis connection
   - Verify middleware order
   - Check IP extraction

2. **Data Not Being Limited**:
   - Ensure middleware is applied
   - Check tier detection logic
   - Verify field names in limits config

3. **Subscription Status Not Detected**:
   - Check user model fields
   - Verify JWT token includes subscription data
   - Check subscription status enum values

### Debug Commands

```bash
# Test rate limiting
curl -X POST http://localhost:5000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query": "3 bedroom house in Houston"}'

# Check Redis keys
redis-cli keys "free_ai_search_*"
redis-cli keys "premium_ai_search_*"

# Test data limiting
node test-freemium.js
```

## 📚 Dependencies

- `rate-limiter-flexible`: Redis-based rate limiting
- `redis`: Redis client for caching and rate limiting
- `express`: Web framework (existing)
- `jsonwebtoken`: JWT token handling (existing)
- `mongoose`: MongoDB ODM (existing)

## 👥 Contributing

When making changes to the freemium system:

1. Update relevant tests in `test-freemium.js`
2. Update this documentation
3. Test with both free and premium user scenarios
4. Consider impact on existing users
5. Monitor performance after deployment

## 📝 License

This freemium system is part of the FractionaX platform and follows the same licensing terms.
