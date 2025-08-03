const { getAsync, setAsync, deletePatternAsync } = require('./redisClient');
const { getPropertyInfoFromCoreLogic } = require('./coreLogicClientV2');
const { CoreLogicSuperClient } = require('./coreLogicSuperClient');

/**
 * 🏆 CoreLogic Cache Wrapper - MAXIMUM COST SAVINGS
 * 
 * This wrapper provides intelligent caching for ALL CoreLogic API calls
 * to dramatically reduce API costs while improving performance.
 * 
 * Features:
 * - Multi-layered caching with different TTLs
 * - Geographic coordinate-based caching
 * - Address normalization for better cache hits
 * - Automatic cache warming for popular locations
 * - Cost tracking and analytics
 */

class CoreLogicCacheWrapper {
  constructor() {
    this.superClient = new CoreLogicSuperClient();
    
    // Cache TTL configurations (in seconds)
    this.CACHE_TTLS = {
      PROPERTY_BASIC: 86400,      // 24 hours - basic property info changes rarely
      PROPERTY_DETAILS: 43200,     // 12 hours - detailed property info
      AVM_VALUATION: 21600,       // 6 hours - valuations change more frequently
      COMPARABLES: 7200,          // 2 hours - market comparables change regularly
      SEARCH_RESULTS: 14400,      // 4 hours - search results
      CLIMATE_RISK: 604800,       // 7 days - climate data is very stable
      TAX_ASSESSMENT: 2592000,    // 30 days - tax data changes annually
      DEMOGRAPHIC: 2592000,       // 30 days - demographic data is stable
      COORDINATES: 31536000       // 1 year - coordinate mapping is permanent
    };

    // Cost tracking
    this.costTracker = {
      cacheHits: 0,
      cacheMisses: 0,
      apiCallsSaved: 0,
      estimatedCostSaved: 0
    };
  }

  /**
   * 🎯 Main cached property lookup with maximum optimization
   */
  async getCachedPropertyInfo({ address1, city, state, postalcode, lat, lng }) {
    // Normalize inputs for consistent caching
    const normalizedData = this.normalizeAddress({ address1, city, state, postalcode, lat, lng });
    
    // Try multiple cache strategies in order of specificity
    const cacheStrategies = [
      () => this.tryAddressBasedCache(normalizedData),
      () => this.tryCoordinateBasedCache(normalizedData),
      () => this.tryPartialMatchCache(normalizedData)
    ];

    // Attempt each cache strategy
    for (const strategy of cacheStrategies) {
      const cachedResult = await strategy();
      if (cachedResult) {
        this.trackCacheHit('property_basic');
        console.log(`💰 CACHE HIT: Saved CoreLogic API call - Estimated $0.50-$2.00`);
        return cachedResult;
      }
    }

    // Cache miss - make API call and cache result
    console.log(`🔥 CACHE MISS: Making CoreLogic API call - Cost: $0.50-$2.00`);
    this.trackCacheMiss('property_basic');

    try {
      const apiResult = await getPropertyInfoFromCoreLogic(normalizedData);
      
      // Cache the result with multiple strategies for maximum hit rate
      await this.cachePropertyResult(normalizedData, apiResult);
      
      return apiResult;
    } catch (error) {
      console.error('❌ CoreLogic API call failed:', error.message);
      throw error;
    }
  }

  /**
   * 🏠 Cached comprehensive property intelligence
   */
  async getCachedComprehensiveIntelligence(clip, options = {}) {
    const cacheKey = `corelogic:comprehensive:${clip}:${JSON.stringify(options)}`;
    
    // Check cache first
    const cached = await getAsync(cacheKey);
    if (cached) {
      this.trackCacheHit('comprehensive');
      console.log(`💰 CACHE HIT: Comprehensive intelligence - Saved $5.00-$15.00`);
      return cached;
    }

    // Make API call
    console.log(`🔥 CACHE MISS: Comprehensive intelligence API call - Cost: $5.00-$15.00`);
    this.trackCacheMiss('comprehensive');

    const result = await this.superClient.getComprehensivePropertyIntelligence(clip, options);
    
    // Cache with longer TTL due to high cost
    await setAsync(cacheKey, result, this.CACHE_TTLS.PROPERTY_DETAILS);
    
    return result;
  }

  /**
   * 💰 Cached AVM valuations
   */
  async getCachedAVM(clip) {
    const cacheKey = `corelogic:avm:${clip}`;
    
    const cached = await getAsync(cacheKey);
    if (cached) {
      this.trackCacheHit('avm');
      console.log(`💰 CACHE HIT: AVM valuation - Saved $1.00-$3.00`);
      return cached;
    }

    console.log(`🔥 CACHE MISS: AVM valuation API call - Cost: $1.00-$3.00`);
    this.trackCacheMiss('avm');

    const result = await this.superClient.getAVMValuation(clip);
    await setAsync(cacheKey, result, this.CACHE_TTLS.AVM_VALUATION);
    
    return result;
  }

