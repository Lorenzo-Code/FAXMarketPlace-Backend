/**
 * Admin Pricing Control Routes
 * 
 * Admin-only endpoints for managing the pricing system:
 * 1. POST /admin/pricing/recompute - Force recomputation of FXCT rates
 * 2. POST /admin/pricing/set-margin - Update target margin
 * 3. POST /admin/pricing/set-floors - Update minimum FXCT floors
 * 4. POST /admin/pricing/update-costs - Update provider costs
 * 5. POST /admin/pricing/issue-tokens - Manual token issuance
 * 6. GET /admin/pricing/analytics - Detailed pricing analytics
 */

const express = require('express');
const router = express.Router();

// Import pricing services
const { priceFeedService } = require('../../pricing/priceFeed');
const { fxctRatesService } = require('../../pricing/fxctRates');
const { tokenIssuanceService } = require('../../pricing/tokenIssuance');
const { overageHandlerService } = require('../../pricing/overageHandler');
const { costTableService } = require('../../pricing/costTable');

// Admin authorization middleware (assumes this exists)
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'ADMIN_REQUIRED',
      message: 'Administrator privileges required'
    });
  }
  next();
};

// Apply admin authorization to all routes
router.use(requireAdmin);

/**
 * POST /admin/pricing/recompute
 * Force immediate recomputation of FXCT rates
 */
