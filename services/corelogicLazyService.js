/**
 * 💰🔍 CoreLogic Lazy Loading Service
 * 
 * Provides on-demand CoreLogic data enhancement for properties.
 * Only loads when user specifically requests detailed property analysis.
 * 
 * Features:
 * - User authentication required (sign-in + payment)
 * - Individual property enhancement
 * - Caching to avoid duplicate API calls
 * - Pay-per-use pricing model
 */

const mongoose = require('mongoose');
const { MarketplaceListing } = require('./marketplaceBatchService');

// Schema for CoreLogic requests and caching
const CoreLogicRequestSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  propertyId: { type: String, required: true },
  requestDate: { type: Date, default: Date.now },
  corelogicData: mongoose.Schema.Types.Mixed,
  requestStatus: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'expired'],
    default: 'pending'
  },
  costInCredits: { type: Number, default: 1 },
  paidAt: Date,
  expiresAt: Date, // CoreLogic data expires after 30 days
  apiCallDetails: {
    endpoint: String,
    responseTime: Number,
    errorMessage: String
  }
}, {
  timestamps: true,
  collection: 'corelogic_requests'
});

// Indexes for fast lookups
CoreLogicRequestSchema.index({ userId: 1, propertyId: 1 });
CoreLogicRequestSchema.index({ requestDate: -1 });
CoreLogicRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CoreLogicRequest = mongoose.model('CoreLogicRequest', CoreLogicRequestSchema);

class CoreLogicLazyService {
  constructor() {
    this.apiBaseUrl = process.env.CORELOGIC_API_URL || 'https://api.corelogic.com';
    this.apiKey = process.env.CORELOGIC_API_KEY;
    this.creditsPerRequest = 1; // Default cost per property enhancement
    this.cacheExpiryDays = 30; // Cache CoreLogic data for 30 days
  }

  /**
   * 🔐 Check if user can access CoreLogic data
   */
  async checkUserAccess(userId) {
    // Check if user has valid subscription/credits
    // This would integrate with your user/billing system
    
    // Mock implementation - replace with actual user/billing check
    const mockUserHasAccess = true; // Replace with actual logic
    const mockUserCredits = 10; // Replace with actual credit balance
    
    if (!mockUserHasAccess) {
      throw new Error('CoreLogic access requires premium subscription');
    }
    
    if (mockUserCredits < this.creditsPerRequest) {
      throw new Error('Insufficient credits for CoreLogic data');
    }
    
    return {
      hasAccess: true,
      credits: mockUserCredits,
      costPerRequest: this.creditsPerRequest
    };
  }

