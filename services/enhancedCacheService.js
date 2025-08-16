/**
 * 🚀 Enhanced Cache Service
 * 
 * Advanced caching system with intelligent key generation, TTL management,
 * cache warming, and performance optimization for property data.
 * 
 * Key Features:
 * - Smart cache key generation with normalization
 * - Dynamic TTL based on data type and freshness requirements
 * - Cache warming and preheating strategies
 * - Cache hit/miss analytics and reporting
 * - Multi-tier caching (Redis + MongoDB)
 * - Cache invalidation strategies
 */

const crypto = require('crypto');
const { getAsync, setAsync, deleteAsync } = require('../utils/redisClient');
const SearchCache = require('../models/SearchCache');
const { performance } = require('perf_hooks');

class EnhancedCacheService {
  constructor() {
    this.stats = {
      redisHits: 0,
      redisMisses: 0,
      mongoHits: 0,
      mongoMisses: 0,
      cacheWrites: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      costSavings: 0
    };
    
    // Cache TTL configurations (in seconds) - Standardized for performance and cost optimization
    this.ttlConfig = {
      // Search results - aligned with business requirements
      discovery: 24 * 60 * 60,        // 24 hours - property searches change daily
      address: 30 * 24 * 60 * 60,     // 30 days - address data is stable
      
      // API responses - optimized for cost vs freshness
      zillow_search: 24 * 60 * 60,    // 24 hours - increased from 6h for better caching
      zillow_images: 7 * 24 * 60 * 60, // 7 days - images rarely change
      corelogic: 24 * 60 * 60,        // 24 hours - property intelligence changes daily
      
      // Property details - standardized to 24-hour cycles
      property_basic: 24 * 60 * 60,   // 24 hours - increased from 12h for consistency
      property_detailed: 24 * 60 * 60, // 24 hours - detailed property analysis
      property_intelligence: 7 * 24 * 60 * 60, // 7 days - comprehensive intelligence
      
      // User-specific data - balanced performance vs relevance
      user_search_history: 2 * 60 * 60, // 2 hours - increased from 30min for better caching
      user_preferences: 24 * 60 * 60, // 24 hours - user preferences
      
      // System data - optimized for performance
      api_tokens: 50 * 60,            // 50 minutes - API tokens (refresh before expiry)
      rate_limits: 2 * 60 * 60        // 2 hours - increased from 1h for better performance
    };
    
    // Cost savings per cache type (estimated API cost avoided)
    this.costSavings = {
      zillow_search: 0.02,
      zillow_images: 0.01,
      corelogic: 0.50,
      property_intelligence: 2.00,
      address_verification: 0.05
    };
  }

  /**
   * 🔑 Generate smart, normalized cache keys
   */
  generateCacheKey(type, parameters, options = {}) {
    const { prefix = '', includeTimestamp = false, userSpecific = false } = options;
    
    // Normalize parameters for consistent caching
    const normalizedParams = this.normalizeParameters(parameters);
    
    // Sort parameters for consistent key generation
    const sortedParams = Object.keys(normalizedParams)
      .sort()
      .reduce((result, key) => {
        result[key] = normalizedParams[key];
        return result;
      }, {});
    
    // Create hash for complex parameters to keep keys readable
    const paramString = JSON.stringify(sortedParams);
    const paramHash = crypto.createHash('md5').update(paramString).digest('hex').substring(0, 8);
    
    // Build key components - ensure consistent format
    const keyParts = [];
    if (prefix) keyParts.push(prefix);
    keyParts.push(type);
    keyParts.push(paramHash);
    
    if (userSpecific && options.userId) {
      keyParts.push(`user:${options.userId}`);
    }
    
    if (includeTimestamp) {
      const timestamp = Math.floor(Date.now() / (1000 * 60 * 60)); // Hour-based timestamp
      keyParts.push(`t:${timestamp}`);
    }
    
    const cacheKey = keyParts.join(':');
    
    console.log(`🔑 Generated cache key: ${cacheKey}`);
    console.log(`📋 Parameters hash: ${paramHash}`);
    console.log(`📋 Normalized params: ${JSON.stringify(sortedParams)}`);
    
    return {
      key: cacheKey,
      normalizedParams: sortedParams,
      hash: paramHash
    };
  }

  /**
   * 🧹 Normalize parameters for consistent caching
   */
  normalizeParameters(params) {
    const normalized = {};
    
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return; // Skip empty values
      }
      
