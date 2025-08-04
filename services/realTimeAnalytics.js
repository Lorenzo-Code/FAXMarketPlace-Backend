const User = require('../models/User');
const UserSession = require('../models/UserSession');
const Property = require('../models/Property');
const AuditLog = require('../models/AuditLog');
const { getRealTimeStats } = require('../middleware/sessionTracking');

class RealTimeAnalyticsService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.updateFrequency = 15000; // 15 seconds
  }

  async start() {
    if (this.isRunning) return;
    
    console.log('📊 Starting real-time analytics service...');
    this.isRunning = true;
    
    // Initial broadcast
    await this.broadcastAnalytics();
    
    // Set up periodic updates
    this.interval = setInterval(async () => {
      await this.broadcastAnalytics();
    }, this.updateFrequency);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('📊 Real-time analytics service stopped');
  }

  async broadcastAnalytics() {
    try {
      if (!global.io) return;

      const analytics = await this.generateAnalytics();
      
      // Broadcast to all connected admin clients
      global.io.to('admin-dashboard').emit('analytics-update', analytics);
      
      console.log('📊 Analytics update broadcasted to admin clients');
    } catch (error) {
      console.error('❌ Error broadcasting analytics:', error);
    }
  }

  async generateAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Core metrics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: thirtyDaysAgo } 
    });
    const verifiedUsers = await User.countDocuments({ emailVerified: true });
    const newUsersToday = await User.countDocuments({ 
      createdAt: { $gte: oneDayAgo } 
    });
    const newUsersThisWeek = await User.countDocuments({ 
      createdAt: { $gte: sevenDaysAgo } 
    });

    // Property metrics
    const totalProperties = await Property.countDocuments();
    const approvedProperties = await Property.countDocuments({ status: 'approved' });
    const pendingProperties = await Property.countDocuments({ status: 'pending' });

    // Real-time session data
    const realTimeStats = await getRealTimeStats();

    // Recent activity (last 10 activities)
    const recentActivity = await AuditLog.find()
      .populate('user', 'email firstName lastName')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Activity trends (last 7 days)
    const activityTrends = await this.getActivityTrends();

    return {
      timestamp: now.toISOString(),
      overview: {
        totalUsers,
        activeUsers,
        verifiedUsers,
        newUsersToday,
        newUsersThisWeek,
        totalProperties,
        approvedProperties,
        pendingProperties,
        conversionRate: totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(1) : 0,
        activityRate: totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0
      },
      realTimeStats,
      recentActivity: recentActivity.map(activity => ({
        id: activity._id,
        type: activity.event || activity.type,
        user: activity.user ? `${activity.user.firstName} ${activity.user.lastName}` : 'System',
        email: activity.user?.email,
        message: this.formatActivityMessage(activity),
        timestamp: activity.createdAt || activity.timestamp,
        icon: this.getActivityIcon(activity.event || activity.type)
      })),
      activityTrends,
      alerts: await this.generateAlerts(totalUsers, activeUsers, verifiedUsers)
    };
  }

  async getActivityTrends() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const dailyActivity = await AuditLog.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    return dailyActivity;
  }

  formatActivityMessage(activity) {
    const type = activity.event || activity.type;
    const details = activity.details || '';
    
    switch (type) {
      case 'login':
        return 'User logged in';
      case 'register':
        return 'New user registered';
      case 'property_upload':
        return 'Property uploaded for review';
      case 'property_approved':
        return 'Property approved';
      case 'email_verified':
        return 'Email verification completed';
      default:
        return details || `${type} activity`;
    }
  }

  getActivityIcon(type) {
    const icons = {
      login: '🔐',
      register: '👤',
      property_upload: '🏠',
      property_approved: '✅',
      email_verified: '📧',
      payment: '💰',
      transaction: '💸',
      error: '❌',
      warning: '⚠️'
    };
    
    return icons[type] || '📊';
  }

  async generateAlerts(totalUsers, activeUsers, verifiedUsers) {
    const alerts = [];
    
    // Activity rate alert
    const activityRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;
    if (activityRate < 30) {
      alerts.push({
        type: 'warning',
        title: 'Low User Activity',
        message: `Only ${activityRate.toFixed(1)}% of users are active`,
        priority: 'medium',
        timestamp: new Date().toISOString()
      });
    }

    // Conversion rate alert
    const conversionRate = totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0;
    if (conversionRate < 50) {
      alerts.push({
        type: 'info',
        title: 'Email Verification Rate',
        message: `${conversionRate.toFixed(1)}% email verification rate`,
        priority: 'low',
        timestamp: new Date().toISOString()
      });
    }

    // High activity alert
    if (activityRate > 70) {
      alerts.push({
        type: 'success',
        title: 'High User Engagement',
        message: `${activityRate.toFixed(1)}% of users are actively engaged`,
        priority: 'low',
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  }

  // Manual trigger for immediate updates
  async triggerUpdate() {
    await this.broadcastAnalytics();
  }

  // Update frequency setter
  setUpdateFrequency(milliseconds) {
    this.updateFrequency = milliseconds;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

module.exports = new RealTimeAnalyticsService();