  /**
   * 🏡 Get CoreLogic data for a property (lazy loaded)
   */
  async getCoreLogicData(propertyId, userId) {
    try {
      console.log(`🔍 CoreLogic lazy load requested for property ${propertyId} by user ${userId}`);
      
      // 1. Check user access and credits
      const accessCheck = await this.checkUserAccess(userId);
      
      // 2. Check if we already have recent data cached
      const existingRequest = await CoreLogicRequest.findOne({
        userId,
        propertyId,
        requestStatus: 'completed',
        expiresAt: { $gt: new Date() } // Not expired
      });
      
      if (existingRequest) {
        console.log(`✅ Using cached CoreLogic data for property ${propertyId}`);
        return {
          success: true,
          data: existingRequest.corelogicData,
          cached: true,
          requestDate: existingRequest.requestDate,
          creditsUsed: 0 // No charge for cached data
        };
      }
      
      // 3. Get property details from marketplace
      const property = await MarketplaceListing.findOne({ id: propertyId });
      if (!property) {
        throw new Error(`Property ${propertyId} not found in marketplace`);
      }
      
      // 4. Make CoreLogic API call
      const corelogicData = await this.fetchCoreLogicFromAPI(property);
      
      // 5. Store the request and data
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.cacheExpiryDays);
      
      const corelogicRequest = new CoreLogicRequest({
        userId,
        propertyId,
        corelogicData,
        requestStatus: 'completed',
        costInCredits: this.creditsPerRequest,
        paidAt: new Date(),
        expiresAt
      });
      
      await corelogicRequest.save();
      
      // 6. Update the property with CoreLogic status
      await MarketplaceListing.updateOne(
        { id: propertyId },
        { 
          $set: { 
            'corelogic_status.enhanced': true,
            'corelogic_status.last_updated': new Date(),
            corelogicData: corelogicData
          }
        }
      );
      
      console.log(`✅ CoreLogic data loaded for property ${propertyId} - ${this.creditsPerRequest} credits used`);
      
      return {
        success: true,
        data: corelogicData,
        cached: false,
        requestDate: new Date(),
        creditsUsed: this.creditsPerRequest,
        expiresAt
      };
      
    } catch (error) {
      console.error(`❌ CoreLogic lazy load failed for property ${propertyId}:`, error);
      
      // Log failed request
      const failedRequest = new CoreLogicRequest({
        userId,
        propertyId,
        requestStatus: 'failed',
        costInCredits: 0, // No charge for failed requests
        apiCallDetails: {
          errorMessage: error.message
        }
      });
      
      await failedRequest.save();
      
      throw error;
    }
  }

  /**
   * 🌐 Fetch data from CoreLogic API
   */
  async fetchCoreLogicFromAPI(property) {
    const startTime = Date.now();
    
    try {
      // Mock CoreLogic API response - replace with actual API call
      console.log(`🌐 Calling CoreLogic API for ${property.address}...`);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock enhanced data with real estate insights
      const corelogicData = {
        avm: {
          estimate: Math.round(property.price * (0.95 + Math.random() * 0.1)),
          confidence: Math.random() * 0.3 + 0.7, // 70-100%
          lastUpdated: new Date(),
          methodology: 'Automated Valuation Model v3.2'
        },
        
        marketTrends: {
          appreciation_1yr: Math.random() * 0.15 + 0.02,
          appreciation_3yr: Math.random() * 0.25 + 0.05,
          appreciation_5yr: Math.random() * 0.40 + 0.10,
          daysOnMarket: Math.floor(Math.random() * 60) + 10,
          pricePerSqft: Math.round(property.price / (property.sqft || 1500)),
          marketVelocity: ['slow', 'moderate', 'fast'][Math.floor(Math.random() * 3)]
        },
        
        riskFactors: {
          floodRisk: {
            zone: ['A', 'AE', 'X'][Math.floor(Math.random() * 3)],
            probability: Math.random() * 0.1,
            description: 'FEMA flood zone assessment'
          },
          crimeScore: {
            score: Math.floor(Math.random() * 10) + 1,
            category: ['low', 'moderate', 'high'][Math.floor(Math.random() * 3)],
            lastUpdated: new Date()
          },
          naturalDisaster: {
            earthquake: Math.random() * 0.05,
            hurricane: Math.random() * 0.15,
            wildfire: Math.random() * 0.08
          }
        },
        
        schoolDistrict: {
          elementary: {
            name: `${property.city} Elementary #${Math.floor(Math.random() * 20) + 1}`,
            rating: Math.floor(Math.random() * 5) + 6,
            distance: Math.round(Math.random() * 2 + 0.5 * 10) / 10
          },
          middle: {
            name: `${property.city} Middle School`,
            rating: Math.floor(Math.random() * 4) + 6,
            distance: Math.round(Math.random() * 3 + 0.8 * 10) / 10
          },
          high: {
            name: `${property.city} High School`,
            rating: Math.floor(Math.random() * 4) + 6,
            distance: Math.round(Math.random() * 4 + 1.2 * 10) / 10
          }
        },
        
        investmentMetrics: {
          capRate: Math.random() * 0.08 + 0.04,
          cashOnCashReturn: Math.random() * 0.12 + 0.06,
          rentalYield: Math.random() * 0.10 + 0.05,
          grossRentMultiplier: Math.random() * 5 + 8,
          vacancyRate: Math.random() * 0.08 + 0.02,
          appreciationForecast: Math.random() * 0.06 + 0.03
        },
        
        propertyDetails: {
          lotSize: Math.round(Math.random() * 5000 + 3000),
          taxAssessedValue: Math.round(property.price * (0.8 + Math.random() * 0.3)),
          taxYear: new Date().getFullYear(),
          annualTaxes: Math.round(property.price * (0.015 + Math.random() * 0.01)),
          zoningCode: ['R1', 'R2', 'R3', 'RM'][Math.floor(Math.random() * 4)]
        },
        
        comparables: Array.from({ length: 3 }, (_, i) => ({
          address: `${3000 + i * 100} Comparable St, ${property.city}, ${property.state}`,
          price: Math.round(property.price * (0.9 + Math.random() * 0.2)),
          sqft: Math.round((property.sqft || 1500) * (0.9 + Math.random() * 0.2)),
          distance: Math.round(Math.random() * 0.5 + 0.1 * 10) / 10,
          saleDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
        })),
        
        metadata: {
          provider: 'CoreLogic Professional',
          reportDate: new Date(),
          reportId: `CL-${Date.now()}-${property.id}`,
          dataQuality: Math.random() * 0.2 + 0.8, // 80-100%
          sources: ['MLS', 'Public Records', 'Property Tax', 'Census Data'],
          disclaimers: [
            'Data provided for informational purposes only',
            'Property values are estimates and may vary',
            'Investment metrics are projections based on historical data'
          ]
        }
      };
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ CoreLogic API call completed in ${responseTime}ms`);
      
      return corelogicData;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`❌ CoreLogic API call failed after ${responseTime}ms:`, error);
      throw new Error(`CoreLogic API error: ${error.message}`);
    }
  }

  /**
   * 📊 Get user's CoreLogic usage statistics
   */
  async getUserUsageStats(userId) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const [
        totalRequests,
        completedRequests,
        failedRequests,
        totalCreditsUsed,
        recentRequests
      ] = await Promise.all([
        CoreLogicRequest.countDocuments({ userId }),
        CoreLogicRequest.countDocuments({ userId, requestStatus: 'completed' }),
        CoreLogicRequest.countDocuments({ userId, requestStatus: 'failed' }),
        CoreLogicRequest.aggregate([
          { $match: { userId, requestStatus: 'completed' } },
          { $group: { _id: null, total: { $sum: '$costInCredits' } } }
        ]),
        CoreLogicRequest.find({ 
          userId, 
          requestDate: { $gte: thirtyDaysAgo } 
        })
        .sort({ requestDate: -1 })
        .limit(10)
        .lean()
      ]);
      
      return {
        usage: {
          total_requests: totalRequests,
          completed_requests: completedRequests,
          failed_requests: failedRequests,
          success_rate: totalRequests > 0 ? (completedRequests / totalRequests * 100).toFixed(1) : 0,
          total_credits_used: totalCreditsUsed[0]?.total || 0
        },
        recent_requests: recentRequests,
        billing: {
          credits_per_request: this.creditsPerRequest,
          cache_expiry_days: this.cacheExpiryDays
        }
      };
      
    } catch (error) {
      console.error(`❌ Error fetching usage stats for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * 🧹 Cleanup expired requests
   */
  async cleanupExpiredRequests() {
    try {
      const deleteResult = await CoreLogicRequest.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      
      if (deleteResult.deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deleteResult.deletedCount} expired CoreLogic requests`);
      }
      
      return deleteResult.deletedCount;
    } catch (error) {
      console.error('❌ Error cleaning up expired requests:', error);
      throw error;
    }
  }

  /**
   * 💰 Check pricing for property enhancement
   */
  getPricingInfo() {
    return {
      credits_per_request: this.creditsPerRequest,
      cache_duration_days: this.cacheExpiryDays,
      included_data: [
        'Automated Valuation Model (AVM)',
        'Market Trends & Appreciation History',
        'Risk Assessment (Flood, Crime, Natural Disasters)',
        'School District Information & Ratings',
        'Investment Metrics & ROI Projections',
        'Property Details & Tax Information',
        'Recent Comparable Sales'
      ],
      pricing_model: 'pay_per_property',
      cached_results: 'No additional charge for repeat access within 30 days'
    };
  }
}

module.exports = {
  CoreLogicLazyService,
  CoreLogicRequest
};
