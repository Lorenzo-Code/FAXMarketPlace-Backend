const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../../middleware/auth');

// Import all cache models
const SearchCache = require('../../../models/SearchCache');
const CoreLogicCache = require('../../../models/CoreLogicCache');
const ZillowImageCache = require('../../../models/ZillowImageCache');

// 📊 GET Global Cache Statistics - Admin only
router.get('/stats', verifyToken, async (req, res) => {
  try {
    // Only allow admin users to view global cache stats
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get statistics from all cache models
    const [searchStats, corelogicStats, zillowStats] = await Promise.all([
      SearchCache.getCacheStats(),
      CoreLogicCache.getCacheStats(),
      ZillowImageCache.getCacheStats()
    ]);

    // Calculate overall totals
    const totalCachedQueries = (searchStats.totalCachedQueries || 0) + 
                              (corelogicStats.totalCachedQueries || 0) + 
                              (zillowStats.totalCachedQueries || 0);

    const totalCacheHits = (searchStats.totalCacheHits || 0) + 
                          (corelogicStats.totalCacheHits || 0) + 
                          (zillowStats.totalCacheHits || 0);

    const totalCostSaved = (searchStats.totalCostSaved || 0) + 
                          (corelogicStats.totalCostSaved || 0) + 
                          (zillowStats.totalCostSaved || 0);

    // Calculate global cache efficiency
    const globalHitRate = totalCachedQueries > 0 ? (totalCacheHits / totalCachedQueries) * 100 : 0;
    const avgHitsPerQuery = totalCachedQueries > 0 ? totalCacheHits / totalCachedQueries : 0;

    const response = {
      globalSummary: {
        totalCachedQueries,
        totalCacheHits,
        totalCostSaved,
        globalHitRate,
        avgHitsPerQuery,
        estimatedMonthlySavings: totalCostSaved * 30 // Rough monthly projection
      },
      
      byService: {
        aiSearch: {
          name: 'AI Property Search',
          ...searchStats,
          hitRate: searchStats.totalCachedQueries > 0 ? 
                   (searchStats.totalCacheHits / searchStats.totalCachedQueries) * 100 : 0,
          avgApiCost: 0.10, // Estimated cost per AI search
          description: 'Caches AI-generated property search results'
        },
        
        corelogic: {
          name: 'CoreLogic Property Intelligence',
          ...corelogicStats,
          hitRate: corelogicStats.totalCachedQueries > 0 ? 
                   (corelogicStats.totalCacheHits / corelogicStats.totalCachedQueries) * 100 : 0,
          avgApiCost: 0.15, // Estimated cost per CoreLogic call
          description: 'Caches expensive CoreLogic property data and analytics'
        },
        
        zillowImages: {
          name: 'Zillow Property Images',
          ...zillowStats,
          hitRate: zillowStats.totalCachedQueries > 0 ? 
                   (zillowStats.totalCacheHits / zillowStats.totalCachedQueries) * 100 : 0,
          avgApiCost: 0.05, // Estimated cost per Zillow image call
          description: 'Caches property photos and visual content',
          totalImages: zillowStats.totalImagesCached || 0
        }
      },
      
      // Performance insights
      insights: {
        topPerformer: getBestCacheService(searchStats, corelogicStats, zillowStats),
        recommendations: generateRecommendations(searchStats, corelogicStats, zillowStats),
        costProjections: {
          currentMonthSavings: totalCostSaved,
          projectedYearlySavings: totalCostSaved * 365,
          breakdownByService: {
            aiSearch: searchStats.totalCostSaved || 0,
            corelogic: corelogicStats.totalCostSaved || 0,
            zillowImages: zillowStats.totalCostSaved || 0
          }
        }
      },
      
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching global cache stats:', error);
    res.status(500).json({ error: 'Failed to fetch global cache statistics' });
  }
});

// 📈 GET Cache Performance Over Time - Admin only  
router.get('/performance', verifyToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const days = parseInt(req.query.days) || 7;
    
    // Get performance data from all cache services
    const [searchPerf, corelogicPerf, zillowPerf] = await Promise.all([
      SearchCache.getCacheStats ? SearchCache.getCacheStats() : Promise.resolve({}),
      CoreLogicCache.getCachePerformance ? CoreLogicCache.getCachePerformance(days) : Promise.resolve({}),
      ZillowImageCache.getCachePerformance ? ZillowImageCache.getCachePerformance(days) : Promise.resolve({})
    ]);

    const response = {
      periodDays: days,
      performance: {
        aiSearch: searchPerf,
        corelogic: corelogicPerf,
        zillowImages: zillowPerf
      },
      aggregatedMetrics: {
        totalHits: (searchPerf.totalHits || 0) + (corelogicPerf.totalHits || 0) + (zillowPerf.totalHits || 0),
        totalSavings: (searchPerf.totalSavings || 0) + (corelogicPerf.totalSavings || 0) + (zillowPerf.totalSavings || 0),
        newCacheEntries: (searchPerf.newCacheEntries || 0) + (corelogicPerf.newCacheEntries || 0) + (zillowPerf.newCacheEntries || 0)
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching cache performance:', error);
    res.status(500).json({ error: 'Failed to fetch cache performance data' });
  }
});

// 🧹 POST Global Cache Cleanup - Admin only
router.post('/cleanup', verifyToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🧹 Starting global cache cleanup...');
    
    // Run cleanup on all cache models
    const cleanupResults = await Promise.allSettled([
      SearchCache.cleanupCache ? SearchCache.cleanupCache() : Promise.resolve(0),
      CoreLogicCache.cleanupCache ? CoreLogicCache.cleanupCache() : Promise.resolve(0),
      ZillowImageCache.cleanupCache ? ZillowImageCache.cleanupCache() : Promise.resolve(0)
    ]);

    const results = {
      success: true,
      cleanup: {
        aiSearch: cleanupResults[0].status === 'fulfilled' ? cleanupResults[0].value : 0,
        corelogic: cleanupResults[1].status === 'fulfilled' ? cleanupResults[1].value : 0,
        zillowImages: cleanupResults[2].status === 'fulfilled' ? cleanupResults[2].value : 0
      },
      totalDeleted: cleanupResults.reduce((sum, result) => {
        return sum + (result.status === 'fulfilled' ? result.value : 0);
      }, 0),
      timestamp: new Date().toISOString()
    };

    console.log(`🧹 Global cleanup completed: ${results.totalDeleted} entries removed`);
    res.json(results);
  } catch (error) {
    console.error('❌ Error during global cache cleanup:', error);
    res.status(500).json({ error: 'Failed to cleanup caches' });
  }
});

