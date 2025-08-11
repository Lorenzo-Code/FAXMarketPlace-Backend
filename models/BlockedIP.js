const mongoose = require('mongoose');

const BlockedIPSchema = new mongoose.Schema(
  {
    ipAddress: {
      type: String,
      required: true,
      unique: true,
    },
    reason: {
      type: String,
      required: true,
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    blockedByEmail: {
      type: String,
      required: true,
    },
    // Metadata about the IP
    metadata: {
      riskScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
      },
      threatType: {
        type: String,
        enum: ['brute_force', 'suspicious_activity', 'malicious_request', 'manual_block', 'automated_block'],
        default: 'manual_block',
      },
      attemptCount: {
        type: Number,
        default: 0,
      },
      lastAttempt: Date,
      geolocation: {
        country: String,
        city: String,
        region: String,
      },
      userAgent: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: null, // null means permanent block
    },
    // Audit trail
    unblockHistory: [{
      unblockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      unblockedByEmail: String,
      unblockedAt: Date,
      reason: String,
    }],
  },
  { 
    timestamps: true,
    // Auto-remove expired blocks
    expires: 0
  }
);

// Index for better performance
// ipAddress index is automatically created by unique constraint
BlockedIPSchema.index({ isActive: 1 });
BlockedIPSchema.index({ expiresAt: 1 });

// Static method to check if IP is blocked
BlockedIPSchema.statics.isIPBlocked = function(ipAddress) {
  return this.findOne({
    ipAddress,
    isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

// Static method to block an IP
BlockedIPSchema.statics.blockIP = function(ipAddress, reason, blockedBy, blockedByEmail, metadata = {}) {
  const blockData = {
    ipAddress,
    reason,
    blockedBy,
    blockedByEmail,
    metadata,
    isActive: true,
  };
  
  return this.findOneAndUpdate(
    { ipAddress },
    blockData,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

// Instance method to unblock IP
BlockedIPSchema.methods.unblockIP = function(unblockedBy, unblockedByEmail, reason) {
  this.isActive = false;
  this.unblockHistory.push({
    unblockedBy,
    unblockedByEmail,
    unblockedAt: new Date(),
    reason: reason || 'Manual unblock',
  });
  return this.save();
};

module.exports = mongoose.model('BlockedIP', BlockedIPSchema);
