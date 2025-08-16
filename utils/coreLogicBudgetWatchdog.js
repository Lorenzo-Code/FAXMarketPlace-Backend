const { getAsync, setAsync } = require("./redisClient");
require("dotenv").config();

/**
 * 🐕 CORELOGIC BUDGET WATCHDOG SYSTEM
 * 
 * FEATURES:
 * 1. Monthly quota tracking and monitoring
 * 2. Real-time budget consumption alerts
 * 3. Automatic 'Safe Mode' activation when usage > 80%
 * 4. Per-endpoint cost tracking and analysis
 * 5. Usage forecasting and recommendations
 * 6. Admin notifications and emergency controls
 */

// CoreLogic pricing per endpoint (in USD)
const CORELOGIC_ENDPOINT_COSTS = {
  'property/search': 2.50,
  'property/detail': 15.00,
  'property/buildings': 8.00,
  'property/site-location': 6.00,
  'property/tax-assessments': 5.00,
  'property/ownership': 8.00,
  'property/ownership-transfers': 10.00,
  'property/transaction-history': 12.00,
  'property/mortgage/current': 10.00,
  'property/mortgage': 15.00,
  'property/liens': 8.00,
  'property/liens/involuntary': 10.00,
  'property/comparables': 12.50,
  'property/rent-amount-model': 10.00,
  'property/propensity-scores': 8.00,
  'property/climate-risk-analytics': 25.00
};

// Monthly budget limits (configurable)
const BUDGET_LIMITS = {
  MONTHLY_BUDGET: parseFloat(process.env.CORELOGIC_MONTHLY_BUDGET) || 5000, // $5000 default
  WARNING_THRESHOLD: 0.80, // 80%
  CRITICAL_THRESHOLD: 0.95, // 95%
  SAFE_MODE_THRESHOLD: 0.80 // Activate safe mode at 80%
};

class CoreLogicBudgetWatchdog {
  constructor() {
    this.isInitialized = false;
    this.currentMonth = new Date().getMonth();
    this.currentYear = new Date().getFullYear();
  }

  /**
   * 📊 Get Current Budget Status
   */
  async getBudgetStatus() {
    const monthKey = this.getMonthKey();
    const usageKey = `corelogic:usage:${monthKey}`;
    
    try {
      const usageData = await getAsync(usageKey);
      const currentUsage = usageData ? JSON.parse(usageData) : {
        totalCost: 0,
        totalCalls: 0,
        endpoints: {},
        lastUpdated: new Date().toISOString()
      };

      const budgetStatus = {
        monthKey: monthKey,
        budget: {
          total: BUDGET_LIMITS.MONTHLY_BUDGET,
          used: currentUsage.totalCost,
          remaining: BUDGET_LIMITS.MONTHLY_BUDGET - currentUsage.totalCost,
          percentUsed: (currentUsage.totalCost / BUDGET_LIMITS.MONTHLY_BUDGET) * 100
        },
        usage: {
          totalCalls: currentUsage.totalCalls,
          totalCost: currentUsage.totalCost,
          averageCostPerCall: currentUsage.totalCalls > 0 ? currentUsage.totalCost / currentUsage.totalCalls : 0
        },
        thresholds: {
          warningLevel: BUDGET_LIMITS.MONTHLY_BUDGET * BUDGET_LIMITS.WARNING_THRESHOLD,
          criticalLevel: BUDGET_LIMITS.MONTHLY_BUDGET * BUDGET_LIMITS.CRITICAL_THRESHOLD,
          safeModeLevel: BUDGET_LIMITS.MONTHLY_BUDGET * BUDGET_LIMITS.SAFE_MODE_THRESHOLD
        },
        status: this.getBudgetAlertLevel(currentUsage.totalCost),
        safeMode: await this.isSafeModeActive(),
        lastUpdated: currentUsage.lastUpdated
      };

      return budgetStatus;
      
    } catch (error) {
      console.error('❌ Budget status check failed:', error.message);
      return {
        error: 'Failed to get budget status',
        details: error.message
      };
    }
  }