// 🎯 GET Most Valuable Cache Entries - Admin only
router.get('/valuable', verifyToken, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const limit = parseInt(req.query.limit) || 10;

    // Get most valuable cache entries from each service
    const [valuableSearch, valuableCorelogic, valuableZillow] = await Promise.allSettled([
      SearchCache.find ? SearchCache.find({}).sort({ accessCount: -1 }).limit(limit/3).lean() : Promise.resolve([]),
      CoreLogicCache.getMostValuableCache ? CoreLogicCache.getMostValuableCache(limit/3) : Promise.resolve([]),
      ZillowImageCache.getPopularProperties ? ZillowImageCache.getPopularProperties(limit/3) : Promise.resolve([])
    ]);

    const response = {
      mostValuable: {
        aiSearch: valuableSearch.status === 'fulfilled' ? valuableSearch.value : [],
        corelogic: valuableCorelogic.status === 'fulfilled' ? valuableCorelogic.value : [],
        zillowImages: valuableZillow.status === 'fulfilled' ? valuableZillow.value : []
      },
      summary: {
        message: 'These cache entries have provided the highest cost savings',
        totalEntries: limit,
        note: 'Consider preserving these high-value cache entries during cleanup'
      }
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching valuable cache entries:', error);
    res.status(500).json({ error: 'Failed to fetch valuable cache data' });
  }
});

// 📊 Helper function to determine best performing cache service
function getBestCacheService(searchStats, corelogicStats, zillowStats) {
  const services = [
    { name: 'AI Search', hitRate: searchStats.totalCachedQueries > 0 ? (searchStats.totalCacheHits / searchStats.totalCachedQueries) * 100 : 0, savings: searchStats.totalCostSaved || 0 },
    { name: 'CoreLogic', hitRate: corelogicStats.totalCachedQueries > 0 ? (corelogicStats.totalCacheHits / corelogicStats.totalCachedQueries) * 100 : 0, savings: corelogicStats.totalCostSaved || 0 },
    { name: 'Zillow Images', hitRate: zillowStats.totalCachedQueries > 0 ? (zillowStats.totalCacheHits / zillowStats.totalCachedQueries) * 100 : 0, savings: zillowStats.totalCostSaved || 0 }
  ];
  
  // Sort by combination of hit rate and cost savings
  return services.sort((a, b) => {
    const scoreA = (a.hitRate * 0.6) + (a.savings * 100 * 0.4);
    const scoreB = (b.hitRate * 0.6) + (b.savings * 100 * 0.4);
    return scoreB - scoreA;
  })[0];
}

// 💡 Helper function to generate cache recommendations
function generateRecommendations(searchStats, corelogicStats, zillowStats) {
  const recommendations = [];
  
  // Check hit rates
  const searchHitRate = searchStats.totalCachedQueries > 0 ? (searchStats.totalCacheHits / searchStats.totalCachedQueries) * 100 : 0;
  const corelogicHitRate = corelogicStats.totalCachedQueries > 0 ? (corelogicStats.totalCacheHits / corelogicStats.totalCachedQueries) * 100 : 0;
  const zillowHitRate = zillowStats.totalCachedQueries > 0 ? (zillowStats.totalCacheHits / zillowStats.totalCachedQueries) * 100 : 0;
  
  if (searchHitRate < 70) {
    recommendations.push({
      service: 'AI Search',
      priority: 'medium',
      suggestion: 'Consider increasing cache TTL or optimizing query normalization for AI search results'
    });
  }
  
  if (corelogicHitRate < 80) {
    recommendations.push({
      service: 'CoreLogic',
      priority: 'high',
      suggestion: 'CoreLogic API is expensive - focus on improving hit rate through better caching strategies'
    });
  }
  
  if (zillowHitRate < 75) {
    recommendations.push({
      service: 'Zillow Images',
      priority: 'low',
      suggestion: 'Image caching could be improved - consider pre-fetching popular property images'
    });
  }
  
  // Check cost efficiency
  const totalSavings = (searchStats.totalCostSaved || 0) + (corelogicStats.totalCostSaved || 0) + (zillowStats.totalCostSaved || 0);
  if (totalSavings < 50) {
    recommendations.push({
      service: 'Global',
      priority: 'high', 
      suggestion: 'Overall cost savings are low - consider implementing caching for more expensive API endpoints'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      service: 'Global',
      priority: 'info',
      suggestion: 'Cache performance is optimal! Consider monitoring trends for continued optimization'
    });
  }
  
  return recommendations;
}

module.exports = router;
