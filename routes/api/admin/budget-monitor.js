const express = require("express");
const router = express.Router();
require("dotenv").config();

// Import authentication middleware
const { verifyToken, authorizeAdmin } = require("../../../middleware/auth");

// Import budget watchdog
const { 
  budgetWatchdog, 
  getBudgetStatus, 
  checkSafeMode,
  CORELOGIC_ENDPOINT_COSTS,
  BUDGET_LIMITS 
} = require("../../../utils/coreLogicBudgetWatchdog");

/**
 * 📊 CORELOGIC BUDGET MONITORING ADMIN ENDPOINTS
 * 
 * Provides comprehensive budget monitoring, usage analytics,
 * and cost optimization tools for administrators
 */

/**
 * 📊 Get Current Budget Status
 */
router.get('/status', verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const status = await getBudgetStatus();
    
    res.status(200).json({
      success: true,
      budgetStatus: status,
      systemInfo: {
        safeModeActive: await checkSafeMode(),
        monthlyBudgetLimit: BUDGET_LIMITS.MONTHLY_BUDGET,
        warningThreshold: BUDGET_LIMITS.WARNING_THRESHOLD,
        criticalThreshold: BUDGET_LIMITS.CRITICAL_THRESHOLD,
        safeModeThreshold: BUDGET_LIMITS.SAFE_MODE_THRESHOLD
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get budget status:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get budget status',
      message: error.message
    });
  }
});

/**
 * 📈 Get Usage Analytics
 */
router.get('/analytics', verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { months = 3 } = req.query;
    const analytics = await budgetWatchdog.getUsageAnalytics(parseInt(months));
    
    // Add cost per endpoint breakdown
    const endpointCosts = Object.entries(CORELOGIC_ENDPOINT_COSTS).map(([endpoint, cost]) => ({
      endpoint,
      costPerCall: cost,
      category: categorizeEndpoint(endpoint)
    }));
    
    res.status(200).json({
      success: true,
      analytics: analytics,
      endpointPricing: endpointCosts,
      costOptimizationInsights: await generateCostInsights(analytics),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get usage analytics:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get usage analytics',
      message: error.message
    });
  }
});

/**
 * 🛡️ Safe Mode Controls
 */
router.post('/safe-mode/activate', verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { reason = 'Manual admin activation' } = req.body;
    const result = await budgetWatchdog.activateSafeMode(reason);
    
    res.status(200).json({
      success: true,
      message: 'Safe mode activated',
      safeMode: result,
      impact: [
        'All non-essential CoreLogic calls will require FXCT confirmation',
        'Budget consumption alerts will be more frequent',
        'Aggressive caching policies will be enforced'
      ]
    });
    
  } catch (error) {
    console.error('❌ Failed to activate safe mode:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to activate safe mode',
      message: error.message
    });
  }
});

router.post('/safe-mode/deactivate', verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { reason = 'Manual admin deactivation' } = req.body;
    const result = await budgetWatchdog.deactivateSafeMode(reason);
    
    res.status(200).json({
      success: true,
      message: 'Safe mode deactivated',
      safeMode: result,
      warning: 'Monitor usage closely to ensure budget compliance'
    });
    
  } catch (error) {
    console.error('❌ Failed to deactivate safe mode:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate safe mode',
      message: error.message
    });
  }
});

/**
 * 💰 Budget Management
 */
router.post('/budget/update', verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { newLimit } = req.body;
    
    if (!newLimit || typeof newLimit !== 'number' || newLimit <= 0) {
      return res.status(400).json({
        error: 'Valid budget limit required',
        example: { newLimit: 5000 }
      });
    }
    
    const result = await budgetWatchdog.updateBudgetLimit(newLimit);
    
    res.status(200).json({
      success: true,
      message: `Budget limit updated to $${newLimit}`,
      result: result,
      note: 'Changes take effect immediately for new usage calculations'
    });
    
  } catch (error) {
    console.error('❌ Failed to update budget:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update budget limit',
      message: error.message
    });
  }
});

