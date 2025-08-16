const mongoose = require('mongoose');

/**
 * 🏠 Property Details Cache Model - 30-day caching for detailed property intelligence
 * Used when users click on specific listings to get detailed CoreLogic data
 */
const propertyDetailsCacheSchema = new mongoose.Schema({
  // Property identification
  propertyId: {
    type: String,
    required: true,
    index: true
  },
  
  // Source of the property data
  dataSource: {
    type: String,
    enum: ['corelogic', 'zillow', 'combined'],
    required: true
  },
  
  // Property address for reference
  address: {
    oneLine: String,
    street: String,
    city: String,
    state: String,
    zip: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Detailed property information
  propertyDetails: {
    // Basic information
    basics: {
      beds: Number,
      baths: Number,
      sqft: Number,
      lotSize: Number,
      yearBuilt: Number,
      propertyType: String,
      stories: Number,
      garage: Number,
      pool: Boolean,
      fireplace: Boolean
    },
    
    // Financial information
    financial: {
      currentValue: Number,
      assessedValue: Number,
      taxAmount: Number,
      taxYear: Number,
      pricePerSqft: Number,
      listPrice: Number,
      listDate: Date,
      daysOnMarket: Number,
      priceHistory: [{
        date: Date,
        price: Number,
        event: String, // 'listed', 'price_change', 'sold', etc.
        source: String
      }]
    },
    
    // Building details
    building: {
      construction: String, // 'frame', 'brick', 'stucco', etc.
      roofType: String,
      heating: String,
      cooling: String,
      interiorFeatures: [String],
      exteriorFeatures: [String],
      appliances: [String],
      flooring: [String]
    },
    
    // Neighborhood information
    neighborhood: {
      walkScore: Number,
      bikeScore: Number,
      transitScore: Number,
      crimeRating: String,
      schoolRating: Number,
      nearbyAmenities: [{
        name: String,
        type: String, // 'school', 'park', 'shopping', 'restaurant', etc.
        distance: Number, // in miles
        rating: Number
      }]
    },
    
    // Investment metrics
    investment: {
      rentEstimate: Number,
      capRate: Number,
      cashOnCashReturn: Number,
      yearlyAppreciation: Number,
      propensityScore: Number,
      comparablesSold: Number,
      medianAreaPrice: Number
    },
    
    // Risk factors
    risks: {
      floodZone: String,
      hurricaneRisk: String,
      earthquakeRisk: String,
      fireRisk: String,
      environmentalHazards: [String]
    },
    
    // Full data from sources (for debugging/advanced features)
    rawData: {
      corelogic: mongoose.Schema.Types.Mixed,
      zillow: mongoose.Schema.Types.Mixed,
      enrichments: mongoose.Schema.Types.Mixed
    }
  },
  
  // Images and media
  media: {
    primaryImage: String,
    images: [String],
    virtualTour: String,
    streetView: String
  },
  
  // Cache metadata
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  lastAccessed: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  accessCount: {
    type: Number,
    default: 1
  },
  
  // API cost tracking
  apiCostIncurred: {
    type: Number,
    default: 0
  },
  
  apiCostSaved: {
    type: Number,
    default: 0
  },
  
  // Data freshness tracking
  dataFreshness: {
    corelogic: Date,
    zillow: Date,
    enrichments: Date
  },
  
  // TTL - Auto-expire after 30 days for property details
  expiresAt: {
    type: Date,
    default: Date.now,
    expires: 2592000, // 30 days in seconds
    index: true
  }
});

// 🔍 Static method to find cached property details
propertyDetailsCacheSchema.statics.findCachedDetails = async function(propertyId, source = 'any') {
  const query = { propertyId };
  if (source !== 'any') {
    query.dataSource = source;
  }
  
  const cached = await this.findOne(query);
  
  if (cached) {
    // Update access tracking
    cached.lastAccessed = new Date();
    cached.accessCount += 1;
    cached.apiCostSaved += 0.15; // Estimate $0.15 saved per CoreLogic details call
    await cached.save();
    
    console.log(`💰 Property details cache HIT for ${propertyId} (accessed ${cached.accessCount} times)`);
    return cached.propertyDetails;
  }
  
  console.log(`💸 Property details cache MISS for ${propertyId}`);
  return null;
};

// 💾 Static method to cache property details
propertyDetailsCacheSchema.statics.cacheDetails = async function(
  propertyId, 
  dataSource, 
  address, 
  propertyDetails, 
  media, 
  apiCostEstimate = 0.15
) {
  try {
    // Check if already exists
    const existing = await this.findOne({ propertyId, dataSource });
    if (existing) {
      console.log(`📝 Updating existing property details cache for ${propertyId}`);
      existing.propertyDetails = propertyDetails;
      existing.media = media;
      existing.lastAccessed = new Date();
      existing.accessCount += 1;
      existing.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Reset to 30 days
      existing.dataFreshness = {
        ...existing.dataFreshness,
        [dataSource]: new Date()
      };
      await existing.save();
      return existing;
    }
    
    // Create new cache entry
    const cacheEntry = new this({
      propertyId,
      dataSource,
      address,
      propertyDetails,
      media,
      apiCostIncurred: apiCostEstimate,
      dataFreshness: {
        [dataSource]: new Date()
      },
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    });
    
    await cacheEntry.save();
    console.log(`💾 Cached property details for ${propertyId} (estimated cost: $${apiCostEstimate.toFixed(2)})`);
    
    return cacheEntry;
  } catch (error) {
    console.error('❌ Error caching property details:', error);
    return null;
  }
};

// 📊 Static method to get cache statistics
propertyDetailsCacheSchema.statics.getCacheStats = async function() {
  const [totalCached, totalAccess, totalCostSaved, totalCostIncurred] = await Promise.all([
    this.countDocuments({}),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$accessCount' } } }]),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$apiCostSaved' } } }]),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$apiCostIncurred' } } }])
  ]);
  
  return {
    totalCachedProperties: totalCached,
    totalCacheHits: totalAccess[0]?.total || 0,
    totalCostSaved: totalCostSaved[0]?.total || 0,
    totalCostIncurred: totalCostIncurred[0]?.total || 0,
    avgCacheHits: totalCached > 0 ? (totalAccess[0]?.total || 0) / totalCached : 0,
    costSavingsRatio: totalCostIncurred[0]?.total > 0 
      ? (totalCostSaved[0]?.total || 0) / totalCostIncurred[0].total 
      : 0
  };
};

