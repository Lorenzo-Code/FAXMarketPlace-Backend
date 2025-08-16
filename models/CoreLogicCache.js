const mongoose = require('mongoose');

// 💰 CoreLogic API Cache Model - High-cost API caching for property intelligence
const coreLogicCacheSchema = new mongoose.Schema({
  // Unique cache key for the request
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Request parameters for debugging/analytics
  requestParams: {
    searchType: String, // 'property_search', 'property_detail', 'enrichment', 'analytics'
    address: String,
    city: String,
    state: String,
    zipCode: String,
    propertyId: String,
    filters: mongoose.Schema.Types.Mixed
  },
  
  // Cached CoreLogic API response
  cachedData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // API response metadata
  apiResponse: {
    statusCode: Number,
    responseTime: Number, // in milliseconds
    dataQuality: {
      type: String,
      enum: ['excellent', 'good', 'partial', 'poor'],
      default: 'good'
    },
    recordCount: Number
  },
  
  // Caching metadata
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
  
  // Cost tracking
  estimatedApiCost: {
    type: Number,
    default: 0.15 // Average CoreLogic API cost
  },
  
  costSaved: {
    type: Number,
    default: 0 // Calculated based on access count
  },
  
  // Data source
  apiSource: {
    type: String,
    default: 'corelogic'
  },
  
  // TTL - Different expiry times based on data type
  expiresAt: {
    type: Date,
    default: function() {
      // Property searches: 24 hours
      // Property details: 7 days
      // Analytics: 12 hours
      const hours = this.requestParams?.searchType === 'property_detail' ? 168 : // 7 days
                   this.requestParams?.searchType === 'analytics' ? 12 : // 12 hours
                   24; // 24 hours default
      return new Date(Date.now() + hours * 60 * 60 * 1000);
    },
    index: true
  }
});

// 📊 Static method to generate cache key from CoreLogic request parameters
coreLogicCacheSchema.statics.generateCacheKey = function(searchType, params) {
  const crypto = require('crypto');
  
  // Normalize parameters for consistent hashing
  const normalizedParams = {
    searchType: searchType.toLowerCase(),
    address: params.address?.toLowerCase()?.trim(),
    city: params.city?.toLowerCase()?.trim(),
    state: params.state?.toUpperCase()?.trim(),
    zipCode: params.zipCode?.trim(),
    propertyId: params.propertyId?.trim(),
    // Sort and normalize filters
    filters: params.filters ? JSON.stringify(params.filters, Object.keys(params.filters).sort()) : null
  };
  
  // Remove null/undefined values
  Object.keys(normalizedParams).forEach(key => {
    if (normalizedParams[key] === null || normalizedParams[key] === undefined) {
      delete normalizedParams[key];
    }
  });
  
  // Create hash from normalized parameters
  const hashData = JSON.stringify(normalizedParams);
  return crypto.createHash('sha256').update(hashData).digest('hex');
};

// 🔍 Static method to find cached CoreLogic data
coreLogicCacheSchema.statics.findCachedData = async function(searchType, params) {
  const cacheKey = this.generateCacheKey(searchType, params);
  
  const cached = await this.findOne({ cacheKey });
  
  if (cached) {
    // Update access tracking
    cached.lastAccessed = new Date();
    cached.accessCount += 1;
    // Update cost saved based on access count
    cached.costSaved = cached.estimatedApiCost * (cached.accessCount - 1);
    await cached.save();
    
    console.log(`💰 CoreLogic Cache HIT for ${searchType}: ${cacheKey.substring(0, 12)}... (accessed ${cached.accessCount} times, saved $${cached.costSaved.toFixed(2)})`);
    return cached.cachedData;
  }
  
  console.log(`💸 CoreLogic Cache MISS for ${searchType}: ${cacheKey.substring(0, 12)}...`);
  return null;
};

// 💾 Static method to cache CoreLogic API response
coreLogicCacheSchema.statics.cacheApiResponse = async function(searchType, params, apiData, apiMetadata = {}) {
  const cacheKey = this.generateCacheKey(searchType, params);
  
  try {
    // Check if already exists (race condition protection)
    const existing = await this.findOne({ cacheKey });
    if (existing) {
      console.log(`📝 Updating existing CoreLogic cache entry for ${searchType}`);
      existing.cachedData = apiData;
      existing.apiResponse = { ...existing.apiResponse, ...apiMetadata };
      existing.lastAccessed = new Date();
      existing.accessCount += 1;
      existing.costSaved = existing.estimatedApiCost * (existing.accessCount - 1);
      
      // Reset expiry based on search type
      const hours = searchType === 'property_detail' ? 168 : // 7 days
                   searchType === 'analytics' ? 12 : // 12 hours
                   24; // 24 hours default
      existing.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      
      await existing.save();
      return existing;
    }
    
    // Create new cache entry
    const cacheEntry = new this({
      cacheKey,
      requestParams: {
        searchType,
        address: params.address,
        city: params.city,
        state: params.state,
        zipCode: params.zipCode,
        propertyId: params.propertyId,
        filters: params.filters
      },
      cachedData: apiData,
      apiResponse: {
        statusCode: apiMetadata.statusCode || 200,
        responseTime: apiMetadata.responseTime || 0,
        dataQuality: apiMetadata.dataQuality || 'good',
        recordCount: apiMetadata.recordCount || (Array.isArray(apiData) ? apiData.length : 1)
      },
      estimatedApiCost: apiMetadata.estimatedCost || 0.15
    });
    
    await cacheEntry.save();
    console.log(`💾 Cached CoreLogic ${searchType} response: ${cacheKey.substring(0, 12)}... (estimated cost: $${cacheEntry.estimatedApiCost.toFixed(2)})`);
    
    return cacheEntry;
  } catch (error) {
    console.error('❌ Error caching CoreLogic API response:', error.message);
    return null;
  }
};

