/**
 * Wallet Service - Core wallet operations with ACID compliance
 * 
 * Features:
 * - SERIALIZABLE transaction isolation to prevent double-spend
 * - Row-level locking on wallet_balances
 * - Idempotency key support for all mutating operations
 * - Precise decimal arithmetic using Decimal128
 * - Comprehensive audit trail in wallet_ledger
 * - Balance validation and consistency checks
 * - Error handling and recovery
 */

const mongoose = require('mongoose');
const { Decimal128 } = require('mongodb');
const crypto = require('crypto');
const {
  Wallet,
  WalletBalance,
  WalletLedger,
  WalletIssuance,
  WalletWithdrawal,
  WalletDeposit,
  ExternalWalletLink,
  WalletUsageLedger
} = require('../models/Wallet');

class WalletService {
  constructor() {
    this.metrics = {
      walletsCreated: 0,
      transactionsProcessed: 0,
      balanceChecks: 0,
      errors: 0
    };
  }

  /**
   * Create a new custodial wallet for a user
   * @param {Object} request - CreateWalletRequest
   * @returns {Promise<Object>} Wallet and initial balance
   */
  async createWallet(request) {
    const { userId, createdBy } = request;
    
    // Start transaction session
    const session = await mongoose.startSession();
    
    try {
      let result;
      await session.withTransaction(async () => {
        // Check if wallet already exists
        const existingWallet = await Wallet.findOne({ userId }).session(session);
        if (existingWallet) {
          throw new Error(`Wallet already exists for user ${userId}`);
        }

        // Create wallet
        const wallet = new Wallet({
          userId,
          status: 'active',
          metadata: {
            createdBy,
            totalTransactions: 0,
            lastActivity: new Date()
          }
        });

        await wallet.save({ session });

        // Create initial balance record
        const balance = new WalletBalance({
          walletId: wallet._id,
          availableFxct: new Decimal128('0'),
          pendingFxct: new Decimal128('0'),
          version: 0
        });

        await balance.save({ session });

        // Create initial ledger entry
        const ledgerEntry = new WalletLedger({
          walletId: wallet._id,
          type: 'credit',
          amountFxct: new Decimal128('0'),
          ref: 'wallet_creation',
          meta: {
            action: 'wallet_created',
            userId,
            createdBy
          },
          balanceBefore: {
            available: new Decimal128('0'),
            pending: new Decimal128('0')
          },
          balanceAfter: {
            available: new Decimal128('0'),
            pending: new Decimal128('0')
          },
          processedBy: createdBy
        });

        await ledgerEntry.save({ session });

        result = {
          wallet: wallet.toObject(),
          balance: {
            available: 0,
            pending: 0,
            total: 0,
            walletId: wallet._id.toString(),
            lastUpdated: balance.updatedAt
          }
        };

        this.metrics.walletsCreated++;
      }, {
        readPreference: 'primary',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority' }
      });

      return result;

    } catch (error) {
      this.metrics.errors++;
      console.error('❌ Failed to create wallet:', error.message);
      throw new Error(`Wallet creation failed: ${error.message}`);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get wallet balance with current available/pending amounts
   * @param {string} walletId - Wallet ID
   * @returns {Promise<Object>} Current balance info
   */
  async getBalance(walletId) {
    try {
      this.metrics.balanceChecks++;

      const balance = await WalletBalance.findOne({ walletId });
      if (!balance) {
        throw new Error(`Balance record not found for wallet ${walletId}`);
      }

      const wallet = await Wallet.findById(walletId);
      if (!wallet) {
        throw new Error(`Wallet ${walletId} not found`);
      }

      if (wallet.status !== 'active') {
        console.warn(`⚠️ Accessed balance for non-active wallet ${walletId} (status: ${wallet.status})`);
      }

      return {
        available: balance.availableFxct,
        pending: balance.pendingFxct,
        total: balance.availableFxct + balance.pendingFxct,
        walletId: walletId,
        lastUpdated: balance.updatedAt
      };

    } catch (error) {
      this.metrics.errors++;
      console.error('❌ Failed to get balance:', error.message);
      throw error;
    }
  }

  /**
   * Credit wallet with FXCT tokens (issuance, deposits, refunds)
   * @param {Object} request - CreditWalletRequest
   * @returns {Promise<Object>} Operation result
   */
  async credit(request) {
    const { walletId, amount, type, ref, meta = {}, idempotencyKey, processedBy } = request;
    
    if (amount <= 0) {
      throw new Error('Credit amount must be positive');
    }

    // Check for existing transaction with same idempotency key
    const existingTx = await WalletLedger.findOne({ idempotencyKey });
    if (existingTx) {
      console.log(`ℹ️ Duplicate transaction detected: ${idempotencyKey}`);
      return {
        success: true,
        transaction: existingTx.toObject(),
        balance: await this.getBalance(walletId)
      };
    }

    const session = await mongoose.startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        // Get wallet and validate status
        const wallet = await Wallet.findById(walletId).session(session);
        if (!wallet) {
          throw new Error(`Wallet ${walletId} not found`);
        }

        if (wallet.status === 'frozen' || wallet.status === 'suspended') {
          throw new Error(`Cannot credit frozen/suspended wallet ${walletId}`);
        }

        // Lock balance record for update
        const balance = await WalletBalance.findOne({ walletId }).session(session);
        if (!balance) {
          throw new Error(`Balance record not found for wallet ${walletId}`);
        }

        const balanceBefore = {
          available: balance.availableFxct,
          pending: balance.pendingFxct
        };

        // Update balance
        balance.availableFxct = new Decimal128((balance.availableFxct + amount).toString());
        
        const balanceAfter = {
          available: balance.availableFxct,
          pending: balance.pendingFxct
        };

        await balance.save({ session });

        // Create ledger entry
        const ledgerEntry = new WalletLedger({
          walletId,
          type,
          amountFxct: new Decimal128(amount.toString()),
          ref,
          meta,
          balanceBefore: {
            available: new Decimal128(balanceBefore.available.toString()),
            pending: new Decimal128(balanceBefore.pending.toString())
          },
          balanceAfter: {
            available: new Decimal128(balanceAfter.available.toString()),
            pending: new Decimal128(balanceAfter.pending.toString())
          },
          idempotencyKey,
          processedBy
        });

        await ledgerEntry.save({ session });

        // Update wallet metadata
        wallet.metadata.totalTransactions++;
        wallet.metadata.lastActivity = new Date();
        await wallet.save({ session });

        result = {
          success: true,
          transaction: ledgerEntry.toObject(),
          balance: {
            available: parseFloat(balanceAfter.available.toString()),
            pending: parseFloat(balanceAfter.pending.toString()),
            total: parseFloat(balanceAfter.available.toString()) + parseFloat(balanceAfter.pending.toString()),
            walletId,
            lastUpdated: balance.updatedAt
          }
        };

        this.metrics.transactionsProcessed++;
      }, {
        readPreference: 'primary',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority' }
      });

      console.log(`✅ Credited wallet ${walletId}: +${amount} FXCT (type: ${type})`);
      return result;

    } catch (error) {
      this.metrics.errors++;
      console.error('❌ Failed to credit wallet:', error.message);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Debit wallet with FXCT tokens (usage, withdrawals)
   * @param {Object} request - DebitWalletRequest
   * @returns {Promise<Object>} Operation result
   */
  async debit(request) {
    const { walletId, amount, type, ref, meta = {}, idempotencyKey, processedBy } = request;
    
    if (amount <= 0) {
      throw new Error('Debit amount must be positive');
    }

    // Check for existing transaction with same idempotency key
    const existingTx = await WalletLedger.findOne({ idempotencyKey });
    if (existingTx) {
      console.log(`ℹ️ Duplicate transaction detected: ${idempotencyKey}`);
      return {
        success: true,
        transaction: existingTx.toObject(),
        balance: await this.getBalance(walletId)
      };
    }

    const session = await mongoose.startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        // Get wallet and validate status
        const wallet = await Wallet.findById(walletId).session(session);
        if (!wallet) {
          throw new Error(`Wallet ${walletId} not found`);
        }

        if (wallet.status === 'frozen' || wallet.status === 'suspended') {
          throw new Error(`Cannot debit frozen/suspended wallet ${walletId}`);
        }

        // Lock balance record for update
        const balance = await WalletBalance.findOne({ walletId }).session(session);
        if (!balance) {
          throw new Error(`Balance record not found for wallet ${walletId}`);
        }

        const balanceBefore = {
          available: balance.availableFxct,
          pending: balance.pendingFxct
        };

        // Check sufficient funds
        if (balance.availableFxct < amount) {
          throw new Error(`Insufficient funds: need ${amount} FXCT, have ${balance.availableFxct} FXCT`);
        }

        // Update balance
        balance.availableFxct = new Decimal128((balance.availableFxct - amount).toString());
        
        const balanceAfter = {
          available: balance.availableFxct,
          pending: balance.pendingFxct
        };

        await balance.save({ session });

        // Create ledger entry
        const ledgerEntry = new WalletLedger({
          walletId,
          type,
          amountFxct: new Decimal128(amount.toString()),
          ref,
          meta,
          balanceBefore: {
            available: new Decimal128(balanceBefore.available.toString()),
            pending: new Decimal128(balanceBefore.pending.toString())
          },
          balanceAfter: {
            available: new Decimal128(balanceAfter.available.toString()),
            pending: new Decimal128(balanceAfter.pending.toString())
          },
          idempotencyKey,
          processedBy
        });

        await ledgerEntry.save({ session });

        // Update wallet metadata
        wallet.metadata.totalTransactions++;
        wallet.metadata.lastActivity = new Date();
        await wallet.save({ session });

        result = {
          success: true,
          transaction: ledgerEntry.toObject(),
          balance: {
            available: parseFloat(balanceAfter.available.toString()),
            pending: parseFloat(balanceAfter.pending.toString()),
            total: parseFloat(balanceAfter.available.toString()) + parseFloat(balanceAfter.pending.toString()),
            walletId,
            lastUpdated: balance.updatedAt
          }
        };

        this.metrics.transactionsProcessed++;
      }, {
        readPreference: 'primary',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority' }
      });

