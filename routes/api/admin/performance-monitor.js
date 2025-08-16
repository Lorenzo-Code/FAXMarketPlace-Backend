/**
 * 🔍 Performance Monitoring Endpoint
 * 
 * Provides real-time performance metrics and optimization tracking
 * for the enhanced backend system.
 */

const express = require('express');
const router = express.Router();
const enhancedCache = require('../../../services/enhancedCacheService');
const { PropertyBatchProcessor } = require('../../../services/propertyBatchProcessor');
const { DataSourceRouter } = require('../../../services/dataSourceRouter');
const { performance } = require('perf_hooks');

// Initialize services for monitoring
const dataSourceRouter = new DataSourceRouter();

// Performance tracking storage
let performanceMetrics = {
  startTime: Date.now(),
  totalRequests: 0,
  averageResponseTime: 0,
  batchProcessingStats: {
    totalBatches: 0,
    totalPropertiesProcessed: 0,
    averageBatchSize: 0,
    averageProcessingTimePerProperty: 0,
    parallelizationEfficiency: 0
  },
  optimizationImpact: {
    estimatedTimeSaved: 0,
    estimatedCostSaved: 0,
    errorRateReduction: 0
  }
};

/**
 * GET /api/admin/performance - Get comprehensive performance metrics
 */
