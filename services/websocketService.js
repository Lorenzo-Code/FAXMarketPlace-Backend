const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * WebSocket Service for Real-time IP Monitoring
 * Handles real-time updates for admin dashboard
 */
class WebSocketService {
  constructor() {
    this.io = null;
    this.connections = new Map(); // Store admin connections
    this.updateTimers = new Map(); // Store periodic update timers
    this.eventQueue = []; // Queue for events when no connections
    this.maxQueueSize = 1000;
  }

  /**
   * Initialize Socket.IO server
   * @param {object} server - HTTP server instance
   */
  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://admin.fractionax.com', 'https://fractionax.com'] 
          : ['http://localhost:3000', 'http://localhost:3001'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupAuthentication();
    this.setupConnectionHandlers();
    this.startPeriodicUpdates();
    
    console.log('🌐 WebSocket Service initialized');
  }

  /**
   * Setup authentication middleware for Socket.IO connections
   */
  setupAuthentication() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        if (!user) {
          return next(new Error('User not found'));
        }

        // Check if user is admin
        if (user.role !== 'admin') {
          return next(new Error('Admin access required'));
        }

        // Add user info to socket
        socket.userId = user._id.toString();
        socket.userEmail = user.email;
        socket.userName = `${user.firstName} ${user.lastName}`;
        
