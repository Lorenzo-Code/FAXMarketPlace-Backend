const express = require("express");
const router = express.Router();
const crypto = require("crypto");
require("dotenv").config();

// Import caching, CoreLogic clients, and user/wallet services
const { getAsync, setAsync, getUserKey } = require("../../../utils/redisClient");
const { CoreLogicSuperClient } = require("../../../utils/coreLogicSuperClient");
const { verifyToken } = require("../../../middleware/auth");

/**
 * 💎 PREMIUM PROPERTY FEATURES WITH FXCT COST CONFIRMATION
 * 
 * HIGH-COST FEATURES MOVED TO ON-DEMAND WITH CONFIRMATION:
 * - Ownership & Ownership History ($8-12 per call)
 * - Current Mortgage & Mortgage History ($10-15 per call)  
 * - Liens & Involuntary Liens ($8-12 per call)
 * - Transaction History ($8-15 per call)
 * - Building Permits ($6-10 per call)
 * - Climate Risk Analytics (CRA-AR6) ($20-30 per call)
 * 
 * COST CONTROL STRATEGY:
 * 1. FXCT balance check before expensive calls
 * 2. Cost confirmation modal in frontend
 * 3. Comprehensive caching with appropriate TTLs
 * 4. Usage tracking and budget monitoring
 */

// Cost definitions for premium features (in FXCT tokens)
const FEATURE_COSTS = {
  ownership: { cost: 50, usd: 8.00, description: 'Current owner details and ownership transfers' },
  mortgage: { cost: 75, usd: 12.00, description: 'Current mortgage and complete mortgage history' },
  liens: { cost: 60, usd: 10.00, description: 'All liens, judgments, and involuntary liens' },
  transactions: { cost: 65, usd: 10.50, description: 'Complete sales and transaction history' },
  permits: { cost: 40, usd: 6.50, description: 'Building permits and construction history' },
  climateRisk: { cost: 120, usd: 20.00, description: 'Comprehensive climate risk analytics (CRA-AR6)' },
  comparables: { cost: 80, usd: 13.00, description: 'Recently sold comparable properties analysis' }
};

/**
 * 💰 Check FXCT Balance (Mock Implementation)
 * In production, integrate with actual wallet system
 */
async function checkFXCTBalance(userId) {
  // TODO: Integrate with actual user wallet system
  // For now, return mock balance based on user rules
  return {
    fxctBalance: 1000, // Mock balance
    frozenFXCT: 0,
    availableFXCT: 1000,
    walletAddress: `0x${crypto.randomBytes(20).toString('hex')}`
  };
}

/**
 * 💸 Deduct FXCT Tokens (Mock Implementation) 
 * In production, integrate with blockchain/wallet system
 */
async function deductFXCT(userId, amount, feature, propertyId) {
  // TODO: Integrate with actual blockchain transaction system
  console.log(`💸 FXCT Deduction: ${amount} FXCT for ${feature} on property ${propertyId}`);
  console.log(`👤 User: ${userId}`);
  
  // Mock successful deduction
  return {
    success: true,
    transactionId: `tx_${crypto.randomBytes(8).toString('hex')}`,
    amount: amount,
    newBalance: 1000 - amount, // Mock calculation
    timestamp: new Date().toISOString()
  };
}

/**
 * 🏠 OWNERSHIP DATA - Premium Feature
 * Cost: 50 FXCT (~$8.00)
 * Cache: 30-90 days
 */
