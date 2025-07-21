const mongoose = require("mongoose");

const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true },
  wallet: { type: String, default: null },
  context: { type: String, default: "newsletter" },
  createdAt: { type: Date, default: Date.now },
});

// ✅ Compound index for fast lookups
subscriberSchema.index({ wallet: 1, context: 1 });

module.exports = mongoose.model("Subscriber", subscriberSchema);
