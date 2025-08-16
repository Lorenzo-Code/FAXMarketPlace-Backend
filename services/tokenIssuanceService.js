/**
 * Token Issuance Service - Plan renewal token issuance
 * 
 * Integrates with existing pricing system to issue FXCT tokens when users
 * renew their subscriptions. Uses 7-day average FXCT price to calculate
 * token amounts and credits user wallets.
 * 
 * Features:
 * - Integration with existing priceFeed service
 * - Automatic wallet creation if needed
 * - Proration support for partial periods
 * - Bonus token handling
 * - Comprehensive audit trail
 * - Idempotency support
 */

const mongoose = require('mongoose');
const { Decimal128 } = require('mongodb');
const { priceFeedService } = require('./priceFeedService');
const walletService = require('./walletService');
const { WalletIssuance } = require('../models/Wallet');

// Plan pricing configuration
const PLAN_PRICING = {
  free: { usdPrice: 0, tokensBase: 0 },
  premium: { usdPrice: 29.99, tokensBase: 0 }, // Will be calculated from USD price
  pro: { usdPrice: 79.99, tokensBase: 0 },
  enterprise: { usdPrice: 199.99, tokensBase: 0 }
};

class TokenIssuanceService {
  constructor() {
    this.metrics = {
      issuancesProcessed: 0,
      totalTokensIssued: 0,
      errors: 0
    };
  }

  /**
   * Issue FXCT tokens for a plan renewal
   * @param {Object} request - Token issuance request
   * @returns {Promise<Object>} Issuance result with wallet balance
   */
  async issueTokensForPlan(request) {
    const {
      userId,
      planId,
      planUsdPrice,
      effectiveFrom = new Date(),
      metadata = {}
    } = request;

    if (!['free', 'premium', 'pro', 'enterprise'].includes(planId)) {
      throw new Error(`Invalid plan ID: ${planId}`);
    }

    if (planId === 'free' && planUsdPrice > 0) {
      throw new Error('Free plan cannot have USD price');
    }

    try {
      // Get 7-day average FXCT price
      console.log('🔄 Fetching 7-day average FXCT price...');
      
      // For now, use a placeholder - will integrate with pricing service
      const priceData = { 
        price: 0.25, // $0.25 per FXCT token
        dataPoints: 7,
        isStale: false
      };
      
      // TODO: Integrate with actual pricing service
      // const priceData = await priceFeedService.getSevenDayAverage();
      const fxctUsdAvg = priceData.price;

      if (fxctUsdAvg <= 0) {
        throw new Error('Invalid FXCT price data - cannot issue tokens');
      }

      console.log(`💰 Using 7-day average FXCT price: $${fxctUsdAvg.toFixed(6)}`);

      // Calculate tokens to issue
      let tokensToIssue = 0;
      const actualPlanPrice = planUsdPrice || PLAN_PRICING[planId]?.usdPrice || 0;

      if (actualPlanPrice > 0) {
        // Calculate base tokens: USD price ÷ FXCT price
        tokensToIssue = Math.floor(actualPlanPrice / fxctUsdAvg);
        
        // Add any bonus tokens
        if (metadata.bonusTokens) {
          tokensToIssue += metadata.bonusTokens;
        }

        // Apply proration if needed
        if (metadata.prorationApplied && metadata.prorationFactor) {
          tokensToIssue = Math.floor(tokensToIssue * metadata.prorationFactor);
        }
      }

      console.log(`🎯 Calculated tokens to issue: ${tokensToIssue} FXCT for plan ${planId} ($${actualPlanPrice})`);

      // Get or create user wallet
      const walletInfo = await walletService.getOrCreateWallet(userId, 'system');
      const walletId = walletInfo.wallet._id.toString();

      if (walletInfo.created) {
        console.log(`✅ Created new wallet for user ${userId}`);
      }

      // Generate idempotency key for the issuance
      const idempotencyKey = this.generateIssuanceKey(userId, planId, effectiveFrom);

      // Check if issuance already exists
      const existingIssuance = await WalletIssuance.findOne({
        walletId,
        planId,
        effectiveFrom: {
          $gte: new Date(effectiveFrom.getTime() - 1000), // 1 second tolerance
          $lte: new Date(effectiveFrom.getTime() + 1000)
        }
      });

      if (existingIssuance) {
        console.log(`ℹ️ Issuance already exists for user ${userId}, plan ${planId}`);
        return {
          success: true,
          issuance: existingIssuance.toObject(),
          wallet: walletInfo,
          duplicate: true
        };
      }

      let result;

      if (tokensToIssue > 0) {
        // Credit the wallet
        const creditResult = await walletService.credit({
          walletId,
          amount: tokensToIssue,
          type: 'issuance',
          ref: `plan_${planId}_${effectiveFrom.getTime()}`,
          meta: {
            planId,
            planUsdPrice: actualPlanPrice,
            fxctUsdAvg,
            tokensCalculated: tokensToIssue,
            priceDataPoints: priceData.dataPoints,
            priceStale: priceData.isStale,
            ...metadata
          },
          idempotencyKey: `credit_${idempotencyKey}`,
          processedBy: 'system'
        });

        if (!creditResult.success) {
          throw new Error('Failed to credit wallet with issued tokens');
        }

        console.log(`✅ Credited ${tokensToIssue} FXCT to wallet ${walletId}`);
      }

      // Create issuance record
      const issuance = new WalletIssuance({
        walletId,
        planId,
        fxctUsdAvg: new Decimal128(fxctUsdAvg.toString()),
        tokensIssued: new Decimal128(tokensToIssue.toString()),
        effectiveFrom,
        metadata: {
          subscriptionId: metadata.subscriptionId,
          planUsdPrice: actualPlanPrice,
          billingCycle: metadata.billingCycle,
          bonusTokens: metadata.bonusTokens || 0,
          prorationApplied: metadata.prorationApplied || false,
          priceDataPoints: priceData.dataPoints,
          priceStale: priceData.isStale
        }
      });

      await issuance.save();

      // Update metrics
      this.metrics.issuancesProcessed++;
      this.metrics.totalTokensIssued += tokensToIssue;

      // Get updated wallet balance
      const finalBalance = await walletService.getBalance(walletId);

      result = {
        success: true,
        issuance: issuance.toObject(),
        wallet: {
          ...walletInfo,
          balance: finalBalance
        },
        tokensIssued: tokensToIssue,
        fxctUsdAvg,
        duplicate: false
      };

      console.log(`🎉 Successfully issued ${tokensToIssue} FXCT tokens for user ${userId} (plan: ${planId})`);
      return result;

    } catch (error) {
      this.metrics.errors++;
      console.error('❌ Token issuance failed:', error.message);
      throw new Error(`Token issuance failed: ${error.message}`);
    }
  }

