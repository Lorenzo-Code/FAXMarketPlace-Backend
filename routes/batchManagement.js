/**
 * 🔧⚡ Batch Service Management Routes
 * 
 * Admin/development endpoints for:
 * 1. Checking batch service status
 * 2. Manually triggering batch updates
 * 3. Managing batch service configuration
 */

const express = require('express');
const router = express.Router();

/**
 * 📊 GET /api/batch/status
 * Get current batch service status and statistics
 */
router.get('/status', (req, res) => {
  try {
    const batchService = req.app.locals.batchService;
    
    if (!batchService) {
      return res.status(503).json({
        success: false,
        error: 'Batch service not available',
        message: 'Batch service not initialized'
      });
    }

    const status = batchService.getStatus();
    
    res.json({
      success: true,
      data: {
        service_status: status.isRunning ? 'running' : 'idle',
        last_batch_run: status.lastBatchRun,
        batch_stats: status.batchStats,
        uptime: process.uptime(),
        memory_usage: process.memoryUsage()
      },
      message: `Batch service is ${status.isRunning ? 'running' : 'idle'}`
    });

  } catch (error) {
    console.error('❌ Error fetching batch status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch status',
      message: error.message
    });
  }
});

/**
 * 🔧 POST /api/batch/trigger
 * Manually trigger a batch update (for testing/admin use)
 * 
 * Body:
 * - force: boolean - Force run even if one is in progress
 */
router.post('/trigger', async (req, res) => {
  try {
    const batchService = req.app.locals.batchService;
    const { force = false } = req.body;
    
    if (!batchService) {
      return res.status(503).json({
        success: false,
        error: 'Batch service not available',
        message: 'Batch service not initialized'
      });
    }

    // Check if already running
    const currentStatus = batchService.getStatus();
    if (currentStatus.isRunning && !force) {
      return res.status(409).json({
        success: false,
        error: 'Batch update already running',
        message: 'A batch update is currently in progress. Use force=true to override.',
        data: {
          current_batch_stats: currentStatus.batchStats
        }
      });
    }

    // Trigger manual batch update
    console.log('🔧 Manual batch update triggered via API');
    
    // Don't await - let it run in background
    batchService.triggerManualBatch().catch(error => {
      console.error('❌ Manual batch update failed:', error);
    });

    res.json({
      success: true,
      message: 'Manual batch update triggered successfully',
      data: {
        triggered_at: new Date(),
        force_override: force,
        estimated_duration: '2-5 minutes'
      }
    });

  } catch (error) {
    console.error('❌ Error triggering manual batch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger manual batch update',
      message: error.message
    });
  }
});

/**
 * 📈 GET /api/batch/health
 * Health check endpoint for batch service
 */
router.get('/health', async (req, res) => {
  try {
    const { MarketplaceListing } = require('../services/marketplaceBatchService');
    
    // Check MongoDB connection and recent data
    const recentListings = await MarketplaceListing.countDocuments({
      batchDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    const totalListings = await MarketplaceListing.countDocuments();
    
    const health = {
      database: 'connected',
      recent_listings: recentListings,
      total_listings: totalListings,
      data_freshness: recentListings > 0 ? 'fresh' : 'stale',
      service_uptime: process.uptime(),
      memory_usage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      timestamp: new Date()
    };

    const isHealthy = recentListings > 0;

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      data: health,
      message: isHealthy ? 'Batch service is healthy' : 'Batch service needs attention - no recent data'
    });

  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      message: error.message,
      data: {
        database: 'error',
        timestamp: new Date()
      }
    });
  }
});

/**
 * 🧹 POST /api/batch/cleanup
 * Manually trigger cleanup of old listings
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { MarketplaceListing } = require('../services/marketplaceBatchService');
    const { days_old = 7 } = req.body;
    
    const cutoffDate = new Date(Date.now() - days_old * 24 * 60 * 60 * 1000);
    
    const deleteResult = await MarketplaceListing.deleteMany({
      batchDate: { $lt: cutoffDate }
    });

    res.json({
      success: true,
      data: {
        deleted_count: deleteResult.deletedCount,
        cutoff_date: cutoffDate,
        days_old: days_old
      },
      message: `Cleanup completed - removed ${deleteResult.deletedCount} old listings`
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

/**
 * 📊 GET /api/batch/metrics
 * Detailed metrics about batch operations and performance
 */
router.get('/metrics', async (req, res) => {
  try {
    const { MarketplaceListing } = require('../services/marketplaceBatchService');
    const batchService = req.app.locals.batchService;
    
    // Get batch statistics
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const [
      listingsLast24h,
      listingsLast7d,
      totalListings,
      batchDates
    ] = await Promise.all([
      MarketplaceListing.countDocuments({ batchDate: { $gte: last24h } }),
      MarketplaceListing.countDocuments({ batchDate: { $gte: last7d } }),
      MarketplaceListing.countDocuments(),
      MarketplaceListing.aggregate([
        { $group: { 
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$batchDate" } },
          count: { $sum: 1 }
        }},
        { $sort: { _id: -1 } },
        { $limit: 7 }
      ])
    ]);

    const serviceStatus = batchService ? batchService.getStatus() : null;

    const metrics = {
      listings: {
        last_24h: listingsLast24h,
        last_7d: listingsLast7d,
        total: totalListings,
        by_date: batchDates
      },
      service: serviceStatus ? {
        is_running: serviceStatus.isRunning,
        last_batch_run: serviceStatus.lastBatchRun,
        last_batch_stats: serviceStatus.batchStats
      } : null,
      performance: {
        memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptime_hours: Math.round(process.uptime() / 3600 * 100) / 100,
        cpu_usage: process.cpuUsage()
      },
      timestamp: new Date()
    };

    res.json({
      success: true,
      data: metrics,
      message: 'Batch service metrics retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch metrics',
      message: error.message
    });
  }
});

module.exports = router;