  /**
   * 💸 Track API Call Cost
   */
  async trackApiCall(endpoint, cost, additionalMetadata = {}) {
    const monthKey = this.getMonthKey();
    const usageKey = `corelogic:usage:${monthKey}`;
    
    try {
      // Get current usage
      let usageData = await getAsync(usageKey);
      let currentUsage = usageData ? JSON.parse(usageData) : {
        totalCost: 0,
        totalCalls: 0,
        endpoints: {},
        dailyBreakdown: {},
        lastUpdated: new Date().toISOString()
      };

      // Update usage
      currentUsage.totalCost += cost;
      currentUsage.totalCalls += 1;
      currentUsage.lastUpdated = new Date().toISOString();

      // Track per-endpoint usage
      if (!currentUsage.endpoints[endpoint]) {
        currentUsage.endpoints[endpoint] = {
          calls: 0,
          totalCost: 0,
          averageCost: 0,
          lastCall: null
        };
      }
      
      currentUsage.endpoints[endpoint].calls += 1;
      currentUsage.endpoints[endpoint].totalCost += cost;
      currentUsage.endpoints[endpoint].averageCost = 
        currentUsage.endpoints[endpoint].totalCost / currentUsage.endpoints[endpoint].calls;
      currentUsage.endpoints[endpoint].lastCall = new Date().toISOString();

      // Track daily usage
      const today = new Date().toISOString().split('T')[0];
      if (!currentUsage.dailyBreakdown[today]) {
        currentUsage.dailyBreakdown[today] = { calls: 0, cost: 0 };
      }
      currentUsage.dailyBreakdown[today].calls += 1;
      currentUsage.dailyBreakdown[today].cost += cost;

      // Add metadata if provided
      if (Object.keys(additionalMetadata).length > 0) {
        if (!currentUsage.metadata) currentUsage.metadata = [];
        currentUsage.metadata.push({
          timestamp: new Date().toISOString(),
          endpoint: endpoint,
          cost: cost,
          ...additionalMetadata
        });
        
        // Keep only last 100 metadata entries to prevent bloat
        if (currentUsage.metadata.length > 100) {
          currentUsage.metadata = currentUsage.metadata.slice(-100);
        }
      }

      // Save updated usage
      await setAsync(usageKey, currentUsage, 0); // Never expire usage data
      
      // Check if we need to activate safe mode or send alerts
      await this.checkBudgetThresholds(currentUsage.totalCost);
      
      console.log(`💸 Tracked CoreLogic call: ${endpoint} - $${cost.toFixed(2)}`);
      console.log(`💰 Month-to-date: $${currentUsage.totalCost.toFixed(2)}/${BUDGET_LIMITS.MONTHLY_BUDGET}`);
      
      return {
        success: true,
        endpoint: endpoint,
        cost: cost,
        monthlyTotal: currentUsage.totalCost,
        budgetRemaining: BUDGET_LIMITS.MONTHLY_BUDGET - currentUsage.totalCost,
        percentUsed: (currentUsage.totalCost / BUDGET_LIMITS.MONTHLY_BUDGET) * 100
      };
      
    } catch (error) {
      console.error('❌ API call tracking failed:', error.message);
      return {
        success: false,
        error: 'Failed to track API call',
        details: error.message
      };
    }
  }

  /**
   * 🚨 Check Budget Thresholds and Trigger Actions
   */
  async checkBudgetThresholds(currentCost) {
    const percentUsed = (currentCost / BUDGET_LIMITS.MONTHLY_BUDGET) * 100;
    const alertLevel = this.getBudgetAlertLevel(currentCost);
    
    // Activate safe mode if threshold exceeded
    if (percentUsed >= (BUDGET_LIMITS.SAFE_MODE_THRESHOLD * 100)) {
      await this.activateSafeMode('Budget threshold exceeded');
    }
    
    // Send alerts based on thresholds
    if (alertLevel === 'CRITICAL') {
      await this.sendBudgetAlert('CRITICAL', currentCost, percentUsed);
    } else if (alertLevel === 'WARNING') {
      await this.sendBudgetAlert('WARNING', currentCost, percentUsed);
    }
    
    return alertLevel;
  }