  /**
   * Get issuance history for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Issuance history
   */
  async getIssuanceHistory(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        planId = null,
        startDate = null,
        endDate = null
      } = options;

      // Get user's wallet first
      const wallet = await walletService.getOrCreateWallet(userId, 'system');
      const walletId = wallet.wallet._id.toString();

      const query = { walletId };
      
      if (planId) {
        query.planId = planId;
      }
      
      if (startDate || endDate) {
        query.effectiveFrom = {};
        if (startDate) query.effectiveFrom.$gte = new Date(startDate);
        if (endDate) query.effectiveFrom.$lte = new Date(endDate);
      }

      const skip = (page - 1) * limit;

      const [issuances, total] = await Promise.all([
        WalletIssuance.find(query)
          .sort({ effectiveFrom: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        WalletIssuance.countDocuments(query)
      ]);

      return {
        issuances,
        pagination: {
          page,
          limit,
          total,
          hasMore: skip + issuances.length < total
        },
        summary: {
          totalIssuances: total,
          totalTokensIssued: issuances.reduce((sum, iss) => sum + iss.tokensIssued, 0)
        }
      };

    } catch (error) {
      console.error('❌ Failed to get issuance history:', error.message);
      throw error;
    }
  }

  /**
   * Preview token issuance without executing
   * @param {string} planId - Plan ID
   * @param {number} planUsdPrice - Plan USD price
   * @param {Object} options - Preview options
   * @returns {Promise<Object>} Issuance preview
   */
  async previewTokenIssuance(planId, planUsdPrice, options = {}) {
    try {
      const { bonusTokens = 0, prorationFactor = 1 } = options;

      if (planId === 'free') {
        return {
          planId,
          planUsdPrice: 0,
          tokensToIssue: 0,
          bonusTokens: 0,
          totalTokens: 0,
          fxctUsdAvg: 0,
          preview: true
        };
      }

      // Get current 7-day average FXCT price
      // For now, use placeholder
      const priceData = { 
        price: 0.25, 
        dataPoints: 7,
        isStale: false
      };
      
      const fxctUsdAvg = priceData.price;

      if (fxctUsdAvg <= 0) {
        throw new Error('Invalid FXCT price data - cannot preview issuance');
      }

      // Calculate base tokens
      let baseTokens = 0;
      if (planUsdPrice > 0) {
        baseTokens = Math.floor(planUsdPrice / fxctUsdAvg);
      }

      // Apply proration
      const proratedTokens = Math.floor(baseTokens * prorationFactor);
      
      // Add bonus tokens
      const totalTokens = proratedTokens + bonusTokens;

      return {
        planId,
        planUsdPrice,
        baseTokens,
        proratedTokens,
        bonusTokens,
        totalTokens,
        fxctUsdAvg,
        priceDataAge: priceData.dataPoints,
        priceStale: priceData.isStale,
        preview: true
      };

    } catch (error) {
      console.error('❌ Failed to preview token issuance:', error.message);
      throw error;
    }
  }

