/**
 * Public Pricing API Routes
 * 
 * Provides public access to pricing information:
 * 1. GET /pricing/current - Current FXCT rates and 7-day average price
 * 2. GET /pricing/plan-estimate - Estimate tokens for subscription plans
 * 3. GET /pricing/usage/summary - User's usage summary and balance
 * 4. GET /pricing/history - Historical pricing data
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Import pricing services
const { priceFeedService } = require('../pricing/priceFeed');
const { fxctRatesService } = require('../pricing/fxctRates');
const { tokenIssuanceService } = require('../pricing/tokenIssuance');
const { overageHandlerService } = require('../pricing/overageHandler');
const { costTableService } = require('../pricing/costTable');

// Rate limiting for pricing endpoints
const pricingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too many pricing requests',
    retryAfter: '60 seconds'
  }
});

// Apply rate limiting to all pricing endpoints
router.use(pricingLimiter);

/**
 * GET /pricing/current
 * Returns current FXCT rates and 7-day average price
 */
router.get('/current', async (req, res) => {
  try {
    // Get 7-day average FXCT price
    const priceData = await priceFeedService.getSevenDayAverage();
    
    // Get current FXCT rates for all data types
    const currentRates = await fxctRatesService.getCurrentRates();
    
    // Get cost table summary
    const costSummary = await costTableService.getCostsSummary();

    const response = {
      fxct_usd_7d_avg: priceData.price,
      price_data: {
        period: priceData.period,
        data_points: priceData.dataPoints,
        is_stale: priceData.isStale,
        staleness_hours: priceData.staleness,
        last_update: priceData.lastUpdate,
        price_range: priceData.priceRange
      },
      fxct_rates: {},
      cost_basis: costSummary.version,
      last_updated: new Date().toISOString(),
      margin_info: {
        target_margin: require('../config/pricing').getEffectiveMargin(),
        strict_mode: process.env.PRICING_STRICT_MODE === 'true'
      }
    };

    // Format rates for public consumption
    for (const [dataType, rateInfo] of Object.entries(currentRates)) {
      response.fxct_rates[dataType.toLowerCase()] = {
        fxct_per_call: rateInfo.fxctRate,
        usd_cost_basis: rateInfo.usdCost,
        margin: rateInfo.margin,
        effective_from: rateInfo.effectiveFrom,
        floor_applied: rateInfo.metadata?.appliedFloor || false
      };
    }

    res.json({
      success: true,
      data: response,
      cache_ttl: 300 // 5 minutes
    });

  } catch (error) {
    console.error('❌ Failed to get current pricing:', error.message);
    res.status(500).json({
      error: 'PRICING_SERVICE_ERROR',
      message: 'Failed to retrieve current pricing data'
    });
  }
});

/**
 * GET /pricing/plan-estimate
 * Estimate monthly token issuance for subscription plans
 */
