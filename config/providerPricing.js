/**
 * Provider Pricing Configuration
 * Real-world pricing models for all external API providers
 * Last Updated: 2024-08-08
 */

const PROVIDER_PRICING = {
  // ===== OPENAI PRICING (Token-based, Updated January 2024) =====
  openai: {
    type: 'token_based',
    currency: 'USD',
    models: {
      'gpt-4': {
        input_cost_per_1k_tokens: 0.03,
        output_cost_per_1k_tokens: 0.06,
        max_tokens: 8192
      },
      'gpt-4-32k': {
        input_cost_per_1k_tokens: 0.06,
        output_cost_per_1k_tokens: 0.12,
        max_tokens: 32768
      },
      'gpt-3.5-turbo': {
        input_cost_per_1k_tokens: 0.0015,
        output_cost_per_1k_tokens: 0.002,
        max_tokens: 4096
      },
      'gpt-3.5-turbo-16k': {
        input_cost_per_1k_tokens: 0.003,
        output_cost_per_1k_tokens: 0.004,
        max_tokens: 16384
      },
      'text-embedding-ada-002': {
        cost_per_1k_tokens: 0.0001,
        max_tokens: 8191
      },
      'text-davinci-003': {
        cost_per_1k_tokens: 0.02,
        max_tokens: 4097
      }
    },
    volume_discounts: [
      { threshold: 1000000, discount: 0.05 },  // 5% discount for 1M+ tokens/month
      { threshold: 10000000, discount: 0.10 }, // 10% discount for 10M+ tokens/month
      { threshold: 100000000, discount: 0.15 } // 15% discount for 100M+ tokens/month
    ]
  },

  // ===== CORELOGIC PRICING (Per-call with tiered pricing) =====
  corelogic: {
    type: 'per_call',
    currency: 'USD',
    endpoints: {
      'property/search': {
        base_cost: 2.50,
        description: 'Property search query'
      },
      'property/detail': {
        base_cost: 15.00,
        description: 'Detailed property report'
      },
      'property/comparables': {
        base_cost: 12.50,
        description: 'Comparable properties analysis'
      },
      'property/history': {
        base_cost: 8.00,
        description: 'Property transaction history'
      },
      'property/valuation': {
        base_cost: 25.00,
        description: 'Professional property valuation'
      },
      'property/rental': {
        base_cost: 10.00,
        description: 'Rental market analysis'
      }
    },
    volume_tiers: [
      { min_calls: 0, max_calls: 100, multiplier: 1.0 },      // Full price for 0-100 calls
      { min_calls: 101, max_calls: 500, multiplier: 0.90 },   // 10% discount for 101-500 calls
      { min_calls: 501, max_calls: 1000, multiplier: 0.85 },  // 15% discount for 501-1000 calls
      { min_calls: 1001, max_calls: 5000, multiplier: 0.80 }, // 20% discount for 1001-5000 calls
      { min_calls: 5001, max_calls: null, multiplier: 0.70 }  // 30% discount for 5000+ calls
    ]
  },

  // ===== ATTOM DATA PRICING =====
  attom: {
    type: 'per_call',
    currency: 'USD',
    endpoints: {
      'property/basicprofile': {
        base_cost: 0.75,
        description: 'Basic property information'
      },
      'property/detailprofile': {
        base_cost: 2.50,
        description: 'Detailed property profile'
      },
      'property/expandedprofile': {
        base_cost: 4.00,
        description: 'Expanded property data'
      },
      'avm/detail': {
        base_cost: 8.50,
        description: 'Automated Valuation Model'
      },
      'avm/salescomps': {
        base_cost: 6.00,
        description: 'AVM with sales comparables'
      },
      'saleshistory/detail': {
        base_cost: 1.25,
        description: 'Property sales history'
      },
      'assessor/detail': {
        base_cost: 1.00,
        description: 'Assessor data'
      }
    },
    volume_tiers: [
      { min_calls: 0, max_calls: 250, multiplier: 1.0 },
      { min_calls: 251, max_calls: 1000, multiplier: 0.92 },
      { min_calls: 1001, max_calls: 2500, multiplier: 0.85 },
      { min_calls: 2501, max_calls: null, multiplier: 0.78 }
    ]
  },

  // ===== ZILLOW PRICING =====
  zillow: {
    type: 'per_call',
    currency: 'USD',
    endpoints: {
      'property/details': {
        base_cost: 1.50,
        description: 'Property details from Zillow'
      },
      'property/images': {
        base_cost: 0.25,
        description: 'Property images'
      },
      'property/zestimate': {
        base_cost: 2.00,
        description: 'Zestimate valuation'
      },
      'property/rentestimate': {
        base_cost: 1.75,
        description: 'Rent estimate'
      }
    },
    volume_tiers: [
      { min_calls: 0, max_calls: 500, multiplier: 1.0 },
      { min_calls: 501, max_calls: 2000, multiplier: 0.88 },
      { min_calls: 2001, max_calls: null, multiplier: 0.75 }
    ]
  },

  // ===== GOOGLE MAPS PRICING =====
  googlemaps: {
    type: 'per_call',
    currency: 'USD',
    endpoints: {
      'geocoding': {
        base_cost: 0.005,
        description: 'Geocoding API call'
      },
      'places/nearbysearch': {
        base_cost: 0.032,
        description: 'Places Nearby Search'
      },
      'places/details': {
        base_cost: 0.017,
        description: 'Place Details'
      },
      'places/textsearch': {
        base_cost: 0.032,
        description: 'Places Text Search'
      },
      'directions': {
        base_cost: 0.005,
        description: 'Directions API'
      },
      'distancematrix': {
        base_cost: 0.005,
        description: 'Distance Matrix API'
      },
      'elevation': {
        base_cost: 0.005,
        description: 'Elevation API'
      }
    },
    // Google offers $200 free credit monthly
    free_tier: {
      monthly_credit: 200,
      applies_to: 'all'
    },
    volume_tiers: [
      { min_calls: 0, max_calls: null, multiplier: 1.0 } // Google uses flat pricing
    ]
  },

  // ===== GREAT SCHOOLS PRICING =====
  greatschools: {
    type: 'per_call',
    currency: 'USD',
    endpoints: {
      'schools/nearby': {
        base_cost: 0.10,
        description: 'Schools near location'
      },
      'schools/detail': {
        base_cost: 0.15,
        description: 'School detailed information'
      },
      'schools/reviews': {
        base_cost: 0.08,
        description: 'School reviews and ratings'
      }
    },
    volume_tiers: [
      { min_calls: 0, max_calls: 1000, multiplier: 1.0 },
      { min_calls: 1001, max_calls: 5000, multiplier: 0.85 },
      { min_calls: 5001, max_calls: null, multiplier: 0.70 }
    ]
  },

  // ===== SUMSUB (KYC/AML) PRICING =====
  sumsub: {
    type: 'per_verification',
    currency: 'USD',
    services: {
      'identity_verification': {
        base_cost: 2.50,
        description: 'Identity document verification'
      },
      'liveness_check': {
        base_cost: 1.50,
        description: 'Biometric liveness verification'
      },
      'aml_screening': {
        base_cost: 0.75,
        description: 'AML/sanctions screening'
      },
      'ongoing_monitoring': {
        base_cost: 0.25,
        description: 'Ongoing AML monitoring per month'
      }
    },
    volume_tiers: [
      { min_verifications: 0, max_verifications: 100, multiplier: 1.0 },
      { min_verifications: 101, max_verifications: 500, multiplier: 0.90 },
      { min_verifications: 501, max_verifications: 1000, multiplier: 0.80 },
      { min_verifications: 1001, max_verifications: null, multiplier: 0.70 }
    ]
  },

  // ===== JUMIO (Identity Verification) PRICING =====
  jumio: {
    type: 'per_verification',
    currency: 'USD',
    services: {
      'id_verification': {
        base_cost: 3.25,
        description: 'ID document verification'
      },
      'identity_verification': {
        base_cost: 4.50,
        description: 'Full identity verification with selfie'
      },
      'document_verification': {
        base_cost: 2.00,
        description: 'Document authenticity check'
      },
      'aml_screening': {
        base_cost: 1.25,
        description: 'AML and sanctions screening'
      }
    },
    volume_tiers: [
      { min_verifications: 0, max_verifications: 100, multiplier: 1.0 },
      { min_verifications: 101, max_verifications: 1000, multiplier: 0.85 },
      { min_verifications: 1001, max_verifications: 5000, multiplier: 0.75 },
      { min_verifications: 5001, max_verifications: null, multiplier: 0.65 }
    ]
  },

  // ===== SENDGRID (Email) PRICING =====
  sendgrid: {
    type: 'per_email',
    currency: 'USD',
    tiers: [
      { min_emails: 0, max_emails: 100, cost_per_email: 0 },           // Free tier
      { min_emails: 101, max_emails: 40000, cost_per_email: 0.000375 }, // Essentials
      { min_emails: 40001, max_emails: 100000, cost_per_email: 0.00015 }, // Pro
      { min_emails: 100001, max_emails: null, cost_per_email: 0.00009 }   // Premier
    ],
    additional_features: {
      'dedicated_ip': 50.00, // Monthly cost
      'ip_warmup': 0,        // Included
      'advanced_suppression': 0 // Included
    }
  },

  // ===== TWILIO (SMS/Voice) PRICING =====
  twilio: {
    type: 'per_message',
    currency: 'USD',
    services: {
      'sms_us': {
        cost_per_message: 0.0075,
        description: 'SMS within United States'
      },
      'sms_canada': {
        cost_per_message: 0.0075,
        description: 'SMS to Canada'
      },
      'sms_uk': {
        cost_per_message: 0.04,
        description: 'SMS to United Kingdom'
      },
      'sms_international': {
        cost_per_message: 0.085,
        description: 'SMS international average'
      },
      'voice_us': {
        cost_per_minute: 0.013,
        description: 'Voice calls within United States'
      },
      'voice_international': {
        cost_per_minute: 0.045,
        description: 'International voice calls average'
      }
    }
  }
};