router.get('/:addressKey/ownership', verifyToken, async (req, res) => {
  const { addressKey } = req.params;
  const { pid, confirmed = false } = req.query;
  const userId = req.user?.id;

  console.log('💎 PREMIUM: Ownership data request');
  console.log(`📍 Address Key: ${addressKey}, PID: ${pid}`);
  console.log(`✅ Confirmed: ${confirmed}, User: ${userId}`);

  if (!pid) {
    return res.status(400).json({
      error: 'Property ID (PID) required for ownership lookup'
    });
  }

  try {
    const feature = 'ownership';
    const cost = FEATURE_COSTS[feature];

    // Step 1: Check cache first (even before FXCT check to save costs)
    const cacheKey = `premium:ownership:${pid}`;
    const cachedData = await getAsync(cacheKey);
    
    if (cachedData) {
      console.log('💾 Ownership data served from cache - NO FXCT charge');
      const parsedData = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        feature: feature,
        cost: { charged: 0, reason: 'served_from_cache' },
        data: parsedData.data,
        dataSource: {
          provider: 'CoreLogic',
          cachedAt: parsedData.cachedAt,
          ttl: parsedData.ttl
        },
        timestamp: new Date().toISOString()
      });
    }

    // Step 2: Check FXCT balance
    const walletInfo = await checkFXCTBalance(userId);
    if (walletInfo.availableFXCT < cost.cost) {
      return res.status(402).json({
        error: 'Insufficient FXCT balance',
        required: cost.cost,
        available: walletInfo.availableFXCT,
        deficit: cost.cost - walletInfo.availableFXCT,
        feature: feature,
        costInfo: cost
      });
    }

    // Step 3: If not confirmed, return cost confirmation
    if (confirmed !== 'true') {
      return res.status(200).json({
        requiresConfirmation: true,
        feature: feature,
        cost: cost,
        userBalance: {
          current: walletInfo.availableFXCT,
          afterPurchase: walletInfo.availableFXCT - cost.cost
        },
        confirmationUrl: `/api/properties/${addressKey}/ownership?pid=${pid}&confirmed=true`,
        message: 'This feature requires FXCT payment. Confirm to proceed.'
      });
    }

    // Step 4: Deduct FXCT and make CoreLogic calls
    console.log(`💸 Processing FXCT payment: ${cost.cost} FXCT`);
    const payment = await deductFXCT(userId, cost.cost, feature, pid);
    
    if (!payment.success) {
      return res.status(500).json({
        error: 'FXCT payment failed',
        details: payment.error
      });
    }

    // Step 5: Make expensive CoreLogic calls
    console.log('💸 Making expensive CoreLogic ownership calls...');
    const superClient = new CoreLogicSuperClient();
    
    const [ownership, ownershipTransfers] = await Promise.allSettled([
      superClient.getOwnership(pid),
      superClient.getOwnershipTransfers(pid, 'all', 'latest')
    ]);

    const ownershipData = {
      current: ownership.status === 'fulfilled' ? ownership.value : null,
      history: ownershipTransfers.status === 'fulfilled' ? ownershipTransfers.value : null,
      errors: {
        current: ownership.status === 'rejected' ? ownership.reason?.message : null,
        history: ownershipTransfers.status === 'rejected' ? ownershipTransfers.reason?.message : null
      }
    };

    // Step 6: Cache the expensive data (30-90 days)
    const cacheData = {
      data: ownershipData,
      feature: feature,
      cost: cost.cost,
      cachedAt: new Date().toISOString(),
      ttl: '60_days'
    };
    
    const cacheSeconds = 60 * 24 * 60 * 60; // 60 days
    await setAsync(cacheKey, cacheData, cacheSeconds);
    console.log(`💾 Ownership data cached for 60 days`);

    res.status(200).json({
      success: true,
      feature: feature,
      cost: {
        charged: cost.cost,
        usd: cost.usd,
        transactionId: payment.transactionId
      },
      data: ownershipData,
      dataSource: {
        provider: 'CoreLogic',
        freshData: true,
        cachedAt: cacheData.cachedAt,
        ttl: cacheData.ttl
      },
      userBalance: {
        previous: walletInfo.availableFXCT,
        current: payment.newBalance
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Ownership data retrieval failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Ownership data retrieval failed',
      message: error.message,
      refundInfo: 'If FXCT was charged, contact support for refund'
    });
  }
});

/**
 * 🏦 MORTGAGE DATA - Premium Feature  
 * Cost: 75 FXCT (~$12.00)
 * Cache: 30-90 days
 */
