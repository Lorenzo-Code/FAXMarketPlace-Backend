const mongoose = require('mongoose');

// 🖼️ Zillow Image Cache Model - Cache property photos to reduce API costs
const zillowImageCacheSchema = new mongoose.Schema({
  // Unique cache key for the image request
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Request parameters for debugging/analytics
  requestParams: {
    address: String,
    zipCode: String,
    zpid: String,
    searchType: {
      type: String,
      enum: ['address_search', 'zpid_lookup', 'property_photos'],
      default: 'address_search'
    }
  },
  
  // Cached Zillow image data
  cachedData: {
    images: [{
      imgSrc: String,
      zpid: String,
      propertyUrl: String,
      imageType: {
        type: String,
        enum: ['primary', 'gallery', 'street_view'],
        default: 'primary'
      }
    }],
    propertyInfo: {
      zpid: String,
      address: String,
      price: Number,
      beds: Number,
      baths: Number,
      sqft: Number
    }
  },
  
  // API response metadata
  apiResponse: {
    statusCode: Number,
    responseTime: Number,
    imageCount: Number,
    dataQuality: {
      type: String,
      enum: ['excellent', 'good', 'partial', 'poor'],
      default: 'good'
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
  
  // Cost tracking
  estimatedApiCost: {
    type: Number,
    default: 0.05 // Average Zillow RapidAPI cost
  },
  
  costSaved: {
    type: Number,
    default: 0
  },
  
  // Data source
  apiSource: {
    type: String,
    default: 'zillow_rapidapi'
  },
  
  // TTL - Images rarely change, so longer cache
  expiresAt: {
    type: Date,
    default: function() {
      // Images cache for 30 days
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    },
    index: true
  }
});

// 📊 Static method to generate cache key from Zillow image request
zillowImageCacheSchema.statics.generateCacheKey = function(params) {
  const crypto = require('crypto');
  
  // Normalize parameters for consistent hashing
  const normalizedParams = {
    address: params.address?.toLowerCase()?.trim()?.replace(/[^\w\s]/gi, ''),
    zipCode: params.zipCode?.trim(),
    zpid: params.zpid?.trim(),
    searchType: params.searchType || 'address_search'
  };
  
  // Remove null/undefined values
  Object.keys(normalizedParams).forEach(key => {
    if (normalizedParams[key] === null || normalizedParams[key] === undefined) {
      delete normalizedParams[key];
    }
  });
  
  // Create hash from normalized parameters
  const hashData = JSON.stringify(normalizedParams, Object.keys(normalizedParams).sort());
  return crypto.createHash('sha256').update(hashData).digest('hex');
};

// 🔍 Static method to find cached Zillow images
zillowImageCacheSchema.statics.findCachedImages = async function(params, options = {}) {
  const cacheKey = this.generateCacheKey(params);
  
  // Apply timeout if specified
  const query = this.findOne({ cacheKey });
  if (options.maxTimeMS) {
    query.maxTimeMS(options.maxTimeMS);
  }
  
  const cached = await query;
  
  if (cached) {
    // Update access tracking
    cached.lastAccessed = new Date();
    cached.accessCount += 1;
    cached.costSaved = cached.estimatedApiCost * (cached.accessCount - 1);
    await cached.save();
    
    console.log(`💰 Zillow Image Cache HIT: ${params.address || params.zpid} (accessed ${cached.accessCount} times, saved $${cached.costSaved.toFixed(2)})`);
    return cached.cachedData;
  }
  
  console.log(`💸 Zillow Image Cache MISS: ${params.address || params.zpid}`);
  return null;
};

// 💾 Static method to cache Zillow image response
zillowImageCacheSchema.statics.cacheImageResponse = async function(params, imageData, apiMetadata = {}) {
  const cacheKey = this.generateCacheKey(params);
  
  try {
    // Check if already exists
    const existing = await this.findOne({ cacheKey });
    if (existing) {
      console.log(`📝 Updating existing Zillow image cache entry`);
      existing.cachedData = imageData;
      existing.apiResponse = { ...existing.apiResponse, ...apiMetadata };
      existing.lastAccessed = new Date();
      existing.accessCount += 1;
      existing.costSaved = existing.estimatedApiCost * (existing.accessCount - 1);
      existing.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Reset 30-day expiry
      await existing.save();
      return existing;
    }
    
    // Create new cache entry
    const cacheEntry = new this({
      cacheKey,
      requestParams: {
        address: params.address,
        zipCode: params.zipCode,
        zpid: params.zpid,
        searchType: params.searchType || 'address_search'
      },
      cachedData: imageData,
      apiResponse: {
        statusCode: apiMetadata.statusCode || 200,
        responseTime: apiMetadata.responseTime || 0,
        imageCount: imageData.images?.length || 0,
        dataQuality: apiMetadata.dataQuality || 'good'
      },
      estimatedApiCost: apiMetadata.estimatedCost || 0.05
    });
    
    await cacheEntry.save();
    console.log(`💾 Cached Zillow images for ${params.address || params.zpid}: ${imageData.images?.length || 0} images (cost: $${cacheEntry.estimatedApiCost.toFixed(2)})`);
    
    return cacheEntry;
  } catch (error) {
    console.error('❌ Error caching Zillow image response:', error.message);
    return null;
  }
};

// 📈 Static method to get Zillow image cache statistics
zillowImageCacheSchema.statics.getCacheStats = async function() {
  const [totalCached, totalAccess, totalSavings, imageStats] = await Promise.all([
    this.countDocuments({}),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$accessCount' } } }]),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$costSaved' } } }]),
    this.aggregate([
      { $group: { 
        _id: null, 
        totalImages: { $sum: '$apiResponse.imageCount' },
        avgImagesPerProperty: { $avg: '$apiResponse.imageCount' },
        avgResponseTime: { $avg: '$apiResponse.responseTime' }
      } }
    ])
  ]);
  
  return {
    totalCachedQueries: totalCached,
    totalCacheHits: totalAccess[0]?.total || 0,
    totalCostSaved: totalSavings[0]?.total || 0,
    avgCacheHits: totalCached > 0 ? (totalAccess[0]?.total || 0) / totalCached : 0,
    totalImagesCached: imageStats[0]?.totalImages || 0,
    avgImagesPerProperty: imageStats[0]?.avgImagesPerProperty || 0,
    avgResponseTime: imageStats[0]?.avgResponseTime || 0
  };
};

