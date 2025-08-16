/**
 * FXCT Deduction Middleware - Wallet Integration
 * 
 * Enforces lazy-load pattern and deducts FXCT tokens for premium API calls:
 * 1. Zillow/discovery calls are FREE (no FXCT deduction)
 * 2. CoreLogic/enrichment calls deduct FXCT based on data type
 * 3. Balance validation before expensive operations
 * 4. Usage tracking in new wallet ledger system
 * 5. Auto-wallet creation for new users
 * 6. Insufficient funds handling with buy options
 */

const { fxctRatesService } = require('../services/fxctRatesService');
const { costTableService } = require('../services/costTableService');
const walletService = require('../services/walletService');
const { WalletUsageLedger } = require('../models/Wallet');
const crypto = require('crypto');

class FXCTDeductionMiddleware {
  constructor() {
    this.exemptPatterns = [
      // Zillow endpoints (free discovery)
      /\/api\/properties\/search/,
      /\/api\/properties\/zillow/,
      /\/api\/properties\/.*\/images/,
      /\/api\/properties\/.*\/basic/,
      
      // Other free endpoints
      /\/api\/auth/,
      /\/api\/health/,
      /\/pricing\//,
      /\/admin\//  // Admin endpoints exempt
    ];
    
    // Map endpoints to data types for FXCT deduction
    this.endpointDataTypeMap = {
      // CoreLogic Standard endpoints
      'property_detail': 'STANDARD',
      'property_comparables': 'STANDARD',
      'property_valuation': 'STANDARD',
      'mortgage_data': 'STANDARD',
      
      // CoreLogic Pro Low endpoints
      'ownership_history': 'PRO_LOW',
      'liens_judgments': 'PRO_LOW',
      'transaction_history': 'PRO_LOW',
      'tax_records': 'PRO_LOW',
      
      // CoreLogic Pro High endpoints
      'climate_risk_ar5': 'PRO_HIGH',
      'flood_analysis': 'PRO_HIGH',
      'wildfire_risk': 'PRO_HIGH',
      'earthquake_risk': 'PRO_HIGH',
      'comprehensive_analytics': 'PRO_HIGH',
      
      // Enrichment APIs (Basic)
      'schools_nearby': 'BASIC',
      'walkability': 'BASIC',
      'crime_data': 'BASIC',
      'google_places': 'BASIC'
    };
  }

  /**
   * Main middleware function
   * @param {Object} req - Express request
   * @param {Object} res - Express response 
   * @param {Function} next - Next middleware
   */
  async middleware(req, res, next) {
    try {
      // Skip if user not authenticated
      if (!req.user || !req.user._id) {
        return next();
      }

      const userId = req.user._id.toString();
      const endpoint = this.extractEndpointIdentifier(req);
      
      // Check if endpoint is exempt from FXCT deduction
      if (this.isExemptEndpoint(req.path)) {
        console.log(`🆓 Exempt endpoint: ${req.path} - no FXCT deduction`);
        return next();
      }

      // Check if this is a billable operation
      const dataType = this.getDataTypeForEndpoint(endpoint, req);
      if (!dataType) {
        console.log(`ℹ️ Non-billable endpoint: ${endpoint} - no FXCT deduction`);
        return next();
      }

      console.log(`💰 Processing FXCT deduction for user ${userId}, endpoint: ${endpoint}, data type: ${dataType}`);

      // Get FXCT rate for this data type
      const fxctRate = await fxctRatesService.getFXCTRateForDataType(dataType);
      
      // Get or create user wallet
      const walletInfo = await walletService.getOrCreateWallet(userId, 'system');
      const walletId = walletInfo.wallet._id.toString();
      const currentBalance = walletInfo.balance;
      
      // Check sufficient balance
      if (currentBalance.available < fxctRate) {
        const deficit = fxctRate - currentBalance.available;
        
        // Log failed attempt
        await this.logUsage(userId, walletId, endpoint, dataType, fxctRate, currentBalance.available, 'failed', {
          errorCode: 'INSUFFICIENT_BALANCE',
          deficit,
          paymentRequired: true
        }, req);

        // Return 402 with purchase options
        return res.status(402).json({
          error: 'INSUFFICIENT_FUNDS',
          required: fxctRate,
          available: currentBalance.available,
          deficit,
          buyOptions: {
            url: `${process.env.FRONTEND_URL || 'https://fractionax.io'}/pricing`,
            plans: [
              { id: 'premium', name: 'Premium', price: 29.99, tokensIncluded: 500 },
              { id: 'pro', name: 'Pro', price: 79.99, tokensIncluded: 1500 },
              { id: 'enterprise', name: 'Enterprise', price: 199.99, tokensIncluded: 4000 }
            ]
          },
          timestamp: new Date().toISOString()
        });
      }

      // Deduct FXCT tokens
      const newBalance = await this.deductFXCT(userId, walletId, fxctRate, endpoint, dataType, req);
      
      // Add balance info to request for downstream use
      req.fxct = {
        deducted: fxctRate,
        balanceBefore: currentBalance.available,
        balanceAfter: newBalance.balance.available,
        dataType,
        endpoint
      };

      // Continue to actual API handler
      next();

    } catch (error) {
      console.error(`❌ FXCT middleware error:`, error.message);
      
      // On middleware errors, don't block the request but log the issue
      req.fxct = {
        error: error.message,
        deducted: 0,
        middlewareError: true
      };
      
      next();
    }
  }