router.get('/:addressKey/mortgage', verifyToken, async (req, res) => {
  const { addressKey } = req.params;
  const { pid, confirmed = false } = req.query;
  const userId = req.user?.id;

  if (!pid) {
    return res.status(400).json({
      error: 'Property ID (PID) required for mortgage lookup'
    });
  }

  try {
    const feature = 'mortgage';
    const cost = FEATURE_COSTS[feature];

    // Check cache first
    const cacheKey = `premium:mortgage:${pid}`;
    const cachedData = await getAsync(cacheKey);
    
    if (cachedData) {
      console.log('💾 Mortgage data served from cache - NO FXCT charge');
      const parsedData = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        feature: feature,
        cost: { charged: 0, reason: 'served_from_cache' },
        data: parsedData.data,
        dataSource: {
          provider: 'CoreLogic',
          cachedAt: parsedData.cachedAt,
          ttl: parsedData.ttl
        }
      });
    }

    // Check FXCT balance and confirmation
    const walletInfo = await checkFXCTBalance(userId);
    if (walletInfo.availableFXCT < cost.cost) {
      return res.status(402).json({
        error: 'Insufficient FXCT balance',
        required: cost.cost,
        available: walletInfo.availableFXCT,
        feature: feature,
        costInfo: cost
      });
    }

    if (confirmed !== 'true') {
      return res.status(200).json({
        requiresConfirmation: true,
        feature: feature,
        cost: cost,
        userBalance: {
          current: walletInfo.availableFXCT,
          afterPurchase: walletInfo.availableFXCT - cost.cost
        },
        confirmationUrl: `/api/properties/${addressKey}/mortgage?pid=${pid}&confirmed=true`
      });
    }

    // Process payment and make calls
    console.log(`💸 Processing FXCT payment: ${cost.cost} FXCT for mortgage data`);
    const payment = await deductFXCT(userId, cost.cost, feature, pid);
    
    console.log('💸 Making expensive CoreLogic mortgage calls...');
    const superClient = new CoreLogicSuperClient();
    
    const [currentMortgage, mortgageHistory] = await Promise.allSettled([
      superClient.getCurrentMortgage(pid),
      superClient.getMortgageHistory(pid)
    ]);

    const mortgageData = {
      current: currentMortgage.status === 'fulfilled' ? currentMortgage.value : null,
      history: mortgageHistory.status === 'fulfilled' ? mortgageHistory.value : null,
      errors: {
        current: currentMortgage.status === 'rejected' ? currentMortgage.reason?.message : null,
        history: mortgageHistory.status === 'rejected' ? mortgageHistory.reason?.message : null
      }
    };

    // Cache for 60 days
    const cacheData = {
      data: mortgageData,
      feature: feature,
      cost: cost.cost,
      cachedAt: new Date().toISOString(),
      ttl: '60_days'
    };
    
    await setAsync(cacheKey, cacheData, 60 * 24 * 60 * 60);
    console.log(`💾 Mortgage data cached for 60 days`);

    res.status(200).json({
      success: true,
      feature: feature,
      cost: {
        charged: cost.cost,
        usd: cost.usd,
        transactionId: payment.transactionId
      },
      data: mortgageData,
      userBalance: {
        previous: walletInfo.availableFXCT,
        current: payment.newBalance
      }
    });

  } catch (error) {
    console.error('❌ Mortgage data retrieval failed:', error.message);
    res.status(500).json({
      error: 'Mortgage data retrieval failed',
      message: error.message
    });
  }
});

/**
 * ⚖️ LIENS DATA - Premium Feature
 * Cost: 60 FXCT (~$10.00)
 * Cache: 90-180 days
 */