// ===== PRICING UTILITY FUNCTIONS =====

/**
 * Get volume tier multiplier based on usage
 */
function getVolumeTierMultiplier(provider, callCount) {
  const providerConfig = PROVIDER_PRICING[provider.toLowerCase()];
  if (!providerConfig || !providerConfig.volume_tiers) return 1.0;

  for (const tier of providerConfig.volume_tiers) {
    if (callCount >= tier.min_calls && (tier.max_calls === null || callCount <= tier.max_calls)) {
      return tier.multiplier;
    }
  }
  
  return 1.0; // Default to no discount
}

/**
 * Calculate OpenAI token-based pricing
 */
function calculateOpenAITokenCost(model, inputTokens, outputTokens = 0) {
  const modelConfig = PROVIDER_PRICING.openai.models[model.toLowerCase()];
  if (!modelConfig) {
    console.warn(`Unknown OpenAI model: ${model}, using GPT-3.5-turbo pricing`);
    return calculateOpenAITokenCost('gpt-3.5-turbo', inputTokens, outputTokens);
  }

  let cost = 0;

  // Handle models with separate input/output pricing
  if (modelConfig.input_cost_per_1k_tokens && modelConfig.output_cost_per_1k_tokens) {
    cost = (inputTokens / 1000) * modelConfig.input_cost_per_1k_tokens;
    cost += (outputTokens / 1000) * modelConfig.output_cost_per_1k_tokens;
  }
  // Handle models with single token pricing (embeddings, older models)
  else if (modelConfig.cost_per_1k_tokens) {
    const totalTokens = inputTokens + outputTokens;
    cost = (totalTokens / 1000) * modelConfig.cost_per_1k_tokens;
  }

  return parseFloat(cost.toFixed(6));
}

