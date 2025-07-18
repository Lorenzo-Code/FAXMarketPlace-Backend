// models/AuditLog.js
const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["login", "token_transfer", "document_update", "admin_action"],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    email: String,
    action: String,
    metadata: Object,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);
