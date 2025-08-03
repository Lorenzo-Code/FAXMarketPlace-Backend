const mongoose = require("mongoose");

const FastCompSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    address: { type: String, required: true },
    zip: { type: String, required: true },
    summary: {
      type: Object,
      default: {} // Contains Attom, Zillow, Property data
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("FastComp", FastCompSchema);
