/**
 * FXCT Overage Handler System
 * 
 * Handles situations when users run out of FXCT tokens:
 * 1. Balance validation before expensive operations
 * 2. 402 Payment Required responses with buy-FXCT prompts
 * 3. Integration with payment providers (Stripe, Coinbase, etc.)
 * 4. Overage tracking and billing
 * 5. Auto-topup functionality
 */

const { tokenIssuanceService } = require('./tokenIssuance');
const { fxctRatesService } = require('./fxctRates');
const { BUY_FXCT_URL } = require('../config/pricing');

class OverageHandlerService {
  constructor() {
    this.pendingPurchases = new Map(); // Track pending FXCT purchases
  }

  /**
   * Check if user has sufficient balance for operation
   * 
   * @param {string} userId - User ID
   * @param {string} endpoint - API endpoint being called
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Balance check result
   */
  async checkBalanceForOperation(userId, endpoint, options = {}) {
    try {
      // Get FXCT rate for endpoint
      const fxctRate = await fxctRatesService.getFXCTRateForEndpoint(endpoint);
      
      // Check user balance
      const balanceCheck = await tokenIssuanceService.checkSufficientBalance(userId, fxctRate);
      
      return {
        ...balanceCheck,
        endpoint,
        fxctRate,
        canProceed: balanceCheck.hasSufficient || balanceCheck.overdraftAvailable,
        requiresPayment: !balanceCheck.hasSufficient && !balanceCheck.overdraftAvailable,
        operationCost: fxctRate
      };

    } catch (error) {
      console.error(`❌ Failed to check balance for operation:`, error.message);
      throw error;
    }
  }

