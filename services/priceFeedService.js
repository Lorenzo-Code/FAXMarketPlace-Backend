/**
 * FXCT Price Feed Service with 7-Day TWAP
 * 
 * This service manages the fetching and calculation of FXCT token prices:
 * 1. Fetches daily FXCT/USD prices from primary and fallback oracles
 * 2. Calculates 7-day Time-Weighted Average Price (TWAP)
 * 3. Handles oracle failures with exponential backoff retry
 * 4. Persists price data to database with source tracking
 * 5. Provides cached price data with staleness detection
 */

const axios = require('axios');
const mongoose = require('mongoose');
const { validatePricingConfig } = require('../config/pricing');

// MongoDB schema for token prices
const TokenPriceSchema = new mongoose.Schema({
  symbol: { type: String, required: true, index: true },
  day: { type: Date, required: true, index: true },
  price: { type: Number, required: true },
  source: { type: String, required: true }, // 'primary', 'fallback', 'manual'
  isStale: { type: Boolean, default: false },
  metadata: { type: Object, default: {} }, // Store additional oracle data
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Compound index for efficient queries
TokenPriceSchema.index({ symbol: 1, day: -1 });
const TokenPrice = mongoose.model('PricingTokenPrice', TokenPriceSchema);

class PriceFeedService {
  constructor(config) {
    this.config = config;
    this.priceCache = new Map(); // In-memory cache for recent prices
    this.lastFetchAttempt = null;
    this.isStale = false;
    
    // Validate configuration on initialization
    validatePricingConfig();
  }

  /**
   * Fetch current FXCT price from primary oracle
   * @returns {Promise<{price: number, source: string, metadata: Object}>}
   */
  async fetchFromPrimaryOracle() {
    try {
      const response = await axios.get(this.config.PRICE_ORACLE_URL, {
        timeout: this.config.ORACLE_TIMEOUT_MS,
        headers: {
          'User-Agent': 'FractionaX-PriceFeed/1.0.0',
          'Accept': 'application/json'
        }
      });

      // Handle different oracle response formats
      let price;
      const data = response.data;
      
      if (data.price !== undefined) {
        price = parseFloat(data.price);
      } else if (data.result !== undefined) {
        price = parseFloat(data.result);
      } else if (data[this.config.FXCT_SYMBOL.toLowerCase()]) {
        price = parseFloat(data[this.config.FXCT_SYMBOL.toLowerCase()].usd);
      } else {
        throw new Error('Invalid oracle response format');
      }

      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid price value: ${price}`);
      }

      console.log(`📈 Fetched FXCT price from primary oracle: $${price.toFixed(6)}`);
      
      return {
        price,
        source: 'primary',
        metadata: {
          timestamp: new Date().toISOString(),
          oracle_url: this.config.PRICE_ORACLE_URL,
          raw_response: data
        }
      };

    } catch (error) {
      console.error('❌ Primary oracle fetch failed:', error.message);
      throw error;
    }
  }

  /**
   * Fetch current FXCT price from fallback oracle
   * @returns {Promise<{price: number, source: string, metadata: Object}>}
   */
  async fetchFromFallbackOracle() {
    try {
      const response = await axios.get(this.config.FALLBACK_ORACLE_URL, {
        timeout: this.config.ORACLE_TIMEOUT_MS,
        headers: {
          'User-Agent': 'FractionaX-PriceFeed-Fallback/1.0.0',
          'Accept': 'application/json'
        }
      });

      // Handle fallback oracle response format (e.g., CoinGecko)
      const data = response.data;
      let price;

      if (data.fractionax && data.fractionax.usd) {
        price = parseFloat(data.fractionax.usd);
      } else if (data.price) {
        price = parseFloat(data.price);
      } else {
        throw new Error('Invalid fallback oracle response format');
      }

      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid fallback price value: ${price}`);
      }

      console.log(`📈 Fetched FXCT price from fallback oracle: $${price.toFixed(6)}`);
      
      return {
        price,
        source: 'fallback',
        metadata: {
          timestamp: new Date().toISOString(),
          oracle_url: this.config.FALLBACK_ORACLE_URL,
          raw_response: data
        }
      };

    } catch (error) {
      console.error('❌ Fallback oracle fetch failed:', error.message);
      throw error;
    }
  }

  /**
   * Fetch price with retry logic and fallback
   * @returns {Promise<{price: number, source: string, metadata: Object}>}
   */
  async fetchPriceWithRetry() {
    let lastError;
    
    // Try primary oracle with retry
    for (let attempt = 1; attempt <= this.config.ORACLE_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.fetchFromPrimaryOracle();
      } catch (error) {
        lastError = error;
        
        if (attempt < this.config.ORACLE_RETRY_ATTEMPTS) {
          const delay = this.config.ORACLE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`⏳ Primary oracle retry ${attempt}/${this.config.ORACLE_RETRY_ATTEMPTS} in ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    console.warn('⚠️ Primary oracle failed after all retries, trying fallback...');
    
    // Try fallback oracle with retry
    for (let attempt = 1; attempt <= this.config.ORACLE_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.fetchFromFallbackOracle();
      } catch (error) {
        lastError = error;
        
        if (attempt < this.config.ORACLE_RETRY_ATTEMPTS) {
          const delay = this.config.ORACLE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`⏳ Fallback oracle retry ${attempt}/${this.config.ORACLE_RETRY_ATTEMPTS} in ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`All oracles failed. Last error: ${lastError.message}`);
  }

  /**
   * Update daily price in database
   * @param {Date} date - The date for the price
   * @returns {Promise<Object>} Saved price record
   */
  async updateDailyPrice(date = new Date()) {
    try {
      const dayStart = new Date(date);
      dayStart.setUTCHours(0, 0, 0, 0);

      // Check if we already have a price for this day
      const existing = await TokenPrice.findOne({
        symbol: this.config.FXCT_SYMBOL,
        day: dayStart
      });

      if (existing && !existing.isStale) {
        console.log(`✅ Price already exists for ${dayStart.toISOString().split('T')[0]}`);
        return existing;
      }

      // Fetch new price
      const priceData = await this.fetchPriceWithRetry();
      
      // Save to database
      const priceRecord = await TokenPrice.findOneAndUpdate(
        {
          symbol: this.config.FXCT_SYMBOL,
          day: dayStart
        },
        {
          price: priceData.price,
          source: priceData.source,
          metadata: priceData.metadata,
          isStale: false
        },
        {
          upsert: true,
          new: true
        }
      );

      // Update cache
      this.updatePriceCache(dayStart, priceData.price);
      this.lastFetchAttempt = new Date();
      this.isStale = false;

      console.log(`💾 Saved FXCT price for ${dayStart.toISOString().split('T')[0]}: $${priceData.price.toFixed(6)}`);
      return priceRecord;

    } catch (error) {
      console.error('❌ Failed to update daily price:', error.message);
      
      // Mark existing price as stale if fetch fails
      await TokenPrice.updateMany(
        {
          symbol: this.config.FXCT_SYMBOL,
          isStale: false
        },
        {
          isStale: true
        }
      );
      
      this.isStale = true;
      this.lastFetchAttempt = new Date();
      
      throw error;
    }
  }

  /**
   * Calculate 7-day Time-Weighted Average Price (TWAP)
   * @param {string} symbol - Token symbol (default: FXCT)
   * @returns {Promise<{price: number, period: string, dataPoints: number, isStale: boolean}>}
   */
  async getSevenDayAverage(symbol = null) {
    const tokenSymbol = symbol || this.config.FXCT_SYMBOL;
    
    try {
      // Check cache first
      const cacheKey = `7d_avg_${tokenSymbol}`;
      if (this.priceCache.has(cacheKey)) {
        const cached = this.priceCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.config.PRICE_CACHE_TTL_SECONDS * 1000) {
          return cached.data;
        }
      }

      // Get last 7 days of price data
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setUTCHours(0, 0, 0, 0);

      const priceRecords = await TokenPrice.find({
        symbol: tokenSymbol,
        day: { $gte: sevenDaysAgo }
      })
      .sort({ day: -1 })
      .limit(7);

      if (priceRecords.length === 0) {
        throw new Error(`No price data found for ${tokenSymbol}`);
      }

      // Calculate arithmetic mean (TWAP acceptable for daily data points)
      const totalPrice = priceRecords.reduce((sum, record) => sum + record.price, 0);
      const averagePrice = totalPrice / priceRecords.length;
      
      // Check staleness
      const hasStaleData = priceRecords.some(record => record.isStale);
      const oldestRecord = priceRecords[priceRecords.length - 1];
      const staleness = Date.now() - oldestRecord.day.getTime();
      const isStaleByAge = staleness > (this.config.MAX_PRICE_STALENESS_HOURS * 60 * 60 * 1000);

      const result = {
        price: parseFloat(averagePrice.toFixed(8)),
        period: '7d',
        dataPoints: priceRecords.length,
        isStale: hasStaleData || isStaleByAge || this.isStale,
        staleness: Math.floor(staleness / (60 * 60 * 1000)), // hours
        lastUpdate: priceRecords[0].day,
        priceRange: {
          min: Math.min(...priceRecords.map(r => r.price)),
          max: Math.max(...priceRecords.map(r => r.price))
        }
      };

      // Cache the result
      this.priceCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      console.log(`📊 Calculated 7-day TWAP for ${tokenSymbol}: $${result.price.toFixed(6)} (${result.dataPoints} data points)`);
      return result;

    } catch (error) {
      console.error('❌ Failed to calculate 7-day average:', error.message);
      throw error;
    }
  }

  /**
   * Get latest price for a token
   * @param {string} symbol - Token symbol
   * @returns {Promise<Object>} Latest price record
   */
  async getLatestPrice(symbol = null) {
    const tokenSymbol = symbol || this.config.FXCT_SYMBOL;
    
    const latestPrice = await TokenPrice.findOne({
      symbol: tokenSymbol
    }).sort({ day: -1 });

    if (!latestPrice) {
      throw new Error(`No price data found for ${tokenSymbol}`);
    }

    return latestPrice;
  }

  /**
   * Get price history for a token
   * @param {string} symbol - Token symbol
   * @param {number} days - Number of days of history
   * @returns {Promise<Array>} Price history records
   */
  async getPriceHistory(symbol = null, days = 30) {
    const tokenSymbol = symbol || this.config.FXCT_SYMBOL;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);

    const priceHistory = await TokenPrice.find({
      symbol: tokenSymbol,
      day: { $gte: startDate }
    }).sort({ day: -1 });

    return priceHistory;
  }

  /**
   * Update price cache
   * @param {Date} date - Date of the price
   * @param {number} price - Price value
   */
  updatePriceCache(date, price) {
    const key = `daily_${date.toISOString().split('T')[0]}`;
    this.priceCache.set(key, {
      price,
      timestamp: Date.now()
    });

    // Clean old cache entries (keep last 30 days)
    if (this.priceCache.size > 30) {
      const oldestKey = Array.from(this.priceCache.keys())[0];
      this.priceCache.delete(oldestKey);
    }
  }

  /**
   * Health check for price feed service
   * @returns {Object} Health status
   */
  async healthCheck() {
    try {
      const latest = await this.getLatestPrice();
      const sevenDayAvg = await this.getSevenDayAverage();
      
      return {
        status: 'healthy',
        latestPrice: latest.price,
        latestUpdate: latest.day,
        sevenDayAverage: sevenDayAvg.price,
        isStale: sevenDayAvg.isStale,
        cacheSize: this.priceCache.size
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastFetchAttempt: this.lastFetchAttempt
      };
    }
  }

  /**
   * Sleep utility for retry logic
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create and export singleton instance
const pricingConfig = require('../config/pricing');
const priceFeedService = new PriceFeedService(pricingConfig);

module.exports = {
  PriceFeedService,
  priceFeedService,
  TokenPrice
};
