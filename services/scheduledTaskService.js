const cron = require('node-cron');
const dailyWorkflowService = require('./dailyWorkflowService');

class ScheduledTaskService {
  constructor() {
    this.tasks = new Map();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️ Scheduled tasks already running');
      return;
    }

    this.isRunning = true;
    console.log('📅 Starting scheduled task service...');

    // Morning KPI Summary - 9:00 AM daily
    this.tasks.set('morning-kpi', cron.schedule('0 9 * * *', async () => {
      console.log('🌅 Running morning KPI summary...');
      try {
        await dailyWorkflowService.sendDailyKPISummary();
        console.log('✅ Morning KPI summary completed');
      } catch (error) {
        console.error('❌ Morning KPI summary failed:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'America/New_York'
    }));

    // End of day summary - 4:30 PM daily
    this.tasks.set('eod-summary', cron.schedule('30 16 * * *', async () => {
      console.log('🌇 Running end-of-day summary...');
      try {
        await dailyWorkflowService.sendDailySummary();
        console.log('✅ End-of-day summary completed');
      } catch (error) {
        console.error('❌ End-of-day summary failed:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'America/New_York'
    }));

    // Weekly digest - Monday 8:00 AM
    this.tasks.set('weekly-digest', cron.schedule('0 8 * * 1', async () => {
      console.log('📊 Running weekly digest...');
      try {
        await this.sendWeeklyDigest();
        console.log('✅ Weekly digest completed');
      } catch (error) {
        console.error('❌ Weekly digest failed:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'America/New_York'
    }));

    // System health check - every hour during business hours (9 AM - 6 PM)
    this.tasks.set('health-check', cron.schedule('0 9-18 * * *', async () => {
      console.log('🏥 Running system health check...');
      try {
        await this.performHealthCheck();
        console.log('✅ Health check completed');
      } catch (error) {
        console.error('❌ Health check failed:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'America/New_York'
    }));

    // Cleanup old incidents and logs - daily at midnight
    this.tasks.set('cleanup', cron.schedule('0 0 * * *', async () => {
      console.log('🧹 Running cleanup tasks...');
      try {
        await this.performCleanup();
        console.log('✅ Cleanup tasks completed');
      } catch (error) {
        console.error('❌ Cleanup tasks failed:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'America/New_York'
    }));

    console.log(`✅ Scheduled ${this.tasks.size} automated tasks`);
    this.logNextRuns();
  }

  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Scheduled tasks not running');
      return;
    }

    console.log('🛑 Stopping scheduled task service...');
    
    for (const [name, task] of this.tasks) {
      task.stop();
      console.log(`  - Stopped ${name}`);
    }
    
    this.tasks.clear();
    this.isRunning = false;
    console.log('✅ All scheduled tasks stopped');
  }

  restart() {
    this.stop();
    setTimeout(() => {
      this.start();
    }, 1000);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      taskCount: this.tasks.size,
      tasks: Array.from(this.tasks.keys()).map(name => ({
        name,
        running: this.tasks.get(name)?.running || false
      }))
    };
  }

  logNextRuns() {
    const now = new Date();
    console.log('📅 Next scheduled runs:');
    
    // Calculate next runs (approximate)
    const schedules = {
      'morning-kpi': '9:00 AM daily',
      'eod-summary': '4:30 PM daily', 
      'weekly-digest': '8:00 AM Mondays',
      'health-check': 'Hourly (9 AM - 6 PM)',
      'cleanup': 'Daily at midnight'
    };

    for (const [name, schedule] of Object.entries(schedules)) {
      console.log(`  - ${name}: ${schedule}`);
    }
  }

  // =================== TASK IMPLEMENTATIONS ===================

  async sendWeeklyDigest() {
    const User = require('../models/User');
    const SupportTicket = require('../models/SupportTicket');
    const slackService = require('./slackService');

    try {
      // Get weekly statistics
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date();
      weekEnd.setHours(23, 59, 59, 999);

      const weeklyStats = {
        newUsers: await User.countDocuments({
          createdAt: { $gte: weekStart, $lte: weekEnd }
        }),
        ticketsResolved: await SupportTicket.countDocuments({
          status: { $in: ['resolved', 'closed'] },
          resolvedAt: { $gte: weekStart, $lte: weekEnd }
        }),
        totalUsers: await User.countDocuments(),
        openTickets: await SupportTicket.countDocuments({
          status: { $nin: ['resolved', 'closed'] }
        })
      };

      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 Weekly Digest Report'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*New Users This Week:* ${weeklyStats.newUsers}`
            },
            {
              type: 'mrkdwn',
              text: `*Total Users:* ${weeklyStats.totalUsers.toLocaleString()}`
            },
            {
              type: 'mrkdwn',
              text: `*Tickets Resolved:* ${weeklyStats.ticketsResolved}`
            },
            {
              type: 'mrkdwn',
              text: `*Open Tickets:* ${weeklyStats.openTickets}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Period:* ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`
          }
        }
      ];

      await slackService.makeRequest('POST', '/chat.postMessage', {
        channel: dailyWorkflowService.channels.exec,
        blocks,
        text: 'Weekly Digest Report'
      });

    } catch (error) {
      console.error('Weekly digest error:', error);
      throw error;
    }
  }

  async performHealthCheck() {
    const mongoose = require('mongoose');
    const redisClient = require('../utils/redisClient');

    try {
      const issues = [];

      // Database connectivity
      if (mongoose.connection.readyState !== 1) {
        issues.push('❌ Database connection lost');
      }

      // Redis connectivity
      if (redisClient.status !== 'ready') {
        issues.push('❌ Redis connection issues');
      }

      // Memory usage
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      if (heapUsedMB > 1000) { // Alert if using more than 1GB
        issues.push(`⚠️ High memory usage: ${heapUsedMB}MB`);
      }

      // CPU usage (approximate)
      const uptime = process.uptime();
      if (uptime < 300) { // Less than 5 minutes uptime
        issues.push('⚠️ Recent restart detected');
      }

      // If there are critical issues, send alert
      if (issues.length > 0) {
        await dailyWorkflowService.handleOpsIncident({
          source: 'HealthCheck',
          alertType: 'SystemHealth',
          details: `Health check detected issues:\n${issues.join('\n')}`,
          severity: issues.some(i => i.includes('❌')) ? 'high' : 'medium'
        });
      }

    } catch (error) {
      console.error('Health check error:', error);
      // Send critical alert for health check failure
      await dailyWorkflowService.handleOpsIncident({
        source: 'HealthCheck',
        alertType: 'HealthCheckFailure',
        details: `Health check service failed: ${error.message}`,
        severity: 'high'
      });
    }
  }

  async performCleanup() {
    const AuditLog = require('../models/AuditLog');

    try {
      const cleanupTasks = [];

      // Clean up old audit logs (older than 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const oldLogs = await AuditLog.deleteMany({
        createdAt: { $lt: ninetyDaysAgo },
        action: { $nin: ['password_reset', 'user_created', 'kyc_approved'] } // Keep important logs
      });

      if (oldLogs.deletedCount > 0) {
        cleanupTasks.push(`Cleaned ${oldLogs.deletedCount} old audit logs`);
      }

      // Clean up expired sessions
      const UserSession = require('../models/UserSession');
      const expiredSessions = await UserSession.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      if (expiredSessions.deletedCount > 0) {
        cleanupTasks.push(`Cleaned ${expiredSessions.deletedCount} expired sessions`);
      }

      // Log cleanup results if any
      if (cleanupTasks.length > 0) {
        console.log('🧹 Cleanup completed:', cleanupTasks.join(', '));
      }

    } catch (error) {
      console.error('Cleanup error:', error);
      throw error;
    }
  }

  // =================== MANUAL TRIGGERS ===================

  async triggerMorningKPI() {
    console.log('🌅 Manually triggering morning KPI summary...');
    try {
      await dailyWorkflowService.sendDailyKPISummary();
      return { success: true, message: 'Morning KPI summary sent successfully' };
    } catch (error) {
      console.error('Manual KPI trigger failed:', error);
      return { success: false, error: error.message };
    }
  }

  async triggerEODSummary() {
    console.log('🌇 Manually triggering end-of-day summary...');
    try {
      await dailyWorkflowService.sendDailySummary();
      return { success: true, message: 'End-of-day summary sent successfully' };
    } catch (error) {
      console.error('Manual EOD trigger failed:', error);
      return { success: false, error: error.message };
    }
  }

  async triggerHealthCheck() {
    console.log('🏥 Manually triggering health check...');
    try {
      await this.performHealthCheck();
      return { success: true, message: 'Health check completed' };
    } catch (error) {
      console.error('Manual health check failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ScheduledTaskService();
