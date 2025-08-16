/**
 * Internal Wallet API Routes
 * 
 * Internal endpoints for wallet operations:
 * - Token issuance for plan renewals
 * - Admin wallet management
 * - System operations
 * - Metrics and monitoring
 * 
 * These endpoints are protected and only accessible by internal services
 * and admin users. Not exposed to regular users.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const { authorizeAdmin } = require('../middleware/authorizeAdmin');
const walletService = require('../services/walletService');
const tokenIssuanceService = require('../services/tokenIssuanceService');
const { Wallet, WalletBalance, WalletLedger } = require('../models/Wallet');

const router = express.Router();

// Rate limiting for internal endpoints
const internalRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute for internal operations
  message: { error: 'Too many internal API requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(internalRateLimit);

// Validation middleware helper
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: errors.array()
      },
      timestamp: new Date().toISOString()
    });
  }
  next();
};

/**
 * POST /internal/wallet/issue
 * Issue FXCT tokens for plan renewal
 * 
 * Body:
 * - userId: string (required)
 * - planId: 'free' | 'premium' | 'pro' | 'enterprise' (required)
 * - planUsdPrice: number (optional, uses default if not provided)
 * - effectiveFrom: ISO date string (optional, defaults to now)
 * - metadata: object (optional) - subscription details
 */