router.post('/usage/reset', verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== true) {
      return res.status(400).json({
        error: 'Explicit confirmation required',
        message: 'This action will reset all usage data for the current month',
        required: { confirm: true },
        warning: 'This action cannot be undone'
      });
    }
    
    const result = await budgetWatchdog.resetMonthlyUsage(true);
    
    res.status(200).json({
      success: true,
      message: 'Monthly usage data reset',
      result: result,
      warning: 'All usage tracking for this month has been cleared'
    });
    
  } catch (error) {
    console.error('❌ Failed to reset usage:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reset monthly usage',
      message: error.message
    });
  }
});

/**
 * 📋 Get Alert History
 */
router.get('/alerts', verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { getAsync } = require('../../../utils/redisClient');
    const alertHistory = await getAsync('corelogic:alerts');
    const alerts = alertHistory ? JSON.parse(alertHistory) : [];
    
    res.status(200).json({
      success: true,
      alerts: alerts.reverse(), // Most recent first
      alertCount: alerts.length,
      alertTypes: {
        WARNING: alerts.filter(a => a.type === 'WARNING').length,
        CRITICAL: alerts.filter(a => a.type === 'CRITICAL').length,
        SAFE_MODE_ACTIVATED: alerts.filter(a => a.type === 'SAFE_MODE_ACTIVATED').length
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to get alert history:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get alert history',
      message: error.message
    });
  }
});

/**
 * 🎯 Cost Optimization Recommendations
 */
router.get('/optimization', verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const analytics = await budgetWatchdog.getUsageAnalytics(6); // 6 months of data
    const recommendations = await generateDetailedOptimizations(analytics);
    
    res.status(200).json({
      success: true,
      optimizations: recommendations,
      implementationGuide: {
        highImpact: recommendations.filter(r => r.impact === 'HIGH'),
        mediumImpact: recommendations.filter(r => r.impact === 'MEDIUM'),
        lowImpact: recommendations.filter(r => r.impact === 'LOW')
      },
      estimatedSavings: calculateEstimatedSavings(recommendations, analytics)
    });
    
  } catch (error) {
    console.error('❌ Failed to get optimization recommendations:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get optimization recommendations',
      message: error.message
    });
  }
});

/**
 * 📊 Real-time Usage Dashboard Data
 */
router.get('/dashboard', verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const [status, analytics, safeMode] = await Promise.all([
      getBudgetStatus(),
      budgetWatchdog.getUsageAnalytics(1),
      checkSafeMode()
    ]);
    
    // Get recent activity (last 7 days)
    const recentActivity = await getRecentActivity();
    
    const dashboardData = {
      summary: {
        monthlyBudget: status.budget?.total || 0,
        budgetUsed: status.budget?.used || 0,
        budgetRemaining: status.budget?.remaining || 0,
        percentUsed: status.budget?.percentUsed || 0,
        totalCalls: status.usage?.totalCalls || 0,
        averageCostPerCall: status.usage?.averageCostPerCall || 0,
        safeMode: safeMode,
        alertLevel: status.status || 'NORMAL'
      },
      
      dailyUsage: getDailyUsageFromAnalytics(analytics),
      
      topEndpoints: analytics.topEndpoints || [],
      
      recentActivity: recentActivity,
      
      alerts: {
        active: status.status !== 'NORMAL',
        level: status.status,
        safeModeActive: safeMode
      },
      
      trends: {
        monthlySpend: analytics.trends || [],
        projectedMonthlySpend: projectMonthlySpend(status)
      }
    };
    
    res.status(200).json({
      success: true,
      dashboard: dashboardData,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to get dashboard data:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard data',
      message: error.message
    });
  }
});

/**
 * 🔧 Utility Functions
 */
function categorizeEndpoint(endpoint) {
  if (endpoint.includes('search') || endpoint.includes('detail')) return 'Basic';
  if (endpoint.includes('ownership') || endpoint.includes('mortgage') || endpoint.includes('liens')) return 'Premium';
  if (endpoint.includes('climate-risk') || endpoint.includes('comparables')) return 'Analytics';
  return 'Standard';
}