router.get('/:addressKey/liens', verifyToken, async (req, res) => {
  const { addressKey } = req.params;
  const { pid, confirmed = false } = req.query;
  const userId = req.user?.id;

  if (!pid) {
    return res.status(400).json({
      error: 'Property ID (PID) required for liens lookup'
    });
  }

  try {
    const feature = 'liens';
    const cost = FEATURE_COSTS[feature];
    const cacheKey = `premium:liens:${pid}`;
    
    // Check cache (longer TTL for liens - they don't change as often)
    const cachedData = await getAsync(cacheKey);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        feature: feature,
        cost: { charged: 0, reason: 'served_from_cache' },
        data: parsedData.data
      });
    }

    // FXCT checks
    const walletInfo = await checkFXCTBalance(userId);
    if (walletInfo.availableFXCT < cost.cost) {
      return res.status(402).json({
        error: 'Insufficient FXCT balance',
        required: cost.cost,
        available: walletInfo.availableFXCT
      });
    }

    if (confirmed !== 'true') {
      return res.status(200).json({
        requiresConfirmation: true,
        feature: feature,
        cost: cost,
        userBalance: {
          current: walletInfo.availableFXCT,
          afterPurchase: walletInfo.availableFXCT - cost.cost
        },
        confirmationUrl: `/api/properties/${addressKey}/liens?pid=${pid}&confirmed=true`
      });
    }

    // Process and make expensive calls
    const payment = await deductFXCT(userId, cost.cost, feature, pid);
    const superClient = new CoreLogicSuperClient();
    
    const [liensSummary, involuntaryLiens] = await Promise.allSettled([
      superClient.getLiensSummary(pid),
      superClient.getInvoluntaryLiens(pid)
    ]);

    const liensData = {
      summary: liensSummary.status === 'fulfilled' ? liensSummary.value : null,
      involuntary: involuntaryLiens.status === 'fulfilled' ? involuntaryLiens.value : null,
      errors: {
        summary: liensSummary.status === 'rejected' ? liensSummary.reason?.message : null,
        involuntary: involuntaryLiens.status === 'rejected' ? involuntaryLiens.reason?.message : null
      }
    };

    // Cache for 120 days (liens change less frequently)
    const cacheData = {
      data: liensData,
      feature: feature,
      cost: cost.cost,
      cachedAt: new Date().toISOString(),
      ttl: '120_days'
    };
    
    await setAsync(cacheKey, cacheData, 120 * 24 * 60 * 60);
    
    res.status(200).json({
      success: true,
      feature: feature,
      cost: {
        charged: cost.cost,
        usd: cost.usd,
        transactionId: payment.transactionId
      },
      data: liensData,
      userBalance: {
        current: payment.newBalance
      }
    });

  } catch (error) {
    console.error('❌ Liens data retrieval failed:', error.message);
    res.status(500).json({
      error: 'Liens data retrieval failed',
      message: error.message
    });
  }
});

/**
 * 📊 TRANSACTION HISTORY - Premium Feature
 * Cost: 65 FXCT (~$10.50) 
 * Cache: 90-180 days
 */
router.get('/:addressKey/transactions', verifyToken, async (req, res) => {
  const { addressKey } = req.params;
  const { pid, confirmed = false } = req.query;
  const userId = req.user?.id;

  if (!pid) {
    return res.status(400).json({
      error: 'Property ID (PID) required for transaction history'
    });
  }

  try {
    const feature = 'transactions';
    const cost = FEATURE_COSTS[feature];
    const cacheKey = `premium:transactions:${pid}`;
    
    // Check cache
    const cachedData = await getAsync(cacheKey);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        cost: { charged: 0, reason: 'served_from_cache' },
        data: parsedData.data
      });
    }

    // Standard FXCT flow
    const walletInfo = await checkFXCTBalance(userId);
    if (walletInfo.availableFXCT < cost.cost) {
      return res.status(402).json({
        error: 'Insufficient FXCT balance',
        required: cost.cost,
        available: walletInfo.availableFXCT
      });
    }

    if (confirmed !== 'true') {
      return res.status(200).json({
        requiresConfirmation: true,
        feature: feature,
        cost: cost,
        confirmationUrl: `/api/properties/${addressKey}/transactions?pid=${pid}&confirmed=true`
      });
    }

    const payment = await deductFXCT(userId, cost.cost, feature, pid);
    const superClient = new CoreLogicSuperClient();
    
    const transactionHistory = await superClient.getTransactionHistory(pid);

    // Cache for 120 days
    const cacheData = {
      data: transactionHistory,
      feature: feature,
      cost: cost.cost,
      cachedAt: new Date().toISOString(),
      ttl: '120_days'
    };
    
    await setAsync(cacheKey, cacheData, 120 * 24 * 60 * 60);
    
    res.status(200).json({
      success: true,
      feature: feature,
      cost: {
        charged: cost.cost,
        usd: cost.usd,
        transactionId: payment.transactionId
      },
      data: transactionHistory,
      userBalance: { current: payment.newBalance }
    });

  } catch (error) {
    console.error('❌ Transaction history retrieval failed:', error.message);
    res.status(500).json({
      error: 'Transaction history retrieval failed',
      message: error.message
    });
  }
});