  /**
   * Deduct FXCT tokens from user balance
   * @param {string} userId - User ID
   * @param {string} walletId - Wallet ID
   * @param {number} amount - FXCT amount to deduct
   * @param {string} endpoint - API endpoint
   * @param {string} dataType - Data type
   * @param {Object} req - Express request
   * @returns {Object} Updated balance
   */
  async deductFXCT(userId, walletId, amount, endpoint, dataType, req) {
    try {
      // Get current balance for logging
      const balanceBefore = await walletService.getBalance(walletId);
      
      // Generate idempotency key for this transaction
      const idempotencyKey = `usage_${userId}_${endpoint}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      // Debit the wallet
      const result = await walletService.debit({
        walletId,
        amount,
        type: 'debit',
        ref: `api_usage_${endpoint}`,
        meta: {
          endpoint,
          dataType,
          provider: this.getProviderFromEndpoint(endpoint),
          sessionId: req.session?.id,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          pid: req.params?.pid || req.body?.propertyId
        },
        idempotencyKey,
        processedBy: 'system'
      });
      
      // Log successful deduction to usage ledger
      await this.logUsage(userId, walletId, endpoint, dataType, amount, balanceBefore.available, 'completed', {
        provider: this.getProviderFromEndpoint(endpoint),
        sessionId: req.session?.id,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        walletTransactionId: result.transaction._id
      }, req);

      return result;

    } catch (error) {
      console.error(`❌ Failed to deduct FXCT:`, error.message);
      throw error;
    }
  }

  /**
   * Log usage to ledger
   * @param {string} userId - User ID
   * @param {string} walletId - Wallet ID
   * @param {string} endpoint - API endpoint
   * @param {string} dataType - Data type
   * @param {number} fxctAmount - FXCT amount
   * @param {number} balanceBefore - Balance before transaction
   * @param {string} status - Transaction status
   * @param {Object} metadata - Additional metadata
   * @param {Object} req - Express request
   */
  async logUsage(userId, walletId, endpoint, dataType, fxctAmount, balanceBefore, status, metadata = {}, req = {}) {
    try {
      const usdCostRef = await costTableService.getCostForDataType(dataType);
      
      // Generate idempotency key for usage logging
      const idempotencyKey = `usage_log_${userId}_${endpoint}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      const usageEntry = new WalletUsageLedger({
        userId,
        walletId,
        pid: req.params?.pid || req.body?.propertyId,
        dataType,
        fxctDebited: fxctAmount,
        usdCostRef: usdCostRef || 0,
        requestIdempotencyKey: idempotencyKey,
        status,
        endpoint,
        sessionData: {
          sessionId: metadata.sessionId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent
        }
      });

      await usageEntry.save();
      console.log(`📊 Logged usage: ${userId} - ${endpoint} - ${fxctAmount} FXCT - ${status}`);

    } catch (error) {
      console.error(`❌ Failed to log usage:`, error.message);
      // Don't throw - logging failures shouldn't break the main flow
    }
  }

