const mongoose = require('mongoose');

const NetworkAnalyticsSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: [
      'openai',
      'corelogic',
      'attom',
      'zillow',
      'greatschools',
      'googlemaps',
      'slack',
      'helpscout',
      'sumsub',
      'other'
    ]
  },
  endpoint: {
    type: String,
    required: true
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    default: 'GET'
  },
  status: {
    type: String,
    required: true,
    enum: ['success', 'error', 'timeout', 'rate_limited']
  },
  responseTime: {
    type: Number, // in milliseconds
    required: true
  },
  statusCode: {
    type: Number // HTTP status code
  },
  requestSize: {
    type: Number, // bytes
    default: 0
  },
  responseSize: {
    type: Number, // bytes
    default: 0
  },
  cost: {
    type: Number, // estimated cost in cents
    default: 0
  },
  errorMessage: {
    type: String
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  requestParams: {
    type: mongoose.Schema.Types.Mixed // Store request parameters (excluding sensitive data)
  },
  cacheHit: {
    type: Boolean,
    default: false
  },
  // Rate limiting info
  rateLimitRemaining: {
    type: Number
  },
  rateLimitResetTime: {
    type: Date
  },
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  // Index for performance
  index: [
    { provider: 1, createdAt: -1 },
    { status: 1, createdAt: -1 },
    { userId: 1, createdAt: -1 },
    { createdAt: -1 }
  ]
});

// Virtual for calculating hourly/daily aggregations
NetworkAnalyticsSchema.virtual('hourBucket').get(function() {
  const date = new Date(this.createdAt);
  date.setMinutes(0, 0, 0);
  return date;
});

NetworkAnalyticsSchema.virtual('dayBucket').get(function() {
  const date = new Date(this.createdAt);
  date.setHours(0, 0, 0, 0);
  return date;
});

// Static methods for analytics
NetworkAnalyticsSchema.statics.getProviderStats = async function(timeRange = 24) {
  const startTime = new Date(Date.now() - timeRange * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: { createdAt: { $gte: startTime } }
    },
    {
      $group: {
        _id: '$provider',
        totalRequests: { $sum: 1 },
        successfulRequests: { 
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        errorRequests: {
          $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] }
        },
        avgResponseTime: { $avg: '$responseTime' },
        totalCost: { $sum: '$cost' },
        cacheHits: {
          $sum: { $cond: ['$cacheHit', 1, 0] }
        }
      }
    },
    {
      $addFields: {
        successRate: {
          $multiply: [
            { $divide: ['$successfulRequests', '$totalRequests'] },
            100
          ]
        },
        cacheHitRate: {
          $multiply: [
            { $divide: ['$cacheHits', '$totalRequests'] },
            100
          ]
        }
      }
    },
    {
      $sort: { totalRequests: -1 }
    }
  ]);
};

NetworkAnalyticsSchema.statics.getHourlyTrends = async function(provider = null, hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const matchStage = { createdAt: { $gte: startTime } };
  if (provider) {
    matchStage.provider = provider;
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          hour: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } },
          provider: '$provider'
        },
        requests: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
        totalCost: { $sum: '$cost' }
      }
    },
    {
      $sort: { '_id.hour': 1 }
    }
  ]);
};

NetworkAnalyticsSchema.statics.getTopEndpoints = async function(provider, limit = 10) {
  return this.aggregate([
    { $match: { provider } },
    {
      $group: {
        _id: '$endpoint',
        totalRequests: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        successRate: {
          $avg: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        totalCost: { $sum: '$cost' }
      }
    },
    {
      $addFields: {
        successRatePercent: { $multiply: ['$successRate', 100] }
      }
    },
    {
      $sort: { totalRequests: -1 }
    },
    {
      $limit: limit
    }
  ]);
};

NetworkAnalyticsSchema.statics.getErrorAnalysis = async function(timeRange = 24) {
  const startTime = new Date(Date.now() - timeRange * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: { 
        createdAt: { $gte: startTime },
        status: 'error'
      }
    },
    {
      $group: {
        _id: {
          provider: '$provider',
          statusCode: '$statusCode',
          errorMessage: '$errorMessage'
        },
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        lastOccurrence: { $max: '$createdAt' }
      }
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 20
    }
  ]);
};

module.exports = mongoose.model('NetworkAnalytics', NetworkAnalyticsSchema);
