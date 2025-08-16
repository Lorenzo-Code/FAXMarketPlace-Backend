/**
 * Wallet System Main Export
 * 
 * Central export point for all wallet system components.
 * Use this file to import wallet services and utilities.
 */

// Core Services
const walletService = require('./services/walletService');
const tokenIssuanceService = require('./services/tokenIssuanceService');

// Database Models
const {
  Wallet,
  WalletBalance,
  WalletLedger,
  WalletIssuance,
  WalletWithdrawal,
  WalletDeposit,
  ExternalWalletLink,
  WalletUsageLedger
} = require('./models/Wallet');

// Middleware
const {
  FXCTDeductionMiddleware,
  fxctDeductionMiddleware,
  deductFxct,
  conditionalDeductFxct
} = require('./middleware/deductFxct');

// Configuration and Constants
const WALLET_CONFIG = {
  SUPPORTED_NETWORKS: ['ethereum', 'polygon', 'bsc', 'avalanche', 'hedera', 'solana'],
  SUPPORTED_PROVIDERS: ['walletconnect', 'evm', 'hedera', 'solana', 'other'],
  SUPPORTED_PLANS: ['free', 'premium', 'pro', 'enterprise'],
  DATA_TYPES: ['BASIC', 'STANDARD', 'PRO_LOW', 'PRO_HIGH'],
  LEDGER_TYPES: ['issuance', 'debit', 'credit', 'hold', 'release', 'withdraw', 'refund', 'adjust'],
  WITHDRAWAL_STATUSES: ['pending', 'broadcast', 'confirmed', 'failed', 'reversed'],
  WALLET_STATUSES: ['active', 'frozen', 'suspended']
};

// Utility Functions
const walletUtils = {
  /**
   * Generate unique idempotency key
   */
  generateIdempotencyKey: (prefix = 'tx') => {
    const crypto = require('crypto');
    return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  },

  /**
   * Format FXCT amount for display
   */
  formatFxctAmount: (amount) => {
    if (typeof amount === 'object' && amount.toString) {
      amount = parseFloat(amount.toString());
    }
    return Number(amount).toFixed(6).replace(/\.?0+$/, '');
  },

  /**
   * Validate wallet address format
   */
  validateWalletAddress: (address, network) => {
    if (!address || typeof address !== 'string') return false;
    
    switch (network) {
      case 'ethereum':
      case 'polygon':
      case 'bsc':
      case 'avalanche':
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      case 'hedera':
        return /^\d+\.\d+\.\d+$/.test(address);
      case 'solana':
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      default:
        return false;
    }
  },

  /**
   * Calculate wallet health score
   */
  calculateWalletHealth: (wallet, balance, recentTransactions = []) => {
    let score = 100;
    
    // Reduce score for frozen/suspended wallets
    if (wallet.status === 'frozen') score -= 50;
    if (wallet.status === 'suspended') score -= 75;
    
    // Reduce score for low balance
    if (balance.available < 10) score -= 20;
    if (balance.available < 1) score -= 30;
    
    // Reduce score for failed transactions
    const failedTxCount = recentTransactions.filter(tx => tx.status === 'failed').length;
    score -= failedTxCount * 5;
    
    return Math.max(0, Math.min(100, score));
  }
};

module.exports = {
  // Services
  walletService,
  tokenIssuanceService,
  
  // Models
  Wallet,
  WalletBalance,
  WalletLedger,
  WalletIssuance,
  WalletWithdrawal,
  WalletDeposit,
  ExternalWalletLink,
  WalletUsageLedger,
  
  // Middleware
  FXCTDeductionMiddleware,
  fxctDeductionMiddleware,
  deductFxct,
  conditionalDeductFxct,
  
  // Configuration
  WALLET_CONFIG,
  walletUtils
};

/**
 * Quick Start Guide
 * 
 * 1. Basic wallet operations:
 * 
 *    const { walletService } = require('./wallet');
 * 
 *    // Create wallet
 *    const wallet = await walletService.createWallet({ userId: '...' });
 * 
 *    // Get balance
 *    const balance = await walletService.getBalance(walletId);
 * 
 *    // Credit tokens
 *    await walletService.credit({
 *      walletId,
 *      amount: 100,
 *      type: 'issuance',
 *      idempotencyKey: walletUtils.generateIdempotencyKey()
 *    });
 * 
 * 2. Token issuance:
 * 
 *    const { tokenIssuanceService } = require('./wallet');
 * 
 *    const result = await tokenIssuanceService.issueTokensForPlan({
 *      userId: '...',
 *      planId: 'premium',
 *      planUsdPrice: 29.99
 *    });
 * 
 * 3. Usage deduction middleware:
 * 
 *    const { deductFxct } = require('./wallet');
 * 
 *    app.get('/api/premium-endpoint', 
 *      verifyToken, 
 *      deductFxct, 
 *      handler
 *    );
 * 
 * For complete documentation, see WALLET_SYSTEM_README.md
 */
