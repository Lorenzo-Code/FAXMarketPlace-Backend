/**
 * 🆓 Freemium Data Limiter Utility
 * 
 * This utility limits and sanitizes search results based on user subscription tier
 * to encourage free users to upgrade while still providing value.
 */

// 📊 Free tier limitations
// 🎯 NEW FREEMIUM STRATEGY: Show ALL discovery data, premium features only on property details
//     - Discovery Phase: Show ALL available data from Zillow/MLS (same for free & premium)
//     - Property Details: Premium gets enhanced analytics, investment scoring, comparable sales, etc.
const FREE_TIER_LIMITS = {
  maxResults: null,        // Show ALL listings (no quantity limits)
  maxImages: null,         // Show all images available from discovery
  hiddenFields: [          // Only hide internal/processing fields from free users
    'attomData',           // Hide detailed Attom intelligence data (premium feature)
    'coreLogicData',       // Hide CoreLogic enrichment data (premium feature)
    'processingTime',      // Hide internal processing metrics
    'validation',          // Hide internal validation data
    'dataQuality'          // Hide internal quality assessment
  ],
  sanitizedFields: {       // Very minimal sanitization for discovery
    'ai_summary': 250,     // More generous AI summary limit
    'metadata': ['searchQuery', 'searchType', 'totalFound', 'timestamp', 'dataSource', 'performanceMetrics'] // Show more metadata
  }
};

// 💎 Premium tier gets everything
const PREMIUM_TIER_LIMITS = {
  maxResults: null,        // No limit on results
  maxImages: null,         // No limit on images
  hiddenFields: [],        // No hidden fields
  sanitizedFields: {}      // No sanitization
};

/**
 * Get tier-specific limits
 * @param {string} tier - 'free' or 'premium'
 * @returns {object} Tier limits configuration
 */
function getTierLimits(tier) {
  return tier === 'premium' ? PREMIUM_TIER_LIMITS : FREE_TIER_LIMITS;
}

/**
 * Sanitize a single property object based on tier limits
 * @param {object} property - Property object to sanitize
 * @param {object} limits - Tier limits configuration
 * @returns {object} Sanitized property object
 */
function sanitizeProperty(property, limits) {
  const sanitized = { ...property };

  // Remove hidden fields
  limits.hiddenFields.forEach(field => {
    if (field.includes('.')) {
      // Handle nested fields like 'address.zip'
      const parts = field.split('.');
      let obj = sanitized;
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj[parts[i]]) {
          obj = obj[parts[i]];
        } else {
          return; // Field doesn't exist, skip
        }
      }
      delete obj[parts[parts.length - 1]];
    } else {
      delete sanitized[field];
    }
  });

  // Handle sanitized fields
  Object.entries(limits.sanitizedFields).forEach(([field, limit]) => {
    if (field.includes('.')) {
      // Handle nested fields
      const parts = field.split('.');
      let obj = sanitized;
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj[parts[i]]) {
          obj = obj[parts[i]];
        } else {
          return; // Field doesn't exist, skip
        }
      }
      
      const finalField = parts[parts.length - 1];
      if (obj[finalField]) {
        if (typeof limit === 'number' && typeof obj[finalField] === 'string') {
          // Truncate string fields
          obj[finalField] = obj[finalField].substring(0, limit) + 
            (obj[finalField].length > limit ? '...' : '');
        } else if (limit === true) {
          // Keep field as is (flag for keeping important fields)
        }
      }
    } else if (sanitized[field]) {
      if (typeof limit === 'number' && typeof sanitized[field] === 'string') {
        // Truncate string fields
        sanitized[field] = sanitized[field].substring(0, limit) + 
          (sanitized[field].length > limit ? '...' : '');
      }
    }
  });

  // For free tier, add a "premium preview" indicator
  if (limits === FREE_TIER_LIMITS) {
    sanitized.freePreview = true;
    sanitized.upgradeMessage = "Click to view detailed property analytics, investment scoring, comparable sales, and market insights with Premium.";
  }

  return sanitized;
}

/**
 * Sanitize metadata object for free tier users
 * @param {object} metadata - Original metadata object
 * @param {object} limits - Tier limits configuration
 * @returns {object} Sanitized metadata object
 */
function sanitizeMetadata(metadata, limits) {
  if (!metadata || limits === PREMIUM_TIER_LIMITS) {
    return metadata;
  }

  // For free tier, only keep essential metadata fields
  const sanitized = {};
  limits.sanitizedFields.metadata.forEach(field => {
    if (metadata[field] !== undefined) {
      sanitized[field] = metadata[field];
    }
  });

  // Add free tier specific metadata
  sanitized.tier = 'free';
  sanitized.note = 'Results limited for free tier. Upgrade for complete data and unlimited searches.';
  
  return sanitized;
}