/**
 * 🌍 CLIMATE RISK ANALYTICS - Premium Feature
 * Cost: 120 FXCT (~$20.00) - Most Expensive
 * Cache: 180-365 days
 */
router.get('/:addressKey/climate-risk', verifyToken, async (req, res) => {
  const { addressKey } = req.params;
  const { pid, confirmed = false } = req.query;
  const userId = req.user?.id;

  if (!pid) {
    return res.status(400).json({
      error: 'Property ID (PID) required for climate risk analytics'
    });
  }

  try {
    const feature = 'climateRisk';
    const cost = FEATURE_COSTS[feature];
    const cacheKey = `premium:climate:${pid}`;
    
    // Check cache (longest TTL - climate data changes very slowly)
    const cachedData = await getAsync(cacheKey);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        cost: { charged: 0, reason: 'served_from_cache' },
        data: parsedData.data,
        note: 'Climate risk data served from cache - this is the most expensive feature'
      });
    }

    const walletInfo = await checkFXCTBalance(userId);
    if (walletInfo.availableFXCT < cost.cost) {
      return res.status(402).json({
        error: 'Insufficient FXCT balance',
        required: cost.cost,
        available: walletInfo.availableFXCT,
        note: 'Climate Risk Analytics is the most expensive premium feature'
      });
    }

    if (confirmed !== 'true') {
      return res.status(200).json({
        requiresConfirmation: true,
        feature: feature,
        cost: cost,
        warning: 'This is the most expensive premium feature - confirm carefully',
        confirmationUrl: `/api/properties/${addressKey}/climate-risk?pid=${pid}&confirmed=true`
      });
    }

    const payment = await deductFXCT(userId, cost.cost, feature, pid);
    const superClient = new CoreLogicSuperClient();
    
    console.log('💸💸 Making VERY EXPENSIVE CoreLogic Climate Risk call...');
    const climateRisk = await superClient.getClimateRiskAnalytics(pid);

    // Cache for 300 days (climate data changes very slowly)
    const cacheData = {
      data: climateRisk,
      feature: feature,
      cost: cost.cost,
      cachedAt: new Date().toISOString(),
      ttl: '300_days'
    };
    
    await setAsync(cacheKey, cacheData, 300 * 24 * 60 * 60);
    
    res.status(200).json({
      success: true,
      feature: feature,
      cost: {
        charged: cost.cost,
        usd: cost.usd,
        transactionId: payment.transactionId,
        note: 'Most expensive premium feature'
      },
      data: climateRisk,
      userBalance: { current: payment.newBalance }
    });

  } catch (error) {
    console.error('❌ Climate risk analytics failed:', error.message);
    res.status(500).json({
      error: 'Climate risk analytics failed',
      message: error.message
    });
  }
});

/**
 * 💰 Get Premium Feature Costs and User Balance
 */
router.get('/:addressKey/costs', verifyToken, async (req, res) => {
  const userId = req.user?.id;
  
  try {
    const walletInfo = await checkFXCTBalance(userId);
    
    // Calculate which features user can afford
    const affordableFeatures = {};
    Object.keys(FEATURE_COSTS).forEach(feature => {
      affordableFeatures[feature] = {
        ...FEATURE_COSTS[feature],
        affordable: walletInfo.availableFXCT >= FEATURE_COSTS[feature].cost
      };
    });
    
    res.status(200).json({
      userBalance: walletInfo,
      features: affordableFeatures,
      totalCostAllFeatures: Object.values(FEATURE_COSTS).reduce((sum, f) => sum + f.cost, 0),
      recommendations: {
        mostPopular: 'ownership',
        bestValue: 'transactions', 
        mostExpensive: 'climateRisk'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get cost information',
      message: error.message
    });
  }
});

module.exports = router;
