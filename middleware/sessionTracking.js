const UserSession = require('../models/UserSession');
const User = require('../models/User');
const crypto = require('crypto');

/**
 * Middleware to track user sessions and real-time activity
 */
const trackUserSession = async (req, res, next) => {
  try {
    // Only track authenticated users
    if (!req.user || !req.user.id) {
      return next();
    }

    const userId = req.user.id;
    const sessionId = req.sessionID || req.headers['x-session-id'] || generateSessionId();
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    // Find or create user session
    let userSession = await UserSession.findOne({ 
      userId, 
      sessionId,
      isActive: true 
    });

    if (!userSession) {
      // Create new session
      userSession = new UserSession({
        userId,
        sessionId,
        ipAddress,
        userAgent,
        deviceInfo: parseUserAgent(userAgent),
        location: await getLocationFromIP(ipAddress) // Optional: implement IP geolocation
      });
      
      console.log(`🔴 New user session created for user ${userId}`);
    }

    // Update session activity
    await userSession.updateActivity();

    // Update user online status
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date(),
      sessionId: sessionId
    });

    // Add session info to request
    req.userSession = userSession;

    next();
  } catch (error) {
    console.error('❌ Session tracking error:', error);
    next(); // Continue even if tracking fails
  }
};

/**
 * Generate unique session ID
 */
const generateSessionId = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Parse user agent for device information
 */
const parseUserAgent = (userAgent) => {
  // Simple user agent parsing - you can use a library like 'useragent' for better parsing
  const info = {
    browser: 'Unknown',
    os: 'Unknown',
    device: 'Unknown'
  };

  if (userAgent) {
    // Browser detection
    if (userAgent.includes('Chrome')) info.browser = 'Chrome';
    else if (userAgent.includes('Firefox')) info.browser = 'Firefox';
    else if (userAgent.includes('Safari')) info.browser = 'Safari';
    else if (userAgent.includes('Edge')) info.browser = 'Edge';

    // OS detection
    if (userAgent.includes('Windows')) info.os = 'Windows';
    else if (userAgent.includes('Mac')) info.os = 'macOS';
    else if (userAgent.includes('Linux')) info.os = 'Linux';
    else if (userAgent.includes('Android')) info.os = 'Android';
    else if (userAgent.includes('iOS')) info.os = 'iOS';

    // Device detection
    if (userAgent.includes('Mobile')) info.device = 'Mobile';
    else if (userAgent.includes('Tablet')) info.device = 'Tablet';
    else info.device = 'Desktop';
  }

  return info;
};

/**
 * Get location from IP address (optional - requires geolocation service)
 */
const getLocationFromIP = async (ipAddress) => {
  // For now, return null - you can implement IP geolocation service later
  // Popular services: ip-api.com, ipstack.com, maxmind.com
  return null;
};

/**
 * Cleanup inactive sessions (run periodically)
 */
const cleanupInactiveSessions = async () => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    
    // Mark sessions as inactive if no activity for 15 minutes
    const inactiveSessions = await UserSession.find({
      isActive: true,
      lastActivity: { $lt: fifteenMinutesAgo }
    });

    for (const session of inactiveSessions) {
      await session.markInactive();
      
      // Update user online status
      await User.findByIdAndUpdate(session.userId, {
        isOnline: false,
        lastSeen: session.lastActivity
      });
    }

    if (inactiveSessions.length > 0) {
      console.log(`🔴 Cleaned up ${inactiveSessions.length} inactive sessions`);
    }
  } catch (error) {
    console.error('❌ Session cleanup error:', error);
  }
};

/**
 * Get real-time user statistics
 */
const getRealTimeStats = async () => {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Users online now (active sessions in last 5 minutes)
    const usersOnlineNow = await UserSession.countDocuments({
      isActive: true,
      lastActivity: { $gte: fiveMinutesAgo }
    });

    // Total sessions today
    const sessionsToday = await UserSession.countDocuments({
      loginTime: { $gte: today }
    });

    // Peak concurrent users (approximate)
    const peakConcurrentUsers = await UserSession.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d-%H",
              date: "$createdAt"
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 1
      }
    ]);

    return {
      usersOnlineNow,
      sessionsToday,
      peakConcurrentUsers: peakConcurrentUsers[0]?.count || 0,
      lastUpdated: now.toISOString()
    };
  } catch (error) {
    console.error('❌ Error getting real-time stats:', error);
    return {
      usersOnlineNow: 0,
      sessionsToday: 0,
      peakConcurrentUsers: 0,
      lastUpdated: new Date().toISOString()
    };
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupInactiveSessions, 5 * 60 * 1000);

module.exports = {
  trackUserSession,
  cleanupInactiveSessions,
  getRealTimeStats
};