// 🧹 Static method to clean up old property details cache
propertyDetailsCacheSchema.statics.cleanupCache = async function() {
  const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  
  // Remove entries that haven't been accessed in 2 months and have low access count
  const result = await this.deleteMany({
    lastAccessed: { $lt: twoMonthsAgo },
    accessCount: { $lt: 3 }
  });
  
  console.log(`🧹 Cleaned up ${result.deletedCount} old property details cache entries`);
  return result.deletedCount;
};

// 📈 Static method to get property popularity metrics
propertyDetailsCacheSchema.statics.getPopularProperties = async function(limit = 10) {
  return await this.find({})
    .sort({ accessCount: -1, lastAccessed: -1 })
    .limit(limit)
    .select('propertyId address.oneLine accessCount lastAccessed dataSource')
    .lean();
};

// 🔍 Add indexes for efficient querying
propertyDetailsCacheSchema.index({ propertyId: 1, dataSource: 1 }, { unique: true });
propertyDetailsCacheSchema.index({ 'address.city': 1, 'address.state': 1 });
propertyDetailsCacheSchema.index({ createdAt: -1, accessCount: -1 });
propertyDetailsCacheSchema.index({ lastAccessed: -1 });

module.exports = mongoose.model('PropertyDetailsCache', propertyDetailsCacheSchema);