router.get('/', async (req, res) => {
  try {
    const currentTime = Date.now();
    const uptime = (currentTime - performanceMetrics.startTime) / 1000; // seconds

    // Get cache performance
    const cacheStats = enhancedCache.getStats();
    
    // Get data source routing stats
    const routingStats = dataSourceRouter.getRoutingStats();
    
    // Calculate overall system health score
    const healthScore = calculateSystemHealthScore(cacheStats, routingStats, performanceMetrics);
    
    const report = {
      systemOverview: {
        uptime: Math.round(uptime),
        healthScore: parseFloat(healthScore.toFixed(1)),
        totalRequests: performanceMetrics.totalRequests,
        averageResponseTime: parseFloat(performanceMetrics.averageResponseTime.toFixed(2)),
        timestamp: new Date().toISOString()
      },
      
      caching: {
        performance: cacheStats.performance,
        redis: cacheStats.redis,
        mongodb: cacheStats.mongodb,
        storage: cacheStats.storage,
        efficiency: {
          totalSavings: `$${cacheStats.performance.costSavings.toFixed(2)}`,
          avgResponseTime: `${cacheStats.performance.avgResponseTime.toFixed(2)}ms`,
          hitRate: `${cacheStats.performance.hitRate}%`
        }
      },
      
      dataSourceRouting: {
        stats: routingStats,
        efficiency: {
          optimalRouting: calculateOptimalRoutingPercentage(routingStats),
          costOptimization: `${((1 - routingStats.performance.estimatedCostSavings / 100) * 100).toFixed(1)}% cost reduction`,
          decisionSpeed: `${routingStats.performance.avgDecisionTime.toFixed(2)}ms avg decision time`
        }
      },
      
      batchProcessing: {
        stats: performanceMetrics.batchProcessingStats,
        efficiency: {
          parallelization: `${performanceMetrics.batchProcessingStats.parallelizationEfficiency.toFixed(1)}%`,
          throughput: `${(performanceMetrics.batchProcessingStats.totalPropertiesProcessed / uptime).toFixed(2)} properties/second`,
          avgBatchTime: `${performanceMetrics.batchProcessingStats.averageProcessingTimePerProperty.toFixed(2)}ms per property`
        }
      },
      
      optimizationImpact: {
        timeSaved: `${(performanceMetrics.optimizationImpact.estimatedTimeSaved / 1000).toFixed(2)}s total`,
        costSaved: `$${performanceMetrics.optimizationImpact.estimatedCostSaved.toFixed(2)}`,
        errorReduction: `${performanceMetrics.optimizationImpact.errorRateReduction.toFixed(1)}% fewer errors`,
        efficiency: `${((performanceMetrics.optimizationImpact.estimatedTimeSaved / (uptime * 1000)) * 100).toFixed(2)}% time optimization`
      },
      
      recommendations: generateOptimizationRecommendations(cacheStats, routingStats, performanceMetrics)
    };

    res.json(report);

  } catch (error) {
    console.error('❌ Performance monitoring error:', error);
    res.status(500).json({
      error: 'Failed to retrieve performance metrics',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/performance/test - Run performance test
 */
router.post('/test', async (req, res) => {
  const { testType = 'comprehensive', propertyCount = 20 } = req.body;
  
  console.log(`🧪 Starting performance test: ${testType} with ${propertyCount} properties`);
  
  try {
    const testStartTime = performance.now();
    
    let testResults = {};
    
    if (testType === 'batch-processing' || testType === 'comprehensive') {
      // Test batch processing performance
      const batchTest = await runBatchProcessingTest(propertyCount);
      testResults.batchProcessing = batchTest;
    }
    
    if (testType === 'caching' || testType === 'comprehensive') {
      // Test caching performance
      const cacheTest = await runCachingTest();
      testResults.caching = cacheTest;
    }
    
    if (testType === 'routing' || testType === 'comprehensive') {
      // Test data source routing
      const routingTest = await runRoutingTest();
      testResults.routing = routingTest;
    }
    
    const totalTestTime = performance.now() - testStartTime;
    
    res.json({
      testType,
      testDuration: `${(totalTestTime / 1000).toFixed(2)}s`,
      results: testResults,
      summary: generateTestSummary(testResults, totalTestTime),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Performance test failed:', error);
    res.status(500).json({
      error: 'Performance test failed',
      details: error.message
    });
  }
});

/**
 * 🧪 Run batch processing performance test
 */
async function runBatchProcessingTest(propertyCount) {
  const mockProperties = generateMockProperties(propertyCount);
  
  console.log(`🚀 Testing batch processing with ${propertyCount} properties`);
  
  const batchProcessor = new PropertyBatchProcessor();
  const startTime = performance.now();
  
  const result = await batchProcessor.processPropertiesBatch(mockProperties);
  
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  // Update global stats
  performanceMetrics.batchProcessingStats.totalBatches++;
  performanceMetrics.batchProcessingStats.totalPropertiesProcessed += propertyCount;
  performanceMetrics.batchProcessingStats.averageBatchSize = 
    performanceMetrics.batchProcessingStats.totalPropertiesProcessed / 
    performanceMetrics.batchProcessingStats.totalBatches;
  
  const processingTimePerProperty = duration / propertyCount;
  performanceMetrics.batchProcessingStats.averageProcessingTimePerProperty = processingTimePerProperty;
  
  // Estimate parallelization efficiency (compared to theoretical sequential processing)
  const estimatedSequentialTime = propertyCount * 100; // Assume 100ms per property sequentially
  const efficiency = Math.max(0, ((estimatedSequentialTime - duration) / estimatedSequentialTime) * 100);
  performanceMetrics.batchProcessingStats.parallelizationEfficiency = efficiency;
  
  return {
    propertyCount,
    duration: `${(duration / 1000).toFixed(2)}s`,
    throughput: `${(propertyCount / (duration / 1000)).toFixed(2)} properties/second`,
    avgTimePerProperty: `${processingTimePerProperty.toFixed(2)}ms`,
    parallelizationEfficiency: `${efficiency.toFixed(1)}%`,
    dataQuality: {
      successful: result.dataQualityStats.excellent + result.dataQualityStats.good,
      total: result.dataQualityStats.totalProcessed,
      successRate: `${((result.dataQualityStats.excellent + result.dataQualityStats.good) / result.dataQualityStats.totalProcessed * 100).toFixed(1)}%`
    }
  };
}

/**
 * 💾 Run caching performance test
 */
async function runCachingTest() {
  console.log('💾 Testing caching performance');
  
  const testCacheKey = 'test_performance_cache';
  const testData = { test: 'performance', timestamp: Date.now() };
  
  // Test cache write
  const writeStart = performance.now();
  await enhancedCache.set('test', { query: 'performance test' }, testData);
  const writeTime = performance.now() - writeStart;
  
  // Test cache read (should hit)
  const readStart = performance.now();
  const cachedResult = await enhancedCache.get('test', { query: 'performance test' });
  const readTime = performance.now() - readStart;
  
  return {
    writeTime: `${writeTime.toFixed(2)}ms`,
    readTime: `${readTime.toFixed(2)}ms`,
    cacheHit: cachedResult.cached,
    efficiency: `${((writeTime + readTime) / 2).toFixed(2)}ms avg operation time`
  };
}

/**
 * 🧠 Run data source routing test
 */
async function runRoutingTest() {
  console.log('🧠 Testing data source routing');
  
  const testRequests = [
    { query: '123 Main St, Houston, TX', city: 'Houston' }, // Address search
    { query: '3 bedroom houses under 300k in Houston', city: 'Houston', maxPrice: 300000, beds: 3 }, // Filtered search
    { query: 'properties in Houston', city: 'Houston' } // General search
  ];
  
  const results = [];
  
  for (const request of testRequests) {
    const startTime = performance.now();
    const routingDecision = await dataSourceRouter.determineOptimalRoute(request);
    const endTime = performance.now();
    
    results.push({
      requestType: routingDecision.searchAnalysis?.searchType || 'unknown',
      strategy: routingDecision.strategy,
      decisionTime: `${(endTime - startTime).toFixed(2)}ms`,
      estimatedCost: `$${routingDecision.estimatedCost.toFixed(3)}`,
      qualityScore: `${routingDecision.qualityScore}/10`
    });
  }
  
  return {
    totalTests: testRequests.length,
    results,
    averageDecisionTime: `${(results.reduce((sum, r) => sum + parseFloat(r.decisionTime), 0) / results.length).toFixed(2)}ms`
  };
}

/**
 * 📊 Generate mock properties for testing
 */
function generateMockProperties(count) {
  const mockProperties = [];
  const cities = ['Houston', 'Dallas', 'Austin', 'San Antonio'];
  const streets = ['Main St', 'Oak Ave', 'Pine Dr', 'Maple Ln', 'Cedar Ct'];
  
  for (let i = 0; i < count; i++) {
    const city = cities[Math.floor(Math.random() * cities.length)];
    const street = streets[Math.floor(Math.random() * streets.length)];
    
    mockProperties.push({
      address: `${Math.floor(Math.random() * 9999) + 1} ${street}, ${city}, TX 7${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}`,
      price: Math.floor(Math.random() * 500000) + 100000,
      bedrooms: Math.floor(Math.random() * 5) + 1,
      bathrooms: Math.floor(Math.random() * 3) + 1,
      livingArea: Math.floor(Math.random() * 2000) + 800,
      latitude: 29.7 + (Math.random() * 0.5 - 0.25),
      longitude: -95.4 + (Math.random() * 0.5 - 0.25),
      zpid: Math.floor(Math.random() * 1000000),
      dataSource: 'mock'
    });
  }
  
  return mockProperties;
}

/**
 * 📊 Calculate system health score
 */
function calculateSystemHealthScore(cacheStats, routingStats, perfMetrics) {
  let score = 100;
  
  // Cache performance impact
  if (cacheStats.performance.hitRate < 50) score -= 20;
  else if (cacheStats.performance.hitRate < 70) score -= 10;
  else if (cacheStats.performance.hitRate > 90) score += 5;
  
  // Response time impact
  if (cacheStats.performance.avgResponseTime > 1000) score -= 15;
  else if (cacheStats.performance.avgResponseTime > 500) score -= 10;
  else if (cacheStats.performance.avgResponseTime < 100) score += 5;
  
  // Routing efficiency impact
  if (routingStats.performance.avgDecisionTime > 50) score -= 10;
  else if (routingStats.performance.avgDecisionTime < 10) score += 5;
  
  // Batch processing efficiency
  if (perfMetrics.batchProcessingStats.parallelizationEfficiency < 50) score -= 15;
  else if (perfMetrics.batchProcessingStats.parallelizationEfficiency > 80) score += 10;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * 📈 Calculate optimal routing percentage
 */
function calculateOptimalRoutingPercentage(routingStats) {
  const total = routingStats.totalRoutes;
  if (total === 0) return 0;
  
  // Consider Zillow primary as optimal for most searches (cost-effective)
  // Parallel as optimal for address searches
  // CoreLogic primary as optimal for detailed analysis needs
  return ((routingStats.distribution.zillow.count + routingStats.distribution.parallel.count) / total * 100).toFixed(1);
}

/**
 * 💡 Generate optimization recommendations
 */
function generateOptimizationRecommendations(cacheStats, routingStats, perfMetrics) {
  const recommendations = [];
  
  if (cacheStats.performance.hitRate < 70) {
    recommendations.push({
      type: 'caching',
      priority: 'high',
      suggestion: 'Consider implementing cache warming strategies to improve hit rate',
      expectedImpact: 'Reduce API costs by 20-30%'
    });
  }
  
  if (cacheStats.performance.avgResponseTime > 500) {
    recommendations.push({
      type: 'performance',
      priority: 'medium',
      suggestion: 'Optimize cache key generation or consider Redis clustering',
      expectedImpact: 'Improve response time by 30-50%'
    });
  }
  
  if (routingStats.distribution.corelogic.percentage > 50) {
    recommendations.push({
      type: 'cost-optimization',
      priority: 'medium',
      suggestion: 'Review CoreLogic routing decisions - consider Zillow primary for more searches',
      expectedImpact: 'Reduce API costs by 15-25%'
    });
  }
  
  if (perfMetrics.batchProcessingStats.parallelizationEfficiency < 70) {
    recommendations.push({
      type: 'batch-processing',
      priority: 'low',
      suggestion: 'Tune batch size and concurrency limits for better parallelization',
      expectedImpact: 'Improve processing speed by 10-20%'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'maintenance',
      priority: 'low',
      suggestion: 'System is performing well - continue monitoring',
      expectedImpact: 'Maintain current performance levels'
    });
  }
  
  return recommendations;
}

/**
 * 📋 Generate test summary
 */
function generateTestSummary(testResults, totalTestTime) {
  const summary = {
    overallPerformance: 'good',
    keyFindings: [],
    totalTestTime: `${(totalTestTime / 1000).toFixed(2)}s`
  };
  
  if (testResults.batchProcessing) {
    const throughput = parseFloat(testResults.batchProcessing.throughput.split(' ')[0]);
    if (throughput > 50) {
      summary.keyFindings.push('Excellent batch processing throughput');
      summary.overallPerformance = 'excellent';
    } else if (throughput > 20) {
      summary.keyFindings.push('Good batch processing performance');
    } else {
      summary.keyFindings.push('Batch processing could be optimized');
      summary.overallPerformance = 'needs improvement';
    }
  }
  
  if (testResults.caching) {
    const cacheTime = parseFloat(testResults.caching.readTime.split('ms')[0]);
    if (cacheTime < 10) {
      summary.keyFindings.push('Excellent cache performance');
    } else if (cacheTime < 50) {
      summary.keyFindings.push('Good cache response times');
    } else {
      summary.keyFindings.push('Cache performance could be improved');
    }
  }
  
  if (testResults.routing) {
    const avgTime = parseFloat(testResults.routing.averageDecisionTime.split('ms')[0]);
    if (avgTime < 10) {
      summary.keyFindings.push('Excellent routing decision speed');
    } else if (avgTime < 25) {
      summary.keyFindings.push('Good routing performance');
    } else {
      summary.keyFindings.push('Routing decisions taking longer than optimal');
    }
  }
  
  return summary;
}

module.exports = router;
