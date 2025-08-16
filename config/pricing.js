/**
 * FXCT Pricing System Configuration
 * 
 * This configuration manages the 7-day FXCT pricing engine that:
 * 1. Fetches FXCT/USD price from oracles
 * 2. Calculates margin-safe FXCT rates for API calls
 * 3. Issues monthly FXCT tokens based on subscription plans
 * 4. Handles overages and budget controls
 */

const config = {
  // Core pricing configuration
  PRICING_TARGET_MARGIN: parseFloat(process.env.PRICING_TARGET_MARGIN) || 0.75, // 75% margin default
  FXCT_SYMBOL: process.env.FXCT_SYMBOL || 'FXCT',
  
  // Oracle configuration with fallback
  PRICE_ORACLE_URL: process.env.PRICE_ORACLE_URL || 'https://api.chainlink.io/v1/price/FXCT-USD',
  FALLBACK_ORACLE_URL: process.env.FALLBACK_ORACLE_URL || 'https://api.coingecko.com/api/v3/simple/price?ids=fractionax&vs_currencies=usd',
  
  // Cron schedule for price updates (daily at 00:15 UTC by default)
  PRICING_UPDATE_CRON: process.env.PRICING_UPDATE_CRON || '15 0 * * *',
  
  // Oracle request configuration
  ORACLE_TIMEOUT_MS: parseInt(process.env.ORACLE_TIMEOUT_MS) || 10000,
  ORACLE_RETRY_ATTEMPTS: parseInt(process.env.ORACLE_RETRY_ATTEMPTS) || 3,
  ORACLE_RETRY_DELAY_MS: parseInt(process.env.ORACLE_RETRY_DELAY_MS) || 2000,
  
  // Cache and staleness configuration
  PRICE_CACHE_TTL_SECONDS: parseInt(process.env.PRICE_CACHE_TTL_SECONDS) || 3600, // 1 hour
  MAX_PRICE_STALENESS_HOURS: parseInt(process.env.MAX_PRICE_STALENESS_HOURS) || 48,
  
  // Minimum FXCT floors by data type
  MINIMUM_FXCT_FLOORS: {
    BASIC: parseFloat(process.env.MIN_FXCT_BASIC) || 2.0,
    STANDARD: parseFloat(process.env.MIN_FXCT_STANDARD) || 20.0,
    PRO_LOW: parseFloat(process.env.MIN_FXCT_PRO_LOW) || 60.0,
    PRO_HIGH: parseFloat(process.env.MIN_FXCT_PRO_HIGH) || 150.0
  },
  
  // Subscription plan USD prices
  SUBSCRIPTION_PLANS: {
    basic: { usd_price: 99, name: 'Basic' },
    standard: { usd_price: 299, name: 'Standard' },
    pro: { usd_price: 699, name: 'Pro' },
    enterprise: { usd_price: null, name: 'Enterprise' } // Custom pricing
  },
  
  // Feature flags and guardrails
  PRICING_STRICT_MODE: process.env.PRICING_STRICT_MODE === 'true',
  STRICT_MODE_FLOOR_INCREASE: parseFloat(process.env.STRICT_MODE_FLOOR_INCREASE) || 0.10, // 10% increase
  
  // Alerting thresholds
  MARGIN_ALERT_THRESHOLD: parseFloat(process.env.MARGIN_ALERT_THRESHOLD) || 0.05, // Alert if margin drops 5% below target
  
  // Database configuration
  PRICING_DB_COLLECTION_PREFIX: process.env.PRICING_DB_COLLECTION_PREFIX || 'pricing_',
  
  // API endpoint configuration
  PRICING_API_PREFIX: process.env.PRICING_API_PREFIX || '/pricing',
  INTERNAL_PRICING_API_PREFIX: process.env.INTERNAL_PRICING_API_PREFIX || '/internal/pricing',
  ADMIN_PRICING_API_PREFIX: process.env.ADMIN_PRICING_API_PREFIX || '/admin/pricing',
  
  // Buy FXCT integration
  BUY_FXCT_URL: process.env.BUY_FXCT_URL || 'https://app.fractionax.com/buy-fxct',
  
  // Observability
  METRICS_ENABLED: process.env.PRICING_METRICS_ENABLED !== 'false',
  METRICS_PREFIX: process.env.PRICING_METRICS_PREFIX || 'fxct_pricing_',
  
  // Rate limiting for pricing endpoints
  PRICING_RATE_LIMIT: {
    windowMs: parseInt(process.env.PRICING_RATE_WINDOW_MS) || 60000, // 1 minute
    max: parseInt(process.env.PRICING_RATE_MAX_REQUESTS) || 100 // 100 requests per minute
  }
};

// Validation function for configuration
function validatePricingConfig() {
  const errors = [];
  
  if (config.PRICING_TARGET_MARGIN <= 0 || config.PRICING_TARGET_MARGIN >= 1) {
    errors.push('PRICING_TARGET_MARGIN must be between 0 and 1');
  }
  
  if (!config.PRICE_ORACLE_URL || !config.FALLBACK_ORACLE_URL) {
    errors.push('Both PRICE_ORACLE_URL and FALLBACK_ORACLE_URL must be configured');
  }
  
  // Validate minimum floors are positive
  for (const [type, floor] of Object.entries(config.MINIMUM_FXCT_FLOORS)) {
    if (floor <= 0) {
      errors.push(`Minimum floor for ${type} must be positive`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Pricing configuration errors: ${errors.join(', ')}`);
  }
  
  return true;
}

// Helper function to get effective margin with strict mode consideration
function getEffectiveMargin() {
  let margin = config.PRICING_TARGET_MARGIN;
  
  if (config.PRICING_STRICT_MODE) {
    // In strict mode, increase margin to be more conservative
    margin = Math.min(margin + 0.05, 0.85); // Cap at 85%
  }
  
  return margin;
}

// Helper function to get effective floors with strict mode consideration
function getEffectiveFloors() {
  const floors = { ...config.MINIMUM_FXCT_FLOORS };
  
  if (config.PRICING_STRICT_MODE) {
    // Increase all floors by the configured percentage
    for (const [type, floor] of Object.entries(floors)) {
      floors[type] = floor * (1 + config.STRICT_MODE_FLOOR_INCREASE);
    }
  }
  
  return floors;
}

module.exports = {
  ...config,
  validatePricingConfig,
  getEffectiveMargin,
  getEffectiveFloors
};