// 🧹 Clean up old image cache entries
zillowImageCacheSchema.statics.cleanupCache = async function() {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  
  // Remove entries that haven't been accessed in 2 weeks and have very low access count
  const result = await this.deleteMany({
    lastAccessed: { $lt: twoWeeksAgo },
    accessCount: { $lt: 2 },
    costSaved: { $lt: 0.10 } // Less than 10 cents saved
  });
  
  console.log(`🧹 Cleaned up ${result.deletedCount} old Zillow image cache entries`);
  return result.deletedCount;
};

// 🎯 Get properties with most image requests (popular properties)
zillowImageCacheSchema.statics.getPopularProperties = async function(limit = 10) {
  return await this.find({})
    .sort({ accessCount: -1 })
    .limit(limit)
    .select('requestParams.address requestParams.zpid accessCount costSaved apiResponse.imageCount')
    .lean();
};

// 📊 Get cache performance metrics
zillowImageCacheSchema.statics.getCachePerformance = async function(days = 7) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const performanceStats = await this.aggregate([
    { $match: { lastAccessed: { $gte: startDate } } },
    { $group: { 
      _id: null, 
      totalHits: { $sum: '$accessCount' },
      totalSavings: { $sum: '$costSaved' },
      avgResponseTime: { $avg: '$apiResponse.responseTime' },
      totalImages: { $sum: '$apiResponse.imageCount' }
    } }
  ]);
  
  const newEntries = await this.countDocuments({ createdAt: { $gte: startDate } });
  
  const stats = performanceStats[0] || {};
  
  return {
    periodDays: days,
    totalHits: stats.totalHits || 0,
    totalSavings: stats.totalSavings || 0,
    avgResponseTime: stats.avgResponseTime || 0,
    totalImages: stats.totalImages || 0,
    newCacheEntries: newEntries,
    dailyAverage: {
      hits: (stats.totalHits || 0) / days,
      savings: (stats.totalSavings || 0) / days,
      newEntries: newEntries / days
    }
  };
};

// 🔍 Text search index
zillowImageCacheSchema.index({ 'requestParams.address': 'text' });

// 📊 Compound indexes for efficient querying
zillowImageCacheSchema.index({ 'requestParams.zpid': 1, accessCount: -1 });
zillowImageCacheSchema.index({ costSaved: -1, accessCount: -1 });
zillowImageCacheSchema.index({ createdAt: -1, 'apiResponse.imageCount': -1 });

module.exports = mongoose.model('ZillowImageCache', zillowImageCacheSchema);
