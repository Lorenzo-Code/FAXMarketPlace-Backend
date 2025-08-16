const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    // 🏠 Address Information
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zipCode: { type: String, trim: true },
      country: { type: String, trim: true, default: 'United States' }
    },
    // 📞 Contact Information
    phone: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
    },
    // 🆔 KYC Information
    kyc: {
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'not_submitted'],
        default: 'not_submitted'
      },
      submittedAt: { type: Date },
      reviewedAt: { type: Date },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      rejectionReason: { type: String },
      documents: [{
        type: {
          type: String,
          enum: ['passport', 'drivers_license', 'national_id', 'utility_bill', 'bank_statement', 'other']
        },
        filename: String,
        originalName: String,
        uploadedAt: { type: Date, default: Date.now },
        verified: { type: Boolean, default: false }
      }],
      riskScore: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
      },
      complianceNotes: String
    },
    // 💼 Profile Information
    profileComplete: {
      type: Boolean,
      default: false
    },
    avatar: {
      type: String, // URL to profile image
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    suspended: {
      type: Boolean,
      default: false,
    },
    suspendedAt: {
      type: Date,
    },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    suspensionReason: {
      type: String,
    },
    // 🔐 2FA/Google Authenticator fields
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: null,
    },
    backupCodes: {
      type: [String],
      default: [],
    },
    // 🛡️ Security fields
    lastLogin: {
      type: Date,
      default: null,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // 🔴 Real-time tracking fields
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    sessionId: {
      type: String,
      default: null,
    },
    // 💳 Subscription Information
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'premium', 'pro'],
        default: 'free'
      },
      status: {
        type: String,
        enum: ['active', 'inactive', 'cancelled', 'past_due', 'trialing'],
        default: 'inactive'
      },
      startDate: {
        type: Date,
        default: null
      },
      endDate: {
        type: Date,
        default: null
      },
      // Stripe/payment integration fields
      stripeCustomerId: {
        type: String,
        default: null
      },
      stripeSubscriptionId: {
        type: String,
        default: null
      },
      // Usage tracking
      usage: {
        searchesThisMonth: {
          type: Number,
          default: 0
        },
        lastResetDate: {
          type: Date,
          default: Date.now
        }
      },
      // Trial information
      trial: {
        hasUsedTrial: {
          type: Boolean,
          default: false
        },
        trialStartDate: {
          type: Date,
          default: null
        },
        trialEndDate: {
          type: Date,
          default: null
        }
      }
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