  /**
   * 🛡️ Safe Mode Management
   */
  async activateSafeMode(reason = 'Manual activation') {
    const safeModeKey = 'corelogic:safe_mode';
    const safeModeData = {
      active: true,
      activatedAt: new Date().toISOString(),
      reason: reason,
      activatedBy: 'system'
    };
    
    await setAsync(safeModeKey, safeModeData, 0); // Never expire
    console.log('🛡️ SAFE MODE ACTIVATED:', reason);
    
    // Send critical alert
    await this.sendBudgetAlert('SAFE_MODE_ACTIVATED', 0, 0, { reason });
    
    return safeModeData;
  }

  async deactivateSafeMode(reason = 'Manual deactivation') {
    const safeModeKey = 'corelogic:safe_mode';
    const safeModeData = {
      active: false,
      deactivatedAt: new Date().toISOString(),
      reason: reason,
      deactivatedBy: 'admin'
    };
    
    await setAsync(safeModeKey, safeModeData, 0);
    console.log('✅ Safe mode deactivated:', reason);
    
    return safeModeData;
  }

  async isSafeModeActive() {
    try {
      const safeModeKey = 'corelogic:safe_mode';
      const safeModeData = await getAsync(safeModeKey);
      return safeModeData ? JSON.parse(safeModeData).active : false;
    } catch (error) {
      console.error('❌ Safe mode check failed:', error.message);
      return false;
    }
  }

  /**
   * 📧 Send Budget Alerts
   */
  async sendBudgetAlert(alertType, currentCost, percentUsed, additionalData = {}) {
    const alertData = {
      type: alertType,
      timestamp: new Date().toISOString(),
      budget: {
        total: BUDGET_LIMITS.MONTHLY_BUDGET,
        used: currentCost,
        percentUsed: percentUsed.toFixed(2)
      },
      month: this.getMonthKey(),
      ...additionalData
    };

    // Log the alert
    console.log(`🚨 BUDGET ALERT [${alertType}]:`, alertData);
    
    // Store alert history
    try {
      const alertKey = 'corelogic:alerts';
      let alertHistory = await getAsync(alertKey);
      let alerts = alertHistory ? JSON.parse(alertHistory) : [];
      
      alerts.push(alertData);
      
      // Keep only last 50 alerts
      if (alerts.length > 50) {
        alerts = alerts.slice(-50);
      }
      
      await setAsync(alertKey, alerts, 0);
      
      // In production, integrate with email/Slack notifications
      // await this.sendEmailAlert(alertData);
      // await this.sendSlackAlert(alertData);
      
    } catch (error) {
      console.error('❌ Failed to store alert:', error.message);
    }
    
    return alertData;
  }

  /**
   * 📊 Generate Usage Analytics
   */
  async getUsageAnalytics(months = 3) {
    const analytics = {
      currentMonth: await this.getBudgetStatus(),
      trends: [],
      topEndpoints: [],
      recommendations: []
    };

    try {
      // Get historical data for trend analysis
      for (let i = 0; i < months; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const usageKey = `corelogic:usage:${monthKey}`;
        
        const usageData = await getAsync(usageKey);
        if (usageData) {
          const monthData = JSON.parse(usageData);
          analytics.trends.push({
            month: monthKey,
            totalCost: monthData.totalCost,
            totalCalls: monthData.totalCalls,
            averageCostPerCall: monthData.totalCalls > 0 ? monthData.totalCost / monthData.totalCalls : 0
          });
        }
      }

      // Analyze top endpoints by cost
      const currentUsage = analytics.currentMonth;
      if (currentUsage.endpoints) {
        analytics.topEndpoints = Object.entries(currentUsage.endpoints)
          .map(([endpoint, data]) => ({ endpoint, ...data }))
          .sort((a, b) => b.totalCost - a.totalCost)
          .slice(0, 10);
      }

      // Generate recommendations
      analytics.recommendations = await this.generateRecommendations(analytics);
      
    } catch (error) {
      console.error('❌ Analytics generation failed:', error.message);
      analytics.error = error.message;
    }
    
    return analytics;
  }