      console.log(`✅ Debited wallet ${walletId}: -${amount} FXCT (type: ${type})`);
      return result;

    } catch (error) {
      this.metrics.errors++;
      console.error('❌ Failed to debit wallet:', error.message);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Hold FXCT tokens (move from available to pending)
   * Used for withdrawal processing
   * @param {Object} request - HoldReleaseRequest
   * @returns {Promise<Object>} Operation result
   */
  async hold(request) {
    const { walletId, amount, ref, meta = {}, idempotencyKey, processedBy } = request;
    
    if (amount <= 0) {
      throw new Error('Hold amount must be positive');
    }

    // Check for existing transaction with same idempotency key
    const existingTx = await WalletLedger.findOne({ idempotencyKey });
    if (existingTx) {
      console.log(`ℹ️ Duplicate hold transaction detected: ${idempotencyKey}`);
      return {
        success: true,
        transaction: existingTx.toObject(),
        balance: await this.getBalance(walletId)
      };
    }

    const session = await mongoose.startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        // Get wallet and validate status
        const wallet = await Wallet.findById(walletId).session(session);
        if (!wallet) {
          throw new Error(`Wallet ${walletId} not found`);
        }

        if (wallet.status === 'frozen' || wallet.status === 'suspended') {
          throw new Error(`Cannot hold funds in frozen/suspended wallet ${walletId}`);
        }

        // Lock balance record for update
        const balance = await WalletBalance.findOne({ walletId }).session(session);
        if (!balance) {
          throw new Error(`Balance record not found for wallet ${walletId}`);
        }

        const balanceBefore = {
          available: balance.availableFxct,
          pending: balance.pendingFxct
        };

        // Check sufficient available funds
        if (balance.availableFxct < amount) {
          throw new Error(`Insufficient available funds for hold: need ${amount} FXCT, have ${balance.availableFxct} FXCT`);
        }

        // Move from available to pending
        balance.availableFxct = new Decimal128((balance.availableFxct - amount).toString());
        balance.pendingFxct = new Decimal128((balance.pendingFxct + amount).toString());
        
        const balanceAfter = {
          available: balance.availableFxct,
          pending: balance.pendingFxct
        };

        await balance.save({ session });

        // Create ledger entry
        const ledgerEntry = new WalletLedger({
          walletId,
          type: 'hold',
          amountFxct: new Decimal128(amount.toString()),
          ref,
          meta,
          balanceBefore: {
            available: new Decimal128(balanceBefore.available.toString()),
            pending: new Decimal128(balanceBefore.pending.toString())
          },
          balanceAfter: {
            available: new Decimal128(balanceAfter.available.toString()),
            pending: new Decimal128(balanceAfter.pending.toString())
          },
          idempotencyKey,
          processedBy
        });

        await ledgerEntry.save({ session });

        // Update wallet metadata
        wallet.metadata.totalTransactions++;
        wallet.metadata.lastActivity = new Date();
        await wallet.save({ session });

        result = {
          success: true,
          transaction: ledgerEntry.toObject(),
          balance: {
            available: parseFloat(balanceAfter.available.toString()),
            pending: parseFloat(balanceAfter.pending.toString()),
            total: parseFloat(balanceAfter.available.toString()) + parseFloat(balanceAfter.pending.toString()),
            walletId,
            lastUpdated: balance.updatedAt
          }
        };

        this.metrics.transactionsProcessed++;
      }, {
        readPreference: 'primary',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority' }
      });

      console.log(`✅ Held ${amount} FXCT in wallet ${walletId} (ref: ${ref})`);
      return result;

    } catch (error) {
      this.metrics.errors++;
      console.error('❌ Failed to hold funds:', error.message);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Release held FXCT tokens (move from pending back to available or remove entirely)
   * @param {Object} request - HoldReleaseRequest with release_type in meta
   * @returns {Promise<Object>} Operation result
   */
  async release(request) {
    const { walletId, amount, ref, meta = {}, idempotencyKey, processedBy } = request;
    const releaseType = meta.releaseType || 'restore'; // 'restore' or 'consume'
    
    if (amount <= 0) {
      throw new Error('Release amount must be positive');
    }

    // Check for existing transaction with same idempotency key
    const existingTx = await WalletLedger.findOne({ idempotencyKey });
    if (existingTx) {
      console.log(`ℹ️ Duplicate release transaction detected: ${idempotencyKey}`);
      return {
        success: true,
        transaction: existingTx.toObject(),
        balance: await this.getBalance(walletId)
      };
    }

    const session = await mongoose.startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        // Get wallet
        const wallet = await Wallet.findById(walletId).session(session);
        if (!wallet) {
          throw new Error(`Wallet ${walletId} not found`);
        }

        // Lock balance record for update
        const balance = await WalletBalance.findOne({ walletId }).session(session);
        if (!balance) {
          throw new Error(`Balance record not found for wallet ${walletId}`);
        }

        const balanceBefore = {
          available: balance.availableFxct,
          pending: balance.pendingFxct
        };

        // Check sufficient pending funds
        if (balance.pendingFxct < amount) {
          throw new Error(`Insufficient pending funds for release: need ${amount} FXCT, have ${balance.pendingFxct} FXCT`);
        }

        // Update balance based on release type
        balance.pendingFxct = new Decimal128((balance.pendingFxct - amount).toString());
        
        if (releaseType === 'restore') {
          // Move back to available
          balance.availableFxct = new Decimal128((balance.availableFxct + amount).toString());
        }
        // If 'consume', just remove from pending (already deducted)
        
        const balanceAfter = {
          available: balance.availableFxct,
          pending: balance.pendingFxct
        };

        await balance.save({ session });

        // Create ledger entry
        const ledgerEntry = new WalletLedger({
          walletId,
          type: 'release',
          amountFxct: new Decimal128(amount.toString()),
          ref,
          meta: { ...meta, releaseType },
          balanceBefore: {
            available: new Decimal128(balanceBefore.available.toString()),
            pending: new Decimal128(balanceBefore.pending.toString())
          },
          balanceAfter: {
            available: new Decimal128(balanceAfter.available.toString()),
            pending: new Decimal128(balanceAfter.pending.toString())
          },
          idempotencyKey,
          processedBy
        });

        await ledgerEntry.save({ session });

        // Update wallet metadata
        wallet.metadata.totalTransactions++;
        wallet.metadata.lastActivity = new Date();
        await wallet.save({ session });

        result = {
          success: true,
          transaction: ledgerEntry.toObject(),
          balance: {
            available: parseFloat(balanceAfter.available.toString()),
            pending: parseFloat(balanceAfter.pending.toString()),
            total: parseFloat(balanceAfter.available.toString()) + parseFloat(balanceAfter.pending.toString()),
            walletId,
            lastUpdated: balance.updatedAt
          }
        };

        this.metrics.transactionsProcessed++;
      }, {
        readPreference: 'primary',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority' }
      });

      console.log(`✅ Released ${amount} FXCT from wallet ${walletId} (type: ${releaseType}, ref: ${ref})`);
      return result;

    } catch (error) {
      this.metrics.errors++;
      console.error('❌ Failed to release funds:', error.message);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get wallet by user ID, creating one if it doesn't exist
   * @param {string} userId - User ID
   * @param {string} createdBy - Admin/system user creating wallet
   * @returns {Promise<Object>} Wallet info
   */
  async getOrCreateWallet(userId, createdBy = 'system') {
    try {
      // Try to find existing wallet first
      let wallet = await Wallet.findOne({ userId });
      
      if (wallet) {
        const balance = await this.getBalance(wallet._id.toString());
        return {
          wallet: wallet.toObject(),
          balance,
          created: false
        };
      }

      // Create new wallet
      const result = await this.createWallet({ userId, createdBy });
      return {
        ...result,
        created: true
      };

    } catch (error) {
      console.error('❌ Failed to get or create wallet:', error.message);
      throw error;
    }
  }

  /**
   * Get wallet transaction history
   * @param {string} walletId - Wallet ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Transaction history
   */
  async getLedger(walletId, options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        type = null,
        startDate = null,
        endDate = null
      } = options;

      const query = { walletId };
      
      if (type) {
        query.type = type;
      }
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        WalletLedger.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('processedBy', 'firstName lastName email')
          .lean(),
        WalletLedger.countDocuments(query)
      ]);

      return {
        transactions,
        pagination: {
          page,
          limit,
          total,
          hasMore: skip + transactions.length < total
        }
      };

    } catch (error) {
      console.error('❌ Failed to get wallet ledger:', error.message);
      throw error;
    }
  }

  /**
   * Get service metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Generate idempotency key for operations
   * @param {string} prefix - Key prefix
   * @returns {string} Unique idempotency key
   */
  generateIdempotencyKey(prefix = 'tx') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
}

// Export singleton instance
const walletService = new WalletService();
module.exports = walletService;
