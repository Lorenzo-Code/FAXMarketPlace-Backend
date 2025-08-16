/**
 * FXCT Rates Calculator
 * 
 * Calculates margin-safe FXCT rates for API calls using the formula:
 * fxct_per_call = (usd_cost / fxct_usd_avg) * (1 / (1 - target_margin))
 * 
 * Features:
 * - Margin-safe pricing with configurable target margins
 * - Rounding UP to nearest 0.5 FXCT to protect margins
 * - Minimum floor enforcement by data type
 * - Rate persistence with effective dates (UTC midnight)
 * - Automatic rate computation and caching
 */

const mongoose = require('mongoose');
const { priceFeedService } = require('./priceFeedService');
const { costTableService } = require('./costTableService');
const { getEffectiveMargin, getEffectiveFloors } = require('../config/pricing');

// MongoDB schema for FXCT rates
const FXCTRatesSchema = new mongoose.Schema({
  dataType: { 
    type: String, 
    required: true, 
    enum: ['BASIC', 'STANDARD', 'PRO_LOW', 'PRO_HIGH'],
    index: true 
  },
  usdCost: { type: Number, required: true },
  fxctRate: { type: Number, required: true },
  margin: { type: Number, required: true }, // Target margin used
  fxctUsdAvg: { type: Number, required: true }, // 7-day average price used
  effectiveFrom: { type: Date, required: true, index: true }, // UTC midnight
  isActive: { type: Boolean, default: true },
  computedAt: { type: Date, default: Date.now },
  metadata: {
    rawCalculation: Number, // Before rounding
    appliedFloor: Boolean, // Whether minimum floor was applied
    strictMode: Boolean, // Whether strict mode was active
    priceDataPoints: Number, // Number of price data points used
    priceStale: Boolean // Whether price data was stale
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
FXCTRatesSchema.index({ dataType: 1, effectiveFrom: -1 });
FXCTRatesSchema.index({ effectiveFrom: -1, isActive: 1 });
const FXCTRates = mongoose.model('PricingFXCTRates', FXCTRatesSchema);

class FXCTRatesService {
  constructor() {
    this.ratesCache = new Map();
    this.lastComputation = null;
  }

  /**
   * Calculate FXCT rate for a given USD cost and FXCT price
   * Formula: fxct_per_call = (usd_cost / fxct_usd_avg) * (1 / (1 - target_margin))
   * 
   * @param {number} usdCost - USD cost of the API call
   * @param {number} fxctUsdPrice - FXCT/USD average price
   * @param {number} targetMargin - Target margin (0.75 = 75%)
   * @returns {number} Raw calculated FXCT rate (before rounding)
   */
  calculateRawFXCTRate(usdCost, fxctUsdPrice, targetMargin) {
    if (usdCost <= 0 || fxctUsdPrice <= 0 || targetMargin <= 0 || targetMargin >= 1) {
      throw new Error('Invalid parameters for FXCT rate calculation');
    }

    // Formula: (USD cost ÷ FXCT price) × (1 ÷ (1 - margin))
    const marginMultiplier = 1 / (1 - targetMargin);
    const rawRate = (usdCost / fxctUsdPrice) * marginMultiplier;
    
    return rawRate;
  }

  /**
   * Round FXCT rate UP to nearest 0.5 to protect margins
   * @param {number} rawRate - Raw calculated rate
   * @returns {number} Rounded rate
   */
  roundFXCTRate(rawRate) {
    // Round UP to nearest 0.5 FXCT: ceil(2 * x) / 2
    return Math.ceil(2 * rawRate) / 2;
  }

  /**
   * Apply minimum floor for data type
   * @param {number} roundedRate - Rounded FXCT rate
   * @param {string} dataType - Data type (BASIC, STANDARD, etc.)
   * @returns {number} Rate with floor applied
   */
  applyMinimumFloor(roundedRate, dataType) {
    const floors = getEffectiveFloors();
    const minFloor = floors[dataType];
    
    if (!minFloor) {
      console.warn(`⚠️ No minimum floor defined for ${dataType}, using rate as-is`);
      return roundedRate;
    }
    
    return Math.max(roundedRate, minFloor);
  }

  /**
   * Compute FXCT rates for all data types
   * @param {boolean} forceRecompute - Force recomputation even if recent rates exist
   * @returns {Promise<Object>} Computed rates by data type
   */
  async computeAllRates(forceRecompute = false) {
    try {
      console.log('🔄 Starting FXCT rates computation...');
      
      // Check if we need to recompute (only once per day unless forced)
      if (!forceRecompute && this.lastComputation) {
        const hoursSinceLastComputation = (Date.now() - this.lastComputation) / (1000 * 60 * 60);
        if (hoursSinceLastComputation < 12) { // Recompute at most twice per day
          console.log(`⏰ Skipping computation (last computed ${hoursSinceLastComputation.toFixed(1)}h ago)`);
          return await this.getCurrentRates();
        }
      }

      // Get 7-day average FXCT price
      const priceData = await priceFeedService.getSevenDayAverage();
      const fxctUsdAvg = priceData.price;
      
      console.log(`💰 Using 7-day average FXCT price: $${fxctUsdAvg.toFixed(6)}`);
      
      // Get current costs for all data types
      const allCosts = await costTableService.getAllDataTypeCosts();
      
      // Get effective margin and floors
      const targetMargin = getEffectiveMargin();
      const floors = getEffectiveFloors();
      
      console.log(`📊 Target margin: ${(targetMargin * 100).toFixed(1)}%`);
      
      // Compute rates for each data type
      const computedRates = {};
      const effectiveFrom = this.getEffectiveFromDate();
      
      for (const [dataType, costInfo] of Object.entries(allCosts)) {
        const usdCost = costInfo.cost;
        
        // Calculate raw rate
        const rawRate = this.calculateRawFXCTRate(usdCost, fxctUsdAvg, targetMargin);
        
        // Round up to nearest 0.5
        const roundedRate = this.roundFXCTRate(rawRate);
        
        // Apply minimum floor
        const finalRate = this.applyMinimumFloor(roundedRate, dataType);
        const floorApplied = finalRate > roundedRate;
        
        // Save to database
        const rateRecord = await FXCTRates.findOneAndUpdate(
          {
            dataType,
            effectiveFrom
          },
          {
            usdCost,
            fxctRate: finalRate,
            margin: targetMargin,
            fxctUsdAvg,
            isActive: true,
            metadata: {
              rawCalculation: rawRate,
              appliedFloor: floorApplied,
              strictMode: process.env.PRICING_STRICT_MODE === 'true',
              priceDataPoints: priceData.dataPoints,
              priceStale: priceData.isStale
            }
          },
          {
            upsert: true,
            new: true
          }
        );
        
        computedRates[dataType] = {
          usdCost,
          fxctRate: finalRate,
          rawRate,
          roundedRate,
          floorApplied,
          margin: targetMargin,
          effectiveFrom
        };
        
        console.log(`✅ ${dataType}: $${usdCost.toFixed(2)} USD → ${finalRate} FXCT (raw: ${rawRate.toFixed(2)}, floor: ${floorApplied ? 'applied' : 'not needed'})`);
      }
      
      // Deactivate old rates
      await FXCTRates.updateMany(
        {
          effectiveFrom: { $lt: effectiveFrom },
          isActive: true
        },
        {
          isActive: false
        }
      );
      
      // Update cache
      this.updateRatesCache(computedRates);
      this.lastComputation = Date.now();
      
      console.log('✅ FXCT rates computation completed successfully');
      return computedRates;
      
    } catch (error) {
      console.error('❌ Failed to compute FXCT rates:', error.message);
      throw error;
    }
  }

  /**
   * Get current active rates for all data types
   * @returns {Promise<Object>} Current rates by data type
   */
  async getCurrentRates() {
    try {
      // Check cache first
      const cacheKey = 'current_rates';
      if (this.ratesCache.has(cacheKey)) {
        const cached = this.ratesCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) { // Cache for 5 minutes
          return cached.data;
        }
      }
      
      // Get from database
      const currentRates = await FXCTRates.find({
        isActive: true
      }).sort({ effectiveFrom: -1 });
      
      // Group by data type, taking the most recent rate for each
      const ratesByType = {};
      const seenTypes = new Set();
      
      for (const rate of currentRates) {
        if (!seenTypes.has(rate.dataType)) {
          ratesByType[rate.dataType] = {
            usdCost: rate.usdCost,
            fxctRate: rate.fxctRate,
            margin: rate.margin,
            effectiveFrom: rate.effectiveFrom,
            metadata: rate.metadata
          };
          seenTypes.add(rate.dataType);
        }
      }
      
      // Cache the result
      this.ratesCache.set(cacheKey, {
        data: ratesByType,
        timestamp: Date.now()
      });
      
      return ratesByType;
      
    } catch (error) {
      console.error('❌ Failed to get current rates:', error.message);
      throw error;
    }
  }

  /**
   * Get FXCT rate for a specific data type
   * @param {string} dataType - Data type (BASIC, STANDARD, etc.)
   * @returns {Promise<number>} FXCT rate for the data type
   */
  async getFXCTRateForDataType(dataType) {
    const currentRates = await this.getCurrentRates();
    
    if (!currentRates[dataType]) {
      console.warn(`⚠️ No rate found for ${dataType}, falling back to BASIC rate`);
      return currentRates.BASIC?.fxctRate || 2.0; // Minimum fallback
    }
    
    return currentRates[dataType].fxctRate;
  }

  /**
   * Get FXCT rate for a specific API endpoint
   * @param {string} endpoint - API endpoint name
   * @returns {Promise<number>} FXCT rate for the endpoint
   */
  async getFXCTRateForEndpoint(endpoint) {
    // Map endpoint to data type using cost table service
    const costs = await costTableService.loadCosts();
    const dataType = costs.dataTypeMapping[endpoint];
    
    if (!dataType) {
      console.warn(`⚠️ No data type mapping for endpoint ${endpoint}, using BASIC rate`);
      return await this.getFXCTRateForDataType('BASIC');
    }
    
    return await this.getFXCTRateForDataType(dataType);
  }

  /**
   * Get effective from date (UTC midnight for current day)
   * @returns {Date} UTC midnight date
   */
  getEffectiveFromDate() {
    const now = new Date();
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    return utcMidnight;
  }

  /**
   * Update rates cache
   * @param {Object} rates - Computed rates to cache
   */
  updateRatesCache(rates) {
    this.ratesCache.set('current_rates', {
      data: rates,
      timestamp: Date.now()
    });
  }

  /**
   * Get rates history for reporting
   * @param {number} days - Number of days of history
   * @returns {Promise<Array>} Historical rates
   */
  async getRatesHistory(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);

    const history = await FXCTRates.find({
      effectiveFrom: { $gte: startDate }
    }).sort({ effectiveFrom: -1, dataType: 1 });

    return history;
  }

  /**
   * Validate rates computation result
   * @param {Object} rates - Computed rates
   * @returns {boolean} Whether rates are valid
   */
  validateRates(rates) {
    const requiredDataTypes = ['BASIC', 'STANDARD', 'PRO_LOW', 'PRO_HIGH'];
    
    for (const dataType of requiredDataTypes) {
      if (!rates[dataType]) {
        console.error(`❌ Missing rate for required data type: ${dataType}`);
        return false;
      }
      
      const rate = rates[dataType];
      if (typeof rate.fxctRate !== 'number' || rate.fxctRate <= 0) {
        console.error(`❌ Invalid FXCT rate for ${dataType}: ${rate.fxctRate}`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get margin analysis for current rates
   * @returns {Promise<Object>} Margin analysis
   */
  async getMarginAnalysis() {
    const currentRates = await this.getCurrentRates();
    const priceData = await priceFeedService.getSevenDayAverage();
    
    const analysis = {};
    
    for (const [dataType, rateInfo] of Object.entries(currentRates)) {
      const actualMargin = 1 - (rateInfo.usdCost / (rateInfo.fxctRate * priceData.price));
      const targetMargin = rateInfo.margin;
      
      analysis[dataType] = {
        targetMargin: targetMargin,
        actualMargin: actualMargin,
        marginDifference: actualMargin - targetMargin,
        isMarginSafe: actualMargin >= targetMargin - 0.02, // 2% tolerance
        usdCost: rateInfo.usdCost,
        fxctRate: rateInfo.fxctRate
      };
    }
    
    return {
      analysis,
      fxctPrice: priceData.price,
      priceStale: priceData.isStale
    };
  }
}

// Create and export singleton instance
const fxctRatesService = new FXCTRatesService();

module.exports = {
  FXCTRatesService,
  fxctRatesService,
  FXCTRates
};