async function generateCostInsights(analytics) {
  const insights = [];
  
  if (analytics.topEndpoints && analytics.topEndpoints.length > 0) {
    const mostExpensive = analytics.topEndpoints[0];
    insights.push({
      type: 'TOP_COST_DRIVER',
      title: `${mostExpensive.endpoint} is your highest cost endpoint`,
      description: `Accounts for $${mostExpensive.totalCost.toFixed(2)} (${((mostExpensive.totalCost / analytics.currentMonth.budget?.used || 1) * 100).toFixed(1)}% of total)`,
      recommendation: 'Consider implementing more aggressive caching for this endpoint'
    });
  }
  
  if (analytics.currentMonth.budget?.percentUsed > 50) {
    insights.push({
      type: 'BUDGET_UTILIZATION',
      title: 'High budget utilization detected',
      description: `${analytics.currentMonth.budget.percentUsed.toFixed(1)}% of monthly budget used`,
      recommendation: 'Monitor usage closely and consider optimizing high-cost operations'
    });
  }
  
  return insights;
}

async function generateDetailedOptimizations(analytics) {
  const optimizations = [];
  
  // Analyze caching opportunities
  if (analytics.topEndpoints) {
    analytics.topEndpoints.forEach(endpoint => {
      if (endpoint.calls > 10 && endpoint.averageCost > 5) {
        optimizations.push({
          type: 'CACHING',
          title: `Optimize caching for ${endpoint.endpoint}`,
          description: `${endpoint.calls} calls costing $${endpoint.totalCost.toFixed(2)} - high cache hit rate could reduce costs significantly`,
          impact: endpoint.totalCost > 100 ? 'HIGH' : 'MEDIUM',
          estimatedSavings: endpoint.totalCost * 0.7, // Assume 70% cache hit rate
          action: 'Implement or extend cache TTL for this endpoint'
        });
      }
    });
  }
  
  // Analyze usage patterns
  if (analytics.trends && analytics.trends.length >= 2) {
    const recent = analytics.trends[0];
    const previous = analytics.trends[1];
    
    if (recent && previous && recent.averageCostPerCall > previous.averageCostPerCall * 1.2) {
      optimizations.push({
        type: 'USAGE_PATTERN',
        title: 'Increasing cost per call detected',
        description: 'Average cost per call has increased by more than 20%',
        impact: 'HIGH',
        estimatedSavings: recent.totalCost * 0.15,
        action: 'Review recent changes in API usage patterns'
      });
    }
  }
  
  return optimizations;
}

function calculateEstimatedSavings(recommendations, analytics) {
  const totalPotentialSavings = recommendations.reduce((sum, rec) => sum + (rec.estimatedSavings || 0), 0);
  const currentMonthlyCost = analytics.currentMonth.budget?.used || 0;
  
  return {
    totalPotentialSavings: totalPotentialSavings,
    percentageReduction: currentMonthlyCost > 0 ? (totalPotentialSavings / currentMonthlyCost * 100) : 0,
    highImpactSavings: recommendations
      .filter(r => r.impact === 'HIGH')
      .reduce((sum, r) => sum + (r.estimatedSavings || 0), 0)
  };
}

async function getRecentActivity() {
  try {
    const { getAsync } = require('../../../utils/redisClient');
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    const usageData = await getAsync(`corelogic:usage:${monthKey}`);
    
    if (usageData) {
      const usage = JSON.parse(usageData);
      return usage.metadata ? usage.metadata.slice(-10) : []; // Last 10 activities
    }
    
    return [];
  } catch (error) {
    console.error('Failed to get recent activity:', error.message);
    return [];
  }
}

function getDailyUsageFromAnalytics(analytics) {
  // Extract daily usage from analytics data
  if (analytics.currentMonth && analytics.currentMonth.dailyBreakdown) {
    return Object.entries(analytics.currentMonth.dailyBreakdown).map(([date, data]) => ({
      date,
      calls: data.calls,
      cost: data.cost
    }));
  }
  return [];
}

function projectMonthlySpend(status) {
  if (!status.budget) return 0;
  
  const daysInMonth = new Date().getDate();
  const currentDay = new Date().getDate();
  const dailyAverage = status.budget.used / currentDay;
  
  return dailyAverage * daysInMonth;
}

module.exports = router;
