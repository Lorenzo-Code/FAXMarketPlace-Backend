const mongoose = require('mongoose');

// 💰 Search Results Cache Model - Aggressive caching to minimize CoreLogic API costs
const searchCacheSchema = new mongoose.Schema({
  // Search query and filter hash for unique identification
  queryHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Original search parameters for debugging/analytics
  originalQuery: {
    type: String,
    required: true
  },
  
  searchFilters: {
    city: String,
    state: String,
    maxPrice: Number,
    minBeds: Number,
    maxBeds: Number,
    exactBeds: Number,
    propertyType: String,
    limit: Number
  },
  
  // Cached search results
  results: {
    listings: [{
      id: String,
      price: Number,
      beds: Number,
      baths: Number,
      sqft: Number,
      address: {
        oneLine: String,
        street: String,
        city: String,
        state: String,
        zip: String
      },
      location: {
        latitude: Number,
        longitude: Number
      },
      imgSrc: String,
      zillowImage: String,
      zpid: String,
      dataSource: {
        type: String,
        enum: ['corelogic', 'zillow', 'combined']
      },
      dataQuality: {
        type: String,
        enum: ['excellent', 'good', 'partial', 'poor']
      },
      propertyType: String,
      yearBuilt: Number,
      // Full CoreLogic data for enrichment
      coreLogicData: mongoose.Schema.Types.Mixed
    }],
    
    ai_summary: String,
    
    metadata: {
      searchQuery: String,
      searchType: String,
      totalFound: Number,
      totalProcessed: Number,
      dataQuality: {
        stats: mongoose.Schema.Types.Mixed,
        breakdown: mongoose.Schema.Types.Mixed
      },
      timestamp: Date
    }
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
  
  // Cost savings tracking
  apiCostSaved: {
    type: Number,
    default: 0 // Track how much we saved by using cache
  },
  
  originalApiCost: {
    type: Number,
    default: 0 // Estimated cost if we hit APIs fresh
  },
  
  // Cache type determines TTL
  cacheType: {
    type: String,
    enum: ['discovery', 'address', 'details', 'marketplace_discovery'],
    default: 'discovery'
  },
  
  // TTL - Variable expiry based on cache type
  // Discovery: 24 hours, Address/Details: 30 days
  expiresAt: {
    type: Date,
    default: function() {
      const now = Date.now();
      switch(this.cacheType) {
        case 'discovery': return new Date(now + 24 * 60 * 60 * 1000); // 24 hours
        case 'marketplace_discovery': return new Date(now + 2 * 60 * 60 * 1000); // 2 hours
        case 'address': return new Date(now + 30 * 24 * 60 * 60 * 1000); // 30 days
        case 'details': return new Date(now + 30 * 24 * 60 * 60 * 1000); // 30 days
        default: return new Date(now + 24 * 60 * 60 * 1000); // Default 24 hours
      }
    },
    index: true
  }
});

// 📊 Static method to generate cache key from search parameters
searchCacheSchema.statics.generateQueryHash = function(query, filters = {}) {
  const crypto = require('crypto');
  
  // Normalize the search parameters for consistent hashing
  const normalizedParams = {
    query: query.toLowerCase().trim(),
    city: filters.city?.toLowerCase()?.trim(),
    state: filters.state?.toUpperCase()?.trim(),
    maxPrice: filters.maxPrice || null,
    minBeds: filters.minBeds || null,
    maxBeds: filters.maxBeds || null,
    exactBeds: filters.exactBeds || null,
    propertyType: filters.propertyType?.toLowerCase()?.trim(),
    limit: filters.limit || 10
  };
  
  // Create hash from normalized parameters
  const hashData = JSON.stringify(normalizedParams);
  return crypto.createHash('sha256').update(hashData).digest('hex');
};

// 🔍 Static method to find cached results
searchCacheSchema.statics.findCachedResults = async function(query, filters = {}) {
  const queryHash = this.generateQueryHash(query, filters);
  
  const cached = await this.findOne({ queryHash });
  
  if (cached) {
    // Update access tracking
    cached.lastAccessed = new Date();
    cached.accessCount += 1;
    await cached.save();
    
    console.log(`💰 Cache HIT for query: "${query}" (accessed ${cached.accessCount} times)`);
    return cached.results;
  }
  
  console.log(`💸 Cache MISS for query: "${query}"`);
  return null;
};

// 💾 Static method to cache search results with proper TTL
searchCacheSchema.statics.cacheResults = async function(query, filters = {}, results, apiCostEstimate = 0, cacheType = 'discovery') {
  const queryHash = this.generateQueryHash(query, filters);
  
  try {
    // Check if already exists (race condition protection)
    const existing = await this.findOne({ queryHash });
    if (existing) {
      console.log(`📝 Updating existing cache entry for query: "${query}"`);
      existing.results = results;
      existing.lastAccessed = new Date();
      existing.accessCount += 1;
      existing.cacheType = cacheType;
      
      // Reset expiry based on cache type
      const now = Date.now();
      switch(cacheType) {
        case 'discovery': existing.expiresAt = new Date(now + 24 * 60 * 60 * 1000); break; // 24 hours
        case 'marketplace_discovery': existing.expiresAt = new Date(now + 2 * 60 * 60 * 1000); break; // 2 hours
        case 'address': existing.expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000); break; // 30 days
        case 'details': existing.expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000); break; // 30 days
        default: existing.expiresAt = new Date(now + 24 * 60 * 60 * 1000); // Default 24 hours
      }
      
      await existing.save();
      return existing;
    }
    
    // Create new cache entry
    const cacheEntry = new this({
      queryHash,
      originalQuery: query,
      searchFilters: filters,
      results,
      originalApiCost: apiCostEstimate,
      cacheType
    });
    
    await cacheEntry.save();
    console.log(`💾 Cached ${cacheType} results for query: "${query}" (TTL: ${cacheType === 'discovery' ? '24h' : '30d'}, cost saved: $${apiCostEstimate.toFixed(2)})`);
    
    return cacheEntry;
  } catch (error) {
    console.error('❌ Error caching search results:', error);
    return null;
  }
};

// 📈 Static method to get cache statistics
searchCacheSchema.statics.getCacheStats = async function() {
  const [totalCached, totalAccess, totalSavings] = await Promise.all([
    this.countDocuments({}),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$accessCount' } } }]),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$apiCostSaved' } } }])
  ]);
  
  return {
    totalCachedQueries: totalCached,
    totalCacheHits: totalAccess[0]?.total || 0,
    totalCostSaved: totalSavings[0]?.total || 0,
    avgCacheHits: totalCached > 0 ? (totalAccess[0]?.total || 0) / totalCached : 0
  };
};

// 🧹 Static method to clean up old/unused cache entries
searchCacheSchema.statics.cleanupCache = async function() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  // Remove entries that haven't been accessed in a week and have low access count
  const result = await this.deleteMany({
    lastAccessed: { $lt: oneWeekAgo },
    accessCount: { $lt: 2 }
  });
  
  console.log(`🧹 Cleaned up ${result.deletedCount} old cache entries`);
  return result.deletedCount;
};

// 🔍 Add text index for search queries
searchCacheSchema.index({ originalQuery: 'text' });

// 📊 Compound indexes for efficient querying
searchCacheSchema.index({ 'searchFilters.city': 1, 'searchFilters.maxPrice': 1 });
searchCacheSchema.index({ createdAt: -1, accessCount: -1 });

module.exports = mongoose.model('SearchCache', searchCacheSchema);