      // Normalize strings
      if (typeof value === 'string') {
        normalized[key] = value.trim().toLowerCase();
      }
      // Normalize numbers
      else if (typeof value === 'number') {
        normalized[key] = value;
      }
      // Normalize arrays
      else if (Array.isArray(value)) {
        normalized[key] = value.sort();
      }
      // Normalize objects
      else if (typeof value === 'object') {
        normalized[key] = this.normalizeParameters(value);
      } else {
        normalized[key] = value;
      }
    });
    
    return normalized;
  }

  /**
   * 📊 Multi-tier cache retrieval (Redis → MongoDB)
   */
  async get(type, parameters, options = {}) {
    const startTime = performance.now();
    this.stats.totalRequests++;
    
    const { key, normalizedParams } = this.generateCacheKey(type, parameters, options);
    
    try {
      // Tier 1: Try Redis (fastest)
      console.log(`🔍 Tier 1: Checking Redis cache for key: ${key}`);
      const redisResult = await getAsync(key);
      
      if (redisResult) {
        this.stats.redisHits++;
        const responseTime = performance.now() - startTime;
        this.updateStats(responseTime, this.costSavings[type] || 0.01);
        
        console.log(`⚡ Redis HIT: ${key} (${responseTime.toFixed(2)}ms)`);
        console.log(`📊 Cache Performance - Redis Hit Rate: ${((this.stats.redisHits / this.stats.totalRequests) * 100).toFixed(1)}%`);
        
        try {
          const parsedData = JSON.parse(redisResult);
          console.log(`🎯 Cache Content Size: ${JSON.stringify(parsedData).length} bytes`);
          
          return {
            data: parsedData,
            source: 'redis',
            cached: true,
            responseTime,
            stats: {
              hitRate: ((this.stats.redisHits / this.stats.totalRequests) * 100).toFixed(1),
              totalRequests: this.stats.totalRequests
            }
          };
        } catch (parseError) {
          console.warn(`⚠️ Redis data corrupted for key ${key}, falling back to MongoDB`);
          console.warn(`🔍 Corruption details: ${parseError.message}`);
          await deleteAsync(key); // Clean up corrupted data
        }
      }
      
      this.stats.redisMisses++;
      
      // Tier 2: Try MongoDB (persistent)
      console.log(`🔍 Tier 2: Checking MongoDB cache for type: ${type}`);
      const mongoResult = await SearchCache.findCachedResults(key, normalizedParams);
      
      if (mongoResult) {
        this.stats.mongoHits++;
        const responseTime = performance.now() - startTime;
        this.updateStats(responseTime, this.costSavings[type] || 0.01);
        
        console.log(`💾 MongoDB HIT: ${key} (${responseTime.toFixed(2)}ms)`);
        console.log(`📊 Cache Performance - MongoDB Hit Rate: ${((this.stats.mongoHits / this.stats.totalRequests) * 100).toFixed(1)}%`);
        console.log(`🔄 Warming Redis cache from MongoDB data`);
        
        // Warm Redis cache with MongoDB data
        const redisData = JSON.stringify(mongoResult);
        const redisTTL = Math.min(this.ttlConfig[type] || 3600, 6 * 60 * 60); // Max 6 hours for Redis
        const redisSetResult = await setAsync(key, redisData, redisTTL);
        
        if (redisSetResult) {
          console.log(`✅ Successfully warmed Redis cache for key: ${key}`);
        } else {
          console.warn(`⚠️ Failed to warm Redis cache for key: ${key}`);
        }
        
        console.log(`🎯 MongoDB Content Size: ${JSON.stringify(mongoResult).length} bytes`);
        
        return {
          data: mongoResult,
          source: 'mongodb',
          cached: true,
          responseTime,
          stats: {
            overallHitRate: (((this.stats.redisHits + this.stats.mongoHits) / this.stats.totalRequests) * 100).toFixed(1),
            mongoHitRate: ((this.stats.mongoHits / this.stats.totalRequests) * 100).toFixed(1),
            totalRequests: this.stats.totalRequests,
            redisWarmed: redisSetResult
          }
        };
      }
      
      this.stats.mongoMisses++;
      const responseTime = performance.now() - startTime;
      
      const totalHits = this.stats.redisHits + this.stats.mongoHits;
      const totalMisses = this.stats.redisMisses + this.stats.mongoMisses;
      const overallHitRate = this.stats.totalRequests > 0 ? 
        ((totalHits / this.stats.totalRequests) * 100).toFixed(1) : 0;
      
      console.log(`❌ Cache MISS: ${key} (${responseTime.toFixed(2)}ms)`);
      console.log(`📊 Cache Performance - Overall Hit Rate: ${overallHitRate}%`);
      console.log(`🔍 Cache Miss Analytics:`);
      console.log(`   - Redis Misses: ${this.stats.redisMisses}`);
      console.log(`   - MongoDB Misses: ${this.stats.mongoMisses}`);
      console.log(`   - Total Misses: ${totalMisses}`);
      console.log(`   - Cost Impact: $${(this.costSavings[type] || 0.01).toFixed(3)} (API call required)`);
      
      if (overallHitRate < 50) {
        console.warn(`⚠️ Low cache hit rate (${overallHitRate}%) - Consider optimizing cache strategy`);
      }
      
      return {
        data: null,
        source: 'none',
        cached: false,
        responseTime,
        stats: {
          overallHitRate,
          totalMisses,
          redisMisses: this.stats.redisMisses,
          mongoMisses: this.stats.mongoMisses,
          totalRequests: this.stats.totalRequests,
          estimatedApiCost: this.costSavings[type] || 0.01
        }
      };
      
    } catch (error) {
      console.error(`❌ Cache retrieval error for ${key}:`, error.message);
      return {
        data: null,
        source: 'error',
        cached: false,
        error: error.message
      };
    }
  }

  /**
   * 💾 Multi-tier cache storage with intelligent TTL
   */
  async set(type, parameters, data, options = {}) {
    const startTime = performance.now();
    
    const { key, normalizedParams } = this.generateCacheKey(type, parameters, options);
    const { 
      customTTL,
      priority = 'normal',
      estimatedCost = 0.01,
      metadata = {}
    } = options;
    
    try {
      // Calculate TTL based on type and priority
      const baseTTL = customTTL || this.ttlConfig[type] || 3600;
      const redisTTL = Math.min(baseTTL, 6 * 60 * 60); // Redis max 6 hours
      const mongoTTL = baseTTL; // MongoDB for longer-term storage
      
      // Enhanced metadata
      const enhancedMetadata = {
        ...metadata,
        cacheType: type,
        priority,
        estimatedCost,
        dataSize: JSON.stringify(data).length,
        timestamp: new Date().toISOString(),
        ttl: mongoTTL
      };
      
      // Store in Redis for fast access
      const redisData = JSON.stringify(data);
      await setAsync(key, redisData, redisTTL);
      console.log(`⚡ Stored in Redis: ${key} (TTL: ${redisTTL}s)`);
      
      // Store in MongoDB for persistence
      if (type === 'discovery' || type === 'address' || priority === 'high') {
        await SearchCache.cacheResults(
          key,
          normalizedParams,
          data,
          estimatedCost,
          type,
          mongoTTL,
          enhancedMetadata
        );
        console.log(`💾 Stored in MongoDB: ${key} (TTL: ${mongoTTL}s)`);
      }
      
      this.stats.cacheWrites++;
      const responseTime = performance.now() - startTime;
      
      console.log(`✅ Cache SET complete: ${key} (${responseTime.toFixed(2)}ms)`);
      
      return {
        key,
        stored: true,
        redisTTL,
        mongoTTL,
        responseTime
      };
      
    } catch (error) {
      console.error(`❌ Cache storage error for ${key}:`, error.message);
      return {
        key,
        stored: false,
        error: error.message
      };
    }
  }

  /**
   * 🔥 Cache warming strategies
   */
  async warmCache(type, parametersList, options = {}) {
    console.log(`🔥 Starting cache warming for type: ${type}`);
    console.log(`📋 Warming ${parametersList.length} cache entries`);
    
    const { batchSize = 5, fetchFunction } = options;
    const results = [];
    
    // Process in batches to avoid overwhelming APIs
    for (let i = 0; i < parametersList.length; i += batchSize) {
      const batch = parametersList.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (params) => {
        try {
          // Check if already cached
          const cached = await this.get(type, params);
          if (cached.cached) {
            return { params, status: 'already_cached', cached: true };
          }
          
          // Fetch and cache if not present
          if (fetchFunction) {
            const freshData = await fetchFunction(params);
            await this.set(type, params, freshData, {
              priority: 'normal',
              metadata: { warmed: true }
            });
            return { params, status: 'warmed', cached: false };
          }
          
          return { params, status: 'no_fetch_function', cached: false };
          
        } catch (error) {
          console.warn(`⚠️ Cache warming failed for params:`, params, error.message);
          return { params, status: 'error', error: error.message, cached: false };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || r.reason));
      
      // Small delay between batches
      if (i + batchSize < parametersList.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const successful = results.filter(r => r.status === 'warmed').length;
    const alreadyCached = results.filter(r => r.status === 'already_cached').length;
    const errors = results.filter(r => r.status === 'error').length;
    
    console.log(`🔥 Cache warming complete:`);
    console.log(`   ✅ Newly warmed: ${successful}`);
    console.log(`   💾 Already cached: ${alreadyCached}`);
    console.log(`   ❌ Errors: ${errors}`);
    
    return {
      total: parametersList.length,
      successful,
      alreadyCached,
      errors,
      results
    };
  }

  /**
   * 🗑️ Intelligent cache invalidation
   */
  async invalidate(pattern, options = {}) {
    const { includeRedis = true, includeMongoDB = true } = options;
    const results = { redis: 0, mongodb: 0, errors: [] };
    
    console.log(`🗑️ Invalidating cache entries matching pattern: ${pattern}`);
    
    try {
      if (includeRedis) {
        // Redis pattern-based deletion would need Redis SCAN command
        // For now, we'll track keys for specific invalidation
        console.log(`🗑️ Redis pattern invalidation not implemented yet`);
      }
      
      if (includeMongoDB) {
        // MongoDB invalidation by pattern or criteria
        const deleted = await SearchCache.deleteMany({
          cacheKey: { $regex: pattern, $options: 'i' }
        });
        results.mongodb = deleted.deletedCount;
        console.log(`🗑️ Invalidated ${deleted.deletedCount} MongoDB entries`);
      }
      
    } catch (error) {
      console.error(`❌ Cache invalidation error:`, error.message);
      results.errors.push(error.message);
    }
    
    return results;
  }

  /**
   * 📊 Update performance statistics
   */
  updateStats(responseTime, costSaved) {
    // Update running average of response times
    this.stats.avgResponseTime = (
      (this.stats.avgResponseTime * (this.stats.totalRequests - 1) + responseTime) / 
      this.stats.totalRequests
    );
    
    // Track cost savings
    this.stats.costSavings += costSaved;
  }

  /**
   * 📊 Get comprehensive cache statistics
   */
  getStats() {
    const totalHits = this.stats.redisHits + this.stats.mongoHits;
    const totalRequests = this.stats.totalRequests;
    const hitRate = totalRequests > 0 ? (totalHits / totalRequests * 100) : 0;
    
    return {
      performance: {
        totalRequests: this.stats.totalRequests,
        hitRate: parseFloat(hitRate.toFixed(2)),
        avgResponseTime: parseFloat(this.stats.avgResponseTime.toFixed(2)),
        costSavings: parseFloat(this.stats.costSavings.toFixed(2))
      },
      redis: {
        hits: this.stats.redisHits,
        misses: this.stats.redisMisses,
        hitRate: this.stats.redisHits > 0 ? 
          ((this.stats.redisHits / (this.stats.redisHits + this.stats.redisMisses)) * 100).toFixed(2) : 0
      },
      mongodb: {
        hits: this.stats.mongoHits,
        misses: this.stats.mongoMisses,
        hitRate: this.stats.mongoHits > 0 ? 
          ((this.stats.mongoHits / (this.stats.mongoHits + this.stats.mongoMisses)) * 100).toFixed(2) : 0
      },
      storage: {
        cacheWrites: this.stats.cacheWrites
      }
    };
  }

  /**
   * 📊 Log performance report
   */
  logPerformanceReport() {
    const stats = this.getStats();
    
    console.log(`\n📊 ENHANCED CACHE PERFORMANCE REPORT`);
    console.log(`==========================================`);
    console.log(`Total Requests: ${stats.performance.totalRequests}`);
    console.log(`Overall Hit Rate: ${stats.performance.hitRate}%`);
    console.log(`Average Response Time: ${stats.performance.avgResponseTime}ms`);
    console.log(`Estimated Cost Savings: $${stats.performance.costSavings}`);
    console.log(`\nRedis Performance:`);
    console.log(`  Hits: ${stats.redis.hits} (${stats.redis.hitRate}%)`);
    console.log(`  Misses: ${stats.redis.misses}`);
    console.log(`\nMongoDB Performance:`);
    console.log(`  Hits: ${stats.mongodb.hits} (${stats.mongodb.hitRate}%)`);
    console.log(`  Misses: ${stats.mongodb.misses}`);
    console.log(`\nStorage:`);
    console.log(`  Cache Writes: ${stats.storage.cacheWrites}`);
    console.log(`==========================================`);
  }
}

// Export singleton instance
module.exports = new EnhancedCacheService();
