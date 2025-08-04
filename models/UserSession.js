const mongoose = require("mongoose");

const UserSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    loginTime: {
      type: Date,
      default: Date.now,
    },
    logoutTime: {
      type: Date,
      default: null,
    },
    // Geolocation data (optional)
    location: {
      country: String,
      city: String,
      region: String,
    },
    // Device information
    deviceInfo: {
      browser: String,
      os: String,
      device: String,
    }
  },
  { 
    timestamps: true,
    // Automatically remove sessions after 24 hours of inactivity
    expires: '24h'
  }
);

// Index for better performance on queries
UserSessionSchema.index({ userId: 1, isActive: 1 });
UserSessionSchema.index({ sessionId: 1 });
UserSessionSchema.index({ lastActivity: 1 });

// Update lastActivity whenever session is accessed
UserSessionSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Mark session as inactive
UserSessionSchema.methods.markInactive = function() {
  this.isActive = false;
  this.logoutTime = new Date();
  return this.save();
};

module.exports = mongoose.model("UserSession", UserSessionSchema);
