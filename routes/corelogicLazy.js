/**
 * 💰🔍 CoreLogic Lazy Loading API Routes
 * 
 * On-demand property enhancement with CoreLogic data.
 * Requires user authentication and credits/payment.
 */

const express = require('express');
const router = express.Router();
const { CoreLogicLazyService } = require('../services/corelogicLazyService');

// Initialize CoreLogic service
const corelogicService = new CoreLogicLazyService();

/**
 * 🔐 Middleware to check user authentication
 * Replace with your actual authentication middleware
 */
const requireAuth = (req, res, next) => {
  // Mock authentication - replace with your actual auth logic
  const userId = req.headers['user-id'] || req.query.userId || 'demo-user-123';
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Please sign in to access CoreLogic property data'
    });
  }
  
  req.userId = userId;
  next();
};

/**
 * 💰 GET /api/corelogic/pricing
 * Get CoreLogic pricing information
 */
router.get('/pricing', (req, res) => {
  try {
    const pricingInfo = corelogicService.getPricingInfo();
    
    res.json({
      success: true,
      data: pricingInfo,
      message: 'CoreLogic pricing information'
    });
    
  } catch (error) {
    console.error('❌ Error fetching pricing info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing information',
      message: error.message
    });
  }
});

/**
 * 🏡 POST /api/corelogic/enhance/:propertyId
 * Request CoreLogic data enhancement for a specific property
 */
router.post('/enhance/:propertyId', requireAuth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { userId } = req;
    
    const startTime = Date.now();
    
    console.log(`🔍 CoreLogic enhancement requested for property ${propertyId} by user ${userId}`);
    
    // Check if user confirms the cost
    const { confirmPayment = false } = req.body;
    
    if (!confirmPayment) {
      return res.status(400).json({
        success: false,
        error: 'Payment confirmation required',
        message: 'Please confirm you want to use credits for CoreLogic data enhancement',
        pricing: corelogicService.getPricingInfo(),
        action_required: 'Set confirmPayment: true in request body to proceed'
      });
    }
    
    // Request CoreLogic data
    const result = await corelogicService.getCoreLogicData(propertyId, userId);
    
    const processingTime = Date.now() - startTime;
    
    res.json({
      success: true,
      data: {
        property_id: propertyId,
        corelogic_data: result.data,
        billing: {
          credits_used: result.creditsUsed,
          cached: result.cached,
          expires_at: result.expiresAt
        },
        performance: {
          processing_time_ms: processingTime,
          request_date: result.requestDate
        }
      },
      message: result.cached 
        ? 'CoreLogic data retrieved from cache (no charge)'
        : `CoreLogic data enhanced successfully (${result.creditsUsed} credits used)`
    });
    
  } catch (error) {
    console.error(`❌ CoreLogic enhancement failed:`, error);
    
    // Handle specific error types
    let statusCode = 500;
    let errorType = 'enhancement_failed';
    
    if (error.message.includes('premium subscription')) {
      statusCode = 403;
      errorType = 'subscription_required';
    } else if (error.message.includes('Insufficient credits')) {
      statusCode = 402;
      errorType = 'insufficient_credits';
    } else if (error.message.includes('not found')) {
      statusCode = 404;
      errorType = 'property_not_found';
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorType,
      message: error.message,
      property_id: req.params.propertyId,
      user_id: req.userId
    });
  }
});

/**
 * 📊 GET /api/corelogic/usage
 * Get user's CoreLogic usage statistics
 */
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const { userId } = req;
    const stats = await corelogicService.getUserUsageStats(userId);
    
    res.json({
      success: true,
      data: stats,
      message: 'Usage statistics retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage statistics',
      message: error.message
    });
  }
});

/**
 * 🔍 GET /api/corelogic/property/:propertyId/status
 * Check if CoreLogic data is available for a property (without purchasing)
 */
router.get('/property/:propertyId/status', requireAuth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { userId } = req;
    
    const { CoreLogicRequest } = require('../services/corelogicLazyService');
    
    // Check if user has existing data
    const existingRequest = await CoreLogicRequest.findOne({
      userId,
      propertyId,
      requestStatus: 'completed',
      expiresAt: { $gt: new Date() }
    });
    
    const hasData = !!existingRequest;
    
    res.json({
      success: true,
      data: {
        property_id: propertyId,
        has_corelogic_data: hasData,
        data_status: hasData ? 'available' : 'not_enhanced',
        expires_at: existingRequest?.expiresAt,
        last_updated: existingRequest?.requestDate,
        pricing: hasData ? null : corelogicService.getPricingInfo()
      },
      message: hasData 
        ? 'CoreLogic data available for this property'
        : 'CoreLogic data not yet enhanced for this property'
    });
    
  } catch (error) {
    console.error('❌ Error checking property status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check property status',
      message: error.message
    });
  }
});

/**
 * 🗂️ GET /api/corelogic/property/:propertyId/preview
 * Get a preview of what CoreLogic data would include (without purchasing)
 */
router.get('/property/:propertyId/preview', requireAuth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    const { MarketplaceListing } = require('../services/marketplaceBatchService');
    
    // Get basic property info
    const property = await MarketplaceListing.findOne({ id: propertyId });
    
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
        message: `Property ${propertyId} not found in marketplace`
      });
    }
    
    // Generate preview of what would be included
    const preview = {
      property_id: propertyId,
      property_address: property.address,
      basic_info: {
        price: property.price,
        beds: property.beds,
        baths: property.baths,
        sqft: property.sqft
      },
      corelogic_enhancement_preview: {
        available_data: [
          {
            category: 'Automated Valuation Model (AVM)',
            description: 'Professional property valuation with confidence scoring',
            sample_fields: ['estimate', 'confidence', 'methodology']
          },
          {
            category: 'Market Trends',
            description: '1, 3, and 5-year appreciation history and forecasts',
            sample_fields: ['appreciation_rates', 'days_on_market', 'market_velocity']
          },
          {
            category: 'Risk Assessment',
            description: 'Flood zones, crime scores, natural disaster probabilities',
            sample_fields: ['flood_risk', 'crime_score', 'disaster_risk']
          },
          {
            category: 'School Information',
            description: 'Nearby schools with ratings and distances',
            sample_fields: ['elementary', 'middle', 'high_school']
          },
          {
            category: 'Investment Metrics',
            description: 'Cap rates, cash-on-cash returns, rental yields',
            sample_fields: ['cap_rate', 'cash_return', 'vacancy_rate']
          },
          {
            category: 'Comparable Sales',
            description: 'Recent sales of similar properties in the area',
            sample_fields: ['comp_addresses', 'sale_prices', 'sale_dates']
          }
        ],
        pricing: corelogicService.getPricingInfo(),
        data_freshness: '30-day cache, professionally updated'
      }
    };
    
    res.json({
      success: true,
      data: preview,
      message: 'CoreLogic data preview - sign in and confirm payment to access full report'
    });
    
  } catch (error) {
    console.error('❌ Error generating preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate preview',
      message: error.message
    });
  }
});

/**
 * 🧹 POST /api/corelogic/admin/cleanup
 * Admin endpoint to cleanup expired requests
 */
router.post('/admin/cleanup', async (req, res) => {
  try {
    // Add admin authentication check here if needed
    const deletedCount = await corelogicService.cleanupExpiredRequests();
    
    res.json({
      success: true,
      data: {
        deleted_requests: deletedCount
      },
      message: `Cleanup completed - removed ${deletedCount} expired requests`
    });
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup operation failed',
      message: error.message
    });
  }
});

module.exports = router;