router.get('/plan-estimate', async (req, res) => {
  try {
    const { plan_id, custom_price } = req.query;
    
    if (!plan_id) {
      return res.status(400).json({
        error: 'MISSING_PLAN_ID',
        message: 'plan_id query parameter is required'
      });
    }

    // Get estimation for the plan
    const estimation = await tokenIssuanceService.estimateMonthlyIssuance(
      plan_id, 
      custom_price ? parseFloat(custom_price) : null
    );

    const response = {
      plan_id: estimation.planId,
      plan_price_usd: estimation.planPrice,
      fxct_usd_avg_7d: estimation.fxctUsdAvg,
      estimated_tokens: estimation.estimatedTokens,
      effective_value_usd: estimation.effectiveValue,
      utilization_rate: estimation.utilizationRate,
      price_data: {
        data_points: estimation.priceDataPoints,
        is_stale: estimation.priceStale
      },
      calculation: {
        raw_tokens: estimation.rawCalculation,
        rounded_down: Math.floor(estimation.rawCalculation),
        user_protection: 'Tokens rounded DOWN to protect user value'
      },
      estimate_valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    res.json({
      success: true,
      data: response,
      cache_ttl: 3600 // 1 hour
    });

  } catch (error) {
    console.error('❌ Failed to get plan estimate:', error.message);
    res.status(500).json({
      error: 'ESTIMATION_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /pricing/usage/summary
 * Get user's usage summary and balance (requires authentication)
 */
router.get('/usage/summary', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'User authentication required for usage summary'
      });
    }

    const userId = req.user._id.toString();
    const days = parseInt(req.query.days) || 30;

    // Get user balance
    const balance = await tokenIssuanceService.getUserBalance(userId);
    
    // Get usage statistics
    const { UsageLedger } = require('../models/PricingModels');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usageStats = await UsageLedger.aggregate([
      {
        $match: {
          userId: new require('mongoose').Types.ObjectId(userId),
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$dataType',
          total_calls: { $sum: 1 },
          total_fxct_spent: { $sum: '$fxctDebited' },
          total_usd_value: { $sum: '$usdCostRef' },
          avg_fxct_per_call: { $avg: '$fxctDebited' },
          last_usage: { $max: '$timestamp' }
        }
      },
      { $sort: { total_fxct_spent: -1 } }
    ]);

    const totalSpent = usageStats.reduce((sum, stat) => sum + stat.total_fxct_spent, 0);
    const totalCalls = usageStats.reduce((sum, stat) => sum + stat.total_calls, 0);

    // Get overage statistics
    const overageStats = await overageHandlerService.getUserOverageStats(userId, days);

    const response = {
      user_id: userId,
      period: `${days} days`,
      balance: {
        current: balance.balance,
        total_issued: balance.totalIssued,
        total_spent: balance.totalSpent,
        total_refunded: balance.totalRefunded,
        last_issuance: balance.lastIssuance,
        last_spend: balance.lastSpend,
        status: balance.status
      },
      usage_summary: {
        total_api_calls: totalCalls,
        total_fxct_spent: totalSpent,
        avg_fxct_per_call: totalCalls > 0 ? totalSpent / totalCalls : 0,
        usage_by_data_type: usageStats.map(stat => ({
          data_type: stat._id,
          calls: stat.total_calls,
          fxct_spent: stat.total_fxct_spent,
          usd_value: stat.total_usd_value,
          avg_per_call: stat.avg_fxct_per_call,
          last_usage: stat.last_usage
        }))
      },
      overage_info: {
        overage_events: overageStats.overageEvents,
        deficit_fxct: overageStats.totalFxctDeficit,
        purchases_made: overageStats.totalPurchases,
        conversion_rate: overageStats.conversionRate
      },
      projections: {
        monthly_burn_rate: totalSpent * (30 / days),
        days_remaining: balance.balance > 0 && totalSpent > 0 ? 
          Math.floor((balance.balance * days) / totalSpent) : null
      }
    };

    res.json({
      success: true,
      data: response,
      cache_ttl: 60 // 1 minute
    });

  } catch (error) {
    console.error('❌ Failed to get usage summary:', error.message);
    res.status(500).json({
      error: 'USAGE_SUMMARY_ERROR',
      message: 'Failed to retrieve usage summary'
    });
  }
});

/**
 * GET /pricing/history
 * Get historical pricing data
 */
router.get('/history', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90); // Max 90 days
    const type = req.query.type || 'rates'; // 'rates' or 'prices'

    if (type === 'prices') {
      // Get FXCT price history
      const priceHistory = await priceFeedService.getPriceHistory(null, days);
      
      const response = {
        type: 'fxct_price_history',
        period: `${days} days`,
        data: priceHistory.map(record => ({
          date: record.day,
          price_usd: record.price,
          source: record.source,
          is_stale: record.isStale
        }))
      };

      return res.json({
        success: true,
        data: response,
        cache_ttl: 3600 // 1 hour
      });

    } else {
      // Get FXCT rates history
      const ratesHistory = await fxctRatesService.getRatesHistory(days);
      
      // Group by effective date
      const groupedHistory = {};
      ratesHistory.forEach(rate => {
        const dateKey = rate.effectiveFrom.toISOString().split('T')[0];
        if (!groupedHistory[dateKey]) {
          groupedHistory[dateKey] = {
            date: dateKey,
            fxct_usd_avg: rate.fxctUsdAvg,
            margin: rate.margin,
            rates: {}
          };
        }
        groupedHistory[dateKey].rates[rate.dataType.toLowerCase()] = {
          fxct_per_call: rate.fxctRate,
          usd_cost_basis: rate.usdCost,
          floor_applied: rate.metadata?.appliedFloor || false
        };
      });

      const response = {
        type: 'fxct_rates_history',
        period: `${days} days`,
        data: Object.values(groupedHistory).sort((a, b) => new Date(b.date) - new Date(a.date))
      };

      return res.json({
        success: true,
        data: response,
        cache_ttl: 1800 // 30 minutes
      });
    }

  } catch (error) {
    console.error('❌ Failed to get pricing history:', error.message);
    res.status(500).json({
      error: 'HISTORY_ERROR',
      message: 'Failed to retrieve pricing history'
    });
  }
});

/**
 * GET /pricing/data-types
 * Get available data types and their descriptions
 */
router.get('/data-types', async (req, res) => {
  try {
    const costs = await costTableService.loadCosts();
    
    const response = {
      data_types: {},
      endpoints_mapping: costs.dataTypeMapping,
      enrichment_apis: costs.enrichmentAPIs,
      last_updated: costs.lastUpdated,
      version: costs.version
    };

    // Format data types
    for (const [dataType, config] of Object.entries(costs.costs)) {
      response.data_types[dataType.toLowerCase()] = {
        description: config.description,
        base_cost_usd: config.defaultCost,
        providers: Object.keys(config.providers || {})
      };
    }

    res.json({
      success: true,
      data: response,
      cache_ttl: 1800 // 30 minutes
    });

  } catch (error) {
    console.error('❌ Failed to get data types:', error.message);
    res.status(500).json({
      error: 'DATA_TYPES_ERROR',
      message: 'Failed to retrieve data types information'
    });
  }
});

/**
 * GET /pricing/health
 * Health check for pricing system
 */
router.get('/health', async (req, res) => {
  try {
    const [priceHealth, ratesStatus, costsStatus] = await Promise.all([
      priceFeedService.healthCheck(),
      fxctRatesService.getCurrentRates().then(() => ({ status: 'healthy' })).catch(e => ({ status: 'unhealthy', error: e.message })),
      costTableService.getCostsSummary().then(() => ({ status: 'healthy' })).catch(e => ({ status: 'unhealthy', error: e.message }))
    ]);

    const overall = priceHealth.status === 'healthy' && 
                   ratesStatus.status === 'healthy' && 
                   costsStatus.status === 'healthy' ? 'healthy' : 'degraded';

    const response = {
      overall_status: overall,
      components: {
        price_feed: priceHealth,
        fxct_rates: ratesStatus,
        cost_table: costsStatus
      },
      timestamp: new Date().toISOString()
    };

    const statusCode = overall === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      success: overall === 'healthy',
      data: response
    });

  } catch (error) {
    console.error('❌ Pricing health check failed:', error.message);
    res.status(503).json({
      success: false,
      error: 'HEALTH_CHECK_ERROR',
      message: 'Pricing system health check failed'
    });
  }
});

module.exports = router;