router.post('/recompute', async (req, res) => {
  try {
    console.log(`🔧 Admin ${req.user._id} triggered FXCT rates recomputation`);
    
    const { force_price_update } = req.body;
    
    // Optionally force price update first
    if (force_price_update) {
      await priceFeedService.updateDailyPrice();
    }
    
    // Force recompute all rates
    const newRates = await fxctRatesService.computeAllRates(true);
    
    // Get margin analysis
    const marginAnalysis = await fxctRatesService.getMarginAnalysis();
    
    const response = {
      success: true,
      message: 'FXCT rates recomputed successfully',
      computed_at: new Date().toISOString(),
      rates: newRates,
      margin_analysis: marginAnalysis,
      admin_user: req.user._id
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Admin rate recomputation failed:', error.message);
    res.status(500).json({
      error: 'RECOMPUTATION_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /admin/pricing/set-margin
 * Update the target margin for FXCT pricing
 */
router.post('/set-margin', async (req, res) => {
  try {
    const { margin } = req.body;
    
    // Validate margin
    if (!margin || margin <= 0 || margin >= 1) {
      return res.status(400).json({
        error: 'INVALID_MARGIN',
        message: 'Margin must be between 0 and 1 (exclusive)'
      });
    }
    
    console.log(`🔧 Admin ${req.user._id} updating target margin to ${(margin * 100).toFixed(1)}%`);
    
    // Update environment variable (in production, this would be persisted)
    process.env.PRICING_TARGET_MARGIN = margin.toString();
    
    // Trigger rates recomputation with new margin
    const newRates = await fxctRatesService.computeAllRates(true);
    
    const response = {
      success: true,
      message: `Target margin updated to ${(margin * 100).toFixed(1)}%`,
      old_margin: require('../../config/pricing').PRICING_TARGET_MARGIN,
      new_margin: margin,
      updated_at: new Date().toISOString(),
      new_rates: newRates,
      admin_user: req.user._id
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Admin margin update failed:', error.message);
    res.status(500).json({
      error: 'MARGIN_UPDATE_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /admin/pricing/set-floors
 * Update minimum FXCT floors for data types
 */
router.post('/set-floors', async (req, res) => {
  try {
    const { floors } = req.body;
    
    if (!floors || typeof floors !== 'object') {
      return res.status(400).json({
        error: 'INVALID_FLOORS',
        message: 'Floors must be an object with data type keys'
      });
    }
    
    // Validate floors
    const validDataTypes = ['BASIC', 'STANDARD', 'PRO_LOW', 'PRO_HIGH'];
    for (const [dataType, floor] of Object.entries(floors)) {
      if (!validDataTypes.includes(dataType)) {
        return res.status(400).json({
          error: 'INVALID_DATA_TYPE',
          message: `Invalid data type: ${dataType}`
        });
      }
      if (typeof floor !== 'number' || floor <= 0) {
        return res.status(400).json({
          error: 'INVALID_FLOOR_VALUE',
          message: `Floor for ${dataType} must be a positive number`
        });
      }
    }
    
    console.log(`🔧 Admin ${req.user._id} updating FXCT floors:`, floors);
    
    // Update environment variables (in production, this would be persisted)
    for (const [dataType, floor] of Object.entries(floors)) {
      process.env[`MIN_FXCT_${dataType}`] = floor.toString();
    }
    
    // Trigger rates recomputation with new floors
    const newRates = await fxctRatesService.computeAllRates(true);
    
    const response = {
      success: true,
      message: 'FXCT floors updated successfully',
      updated_floors: floors,
      updated_at: new Date().toISOString(),
      new_rates: newRates,
      admin_user: req.user._id
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Admin floors update failed:', error.message);
    res.status(500).json({
      error: 'FLOORS_UPDATE_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /admin/pricing/update-costs
 * Update provider costs configuration
 */
router.post('/update-costs', async (req, res) => {
  try {
    const { costs, reason } = req.body;
    
    if (!costs) {
      return res.status(400).json({
        error: 'MISSING_COSTS',
        message: 'Costs configuration is required'
      });
    }
    
    console.log(`🔧 Admin ${req.user._id} updating provider costs. Reason: ${reason || 'No reason provided'}`);
    
    // Add metadata
    costs.updated_by = req.user._id;
    costs.updated_reason = reason;
    costs.updated_at = new Date().toISOString();
    
    // Update costs
    const success = await costTableService.updateCosts(costs);
    
    if (!success) {
      throw new Error('Failed to update costs configuration');
    }
    
    // Trigger rates recomputation with new costs
    const newRates = await fxctRatesService.computeAllRates(true);
    
    const response = {
      success: true,
      message: 'Provider costs updated successfully',
      updated_at: new Date().toISOString(),
      new_rates: newRates,
      admin_user: req.user._id
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Admin costs update failed:', error.message);
    res.status(500).json({
      error: 'COSTS_UPDATE_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /admin/pricing/issue-tokens
 * Manual token issuance for users
 */
router.post('/issue-tokens', async (req, res) => {
  try {
    const { user_id, amount, reason, plan_id } = req.body;
    
    if (!user_id || !amount || amount <= 0) {
      return res.status(400).json({
        error: 'INVALID_PARAMETERS',
        message: 'user_id and positive amount are required'
      });
    }
    
    console.log(`🔧 Admin ${req.user._id} manually issuing ${amount} FXCT to user ${user_id}. Reason: ${reason || 'Manual admin issuance'}`);
    
    // Issue tokens (special admin issuance)
    if (plan_id) {
      // Issue via subscription plan
      const issuanceRecord = await tokenIssuanceService.issueTokensToUser(user_id, plan_id, {
        bonusTokens: amount,
        adminIssuer: req.user._id,
        reason: reason
      });
      
      const response = {
        success: true,
        message: `Issued ${amount} FXCT tokens via plan ${plan_id}`,
        issuance_record: issuanceRecord,
        admin_user: req.user._id
      };
      
      return res.json(response);
      
    } else {
      // Direct balance update
      const newBalance = await tokenIssuanceService.updateUserBalance(user_id, amount, 'issuance');
      
      // Log manual issuance
      const { UsageLedger } = require('../../models/PricingModels');
      const logEntry = new UsageLedger({
        userId: user_id,
        endpoint: 'manual_admin_issuance',
        dataType: 'ADMIN_ISSUANCE',
        fxctDebited: -amount, // Negative because it's a credit
        usdCostRef: 0,
        fxctRate: 0,
        balanceBefore: newBalance.balance - amount,
        balanceAfter: newBalance.balance,
        transactionType: 'issuance',
        status: 'completed',
        metadata: {
          adminUser: req.user._id,
          reason: reason || 'Manual admin issuance',
          issuedAt: new Date().toISOString()
        }
      });
      
      await logEntry.save();
      
      const response = {
        success: true,
        message: `Manually issued ${amount} FXCT tokens`,
        new_balance: newBalance.balance,
        admin_user: req.user._id
      };
      
      return res.json(response);
    }

  } catch (error) {
    console.error('❌ Admin token issuance failed:', error.message);
    res.status(500).json({
      error: 'TOKEN_ISSUANCE_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /admin/pricing/force-price-update
 * Force immediate price update from oracles
 */
router.post('/force-price-update', async (req, res) => {
  try {
    console.log(`🔧 Admin ${req.user._id} forcing price update`);
    
    const priceRecord = await priceFeedService.updateDailyPrice();
    
    const response = {
      success: true,
      message: 'Price update completed',
      price_record: {
        price: priceRecord.price,
        source: priceRecord.source,
        day: priceRecord.day,
        updated_at: priceRecord.updatedAt
      },
      admin_user: req.user._id
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Admin price update failed:', error.message);
    res.status(500).json({
      error: 'PRICE_UPDATE_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /admin/pricing/analytics
 * Detailed pricing system analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    // Get comprehensive analytics
    const [
      marginAnalysis,
      systemIssuanceStats,
      systemOverageStats,
      priceHistory,
      ratesHistory
    ] = await Promise.all([
      fxctRatesService.getMarginAnalysis(),
      tokenIssuanceService.getSystemIssuanceStats(),
      overageHandlerService.getSystemOverageStats(days),
      priceFeedService.getPriceHistory(null, days),
      fxctRatesService.getRatesHistory(days)
    ]);
    
    // Calculate price volatility
    const prices = priceHistory.map(p => p.price);
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance) / avgPrice;
    
    const response = {
      period: `${days} days`,
      price_analytics: {
        current_7d_avg: marginAnalysis.fxctPrice,
        price_stale: marginAnalysis.priceStale,
        volatility: volatility,
        price_range: {
          min: Math.min(...prices),
          max: Math.max(...prices),
          avg: avgPrice
        },
        data_points: priceHistory.length
      },
      margin_analytics: marginAnalysis.analysis,
      issuance_stats: systemIssuanceStats,
      overage_stats: systemOverageStats,
      rates_changes: ratesHistory.length,
      system_health: {
        price_feed_healthy: !marginAnalysis.priceStale,
        margin_safety: Object.values(marginAnalysis.analysis).every(a => a.isMarginSafe),
        overage_rate: systemOverageStats.summary.totalOverageEvents / Math.max(1, systemOverageStats.summary.totalOverageEvents + 1000) // Rough approximation
      }
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('❌ Failed to get admin analytics:', error.message);
    res.status(500).json({
      error: 'ANALYTICS_ERROR',
      message: 'Failed to retrieve pricing analytics'
    });
  }
});

/**
 * POST /admin/pricing/toggle-strict-mode
 * Toggle PRICING_STRICT_MODE feature flag
 */
router.post('/toggle-strict-mode', async (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'INVALID_PARAMETER',
        message: 'enabled must be a boolean value'
      });
    }
    
    console.log(`🔧 Admin ${req.user._id} ${enabled ? 'enabling' : 'disabling'} strict pricing mode`);
    
    // Update environment variable
    const oldValue = process.env.PRICING_STRICT_MODE === 'true';
    process.env.PRICING_STRICT_MODE = enabled.toString();
    
    // If strict mode was changed, recompute rates
    if (oldValue !== enabled) {
      await fxctRatesService.computeAllRates(true);
    }
    
    const response = {
      success: true,
      message: `Strict mode ${enabled ? 'enabled' : 'disabled'}`,
      old_value: oldValue,
      new_value: enabled,
      rates_recomputed: oldValue !== enabled,
      updated_at: new Date().toISOString(),
      admin_user: req.user._id
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Failed to toggle strict mode:', error.message);
    res.status(500).json({
      error: 'STRICT_MODE_TOGGLE_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /admin/pricing/system-status
 * Comprehensive system status for admin dashboard
 */
router.get('/system-status', async (req, res) => {
  try {
    const [healthCheck, currentRates, marginAnalysis] = await Promise.all([
      priceFeedService.healthCheck(),
      fxctRatesService.getCurrentRates(),
      fxctRatesService.getMarginAnalysis()
    ]);
    
    const config = require('../../config/pricing');
    
    const response = {
      overall_health: healthCheck.status,
      price_feed: {
        status: healthCheck.status,
        latest_price: healthCheck.latestPrice,
        latest_update: healthCheck.latestUpdate,
        seven_day_avg: healthCheck.sevenDayAverage,
        is_stale: healthCheck.isStale
      },
      configuration: {
        target_margin: config.getEffectiveMargin(),
        strict_mode: config.PRICING_STRICT_MODE,
        minimum_floors: config.getEffectiveFloors(),
        oracle_urls: {
          primary: config.PRICE_ORACLE_URL,
          fallback: config.FALLBACK_ORACLE_URL
        }
      },
      rates_status: {
        total_data_types: Object.keys(currentRates).length,
        all_margins_safe: Object.values(marginAnalysis.analysis).every(a => a.isMarginSafe),
        price_staleness: marginAnalysis.priceStale
      },
      last_updated: new Date().toISOString()
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('❌ Failed to get system status:', error.message);
    res.status(500).json({
      error: 'SYSTEM_STATUS_ERROR',
      message: 'Failed to retrieve system status'
    });
  }
});

module.exports = router;