  /**
   * 📊 Cached comparables with intelligent distance-based caching
   */
  async getCachedComparables(clip, options = {}) {
    // Create cache key that accounts for search parameters
    const optionsKey = `${options.maxComps || 10}:${options.searchDistance || 0.5}:${options.monthsBack || 9}`;
    const cacheKey = `corelogic:comps:${clip}:${optionsKey}`;
    
    const cached = await getAsync(cacheKey);
    if (cached) {
      this.trackCacheHit('comparables');
      console.log(`💰 CACHE HIT: Comparables - Saved $2.00-$5.00`);
      return cached;
    }

    console.log(`🔥 CACHE MISS: Comparables API call - Cost: $2.00-$5.00`);
    this.trackCacheMiss('comparables');

    const result = await this.superClient.getComparables(clip, options);
    await setAsync(cacheKey, result, this.CACHE_TTLS.COMPARABLES);
    
    return result;
  }

  /**
   * 🌍 Cached climate risk (very expensive API call)
   */
  async getCachedClimateRisk(clip) {
    const cacheKey = `corelogic:climate:${clip}`;
    
    const cached = await getAsync(cacheKey);
    if (cached) {
      this.trackCacheHit('climate');
      console.log(`💰 CACHE HIT: Climate risk - Saved $10.00-$25.00 (HIGH VALUE!)`);
      return cached;
    }

    console.log(`🔥 CACHE MISS: Climate risk API call - Cost: $10.00-$25.00 (EXPENSIVE!)`);
    this.trackCacheMiss('climate');

    const result = await this.superClient.getClimateRiskAnalytics(clip);
    
    // Cache for very long time due to extremely high cost and stable data
    await setAsync(cacheKey, result, this.CACHE_TTLS.CLIMATE_RISK);
    
    return result;
  }

  /**
   * 🏗️ Cached property search with geographic optimization
   */
  async getCachedPropertySearch(searchParams) {
    // Normalize search parameters for consistent caching
    const normalizedParams = this.normalizeSearchParams(searchParams);
    const cacheKey = `corelogic:search:${JSON.stringify(normalizedParams)}`;
    
    const cached = await getAsync(cacheKey);
    if (cached) {
      this.trackCacheHit('search');
      console.log(`💰 CACHE HIT: Property search - Saved $1.00-$4.00`);
      return cached;
    }

    console.log(`🔥 CACHE MISS: Property search API call - Cost: $1.00-$4.00`);
    this.trackCacheMiss('search');

    const result = await this.superClient.searchAndEnrich(searchParams);
    await setAsync(cacheKey, result, this.CACHE_TTLS.SEARCH_RESULTS);
    
    return result;
  }

  /**
   * 🎯 Try address-based cache lookup
   */
  async tryAddressBasedCache({ address1, city, state, postalcode }) {
    const addressKey = `corelogic:addr:${address1}:${city}:${state}:${postalcode}`;
    return await getAsync(addressKey);
  }

  /**
   * 🗺️ Try coordinate-based cache lookup
   */
  async tryCoordinateBasedCache({ lat, lng }) {
    if (!lat || !lng) return null;
    
    // Round coordinates to create geographic clusters for better cache hits
    const roundedLat = Math.round(lat * 10000) / 10000; // ~11m precision
    const roundedLng = Math.round(lng * 10000) / 10000;
    
    const coordKey = `corelogic:coord:${roundedLat}:${roundedLng}`;
    return await getAsync(coordKey);
  }

  /**
   * 🔍 Try partial match cache lookup (for minor address variations)
   */
  async tryPartialMatchCache({ address1, city, state }) {
    // Create a simplified key that might match slight address variations
    const simplifiedAddress = address1.replace(/\b(street|st|avenue|ave|road|rd|drive|dr)\b/gi, '').trim();
    const partialKey = `corelogic:partial:${simplifiedAddress}:${city}:${state}`;
    
    return await getAsync(partialKey);
  }

  /**
   * 💾 Cache property result with multiple strategies
   */
  async cachePropertyResult(normalizedData, result) {
    const { address1, city, state, postalcode, lat, lng } = normalizedData;
    
    // Cache with full address
    const addressKey = `corelogic:addr:${address1}:${city}:${state}:${postalcode}`;
    await setAsync(addressKey, result, this.CACHE_TTLS.PROPERTY_BASIC);
    
    // Cache with coordinates if available
    if (lat && lng) {
      const roundedLat = Math.round(lat * 10000) / 10000;
      const roundedLng = Math.round(lng * 10000) / 10000;
      const coordKey = `corelogic:coord:${roundedLat}:${roundedLng}`;
      await setAsync(coordKey, result, this.CACHE_TTLS.PROPERTY_BASIC);
    }
    
    // Cache with partial address for fuzzy matching
    const simplifiedAddress = address1.replace(/\b(street|st|avenue|ave|road|rd|drive|dr)\b/gi, '').trim();
    const partialKey = `corelogic:partial:${simplifiedAddress}:${city}:${state}`;
    await setAsync(partialKey, result, this.CACHE_TTLS.PROPERTY_BASIC);
  }