  /**
   * 💡 Generate Cost Optimization Recommendations
   */
  async generateRecommendations(analytics) {
    const recommendations = [];
    const currentStatus = analytics.currentMonth;
    
    if (!currentStatus.budget) return recommendations;

    // Budget utilization recommendations
    if (currentStatus.budget.percentUsed > 90) {
      recommendations.push({
        type: 'URGENT',
        title: 'Budget Nearly Exhausted',
        description: 'Consider increasing monthly budget or reducing API usage',
        impact: 'HIGH',
        action: 'Review high-cost endpoints and implement additional caching'
      });
    } else if (currentStatus.budget.percentUsed > 60) {
      recommendations.push({
        type: 'WARNING',
        title: 'High Budget Utilization',
        description: 'Monitor usage closely to avoid exceeding budget',
        impact: 'MEDIUM',
        action: 'Optimize caching strategies for expensive endpoints'
      });
    }

    // Endpoint optimization recommendations
    if (analytics.topEndpoints && analytics.topEndpoints.length > 0) {
      const mostExpensive = analytics.topEndpoints[0];
      if (mostExpensive.totalCost > 500) {
        recommendations.push({
          type: 'OPTIMIZATION',
          title: `High Usage on ${mostExpensive.endpoint}`,
          description: `This endpoint accounts for $${mostExpensive.totalCost.toFixed(2)} of monthly cost`,
          impact: 'MEDIUM',
          action: 'Implement aggressive caching or consider rate limiting'
        });
      }
    }

    // Trend-based recommendations
    if (analytics.trends && analytics.trends.length >= 2) {
      const current = analytics.trends[0];
      const previous = analytics.trends[1];
      
      if (current && previous && current.totalCost > previous.totalCost * 1.5) {
        recommendations.push({
          type: 'TREND',
          title: 'Usage Spike Detected',
          description: 'Monthly costs have increased significantly',
          impact: 'HIGH',
          action: 'Investigate cause of usage increase and optimize accordingly'
        });
      }
    }

    return recommendations;
  }

  /**
   * 🔧 Utility Methods
   */
  getMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  getBudgetAlertLevel(currentCost) {
    const percentUsed = (currentCost / BUDGET_LIMITS.MONTHLY_BUDGET) * 100;
    
    if (percentUsed >= 95) return 'CRITICAL';
    if (percentUsed >= 80) return 'WARNING';
    return 'NORMAL';
  }

  /**
   * 🎛️ Admin Controls
   */
  async resetMonthlyUsage(confirm = false) {
    if (!confirm) {
      throw new Error('resetMonthlyUsage requires explicit confirmation');
    }
    
    const monthKey = this.getMonthKey();
    const usageKey = `corelogic:usage:${monthKey}`;
    
    await setAsync(usageKey, JSON.stringify({
      totalCost: 0,
      totalCalls: 0,
      endpoints: {},
      dailyBreakdown: {},
      lastUpdated: new Date().toISOString(),
      resetAt: new Date().toISOString()
    }), 0);
    
    console.log(`🔄 Monthly usage reset for ${monthKey}`);
    return { success: true, month: monthKey };
  }

  async updateBudgetLimit(newLimit) {
    if (typeof newLimit !== 'number' || newLimit <= 0) {
      throw new Error('Budget limit must be a positive number');
    }
    
    // In production, this would update environment variables or database config
    BUDGET_LIMITS.MONTHLY_BUDGET = newLimit;
    
    console.log(`💰 Budget limit updated to $${newLimit}`);
    return { success: true, newLimit };
  }
}

// Singleton instance
const budgetWatchdog = new CoreLogicBudgetWatchdog();

// Convenience functions for easy integration
async function trackCoreLogicCall(endpoint, additionalMetadata = {}) {
  const cost = CORELOGIC_ENDPOINT_COSTS[endpoint] || 5.00; // Default cost if endpoint not found
  return await budgetWatchdog.trackApiCall(endpoint, cost, additionalMetadata);
}

async function checkSafeMode() {
  return await budgetWatchdog.isSafeModeActive();
}

async function getBudgetStatus() {
  return await budgetWatchdog.getBudgetStatus();
}

module.exports = {
  CoreLogicBudgetWatchdog,
  budgetWatchdog,
  trackCoreLogicCall,
  checkSafeMode,
  getBudgetStatus,
  CORELOGIC_ENDPOINT_COSTS,
  BUDGET_LIMITS
};