/**
 * Main function to limit search results based on user subscription tier
 * @param {object} searchResults - Full search results object
 * @param {string} tier - User subscription tier ('free' or 'premium')
 * @param {object} options - Additional options
 * @returns {object} Limited/sanitized search results
 */
function limitSearchResults(searchResults, tier = 'free', options = {}) {
  const limits = getTierLimits(tier);
  const result = { ...searchResults };

  console.log(`🔒 Applying ${tier} tier limits to search results`);
  console.log(`📊 Original results: ${result.listings?.length || 0} properties`);

  // Limit number of results
  if (limits.maxResults && result.listings && result.listings.length > limits.maxResults) {
    result.listings = result.listings.slice(0, limits.maxResults);
    
    // Add information about hidden results for free users
    if (tier === 'free') {
      result.hiddenResultsCount = searchResults.listings.length - limits.maxResults;
      result.upgradeForMore = {
        message: `${result.hiddenResultsCount} more properties available with Premium`,
        upgradeUrl: "/pricing",
        totalAvailable: searchResults.listings.length
      };
    }
  }

  // Sanitize each property
  if (result.listings) {
    result.listings = result.listings.map(property => sanitizeProperty(property, limits));
  }

  // Sanitize metadata
  if (result.metadata) {
    result.metadata = sanitizeMetadata(result.metadata, limits);
  }

  // Limit AI summary for free users (more generous now)
  if (tier === 'free' && result.ai_summary && result.ai_summary.length > 250) {
    result.ai_summary = result.ai_summary.substring(0, 250) + '... [Premium users see the full AI analysis]';
  }

  // Add tier information to response
  result.tierInfo = {
    tier: tier,
    limits: {
      maxResults: limits.maxResults || 'unlimited',
      hasFullData: tier === 'premium',
      hasUnlimitedSearches: tier === 'premium'
    }
  };

  console.log(`✅ Applied ${tier} tier limits: ${result.listings?.length || 0} properties returned`);

  return result;
}

/**
 * Create upgrade prompt based on search context
 * @param {object} searchContext - Information about the search and user
 * @returns {object} Contextual upgrade prompt
 */
function createUpgradePrompt(searchContext = {}) {
  const { 
    hiddenResultsCount = 0, 
    totalResults = 0, 
    searchType = 'general',
    userSearchCount = 0 
  } = searchContext;

  const prompts = {
    moreResults: {
      condition: hiddenResultsCount > 0,
      message: `${hiddenResultsCount} more properties match your search criteria`,
      cta: "Upgrade to Premium to see all results"
    },
    detailedAnalysis: {
      condition: searchType === 'property' || totalResults > 0,
      message: "Get detailed investment analysis, comparable sales, and market insights",
      cta: "Unlock Premium Property Analytics"
    },
    unlimitedSearches: {
      condition: userSearchCount >= 2,
      message: "You're close to your daily search limit",
      cta: "Get Unlimited AI Searches with Premium"
    },
    default: {
      condition: true,
      message: "Discover investment opportunities with full market data",
      cta: "Upgrade to Premium"
    }
  };

  // Find the most relevant prompt
  for (const [key, prompt] of Object.entries(prompts)) {
    if (prompt.condition) {
      return {
        type: key,
        message: prompt.message,
        cta: prompt.cta,
        upgradeUrl: "/pricing",
        benefits: [
          "Unlimited AI property searches",
          "Complete property analytics & investment scoring",
          "Detailed comparable sales analysis",
          "Market trends & neighborhood insights",
          "Priority customer support",
          "Advanced filtering & alerts"
        ]
      };
    }
  }

  return prompts.default;
}

/**
 * Middleware to automatically apply tier limits to API responses
 */
const applyTierLimitsMiddleware = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Get user tier from request (set by freemiumRateLimit middleware)
    const tier = req.subscription?.tier || 'free';
    
    // Only apply limits to search result responses
    if (data && (data.listings || data.searchType)) {
      const limitedData = limitSearchResults(data, tier);
      
      // Add contextual upgrade prompt for free users
      if (tier === 'free') {
        const searchContext = {
          hiddenResultsCount: limitedData.hiddenResultsCount || 0,
          totalResults: data.listings?.length || 0,
          searchType: data.searchType || 'general',
          userSearchCount: data.searchLimits?.dailyRemaining ? (5 - data.searchLimits.dailyRemaining) : 0
        };
        
        limitedData.contextualUpgradePrompt = createUpgradePrompt(searchContext);
      }
      
      return originalJson.call(this, limitedData);
    }
    
    // For non-search responses, return as-is
    return originalJson.call(this, data);
  };
  
  next();
};

module.exports = {
  limitSearchResults,
  createUpgradePrompt,
  applyTierLimitsMiddleware,
  sanitizeProperty,
  sanitizeMetadata,
  getTierLimits,
  FREE_TIER_LIMITS,
  PREMIUM_TIER_LIMITS
};