        console.log(`🔌 Admin connected via WebSocket: ${socket.userEmail}`);
        next();
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup connection event handlers
   */
  setupConnectionHandlers() {
    this.io.on('connection', (socket) => {
      // Store connection info
      this.connections.set(socket.id, {
        socket,
        userId: socket.userId,
        userEmail: socket.userEmail,
        userName: socket.userName,
        connectedAt: new Date(),
        subscriptions: new Set()
      });

      // Handle subscription to IP monitoring updates
      socket.on('subscribe:ip-monitoring', (options = {}) => {
        const connection = this.connections.get(socket.id);
        if (connection) {
          connection.subscriptions.add('ip-monitoring');
          
          // Send initial data
          this.sendIPMonitoringSnapshot(socket, options);
          
          // Set up periodic updates for this connection
          this.startIPMonitoringUpdates(socket, options);
        }
      });

      // Handle unsubscribe from IP monitoring
      socket.on('unsubscribe:ip-monitoring', () => {
        const connection = this.connections.get(socket.id);
        if (connection) {
          connection.subscriptions.delete('ip-monitoring');
          this.stopIPMonitoringUpdates(socket.id);
        }
      });

      // Handle subscription to threat intelligence updates
      socket.on('subscribe:threat-intel', () => {
        const connection = this.connections.get(socket.id);
        if (connection) {
          connection.subscriptions.add('threat-intel');
        }
      });

      // Handle manual IP lookup requests
      socket.on('lookup:ip', async (data) => {
        try {
          const { ipAddress } = data;
          if (!ipAddress) {
            socket.emit('lookup:ip:error', { error: 'IP address required' });
            return;
          }

          // Emit loading state
          socket.emit('lookup:ip:loading', { ipAddress });

          // Perform IP analysis
          const ipGeolocation = require('./ipGeolocation');
          const threatIntelligence = require('./threatIntelligence');

          const [locationData, threatData] = await Promise.allSettled([
            ipGeolocation.getIPLocation(ipAddress),
            threatIntelligence.analyzeIPThreat(ipAddress)
          ]);

          const result = {
            ipAddress,
            timestamp: new Date(),
            location: locationData.status === 'fulfilled' ? locationData.value : null,
            threat: threatData.status === 'fulfilled' ? threatData.value : null,
            success: true
          };

          socket.emit('lookup:ip:result', result);
        } catch (error) {
          console.error('Manual IP lookup error:', error);
          socket.emit('lookup:ip:error', { 
            ipAddress: data.ipAddress, 
            error: error.message 
          });
        }
      });

      // Handle block/unblock IP requests
      socket.on('action:block-ip', async (data) => {
        try {
          const { ipAddress, reason, category } = data;
          // Here you would call your IP blocking service
          // For now, emit success
          socket.emit('action:block-ip:success', { 
            ipAddress, 
            reason, 
            category,
            timestamp: new Date()
          });
          
          // Broadcast to all connected admins
          this.broadcastToSubscribers('ip-monitoring', 'ip-blocked', {
            ipAddress,
            reason,
            blockedBy: socket.userName,
            timestamp: new Date()
          });
        } catch (error) {
          socket.emit('action:block-ip:error', { error: error.message });
        }
      });

      socket.on('action:unblock-ip', async (data) => {
        try {
          const { ipAddress, reason } = data;
          // Here you would call your IP unblocking service
          socket.emit('action:unblock-ip:success', { 
            ipAddress, 
            reason,
            timestamp: new Date()
          });
          
          // Broadcast to all connected admins
          this.broadcastToSubscribers('ip-monitoring', 'ip-unblocked', {
            ipAddress,
            reason,
            unblockedBy: socket.userName,
            timestamp: new Date()
          });
        } catch (error) {
          socket.emit('action:unblock-ip:error', { error: error.message });
        }
      });

      // Handle real-time analytics requests
      socket.on('subscribe:analytics', (metrics = []) => {
        const connection = this.connections.get(socket.id);
        if (connection) {
          connection.subscriptions.add('analytics');
          connection.analyticsMetrics = metrics;
          this.startAnalyticsUpdates(socket);
        }
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`🔌 Admin disconnected: ${socket.userEmail} (${reason})`);
        this.cleanupConnection(socket.id);
      });

      // Send welcome message with connection info
      socket.emit('connected', {
        message: 'WebSocket connection established',
        userId: socket.userId,
        connectionId: socket.id,
        timestamp: new Date()
      });
    });
  }

  /**
   * Send initial IP monitoring data to newly connected client
   */
  async sendIPMonitoringSnapshot(socket, options = {}) {
    try {
      // You would call your IP monitoring service here
      // For now, send mock data
      const snapshot = {
        timestamp: new Date(),
        summary: {
          totalActive: 45,
          uniqueIPs: 32,
          suspiciousActivity: 3,
          blockedIPs: 12,
          highRiskIPs: 2
        },
        recentActivity: [], // Would be populated by your IP monitoring service
        alerts: []
      };

      socket.emit('ip-monitoring:snapshot', snapshot);
    } catch (error) {
      console.error('Error sending IP monitoring snapshot:', error);
      socket.emit('ip-monitoring:error', { error: error.message });
    }
  }

  /**
   * Start periodic IP monitoring updates for a connection
   */
  startIPMonitoringUpdates(socket, options = {}) {
    const intervalMs = options.updateInterval || 30000; // Default 30 seconds
    
    const timerId = setInterval(async () => {
      if (!this.connections.has(socket.id)) {
        clearInterval(timerId);
        return;
      }

      try {
        // Fetch latest IP monitoring data
        const updateData = await this.fetchIPMonitoringUpdate(options);
        socket.emit('ip-monitoring:update', updateData);
      } catch (error) {
        console.error('Error sending IP monitoring update:', error);
        socket.emit('ip-monitoring:error', { error: error.message });
      }
    }, intervalMs);

    this.updateTimers.set(`ip-monitoring-${socket.id}`, timerId);
  }

  /**
   * Stop IP monitoring updates for a connection
   */
  stopIPMonitoringUpdates(socketId) {
    const timerId = this.updateTimers.get(`ip-monitoring-${socketId}`);
    if (timerId) {
      clearInterval(timerId);
      this.updateTimers.delete(`ip-monitoring-${socketId}`);
    }
  }

  /**
   * Fetch latest IP monitoring update data
   */
  async fetchIPMonitoringUpdate(options = {}) {
    try {
      // Here you would integrate with your actual IP monitoring services
      // For now, return mock data
      return {
        timestamp: new Date(),
        newActivity: [],
        alerts: [],
        summary: {
          totalActive: Math.floor(Math.random() * 20) + 40,
          suspiciousActivity: Math.floor(Math.random() * 5),
          blockedIPs: Math.floor(Math.random() * 5) + 10
        }
      };
    } catch (error) {
      console.error('Error fetching IP monitoring update:', error);
      return {
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Start analytics updates for a connection
   */
  startAnalyticsUpdates(socket) {
    const intervalMs = 15000; // 15 seconds for analytics
    
    const timerId = setInterval(async () => {
      if (!this.connections.has(socket.id)) {
        clearInterval(timerId);
        return;
      }

      try {
        const connection = this.connections.get(socket.id);
        const updateData = await this.fetchAnalyticsUpdate(connection.analyticsMetrics);
        socket.emit('analytics:update', updateData);
      } catch (error) {
        console.error('Error sending analytics update:', error);
        socket.emit('analytics:error', { error: error.message });
      }
    }, intervalMs);

    this.updateTimers.set(`analytics-${socket.id}`, timerId);
  }

  /**
   * Fetch latest analytics data
   */
  async fetchAnalyticsUpdate(metrics = []) {
    // Mock analytics data
    return {
      timestamp: new Date(),
      metrics: {
        activeUsers: Math.floor(Math.random() * 20) + 100,
        networkRequests: Math.floor(Math.random() * 1000) + 5000,
        errorRate: (Math.random() * 2).toFixed(2),
        responseTime: Math.floor(Math.random() * 500) + 200
      }
    };
  }

  /**
   * Start periodic background updates
   */
  startPeriodicUpdates() {
    // Global IP monitoring broadcast (every 60 seconds)
    setInterval(() => {
      if (this.getSubscriberCount('ip-monitoring') > 0) {
        this.broadcastIPMonitoringSummary();
      }
    }, 60000);

    // Threat intelligence updates (every 5 minutes)
    setInterval(() => {
      if (this.getSubscriberCount('threat-intel') > 0) {
        this.broadcastThreatIntelligenceUpdate();
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Broadcast IP monitoring summary to all subscribers
   */
  async broadcastIPMonitoringSummary() {
    try {
      const summary = {
        timestamp: new Date(),
        type: 'summary',
        data: {
          totalActive: Math.floor(Math.random() * 20) + 40,
          uniqueIPs: Math.floor(Math.random() * 15) + 25,
          suspiciousActivity: Math.floor(Math.random() * 5),
          blockedIPs: Math.floor(Math.random() * 5) + 10,
          highRiskIPs: Math.floor(Math.random() * 3)
        }
      };

      this.broadcastToSubscribers('ip-monitoring', 'ip-monitoring:summary', summary);
    } catch (error) {
      console.error('Error broadcasting IP monitoring summary:', error);
    }
  }

  /**
   * Broadcast threat intelligence updates
   */
  async broadcastThreatIntelligenceUpdate() {
    try {
      const update = {
        timestamp: new Date(),
        type: 'threat-update',
        data: {
          newThreats: Math.floor(Math.random() * 3),
          riskLevelChanges: Math.floor(Math.random() * 5),
          feedUpdates: ['Emerging Threats', 'AlienVault'][Math.floor(Math.random() * 2)]
        }
      };

      this.broadcastToSubscribers('threat-intel', 'threat-intel:update', update);
    } catch (error) {
      console.error('Error broadcasting threat intelligence update:', error);
    }
  }

  /**
   * Broadcast message to all subscribers of a specific topic
   */
  broadcastToSubscribers(topic, event, data) {
    let sentCount = 0;
    
    this.connections.forEach((connection) => {
      if (connection.subscriptions.has(topic)) {
        connection.socket.emit(event, data);
        sentCount++;
      }
    });
    
    console.log(`📡 Broadcasted ${event} to ${sentCount} subscribers of ${topic}`);
  }

  /**
   * Get number of subscribers for a topic
   */
  getSubscriberCount(topic) {
    let count = 0;
    this.connections.forEach((connection) => {
      if (connection.subscriptions.has(topic)) {
        count++;
      }
    });
    return count;
  }

  /**
   * Send real-time alert to all connected admins
   */
  sendAlert(alert) {
    const alertData = {
      ...alert,
      timestamp: new Date(),
      id: `alert_${Date.now()}`
    };

    // If no connections, queue the alert
    if (this.connections.size === 0) {
      this.queueEvent('alert', alertData);
      return;
    }

    this.io.emit('security:alert', alertData);
    console.log(`🚨 Security alert sent to ${this.connections.size} admin(s)`);
  }

  /**
   * Send IP activity notification
   */
  sendIPActivity(activity) {
    const activityData = {
      ...activity,
      timestamp: new Date()
    };

    this.broadcastToSubscribers('ip-monitoring', 'ip-monitoring:activity', activityData);
  }

  /**
   * Send threat detection notification
   */
  sendThreatDetection(threat) {
    const threatData = {
      ...threat,
      timestamp: new Date(),
      id: `threat_${Date.now()}`
    };

    this.io.emit('security:threat', threatData);
    console.log(`⚠️ Threat detection sent to ${this.connections.size} admin(s)`);
  }

  /**
   * Queue events when no connections are available
   */
  queueEvent(type, data) {
    if (this.eventQueue.length >= this.maxQueueSize) {
      this.eventQueue.shift(); // Remove oldest event
    }
    
    this.eventQueue.push({
      type,
      data,
      timestamp: new Date()
    });
  }

  /**
   * Send queued events to newly connected client
   */
  sendQueuedEvents(socket, maxEvents = 50) {
    const eventsToSend = this.eventQueue.slice(-maxEvents);
    if (eventsToSend.length > 0) {
      socket.emit('queued-events', eventsToSend);
      console.log(`📤 Sent ${eventsToSend.length} queued events to ${socket.userEmail}`);
    }
  }

  /**
   * Clean up connection and associated timers
   */
  cleanupConnection(socketId) {
    // Remove connection
    this.connections.delete(socketId);
    
    // Clear all timers for this connection
    const timersToDelete = [];
    this.updateTimers.forEach((timerId, key) => {
      if (key.includes(socketId)) {
        clearInterval(timerId);
        timersToDelete.push(key);
      }
    });
    
    timersToDelete.forEach(key => this.updateTimers.delete(key));
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    const stats = {
      totalConnections: this.connections.size,
      activeTimers: this.updateTimers.size,
      queuedEvents: this.eventQueue.length,
      subscriptions: {},
      connections: []
    };

    this.connections.forEach((connection, socketId) => {
      connection.subscriptions.forEach(sub => {
        stats.subscriptions[sub] = (stats.subscriptions[sub] || 0) + 1;
      });

      stats.connections.push({
        socketId: socketId.substr(0, 8) + '...',
        userEmail: connection.userEmail,
        connectedAt: connection.connectedAt,
        subscriptions: Array.from(connection.subscriptions)
      });
    });

    return stats;
  }

  /**
   * Gracefully shutdown WebSocket service
   */
  shutdown() {
    console.log('🔌 Shutting down WebSocket service...');
    
    // Clear all timers
    this.updateTimers.forEach(timerId => clearInterval(timerId));
    this.updateTimers.clear();
    
    // Disconnect all clients
    if (this.io) {
      this.io.emit('server-shutdown', { message: 'Server is shutting down' });
      this.io.close();
    }
    
    // Clear connections
    this.connections.clear();
    
    console.log('✅ WebSocket service shut down completed');
  }
}

// Export singleton instance
module.exports = new WebSocketService();