// 📈 Static method to get CoreLogic cache statistics
coreLogicCacheSchema.statics.getCacheStats = async function() {
  const [totalCached, totalAccess, totalSavings, bySearchType] = await Promise.all([
    this.countDocuments({}),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$accessCount' } } }]),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$costSaved' } } }]),
    this.aggregate([
      { $group: { 
        _id: '$requestParams.searchType', 
        count: { $sum: 1 },
        totalHits: { $sum: '$accessCount' },
        totalSaved: { $sum: '$costSaved' }
      } },
      { $sort: { count: -1 } }
    ])
  ]);
  
  // Calculate hit rates by search type
  const searchTypeStats = {};
  for (const stat of bySearchType) {
    searchTypeStats[stat._id || 'unknown'] = {
      cachedQueries: stat.count,
      totalHits: stat.totalHits,
      costSaved: stat.totalSaved,
      avgHitsPerQuery: stat.count > 0 ? stat.totalHits / stat.count : 0
    };
  }
  
  return {
    totalCachedQueries: totalCached,
    totalCacheHits: totalAccess[0]?.total || 0,
    totalCostSaved: totalSavings[0]?.total || 0,
    avgCacheHits: totalCached > 0 ? (totalAccess[0]?.total || 0) / totalCached : 0,
    bySearchType: searchTypeStats
  };
};

// 🧹 Static method to clean up old CoreLogic cache entries
coreLogicCacheSchema.statics.cleanupCache = async function() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  // Remove entries that haven't been accessed in a week and have low access count
  // Also remove entries where cost saved is very low (not worth keeping)
  const result = await this.deleteMany({
    $or: [
      {
        lastAccessed: { $lt: oneWeekAgo },
        accessCount: { $lt: 2 }
      },
      {
        costSaved: { $lt: 0.05 }, // Less than 5 cents saved
        createdAt: { $lt: oneWeekAgo }
      }
    ]
  });
  
  console.log(`🧹 Cleaned up ${result.deletedCount} old CoreLogic cache entries`);
  return result.deletedCount;
};

// 🎯 Get most expensive cached queries (highest cost saved)
coreLogicCacheSchema.statics.getMostValuableCache = async function(limit = 10) {
  return await this.find({})
    .sort({ costSaved: -1 })
    .limit(limit)
    .select('requestParams.searchType costSaved accessCount estimatedApiCost createdAt')
    .lean();
};

// 📊 Get cache performance by time period
coreLogicCacheSchema.statics.getCachePerformance = async function(days = 7) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const [hitStats, newCacheEntries] = await Promise.all([
    this.aggregate([
      { $match: { lastAccessed: { $gte: startDate } } },
      { $group: { 
        _id: null, 
        totalHits: { $sum: '$accessCount' },
        totalSavings: { $sum: '$costSaved' },
        avgResponseTime: { $avg: '$apiResponse.responseTime' }
      } }
    ]),
    this.countDocuments({ createdAt: { $gte: startDate } })
  ]);
  
  return {
    periodDays: days,
    totalHits: hitStats[0]?.totalHits || 0,
    totalSavings: hitStats[0]?.totalSavings || 0,
    avgResponseTime: hitStats[0]?.avgResponseTime || 0,
    newCacheEntries,
    dailyAverage: {
      hits: (hitStats[0]?.totalHits || 0) / days,
      savings: (hitStats[0]?.totalSavings || 0) / days,
      newEntries: newCacheEntries / days
    }
  };
};

// 🔍 Add text index for searching cached queries
coreLogicCacheSchema.index({ 'requestParams.address': 'text', 'requestParams.city': 'text' });

// 📊 Compound indexes for efficient querying
coreLogicCacheSchema.index({ 'requestParams.searchType': 1, 'requestParams.city': 1, 'requestParams.state': 1 });
coreLogicCacheSchema.index({ costSaved: -1, accessCount: -1 });
coreLogicCacheSchema.index({ createdAt: -1, 'requestParams.searchType': 1 });

module.exports = mongoose.model('CoreLogicCache', coreLogicCacheSchema);