router.post('/issue', [
  // Validation
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('planId')
    .isIn(['free', 'premium', 'pro', 'enterprise'])
    .withMessage('Valid plan ID is required'),
  body('planUsdPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Plan USD price must be a positive number'),
  body('effectiveFrom')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Effective from must be a valid ISO date'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      userId,
      planId,
      planUsdPrice,
      effectiveFrom,
      metadata = {}
    } = req.body;

    console.log(`🔄 Processing token issuance for user ${userId}, plan ${planId}`);

    // Validate plan configuration
    if (!tokenIssuanceService.validatePlanConfiguration(planId, planUsdPrice)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PLAN_CONFIG',
          message: 'Invalid plan configuration'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Issue tokens
    const result = await tokenIssuanceService.issueTokensForPlan({
      userId,
      planId,
      planUsdPrice,
      effectiveFrom: effectiveFrom || new Date(),
      metadata
    });

    res.json({
      success: true,
      data: {
        issuance: result.issuance,
        wallet: {
          id: result.wallet.wallet._id,
          balance: result.wallet.balance,
          created: result.wallet.created || false
        },
        tokensIssued: result.tokensIssued,
        fxctUsdAvg: result.fxctUsdAvg,
        duplicate: result.duplicate
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Token issuance failed:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'ISSUANCE_FAILED',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /internal/wallet/issue/preview
 * Preview token issuance without executing
 */
router.post('/issue/preview', [
  body('planId')
    .isIn(['free', 'premium', 'pro', 'enterprise'])
    .withMessage('Valid plan ID is required'),
  body('planUsdPrice')
    .isFloat({ min: 0 })
    .withMessage('Plan USD price must be a positive number'),
  body('bonusTokens')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Bonus tokens must be a non-negative integer'),
  body('prorationFactor')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Proration factor must be between 0 and 1'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { planId, planUsdPrice, bonusTokens, prorationFactor } = req.body;

    const preview = await tokenIssuanceService.previewTokenIssuance(
      planId, 
      planUsdPrice, 
      { bonusTokens, prorationFactor }
    );

    res.json({
      success: true,
      data: preview,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Issuance preview failed:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'PREVIEW_FAILED',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /internal/wallet/create
 * Create wallet for a user (admin only)
 */
router.post('/create', [
  verifyToken,
  authorizeAdmin,
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { userId } = req.body;
    const createdBy = req.user._id.toString();

    const result = await walletService.createWallet({ userId, createdBy });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Wallet creation failed:', error.message);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'WALLET_EXISTS',
          message: error.message
        },
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'CREATION_FAILED',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /internal/wallet/:walletId/credit
 * Credit wallet with tokens (admin only)
 */
router.post('/:walletId/credit', [
  verifyToken,
  authorizeAdmin,
  param('walletId')
    .isMongoId()
    .withMessage('Valid wallet ID is required'),
  body('amount')
    .isFloat({ min: 0.000001 })
    .withMessage('Amount must be greater than 0'),
  body('type')
    .isIn(['issuance', 'credit', 'refund'])
    .withMessage('Valid credit type is required'),
  body('reason')
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason is required (1-500 characters)'),
  body('ref')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Reference must be a string (max 100 characters)'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { walletId } = req.params;
    const { amount, type, reason, ref } = req.body;
    const processedBy = req.user._id.toString();

    const idempotencyKey = walletService.generateIdempotencyKey('admin_credit');

    const result = await walletService.credit({
      walletId,
      amount,
      type,
      ref,
      meta: {
        adminAction: true,
        reason,
        processedByAdmin: req.user.email
      },
      idempotencyKey,
      processedBy
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Wallet credit failed:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREDIT_FAILED',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /internal/wallet/:walletId/debit
 * Debit wallet (admin only)
 */
router.post('/:walletId/debit', [
  verifyToken,
  authorizeAdmin,
  param('walletId')
    .isMongoId()
    .withMessage('Valid wallet ID is required'),
  body('amount')
    .isFloat({ min: 0.000001 })
    .withMessage('Amount must be greater than 0'),
  body('type')
    .isIn(['debit', 'withdraw'])
    .withMessage('Valid debit type is required'),
  body('reason')
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason is required (1-500 characters)'),
  body('ref')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Reference must be a string (max 100 characters)'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { walletId } = req.params;
    const { amount, type, reason, ref } = req.body;
    const processedBy = req.user._id.toString();

    const idempotencyKey = walletService.generateIdempotencyKey('admin_debit');

    const result = await walletService.debit({
      walletId,
      amount,
      type,
      ref,
      meta: {
        adminAction: true,
        reason,
        processedByAdmin: req.user.email
      },
      idempotencyKey,
      processedBy
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Wallet debit failed:', error.message);
    
    if (error.message.includes('Insufficient funds')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_FUNDS',
          message: error.message
        },
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'DEBIT_FAILED',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * PATCH /internal/wallet/:walletId/freeze
 * Freeze wallet (admin only)
 */
router.patch('/:walletId/freeze', [
  verifyToken,
  authorizeAdmin,
  param('walletId')
    .isMongoId()
    .withMessage('Valid wallet ID is required'),
  body('reason')
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Freeze reason is required (1-500 characters)'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { walletId } = req.params;
    const { reason } = req.body;
    const frozenBy = req.user._id.toString();

    const wallet = await Wallet.findByIdAndUpdate(
      walletId,
      {
        status: 'frozen',
        'metadata.frozenBy': frozenBy,
        'metadata.frozenReason': reason,
        'metadata.frozenAt': new Date()
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'WALLET_NOT_FOUND',
          message: 'Wallet not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        wallet: wallet.toObject(),
        frozenBy: req.user.email,
        frozenAt: wallet.metadata.frozenAt
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Wallet freeze failed:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'FREEZE_FAILED',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * PATCH /internal/wallet/:walletId/unfreeze
 * Unfreeze wallet (admin only)
 */
router.patch('/:walletId/unfreeze', [
  verifyToken,
  authorizeAdmin,
  param('walletId')
    .isMongoId()
    .withMessage('Valid wallet ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { walletId } = req.params;

    const wallet = await Wallet.findByIdAndUpdate(
      walletId,
      {
        status: 'active',
        $unset: {
          'metadata.frozenBy': '',
          'metadata.frozenReason': '',
          'metadata.frozenAt': ''
        }
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'WALLET_NOT_FOUND',
          message: 'Wallet not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        wallet: wallet.toObject(),
        unfrozenBy: req.user.email,
        unfrozenAt: new Date()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Wallet unfreeze failed:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'UNFREEZE_FAILED',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /internal/wallet/stats
 * Get wallet system statistics (admin only)
 */
router.get('/stats', [
  verifyToken,
  authorizeAdmin,
  query('startDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Start date must be a valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('End date must be a valid ISO date'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build aggregation pipeline for wallet stats
    const walletPipeline = [
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ];

    const balancePipeline = [
      {
        $group: {
          _id: null,
          totalAvailable: { $sum: '$availableFxct' },
          totalPending: { $sum: '$pendingFxct' }
        }
      }
    ];

    const issuancePipeline = [];
    if (startDate || endDate) {
      const matchStage = {};
      if (startDate) matchStage.effectiveFrom = { $gte: startDate };
      if (endDate) {
        matchStage.effectiveFrom = matchStage.effectiveFrom || {};
        matchStage.effectiveFrom.$lte = endDate;
      }
      issuancePipeline.push({ $match: matchStage });
    }
    
    issuancePipeline.push({
      $group: {
        _id: null,
        totalIssuances: { $sum: 1 },
        totalTokensIssued: { $sum: '$tokensIssued' }
      }
    });

    const [walletStats, balanceStats, issuanceStats, serviceMetrics] = await Promise.all([
      Wallet.aggregate(walletPipeline),
      WalletBalance.aggregate(balancePipeline),
      tokenIssuanceService.getIssuanceStats({ startDate, endDate }),
      Promise.resolve({
        wallet: walletService.getMetrics(),
        issuance: tokenIssuanceService.getMetrics()
      })
    ]);

    // Format response
    const stats = {
      wallets: {
        total: walletStats.reduce((sum, stat) => sum + stat.count, 0),
        byStatus: walletStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      },
      balances: balanceStats[0] || { totalAvailable: 0, totalPending: 0 },
      issuances: issuanceStats.summary,
      serviceMetrics,
      period: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      generatedAt: new Date()
    };

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get wallet stats:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_FAILED',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /internal/wallet/metrics
 * Get service metrics (no auth required for monitoring)
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = {
      wallet: walletService.getMetrics(),
      issuance: tokenIssuanceService.getMetrics(),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get metrics:', error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'METRICS_FAILED',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
