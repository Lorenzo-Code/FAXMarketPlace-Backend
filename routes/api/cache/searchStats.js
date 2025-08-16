const express = require('express');
const router = express.Router();
const SearchCache = require('../../../models/SearchCache');
const { verifyToken } = require('../../../middleware/auth');

// 📊 GET Cache Statistics - Admin only
router.get('/stats', verifyToken, async (req, res) => {
  try {
    // Only allow admin users to view cache stats
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get comprehensive cache statistics
    const stats = await SearchCache.getCacheStats();
    
    // Get recent cache entries
    const recentEntries = await SearchCache.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .select('originalQuery accessCount createdAt lastAccessed originalApiCost')
      .lean();

    // Get most popular searches
    const popularSearches = await SearchCache.find({})
      .sort({ accessCount: -1 })
      .limit(10)
      .select('originalQuery accessCount createdAt lastAccessed')
      .lean();

    // Get cost savings over time periods
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [dailyStats, weeklyStats, monthlyStats] = await Promise.all([
      SearchCache.aggregate([
        { $match: { createdAt: { $gte: yesterday } } },
        { $group: { 
          _id: null, 
          totalQueries: { $sum: 1 },
          totalHits: { $sum: '$accessCount' },
          totalSaved: { $sum: '$originalApiCost' }
        } }
      ]),
      SearchCache.aggregate([
        { $match: { createdAt: { $gte: weekAgo } } },
        { $group: { 
          _id: null, 
          totalQueries: { $sum: 1 },
          totalHits: { $sum: '$accessCount' },
          totalSaved: { $sum: '$originalApiCost' }
        } }
      ]),
      SearchCache.aggregate([
        { $match: { createdAt: { $gte: monthAgo } } },
        { $group: { 
          _id: null, 
          totalQueries: { $sum: 1 },
          totalHits: { $sum: '$accessCount' },
          totalSaved: { $sum: '$originalApiCost' }
        } }
      ])
    ]);

    const response = {
      overall: stats,
      timePeriods: {
        daily: dailyStats[0] || { totalQueries: 0, totalHits: 0, totalSaved: 0 },
        weekly: weeklyStats[0] || { totalQueries: 0, totalHits: 0, totalSaved: 0 },
        monthly: monthlyStats[0] || { totalQueries: 0, totalHits: 0, totalSaved: 0 }
      },
      recentSearches: recentEntries,
      popularSearches: popularSearches,
      cacheEfficiency: {
        hitRate: stats.totalCachedQueries > 0 ? (stats.totalCacheHits / stats.totalCachedQueries) * 100 : 0,
        avgAccessPerQuery: stats.avgCacheHits,
        costSavingsPerHit: stats.totalCacheHits > 0 ? stats.totalCostSaved / stats.totalCacheHits : 0
      }
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching cache stats:', error);
    res.status(500).json({ error: 'Failed to fetch cache statistics' });
  }
});

// 🧹 POST Cleanup Cache - Admin only
router.post('/cleanup', verifyToken, async (req, res) => {
  try {
    // Only allow admin users to cleanup cache
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const deletedCount = await SearchCache.cleanupCache();
    
    res.json({
      success: true,
      deletedCount,
      message: `Successfully cleaned up ${deletedCount} old cache entries`
    });
  } catch (error) {
    console.error('❌ Error cleaning up cache:', error);
    res.status(500).json({ error: 'Failed to cleanup cache' });
  }
});

// 🔍 GET Search History - Admin only
router.get('/history', verifyToken, async (req, res) => {
  try {
    // Only allow admin users to view search history
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const searches = await SearchCache.find({})
      .sort({ lastAccessed: -1 })
      .skip(skip)
      .limit(limit)
      .select('originalQuery searchFilters accessCount createdAt lastAccessed originalApiCost')
      .lean();

    const total = await SearchCache.countDocuments({});

    res.json({
      searches,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching search history:', error);
    res.status(500).json({ error: 'Failed to fetch search history' });
  }
});

module.exports = router;