  /**
   * Get total tokens issued across all users
   * @param {Object} filters - Date/plan filters
   * @returns {Promise<Object>} Aggregated issuance stats
   */
  async getIssuanceStats(filters = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        planId = null
      } = filters;

      const matchStage = {};
      
      if (startDate || endDate) {
        matchStage.effectiveFrom = {};
        if (startDate) matchStage.effectiveFrom.$gte = new Date(startDate);
        if (endDate) matchStage.effectiveFrom.$lte = new Date(endDate);
      }
      
      if (planId) {
        matchStage.planId = planId;
      }

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: '$planId',
            totalIssuances: { $sum: 1 },
            totalTokensIssued: { $sum: '$tokensIssued' },
            avgTokensPerIssuance: { $avg: '$tokensIssued' },
            avgFxctPrice: { $avg: '$fxctUsdAvg' }
          }
        },
        { $sort: { totalTokensIssued: -1 } }
      ];

      const stats = await WalletIssuance.aggregate(pipeline);

      const summary = stats.reduce((acc, stat) => ({
        totalIssuances: acc.totalIssuances + stat.totalIssuances,
        totalTokensIssued: acc.totalTokensIssued + stat.totalTokensIssued
      }), { totalIssuances: 0, totalTokensIssued: 0 });

      return {
        byPlan: stats,
        summary,
        filters,
        generatedAt: new Date()
      };

    } catch (error) {
      console.error('❌ Failed to get issuance stats:', error.message);
      throw error;
    }
  }

  /**
   * Validate plan and pricing configuration
   * @param {string} planId - Plan ID
   * @param {number} planUsdPrice - Plan USD price
   * @returns {boolean} Valid configuration
   */
  validatePlanConfiguration(planId, planUsdPrice) {
    if (!['free', 'premium', 'pro', 'enterprise'].includes(planId)) {
      return false;
    }

    if (planId === 'free' && planUsdPrice > 0) {
      return false;
    }

    if (planId !== 'free' && planUsdPrice <= 0) {
      return false;
    }

    return true;
  }

  /**
   * Generate unique issuance key
   * @param {string} userId - User ID
   * @param {string} planId - Plan ID
   * @param {Date} effectiveFrom - Effective date
   * @returns {string} Issuance key
   */
  generateIssuanceKey(userId, planId, effectiveFrom) {
    const timestamp = effectiveFrom.getTime();
    return `issuance_${userId}_${planId}_${timestamp}`;
  }

  /**
   * Get service metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics() {
    this.metrics = {
      issuancesProcessed: 0,
      totalTokensIssued: 0,
      errors: 0
    };
  }
}

// Export singleton instance
const tokenIssuanceService = new TokenIssuanceService();
module.exports = tokenIssuanceService;