/**
 * Calculate per-call pricing with volume discounts
 */
function calculatePerCallCost(provider, endpoint, monthlyCallCount = 0) {
  const providerConfig = PROVIDER_PRICING[provider.toLowerCase()];
  if (!providerConfig) return 0;

  let baseCost = 0;

  // Get base cost from endpoints or services
  if (providerConfig.endpoints && providerConfig.endpoints[endpoint]) {
    baseCost = providerConfig.endpoints[endpoint].base_cost;
  } else if (providerConfig.services && providerConfig.services[endpoint]) {
    baseCost = providerConfig.services[endpoint].base_cost;
  } else {
    console.warn(`Unknown endpoint: ${provider}/${endpoint}`);
    return 0;
  }

  // Apply volume tier discount
  const tierMultiplier = getVolumeTierMultiplier(provider, monthlyCallCount);
  const finalCost = baseCost * tierMultiplier;

  return parseFloat(finalCost.toFixed(4));
}

/**
 * Get monthly usage stats for a provider from real database
 */
async function getMonthlyUsageStats(provider, userId = null) {
  try {
    // Import NetworkAnalytics model dynamically to avoid circular dependency
    const NetworkAnalytics = require('../models/NetworkAnalytics');
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Build aggregation query
    const matchQuery = {
      provider: provider.toLowerCase(),
      createdAt: { $gte: thirtyDaysAgo },
      status: { $ne: 'error' } // Only count successful calls for volume tiers
    };
    
    // Add user filter if specified
    if (userId) {
      matchQuery.userId = userId;
    }
    
    const stats = await NetworkAnalytics.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          totalCost: { $sum: '$cost' },
          averageResponseTime: { $avg: '$responseTime' },
          successRate: {
            $avg: {
              $cond: [{ $eq: ['$status', 'success'] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    if (stats.length === 0) {
      return {
        totalCalls: 0,
        totalTokens: 0,
        totalCost: 0,
        averageResponseTime: 0,
        successRate: 0
      };
    }
    
    const result = stats[0];
    
    // For OpenAI, estimate tokens based on request/response sizes and historical data
    let totalTokens = 0;
    if (provider.toLowerCase() === 'openai') {
      // Rough estimation: average API call uses ~1000 tokens
      totalTokens = result.totalCalls * 1000;
    }
    
    return {
      totalCalls: result.totalCalls || 0,
      totalTokens,
      totalCost: result.totalCost || 0,
      averageResponseTime: Math.round(result.averageResponseTime || 0),
      successRate: (result.successRate * 100).toFixed(1)
    };
  } catch (error) {
    console.warn(`Failed to get monthly usage stats for ${provider}:`, error.message);
    // Return safe defaults if database query fails
    return {
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      averageResponseTime: 0,
      successRate: 0
    };
  }
}

/**
 * Estimate cost for a provider API call
 */
async function estimateProviderCost(provider, endpoint, options = {}) {
  const {
    model,           // For OpenAI
    inputTokens,     // For token-based pricing
    outputTokens,    // For token-based pricing
    userId,          // For user-specific volume discounts
    messageCount,    // For SMS/Email
    verificationCount // For KYC providers
  } = options;

  const providerLower = provider.toLowerCase();
  
  // Get monthly usage for volume tier calculation
  const monthlyStats = await getMonthlyUsageStats(providerLower, userId);

  switch (providerLower) {
    case 'openai':
      if (!model || !inputTokens) {
        console.warn('OpenAI cost calculation requires model and inputTokens');
        return 0;
      }
      return calculateOpenAITokenCost(model, inputTokens, outputTokens || 0);

    case 'corelogic':
    case 'attom':
    case 'zillow':
    case 'googlemaps':
    case 'greatschools':
      return calculatePerCallCost(providerLower, endpoint, monthlyStats.totalCalls);

    case 'sumsub':
    case 'jumio':
      const verificationTier = getVolumeTierMultiplier(providerLower, verificationCount || monthlyStats.totalCalls);
      const serviceConfig = PROVIDER_PRICING[providerLower].services[endpoint];
      return serviceConfig ? serviceConfig.base_cost * verificationTier : 0;

    case 'sendgrid':
      const emailTiers = PROVIDER_PRICING.sendgrid.tiers;
      const emailCount = messageCount || 1;
      
      for (const tier of emailTiers) {
        if (emailCount >= tier.min_emails && (tier.max_emails === null || emailCount <= tier.max_emails)) {
          return tier.cost_per_email * emailCount;
        }
      }
      return 0;

    case 'twilio':
      const twilioService = PROVIDER_PRICING.twilio.services[endpoint];
      const count = messageCount || 1;
      return twilioService ? twilioService.cost_per_message * count : 0;

    default:
      console.warn(`Unknown provider for cost calculation: ${provider}`);
      return 0;
  }
}

module.exports = {
  PROVIDER_PRICING,
  getVolumeTierMultiplier,
  calculateOpenAITokenCost,
  calculatePerCallCost,
  estimateProviderCost,
  getMonthlyUsageStats
};