  /**
   * 🧹 Normalize address for consistent caching
   */
  normalizeAddress({ address1, city, state, postalcode, lat, lng }) {
    return {
      address1: address1?.trim().toLowerCase() || '',
      city: city?.trim().toLowerCase() || '',
      state: state?.trim().toUpperCase() || '',
      postalcode: postalcode?.trim() || '',
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null
    };
  }

  /**
   * 🔧 Normalize search parameters
   */
  normalizeSearchParams(params) {
    const normalized = { ...params };
    
    if (normalized.streetAddress) {
      normalized.streetAddress = normalized.streetAddress.trim().toLowerCase();
    }
    if (normalized.city) {
      normalized.city = normalized.city.trim().toLowerCase();
    }
    if (normalized.state) {
      normalized.state = normalized.state.trim().toUpperCase();
    }
    
    // Sort keys for consistent cache keys
    return Object.keys(normalized).sort().reduce((result, key) => {
      result[key] = normalized[key];
      return result;
    }, {});
  }

  /**
   * 🚀 Pre-warm cache for popular locations (run during off-peak hours)
   */
  async warmPopularLocations(popularAddresses = []) {
    console.log(`🔥 Starting cache warming for ${popularAddresses.length} locations...`);
    
    for (const address of popularAddresses) {
      try {
        await this.getCachedPropertyInfo(address);
        console.log(`✅ Warmed cache for: ${address.address1}, ${address.city}`);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.warn(`⚠️ Failed to warm cache for: ${address.address1}, ${address.city}`);
      }
    }
    
    console.log(`🏁 Cache warming completed!`);
  }

  /**
   * 📈 Track cache performance
   */
  trackCacheHit(type) {
    this.costTracker.cacheHits++;
    this.costTracker.apiCallsSaved++;
    
    // Estimate cost savings based on API type
    const costSavings = this.estimateAPICost(type);
    this.costTracker.estimatedCostSaved += costSavings;
  }

  trackCacheMiss(type) {
    this.costTracker.cacheMisses++;
  }

  estimateAPICost(type) {
    const costs = {
      property_basic: 1.5,
      comprehensive: 10,
      avm: 2,
      comparables: 3.5,
      climate: 17.5,
      search: 2.5
    };
    
    return costs[type] || 1;
  }

  /**
   * 📊 Get cost savings report
   */
  getCostSavingsReport() {
    const totalCalls = this.costTracker.cacheHits + this.costTracker.cacheMisses;
    const hitRate = totalCalls > 0 ? (this.costTracker.cacheHits / totalCalls * 100).toFixed(1) : 0;
    
    return {
      cacheHitRate: `${hitRate}%`,
      totalCacheHits: this.costTracker.cacheHits,
      totalCacheMisses: this.costTracker.cacheMisses,
      apiCallsSaved: this.costTracker.apiCallsSaved,
      estimatedCostSaved: `$${this.costTracker.estimatedCostSaved.toFixed(2)}`,
      recommendations: this.generateOptimizationRecommendations()
    };
  }

  generateOptimizationRecommendations() {
    const recommendations = [];
    const hitRate = this.costTracker.cacheHits / (this.costTracker.cacheHits + this.costTracker.cacheMisses);
    
    if (hitRate < 0.7) {
      recommendations.push("Consider implementing cache warming for popular locations");
    }
    if (this.costTracker.cacheMisses > 100) {
      recommendations.push("High cache miss rate - consider longer TTLs for stable data");
    }
    if (this.costTracker.estimatedCostSaved > 50) {
      recommendations.push("Excellent cost savings! Cache strategy is working well");
    }
    
    return recommendations;
  }

  /**
   * 🗑️ Clear cache for specific patterns (for maintenance)
   */
  async clearCachePattern(pattern) {
    console.log(`🗑️ Clearing CoreLogic cache pattern: ${pattern}`);
    await deletePatternAsync(`corelogic:${pattern}*`);
  }

  /**
   * 🧪 Health check for cache performance
   */
  async healthCheck() {
    const report = this.getCostSavingsReport();
    console.log('🏥 CoreLogic Cache Health Report:', JSON.stringify(report, null, 2));
    return report;
  }
}

// Export singleton instance
const coreLogicCache = new CoreLogicCacheWrapper();

module.exports = {
  CoreLogicCacheWrapper,
  coreLogicCache
};