  /**
   * Extract endpoint identifier from request
   * @param {Object} req - Express request
   * @returns {string} Endpoint identifier
   */
  extractEndpointIdentifier(req) {
    const path = req.path;
    const method = req.method.toLowerCase();

    // Map common patterns to endpoint identifiers
    if (path.includes('/properties/') && path.includes('/detail')) {
      return 'property_detail';
    }
    if (path.includes('/properties/') && path.includes('/comparables')) {
      return 'property_comparables';
    }
    if (path.includes('/properties/') && path.includes('/ownership')) {
      return 'ownership_history';
    }
    if (path.includes('/properties/') && path.includes('/liens')) {
      return 'liens_judgments';
    }
    if (path.includes('/properties/') && path.includes('/transactions')) {
      return 'transaction_history';
    }
    if (path.includes('/properties/') && path.includes('/climate-risk')) {
      return 'climate_risk_ar5';
    }
    if (path.includes('/properties/') && path.includes('/schools')) {
      return 'schools_nearby';
    }
    if (path.includes('/properties/') && path.includes('/walkability')) {
      return 'walkability';
    }

    // Default to path-based identifier
    return path.replace(/^\/api\//, '').replace(/\/\d+/, '').replace(/\//g, '_');
  }

  /**
   * Get data type for endpoint
   * @param {string} endpoint - Endpoint identifier
   * @param {Object} req - Express request
   * @returns {string|null} Data type or null if not billable
   */
  getDataTypeForEndpoint(endpoint, req) {
    // Check explicit mapping first
    if (this.endpointDataTypeMap[endpoint]) {
      return this.endpointDataTypeMap[endpoint];
    }

    // Check for premium query parameters that upgrade data type
    if (req.query?.premium === 'true' || req.query?.detailed === 'true') {
      return 'STANDARD';
    }

    if (req.query?.pro === 'true' || req.query?.analytics === 'true') {
      return 'PRO_LOW';
    }

    if (req.query?.comprehensive === 'true' || req.query?.climate === 'true') {
      return 'PRO_HIGH';
    }

    // Use cost table service to map endpoint to data type
    return costTableService.getDataTypeForEndpoint?.(endpoint) || null;
  }

  /**
   * Check if endpoint is exempt from FXCT deduction
   * @param {string} path - Request path
   * @returns {boolean} Whether endpoint is exempt
   */
  isExemptEndpoint(path) {
    return this.exemptPatterns.some(pattern => pattern.test(path));
  }

  /**
   * Get provider name from endpoint
   * @param {string} endpoint - Endpoint identifier
   * @returns {string} Provider name
   */
  getProviderFromEndpoint(endpoint) {
    if (endpoint.includes('corelogic') || 
        ['property_detail', 'ownership_history', 'climate_risk_ar5'].includes(endpoint)) {
      return 'corelogic';
    }
    
    if (endpoint.includes('zillow')) {
      return 'zillow';
    }
    
    if (endpoint.includes('schools')) {
      return 'greatschools';
    }
    
    if (endpoint.includes('google') || endpoint.includes('places')) {
      return 'google';
    }
    
    return 'unknown';
  }

  /**
   * Create middleware instance for Express
   * @returns {Function} Express middleware function
   */
  createMiddleware() {
    return this.middleware.bind(this);
  }

  /**
   * Refund FXCT for failed operations
   * @param {string} userId - User ID
   * @param {number} amount - Amount to refund
   * @param {string} reason - Refund reason
   * @param {string} originalTransactionId - Original transaction ID
   * @returns {Object} Refund result
   */
  async refundFXCT(userId, amount, reason, originalTransactionId = null) {
    try {
      const balanceAfter = await tokenIssuanceService.updateUserBalance(userId, amount, 'refund');
      
      // Log refund transaction
      const refundEntry = new UsageLedger({
        userId,
        endpoint: 'refund',
        dataType: 'REFUND',
        fxctDebited: -amount, // Negative for refunds
        usdCostRef: 0,
        fxctRate: 0,
        balanceBefore: balanceAfter.balance - amount,
        balanceAfter: balanceAfter.balance,
        transactionType: 'refund',
        status: 'completed',
        metadata: {
          refundReason: reason,
          originalTransactionId,
          refundedAt: new Date().toISOString()
        }
      });

      await refundEntry.save();
      
      console.log(`💰 Refunded ${amount} FXCT to user ${userId}: ${reason}`);
      return { success: true, newBalance: balanceAfter.balance };

    } catch (error) {
      console.error(`❌ Failed to refund FXCT:`, error.message);
      throw error;
    }
  }
}

// Create singleton instance
const fxctDeductionMiddleware = new FXCTDeductionMiddleware();

// Express middleware function
const deductFxct = fxctDeductionMiddleware.createMiddleware();

// Helper function to selectively apply middleware
const conditionalDeductFxct = (condition) => {
  return (req, res, next) => {
    if (typeof condition === 'function' && !condition(req)) {
      return next();
    } else if (typeof condition === 'boolean' && !condition) {
      return next();
    }
    return deductFxct(req, res, next);
  };
};

module.exports = {
  FXCTDeductionMiddleware,
  fxctDeductionMiddleware,
  deductFxct,
  conditionalDeductFxct
};