  /**
   * Generate 402 Payment Required response
   * 
   * @param {string} userId - User ID
   * @param {string} endpoint - API endpoint
   * @param {Object} balanceCheck - Balance check result
   * @returns {Object} 402 response payload
   */
  async generatePaymentRequiredResponse(userId, endpoint, balanceCheck = null) {
    try {
      // If no balance check provided, perform it
      if (!balanceCheck) {
        balanceCheck = await this.checkBalanceForOperation(userId, endpoint);
      }

      const fxctRate = balanceCheck.fxctRate || balanceCheck.operationCost;
      const deficit = balanceCheck.deficit || 0;
      
      // Calculate minimum purchase amount (at least cover deficit + some buffer)
      const minPurchaseAmount = Math.max(deficit, fxctRate * 5); // At least 5 operations worth
      const recommendedAmount = Math.ceil(minPurchaseAmount / 50) * 50; // Round to nearest 50 FXCT

      // Generate purchase options
      const purchaseOptions = await this.generatePurchaseOptions(userId, recommendedAmount);
      
      return {
        error: 'INSUFFICIENT_FXCT_BALANCE',
        code: 402,
        message: 'Insufficient FXCT tokens to complete this operation',
        details: {
          userId,
          endpoint,
          currentBalance: balanceCheck.currentBalance,
          requiredAmount: fxctRate,
          deficit: deficit,
          operationCost: fxctRate
        },
        purchase: {
          needed: minPurchaseAmount,
          recommended: recommendedAmount,
          buyUrl: this.generateBuyUrl(userId, recommendedAmount, endpoint),
          options: purchaseOptions
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Failed to generate payment required response:`, error.message);
      throw error;
    }
  }

  /**
   * Generate purchase options for users
   * 
   * @param {string} userId - User ID
   * @param {number} recommendedAmount - Recommended FXCT amount
   * @returns {Array} Purchase options
   */
  async generatePurchaseOptions(userId, recommendedAmount) {
    const options = [
      {
        amount: recommendedAmount,
        label: 'Recommended',
        description: `${recommendedAmount} FXCT tokens`,
        type: 'recommended'
      },
      {
        amount: recommendedAmount * 2,
        label: 'Better Value',
        description: `${recommendedAmount * 2} FXCT tokens (2x coverage)`,
        type: 'better_value'
      },
      {
        amount: 500,
        label: 'Standard Pack',
        description: '500 FXCT tokens',
        type: 'standard_pack'
      },
      {
        amount: 1000,
        label: 'Large Pack',
        description: '1000 FXCT tokens',
        type: 'large_pack'
      }
    ];

    // Add estimated USD values (this would integrate with current FXCT price)
    const priceData = await require('./priceFeed').priceFeedService.getSevenDayAverage();
    const fxctUsd = priceData.price;

    return options.map(option => ({
      ...option,
      estimatedUsd: (option.amount * fxctUsd).toFixed(2),
      purchaseId: this.generatePurchaseId(userId, option.amount)
    }));
  }

  /**
   * Generate buy FXCT URL with tracking parameters
   * 
   * @param {string} userId - User ID
   * @param {number} amount - FXCT amount to purchase
   * @param {string} source - Source endpoint/operation
   * @returns {string} Buy URL
   */
  generateBuyUrl(userId, amount, source = null) {
    const params = new URLSearchParams({
      user: userId,
      amount: amount.toString(),
      source: source || 'api_overage',
      timestamp: Date.now().toString()
    });

    return `${BUY_FXCT_URL}?${params.toString()}`;
  }

  /**
   * Generate unique purchase ID for tracking
   * 
   * @param {string} userId - User ID
   * @param {number} amount - FXCT amount
   * @returns {string} Purchase ID
   */
  generatePurchaseId(userId, amount) {
    const timestamp = Date.now();
    const hash = require('crypto')
      .createHash('md5')
      .update(`${userId}${amount}${timestamp}`)
      .digest('hex')
      .substring(0, 8);
    
    return `fxct_${hash}`;
  }

  /**
   * Process FXCT purchase (integration stub)
   * 
   * @param {string} userId - User ID
   * @param {number} amount - FXCT amount to purchase
   * @param {Object} paymentData - Payment provider data
   * @returns {Object} Purchase result
   */
  async processFXCTPurchase(userId, amount, paymentData) {
    try {
      console.log(`💳 Processing FXCT purchase for user ${userId}: ${amount} FXCT`);

      const purchaseId = this.generatePurchaseId(userId, amount);
      
      // Store pending purchase
      this.pendingPurchases.set(purchaseId, {
        userId,
        amount,
        paymentData,
        status: 'pending',
        createdAt: new Date()
      });

      // Integration stub - in real implementation, this would:
      // 1. Validate payment with Stripe/Coinbase/etc.
      // 2. Execute payment transaction
      // 3. Add FXCT to user balance on successful payment
      // 4. Send confirmation notifications

      // For now, return success (in production, this would be async)
      const result = await this.mockPaymentProcessor(userId, amount, paymentData, purchaseId);
      
      if (result.success) {
        // Add FXCT to user balance
        await tokenIssuanceService.updateUserBalance(userId, amount, 'purchase');
        
        // Update pending purchase
        const pendingPurchase = this.pendingPurchases.get(purchaseId);
        if (pendingPurchase) {
          pendingPurchase.status = 'completed';
          pendingPurchase.completedAt = new Date();
        }

        console.log(`✅ FXCT purchase completed: ${amount} FXCT added to user ${userId}`);
      }

      return {
        purchaseId,
        success: result.success,
        amount,
        userId,
        transactionId: result.transactionId,
        message: result.message
      };

    } catch (error) {
      console.error(`❌ Failed to process FXCT purchase:`, error.message);
      throw error;
    }
  }

  /**
   * Mock payment processor (replace with real integration)
   * 
   * @param {string} userId - User ID
   * @param {number} amount - FXCT amount
   * @param {Object} paymentData - Payment data
   * @param {string} purchaseId - Purchase ID
   * @returns {Object} Payment result
   */
  async mockPaymentProcessor(userId, amount, paymentData, purchaseId) {
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock success (90% success rate for testing)
    const success = Math.random() > 0.1;
    
    if (success) {
      return {
        success: true,
        transactionId: `txn_${purchaseId}_${Date.now()}`,
        message: 'Payment processed successfully'
      };
    } else {
      return {
        success: false,
        transactionId: null,
        message: 'Payment failed - insufficient funds or invalid payment method'
      };
    }
  }

  /**
   * Handle auto-topup for users with enabled feature
   * 
   * @param {string} userId - User ID
   * @param {number} triggeredAmount - Amount that triggered topup
   * @returns {Object} Topup result
   */
  async handleAutoTopup(userId, triggeredAmount) {
    try {
      // Get user balance to check auto-topup settings
      const balance = await tokenIssuanceService.getUserBalance(userId);
      
      if (!balance.metadata?.autoTopup) {
        return { autoTopupEnabled: false };
      }

      const topupAmount = balance.metadata.autoTopupAmount || 500; // Default 500 FXCT
      const triggerThreshold = balance.metadata.lowBalanceAlert || 10; // Default 10 FXCT

      // Check if balance is below trigger threshold
      if (balance.balance <= triggerThreshold) {
        console.log(`🔄 Auto-topup triggered for user ${userId}: balance ${balance.balance} <= threshold ${triggerThreshold}`);
        
        // Process auto-topup purchase
        const topupResult = await this.processFXCTPurchase(userId, topupAmount, {
          source: 'auto_topup',
          triggeredBy: triggeredAmount,
          paymentMethod: balance.metadata.autoTopupPaymentMethod || 'default'
        });

        return {
          autoTopupEnabled: true,
          triggered: true,
          amount: topupAmount,
          success: topupResult.success,
          purchaseId: topupResult.purchaseId
        };
      }

      return {
        autoTopupEnabled: true,
        triggered: false,
        currentBalance: balance.balance,
        threshold: triggerThreshold
      };

    } catch (error) {
      console.error(`❌ Auto-topup failed for user ${userId}:`, error.message);
      return {
        autoTopupEnabled: true,
        triggered: false,
        error: error.message
      };
    }
  }

  /**
   * Get overage statistics for a user
   * 
   * @param {string} userId - User ID
   * @param {number} days - Number of days to analyze
   * @returns {Object} Overage statistics
   */
  async getUserOverageStats(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get usage ledger entries for insufficient balance scenarios
      const { UsageLedger } = require('../models/PricingModels');
      
      const overageEvents = await UsageLedger.find({
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate },
        status: 'failed',
        'metadata.errorCode': 'INSUFFICIENT_BALANCE'
      }).sort({ timestamp: -1 });

      const totalOverages = overageEvents.length;
      const totalFxctDeficit = overageEvents.reduce((sum, event) => sum + (event.fxctDebited || 0), 0);

      // Get purchase history in the same period
      const purchases = Array.from(this.pendingPurchases.values()).filter(
        purchase => purchase.userId === userId && 
        purchase.createdAt >= startDate &&
        purchase.status === 'completed'
      );

      const totalPurchases = purchases.length;
      const totalFxctPurchased = purchases.reduce((sum, purchase) => sum + purchase.amount, 0);

      return {
        userId,
        period: `${days} days`,
        overageEvents: totalOverages,
        totalFxctDeficit,
        totalPurchases,
        totalFxctPurchased,
        conversionRate: totalOverages > 0 ? (totalPurchases / totalOverages) : 0,
        averageOverageAmount: totalOverages > 0 ? (totalFxctDeficit / totalOverages) : 0
      };

    } catch (error) {
      console.error(`❌ Failed to get user overage stats:`, error.message);
      throw error;
    }
  }

  /**
   * Clean up expired pending purchases
   */
  async cleanupExpiredPurchases() {
    const now = Date.now();
    const expirationTime = 15 * 60 * 1000; // 15 minutes

    for (const [purchaseId, purchase] of this.pendingPurchases.entries()) {
      if (purchase.status === 'pending' && (now - purchase.createdAt.getTime()) > expirationTime) {
        console.log(`🧹 Cleaning up expired purchase: ${purchaseId}`);
        this.pendingPurchases.delete(purchaseId);
      }
    }
  }

  /**
   * Get system overage statistics
   * 
   * @param {number} days - Number of days to analyze
   * @returns {Object} System-wide overage stats
   */
  async getSystemOverageStats(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { UsageLedger } = require('../models/PricingModels');
      
      const stats = await UsageLedger.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate },
            status: 'failed',
            'metadata.errorCode': 'INSUFFICIENT_BALANCE'
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
              dataType: "$dataType"
            },
            overageCount: { $sum: 1 },
            totalDeficit: { $sum: "$fxctDebited" },
            uniqueUsers: { $addToSet: "$userId" }
          }
        },
        {
          $group: {
            _id: "$_id.date",
            dailyOverages: { $sum: "$overageCount" },
            dailyDeficit: { $sum: "$totalDeficit" },
            uniqueUsersAffected: { $addToSet: "$uniqueUsers" },
            dataTypeBreakdown: {
              $push: {
                dataType: "$_id.dataType",
                overageCount: "$overageCount",
                totalDeficit: "$totalDeficit"
              }
            }
          }
        },
        { $sort: { _id: -1 } }
      ]);

      return {
        period: `${days} days`,
        dailyStats: stats,
        summary: {
          totalOverageEvents: stats.reduce((sum, day) => sum + day.dailyOverages, 0),
          totalDeficit: stats.reduce((sum, day) => sum + day.dailyDeficit, 0),
          avgDailyOverages: stats.length > 0 ? stats.reduce((sum, day) => sum + day.dailyOverages, 0) / stats.length : 0
        }
      };

    } catch (error) {
      console.error(`❌ Failed to get system overage stats:`, error.message);
      throw error;
    }
  }
}

// Create and export singleton instance
const overageHandlerService = new OverageHandlerService();

// Cleanup expired purchases every 5 minutes
setInterval(() => {
  overageHandlerService.cleanupExpiredPurchases().catch(console.error);
}, 5 * 60 * 1000);

module.exports = {
  OverageHandlerService,
  overageHandlerService
};
