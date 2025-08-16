/**
 * Wallet System Models
 * 
 * MongoDB/Mongoose models for the FXCT internal wallet system:
 * - Internal custodial wallets per user
 * - Wallet balances with available/pending amounts
 * - Comprehensive transaction ledger
 * - Token issuances from plan renewals
 * - Withdrawal tracking and status
 * - External wallet connections
 * - Deposit tracking
 * - FXCT pricing rates (extends existing)
 * - Usage ledger integration
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('crypto').randomUUID || require('uuid').v4;

// Wallet Schema - One custodial wallet per user
const WalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true, // One wallet per user
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'frozen', 'suspended'],
    default: 'active',
    index: true
  },
  // Metadata for admin management
  metadata: {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    frozenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    frozenReason: String,
    frozenAt: Date,
    lastActivity: Date,
    totalTransactions: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Wallet Balance Schema - Current balances with precision
const WalletBalanceSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    unique: true,
    index: true
  },
  // Use Mongoose Decimal128 for precise monetary calculations
  availableFxct: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: 0,
    get: function(value) {
      return value ? parseFloat(value.toString()) : 0;
    }
  },
  pendingFxct: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: 0,
    get: function(value) {
      return value ? parseFloat(value.toString()) : 0;
    }
  },
  // Version for optimistic concurrency control
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Pre-save middleware for balance validation
WalletBalanceSchema.pre('save', function(next) {
  if (this.availableFxct < 0) {
    return next(new Error('Available FXCT balance cannot be negative'));
  }
  if (this.pendingFxct < 0) {
    return next(new Error('Pending FXCT balance cannot be negative'));
  }
  // Increment version for optimistic locking
  this.increment();
  next();
});

// Wallet Ledger Schema - Complete transaction history
const WalletLedgerSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['issuance', 'debit', 'credit', 'hold', 'release', 'withdraw', 'refund', 'adjust'],
    required: true,
    index: true
  },
  amountFxct: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: function(value) {
      return value ? parseFloat(value.toString()) : 0;
    }
  },
  // Reference to related transaction/operation
  ref: {
    type: String, // Could be withdrawal_id, usage_id, issuance_id, etc.
    index: true
  },
  // Flexible metadata for different transaction types
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Balance snapshots for audit trail
  balanceBefore: {
    available: { type: mongoose.Schema.Types.Decimal128 },
    pending: { type: mongoose.Schema.Types.Decimal128 }
  },
  balanceAfter: {
    available: { type: mongoose.Schema.Types.Decimal128 },
    pending: { type: mongoose.Schema.Types.Decimal128 }
  },
  // Idempotency and audit
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Index for efficient ledger queries
WalletLedgerSchema.index({ walletId: 1, createdAt: -1 });
WalletLedgerSchema.index({ type: 1, createdAt: -1 });
WalletLedgerSchema.index({ ref: 1, type: 1 });

// Wallet Issuances Schema - Token issuance from plan renewals
const WalletIssuanceSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  planId: {
    type: String,
    required: true,
    enum: ['free', 'premium', 'pro', 'enterprise']
  },
  fxctUsdAvg: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: function(value) {
      return value ? parseFloat(value.toString()) : 0;
    }
  },
  tokensIssued: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: function(value) {
      return value ? parseFloat(value.toString()) : 0;
    }
  },
  effectiveFrom: {
    type: Date,
    required: true,
    index: true
  },
  // Links to subscription system
  metadata: {
    subscriptionId: String,
    planUsdPrice: Number,
    billingCycle: { type: String, enum: ['monthly', 'yearly'] },
    bonusTokens: Number,
    prorationApplied: Boolean
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

WalletIssuanceSchema.index({ walletId: 1, effectiveFrom: -1 });

// Wallet Withdrawals Schema - Withdrawal tracking and status
const WalletWithdrawalSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  amountFxct: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: function(value) {
      return value ? parseFloat(value.toString()) : 0;
    }
  },
  toAddress: {
    type: String,
    required: true,
    trim: true
  },
  network: {
    type: String,
    required: true,
    enum: ['ethereum', 'polygon', 'bsc', 'avalanche', 'hedera', 'solana'],
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'broadcast', 'confirmed', 'failed', 'reversed'],
    default: 'pending',
    index: true
  },
  txHash: {
    type: String,
    sparse: true,
    index: true
  },
  requestIdempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Fee and gas tracking
  networkFee: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0
  },
  gasUsed: Number,
  gasPrice: String,
  // Security and compliance
  twoFaVerified: { type: Boolean, default: false },
  ipAddress: String,
  userAgent: String,
  // Processing metadata
  processedAt: Date,
  confirmedAt: Date,
  failureReason: String,
  retryCount: { type: Number, default: 0 },
  lastRetryAt: Date
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

WalletWithdrawalSchema.index({ walletId: 1, createdAt: -1 });
WalletWithdrawalSchema.index({ status: 1, createdAt: -1 });
WalletWithdrawalSchema.index({ txHash: 1 });

// Wallet Deposits Schema - Incoming token tracking
const WalletDepositSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  amountFxct: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: function(value) {
      return value ? parseFloat(value.toString()) : 0;
    }
  },
  fromAddress: {
    type: String,
    required: true,
    trim: true
  },
  network: {
    type: String,
    required: true,
    enum: ['ethereum', 'polygon', 'bsc', 'avalanche', 'hedera', 'solana'],
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending',
    index: true
  },
  txHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  blockNumber: Number,
  confirmations: { type: Number, default: 0 },
  // Processing metadata
  detectedAt: { type: Date, default: Date.now },
  processedAt: Date,
  confirmedAt: Date
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

WalletDepositSchema.index({ walletId: 1, createdAt: -1 });
WalletDepositSchema.index({ status: 1, createdAt: -1 });

// External Wallet Links Schema - Connected external wallets
const ExternalWalletLinkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['walletconnect', 'evm', 'hedera', 'solana', 'other']
  },
  address: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  network: {
    type: String,
    required: true,
    enum: ['ethereum', 'polygon', 'bsc', 'avalanche', 'hedera', 'solana']
  },
  // Cryptographic verification
  verifiedSignature: {
    type: String,
    required: true
  },
  verificationNonce: String,
  verificationMessage: String,
  verifiedAt: { type: Date, default: Date.now },
  // Status and metadata
  isActive: { type: Boolean, default: true },
  nickname: String,
  lastUsedAt: Date,
  // Security
  suspendedAt: Date,
  suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  suspensionReason: String
}, {
  timestamps: true
});

// Compound unique index to prevent duplicate wallet connections
ExternalWalletLinkSchema.index({ address: 1, network: 1 }, { unique: true });
ExternalWalletLinkSchema.index({ userId: 1, isActive: 1 });

// Enhanced Usage Ledger Schema - Extends existing for wallet integration
const WalletUsageLedgerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  pid: String, // Property ID
  dataType: {
    type: String,
    required: true,
    enum: ['BASIC', 'STANDARD', 'PRO_LOW', 'PRO_HIGH'],
    index: true
  },
  fxctDebited: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: function(value) {
      return value ? parseFloat(value.toString()) : 0;
    }
  },
  usdCostRef: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: function(value) {
      return value ? parseFloat(value.toString()) : 0;
    }
  },
  requestIdempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Transaction status and metadata
  status: {
    type: String,
    enum: ['completed', 'failed', 'refunded'],
    default: 'completed',
    index: true
  },
  endpoint: String,
  sessionData: {
    sessionId: String,
    ipAddress: String,
    userAgent: String
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

WalletUsageLedgerSchema.index({ userId: 1, createdAt: -1 });
WalletUsageLedgerSchema.index({ walletId: 1, createdAt: -1 });
WalletUsageLedgerSchema.index({ dataType: 1, createdAt: -1 });

// Create models
const Wallet = mongoose.model('Wallet', WalletSchema);
const WalletBalance = mongoose.model('WalletBalance', WalletBalanceSchema);
const WalletLedger = mongoose.model('WalletLedger', WalletLedgerSchema);
const WalletIssuance = mongoose.model('WalletIssuance', WalletIssuanceSchema);
const WalletWithdrawal = mongoose.model('WalletWithdrawal', WalletWithdrawalSchema);
const WalletDeposit = mongoose.model('WalletDeposit', WalletDepositSchema);
const ExternalWalletLink = mongoose.model('ExternalWalletLink', ExternalWalletLinkSchema);
const WalletUsageLedger = mongoose.model('WalletUsageLedger', WalletUsageLedgerSchema);

module.exports = {
  Wallet,
  WalletBalance,
  WalletLedger,
  WalletIssuance,
  WalletWithdrawal,
  WalletDeposit,
  ExternalWalletLink,
  WalletUsageLedger
};
