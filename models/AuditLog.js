// models/AuditLog.js
const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "login", "logout", "failed_login", "token_transfer", 
        "document_update", "admin_action", "password_reset", 
        "email_change", "profile_update", "ip_blocked", 
        "suspicious_activity", "api_call", "transaction", 
        "registration", "email_verification"
      ],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    email: String,
    action: String,
    ipAddress: String,
    userAgent: String,
    location: {
      country: String,
      city: String,
      region: String,
    },
    metadata: Object,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);
