
const mongoose = require("mongoose");

const SuggestedDealSchema = new mongoose.Schema({
  title: { type: String, required: true },
  address1: { type: String, required: true },
  city: String,
  state: String,
  postalcode: String,
  lat: Number,
  lng: Number,
  structure: {
    beds: Number,
    baths: Number,
    sqft: Number,
    yearBuilt: Number,
    propertyType: String
  },
  valuation: {
    avm: Number,
    rangeLow: Number,
    rangeHigh: Number,
    confidence: Number
  },
  targetPrice: Number,
  fractionable: { type: Boolean, default: false },
  dealStatus: { type: String, default: "review" }, // review, approved, live, archived
  imageUrl: String,
  source: String,
  addedBy: String,
  tags: [String],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SuggestedDeal", SuggestedDealSchema);
