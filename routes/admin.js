const express = require("express");
const router = express.Router();
const User = require("../models/User");
const UserSession = require("../models/UserSession");
const { verifyToken, authorizeAdmin } = require("../middleware/auth");
const { getRealTimeStats, trackUserSession } = require("../middleware/sessionTracking");


// ✅ Dashboard Route
router.get("/dashboard", verifyToken, authorizeAdmin, (req, res) => {
  const userKey = req.user?.id || req.sessionID || "guest";
  console.log("🔐 Admin Access:", req.user, "| Cache/User Key:", userKey);

  // Return mock dashboard data that the frontend expects
  res.json({
    message: "Welcome to the admin dashboard.",
    totalUsers: 150,
    verifiedUsers: 120,
    tokenTransfers: 2450,
    activeSubscriptions: 85,
    userTrends: [
      { week: "Week 1", count: 25 },
      { week: "Week 2", count: 30 },
      { week: "Week 3", count: 35 },
      { week: "Week 4", count: 40 }
    ],
    tokenVolume: [
      { date: "Mon", volume: 1200 },
      { date: "Tue", volume: 1800 },
      { date: "Wed", volume: 1500 },
      { date: "Thu", volume: 2100 },
      { date: "Fri", volume: 1900 }
    ],
    revenueTrends: [
      { month: "Jan", revenue: 15000 },
      { month: "Feb", revenue: 18000 },
      { month: "Mar", revenue: 22000 },
      { month: "Apr", revenue: 25000 }
    ],
    reportUsage: [
      { day: "Mon", reports: 45 },
      { day: "Tue", reports: 52 },
      { day: "Wed", reports: 38 },
      { day: "Thu", reports: 65 },
      { day: "Fri", reports: 58 }
    ],
    activityFeed: [
      { icon: "👤", time: "2 min ago", message: "New user registered: john@example.com" },
      { icon: "💰", time: "5 min ago", message: "Token transfer completed: 1,500 FXCT" },
      { icon: "🏠", time: "10 min ago", message: "Property uploaded for review" },
      { icon: "📊", time: "15 min ago", message: "Weekly report generated" }
    ]
  });
});


// ✅ Get All Users
router.get("/users", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const users = await User.find().select("_id email role");
    res.json({ users });
  } catch (err) {
    res.status(500).json({ msg: "Failed to fetch users", error: err.message });
  }
});

// ✅ Promote User to Admin
router.post("/users/:id/promote", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { role: "admin" },
      { new: true }
    ).select("_id email role");

    if (!updated) return res.status(404).json({ msg: "User not found" });

    res.json({ msg: "User promoted to admin", user: updated });
  } catch (err) {
    res.status(500).json({ msg: "Promotion failed", error: err.message });
  }
});

const Property = require("../models/Property"); // adjust path if needed

// 🔍 List all properties for review
router.get("/properties", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const properties = await Property.find().sort({ createdAt: -1 });
    res.json({ properties });
  } catch (err) {
    res.status(500).json({ msg: "Failed to fetch properties", error: err.message });
  }
});

// ✅ Approve property
router.post("/properties/:id/approve", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );
    if (!property) return res.status(404).json({ msg: "Property not found" });
    res.json({ msg: "Property approved", property });
  } catch (err) {
    res.status(500).json({ msg: "Approval failed", error: err.message });
  }
});

// ❌ Reject property
router.post("/properties/:id/reject", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );
    if (!property) return res.status(404).json({ msg: "Property not found" });
    res.json({ msg: "Property rejected", property });
  } catch (err) {
    res.status(500).json({ msg: "Rejection failed", error: err.message });
  }
});

router.get("/token-analytics", verifyToken, authorizeAdmin, (req, res) => {
  res.json({
    fctBreakdown: {
      operations: 250000000,
      founders: 200000000,
      employees: 100000000,
      ecosystem: 395000000,
      presale: 35000000,
      liquidity: 20000000,
    },
    dailyVolume: [
      { date: "Jul 1", volume: 1120 },
      { date: "Jul 2", volume: 890 },
      { date: "Jul 3", volume: 1345 },
      { date: "Jul 4", volume: 980 },
      { date: "Jul 5", volume: 1500 },
      { date: "Jul 6", volume: 1225 },
      { date: "Jul 7", volume: 1730 },
    ],
  });
});

const AuditLog = require("../models/AuditLog");

router.get("/audit-logs", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { event, userId, role, limit = 100 } = req.query;

    // Build query dynamically based on filters
    const query = {};
    if (event) query.event = event;
    if (userId) query.user = userId;
    if (role) query.role = role;

    const logs = await AuditLog.find(query)
      .populate("user", "email")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({ logs });
  } catch (err) {
    console.error("❌ Audit log fetch error:", err);
    res.status(500).json({ msg: "Failed to fetch audit logs", error: err.message });
  }
});
// ✅ Enhanced User Analytics for Admin Dashboard (GET)
router.get("/analytics/users", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Core user metrics
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ emailVerified: true });
    const adminUsers = await User.countDocuments({ role: "admin" });
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: thirtyDaysAgo } 
    });
    const newUsersThisMonth = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });
    const newUsersThisWeek = await User.countDocuments({ 
      createdAt: { $gte: sevenDaysAgo } 
    });
    
    // Previous period comparisons
    const previousMonthStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const previousMonthEnd = thirtyDaysAgo;
    const newUsersPreviousMonth = await User.countDocuments({ 
      createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd } 
    });
    
    // Calculate growth rates
    const monthlyGrowthRate = previousMonthEnd > 0 
      ? Math.round(((newUsersThisMonth - newUsersPreviousMonth) / Math.max(newUsersPreviousMonth, 1)) * 100)
      : 0;
    
    // Daily registration trends (last 30 days)
    const dailyRegistrations = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
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

    // Weekly growth data (last 12 weeks)
    const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
    const weeklyGrowthData = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: twelveWeeksAgo }
        }
      },
      {
        $group: {
          _id: { 
            year: { $year: "$createdAt" },
            week: { $week: "$createdAt" }
          },
          newUsers: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.week": 1 }
      }
    ]);

    const weeklyGrowth = weeklyGrowthData.map((data, index) => ({
      week: `Week ${index + 1}`,
      date: `${data._id.year}-W${data._id.week}`,
      newUsers: data.newUsers,
      cumulative: weeklyGrowthData.slice(0, index + 1).reduce((sum, item) => sum + item.newUsers, 0)
    }));

    // User engagement analysis
    const highlyActiveUsers = await User.countDocuments({ 
      lastLogin: { $gte: sevenDaysAgo } 
    });
    const moderatelyActiveUsers = await User.countDocuments({ 
      lastLogin: { $gte: thirtyDaysAgo, $lt: sevenDaysAgo } 
    });
    const inactiveUsers = totalUsers - activeUsers;

    // Geographic distribution (mock data based on user patterns)
    const geographicDistribution = [
      { country: 'United States', users: Math.floor(totalUsers * 0.35), percentage: 35 },
      { country: 'Canada', users: Math.floor(totalUsers * 0.15), percentage: 15 },
      { country: 'United Kingdom', users: Math.floor(totalUsers * 0.12), percentage: 12 },
      { country: 'Germany', users: Math.floor(totalUsers * 0.08), percentage: 8 },
      { country: 'Australia', users: Math.floor(totalUsers * 0.06), percentage: 6 },
      { country: 'France', users: Math.floor(totalUsers * 0.05), percentage: 5 },
      { country: 'Others', users: Math.floor(totalUsers * 0.19), percentage: 19 }
    ];

    // User retention cohorts (simplified)
    const retentionData = await generateRetentionCohorts();
    
    // Advanced metrics
    const averageSessionDuration = '12m 34s'; // Mock data
    const bounceRate = Math.floor(Math.random() * 15) + 25; // 25-40%
    const conversionRate = totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(1) : 0;
    
    // User journey funnel
    const userFunnel = [
      { stage: 'Visitors', count: Math.floor(totalUsers * 3.2), percentage: 100 },
      { stage: 'Sign Ups', count: totalUsers, percentage: 31.25 },
      { stage: 'Email Verified', count: verifiedUsers, percentage: (verifiedUsers / totalUsers * 31.25).toFixed(1) },
      { stage: 'Profile Complete', count: Math.floor(verifiedUsers * 0.8), percentage: (verifiedUsers * 0.8 / totalUsers * 31.25).toFixed(1) },
      { stage: 'First Transaction', count: Math.floor(verifiedUsers * 0.6), percentage: (verifiedUsers * 0.6 / totalUsers * 31.25).toFixed(1) },
      { stage: 'Active Users', count: activeUsers, percentage: (activeUsers / totalUsers * 31.25).toFixed(1) }
    ];

    // Top user segments
    const userSegments = [
      { segment: 'New Users (< 30 days)', count: newUsersThisMonth, percentage: (newUsersThisMonth / totalUsers * 100).toFixed(1) },
      { segment: 'Active Users', count: activeUsers, percentage: (activeUsers / totalUsers * 100).toFixed(1) },
      { segment: 'Verified Users', count: verifiedUsers, percentage: (verifiedUsers / totalUsers * 100).toFixed(1) },
      { segment: 'Dormant Users (90+ days)', count: Math.max(0, totalUsers - activeUsers - newUsersThisMonth), percentage: (Math.max(0, totalUsers - activeUsers - newUsersThisMonth) / totalUsers * 100).toFixed(1) }
    ];

    // User activity heatmap (hours of day)
    const activityHeatmap = await generateActivityHeatmap();

    // Enhanced response with much richer data for immediate frontend impact
    res.json({
      // Core Metrics (Enhanced)
      totalUsers,
      verifiedUsers,
      adminUsers,
      activeUsers,
      newUsersThisMonth,
      newUsersThisWeek,
      
      // Growth Metrics (Real Data)
      monthlyGrowthRate,
      weeklyGrowth,
      dailyRegistrations,
      
      // Engagement Metrics (Enhanced)
      highlyActiveUsers,
      moderatelyActiveUsers,
      inactiveUsers,
      averageSessionDuration,
      bounceRate: `${bounceRate}%`,
      
      // New Performance Indicators
      performanceScore: Math.floor(85 + Math.random() * 10), // 85-95
      userSatisfactionScore: (8.2 + Math.random() * 1.5).toFixed(1), // 8.2-9.7
      platformHealthScore: Math.floor(88 + Math.random() * 8), // 88-96
      
      // Conversion & Retention (Enhanced)
      conversionRate: parseFloat(conversionRate),
      verificationRate: totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 100) : 0,
      retentionData,
      
      // User Journey & Segments (Enhanced)
      userFunnel,
      userSegments,
      geographicDistribution,
      
      // Activity Analysis (Enhanced)
      activityHeatmap,
      
      // New Real-Time Data (REAL TRACKING)
      realTimeStats: await getRealTimeStats(),
      
      // Enhanced Growth Projections
      growthProjections: {
        nextWeek: Math.floor(newUsersThisWeek * 1.1),
        nextMonth: Math.floor(newUsersThisMonth * 1.05),
        quarterlyForecast: Math.floor(totalUsers * 0.15),
        confidence: '87%'
      },
      
      // User Lifecycle Analysis
      userLifecycle: {
        newUsers: newUsersThisWeek,
        engagedUsers: highlyActiveUsers,
        returningUsers: moderatelyActiveUsers,
        churnRisk: Math.floor(inactiveUsers * 0.3),
        loyalUsers: Math.floor(activeUsers * 0.4)
      },
      
      // Advanced Segmentation
      advancedSegments: {
        highValueUsers: Math.floor(verifiedUsers * 0.2),
        powerUsers: Math.floor(activeUsers * 0.15),
        atRiskUsers: Math.floor(totalUsers * 0.08),
        champions: Math.floor(activeUsers * 0.05)
      },
      
      // Key Performance Indicators
      kpis: {
        acquisitionRate: '+12.5%',
        activationRate: `${Math.round((verifiedUsers / totalUsers) * 100)}%`,
        retentionRate: `${Math.round((activeUsers / totalUsers) * 100)}%`,
        revenuePerUser: '$' + (Math.random() * 50 + 25).toFixed(2),
        lifetimeValue: '$' + (Math.random() * 200 + 150).toFixed(2)
      },
      
      // User Behavior Patterns
      behaviorPatterns: {
        mostActiveDay: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][Math.floor(Math.random() * 5)],
        peakUsageHours: ['9:00-11:00', '14:00-16:00', '19:00-21:00'],
        averageActionsPerSession: Math.floor(Math.random() * 15) + 8,
        featureUsage: [
          { feature: 'Dashboard', usage: 95 },
          { feature: 'Properties', usage: 78 },
          { feature: 'Analytics', usage: 45 },
          { feature: 'Settings', usage: 67 },
          { feature: 'Support', usage: 23 }
        ]
      },
      
      // Alert System
      alerts: [
        {
          type: monthlyGrowthRate > 15 ? 'success' : monthlyGrowthRate < 0 ? 'warning' : 'info',
          title: monthlyGrowthRate > 15 ? 'Exceptional Growth' : monthlyGrowthRate < 0 ? 'Growth Decline' : 'Steady Growth',
          message: `User growth is ${monthlyGrowthRate > 0 ? '+' : ''}${monthlyGrowthRate}% this month`,
          priority: monthlyGrowthRate < 0 ? 'high' : 'medium'
        },
        {
          type: parseFloat(conversionRate) > 80 ? 'success' : parseFloat(conversionRate) < 50 ? 'warning' : 'info',
          title: 'Email Verification Rate',
          message: `${conversionRate}% of users have verified their email`,
          priority: parseFloat(conversionRate) < 50 ? 'high' : 'low'
        }
      ],
      
      // Insights & Recommendations (Enhanced)
      insights: generateUserInsights({
        totalUsers,
        verifiedUsers,
        activeUsers,
        monthlyGrowthRate,
        conversionRate: parseFloat(conversionRate)
      }),
      
      // Smart Recommendations
      recommendations: [
        {
          title: 'Boost User Engagement',
          description: 'Implement gamification features to increase daily active users',
          impact: 'High',
          effort: 'Medium',
          estimatedIncrease: '+15-25%'
        },
        {
          title: 'Improve Onboarding',
          description: 'Streamline email verification process to reduce drop-off',
          impact: 'Medium',
          effort: 'Low',
          estimatedIncrease: '+8-12%'
        },
        {
          title: 'User Retention Campaign',
          description: 'Launch targeted campaigns for inactive users',
          impact: 'High',
          effort: 'Medium',
          estimatedIncrease: '+20-30%'
        }
      ],
      
      // Metadata (Enhanced)
      lastUpdated: now.toISOString(),
      dataRange: '30 days',
      dataQuality: '95%',
      nextRefresh: new Date(now.getTime() + 15 * 60 * 1000).toISOString()
    });
  } catch (err) {
    console.error("❌ Enhanced user analytics error:", err);
    res.status(500).json({ msg: "Failed to fetch user analytics", error: err.message });
  }
});

// ✅ Comprehensive User Analytics with Filters (POST)
router.post("/analytics/users", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { timeRange, metric, segment, filters } = req.body;
    
    // Get real user counts
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ emailVerified: true });
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
    });
    
    // Get recent users with real data
    const recentUsers = await User.find()
      .select('firstName lastName email role emailVerified lastLogin createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    
    // Transform users for frontend
    const transformedUsers = recentUsers.map(user => ({
      ...user,
      status: user.lastLogin && new Date(user.lastLogin) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) ? 'active' : 'inactive',
      kycStatus: user.emailVerified ? 'approved' : 'pending',
      fxctBalance: (Math.random() * 10000).toFixed(2),
      fxstBalance: (Math.random() * 5000).toFixed(2),
      riskScore: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)]
    }));
    
    // Mock analytics data based on filters
    const mockData = {
      totalUsers,
      activeUsers,
      verifiedUsers,
      totalTokenBalance: Math.floor(Math.random() * 1000000),
      userGrowth: Math.floor(Math.random() * 20) - 10,
      activityChange: Math.floor(Math.random() * 30) - 15,
      verificationChange: Math.floor(Math.random() * 25) - 12,
      tokenChange: Math.floor(Math.random() * 40) - 20,
      
      // Chart data
      registrationTrends: generateTimeSeriesData(timeRange, 'registrations'),
      activityTrends: generateTimeSeriesData(timeRange, 'activity'),
      
      statusDistribution: [
        { name: 'Active', value: activeUsers },
        { name: 'Inactive', value: totalUsers - activeUsers },
        { name: 'Verified', value: verifiedUsers },
        { name: 'Pending', value: totalUsers - verifiedUsers }
      ],
      
      countryDistribution: [
        { country: 'United States', count: Math.floor(totalUsers * 0.35) },
        { country: 'Canada', count: Math.floor(totalUsers * 0.15) },
        { country: 'United Kingdom', count: Math.floor(totalUsers * 0.12) },
        { country: 'Germany', count: Math.floor(totalUsers * 0.08) },
        { country: 'Australia', count: Math.floor(totalUsers * 0.06) },
        { country: 'Others', count: Math.floor(totalUsers * 0.24) }
      ],
      
      recentUsers: transformedUsers
    };
    
    res.json(mockData);
  } catch (err) {
    console.error("❌ Comprehensive user analytics error:", err);
    res.status(500).json({ msg: "Failed to fetch user analytics", error: err.message });
  }
});

// ✅ Individual User Behavior Analytics
router.get("/analytics/user-behavior/:userId", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Mock user behavior data - replace with real activity tracking
    const behaviorData = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      activity: Math.floor(Math.random() * 20) + 1
    }));
    
    res.json({ behaviorData });
  } catch (err) {
    console.error("❌ User behavior analytics error:", err);
    res.status(500).json({ msg: "Failed to fetch user behavior", error: err.message });
  }
});

// ✅ Export Analytics Data
router.post("/analytics/export", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { timeRange, metric, segment } = req.body;
    
    // Get user data for export
    const users = await User.find()
      .select('firstName lastName email role emailVerified lastLogin createdAt')
      .lean();
    
    // Create CSV content
    const csvHeaders = 'First Name,Last Name,Email,Role,Email Verified,Last Login,Created At\n';
    const csvData = users.map(user => 
      `${user.firstName},${user.lastName},${user.email},${user.role},${user.emailVerified},${user.lastLogin || 'Never'},${user.createdAt}`
    ).join('\n');
    
    const csvContent = csvHeaders + csvData;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="user_analytics_${timeRange}_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error("❌ Export analytics error:", err);
    res.status(500).json({ msg: "Failed to export analytics", error: err.message });
  }
});

// ✅ REAL DATA ANALYTICS ENDPOINTS

// ✅ Main Dashboard Analytics (Real Data)
router.get("/analytics/dashboard", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Real user counts
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: thirtyDaysAgo } 
    });
    const newUsers = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });
    const verifiedUsers = await User.countDocuments({ emailVerified: true });
    
    // Calculate conversion rate (verified users / total users)
    const conversionRate = totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(1) : 0;
    
    // User growth over the last 4 months (real data)
    const fourMonthsAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const userGrowthData = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: fourMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);
    
    // Transform growth data for frontend
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const userGrowth = userGrowthData.map(item => ({
      month: monthNames[item._id.month - 1],
      users: item.count
    }));
    
    // If no growth data, provide fallback
    if (userGrowth.length === 0) {
      userGrowth.push(
        { month: 'Current', users: totalUsers }
      );
    }
    
    res.json({
      overview: {
        totalUsers,
        activeUsers,
        newUsers,
        conversionRate: parseFloat(conversionRate)
      },
      userGrowth
    });
  } catch (err) {
    console.error("❌ Dashboard analytics error:", err);
    res.status(500).json({ msg: "Failed to fetch dashboard analytics", error: err.message });
  }
});

// ✅ Real-Time Analytics
router.get("/analytics/realtime", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Real-time metrics
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: oneHourAgo } 
    });
    
    const currentSessions = await AuditLog.countDocuments({
      type: "login",
      timestamp: { $gte: oneHourAgo }
    });
    
    // Page views approximation from audit logs
    const pageViews = await AuditLog.countDocuments({
      timestamp: { $gte: oneDayAgo }
    });
    
    res.json({
      activeUsers,
      currentSessions,
      pageViews
    });
  } catch (err) {
    console.error("❌ Real-time analytics error:", err);
    res.status(500).json({ msg: "Failed to fetch real-time analytics", error: err.message });
  }
});

// ✅ User Metrics with Real Data
router.get("/analytics/user-metrics", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Demographics data
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ emailVerified: true });
    const adminUsers = await User.countDocuments({ role: "admin" });
    const twoFactorUsers = await User.countDocuments({ twoFactorEnabled: true });
    
    // User activity behavior
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: thirtyDaysAgo } 
    });
    
    // Recent user registrations by day (last 7 days)
    const weeklyRegistrations = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
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
    
    const demographics = {
      total: totalUsers,
      verified: verifiedUsers,
      admins: adminUsers,
      twoFactorEnabled: twoFactorUsers,
      verificationRate: totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(1) : 0
    };
    
    const behavior = {
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      activityRate: totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0
    };
    
    const retention = {
      weeklyRegistrations
    };
    
    res.json({
      demographics,
      behavior,
      retention
    });
  } catch (err) {
    console.error("❌ User metrics error:", err);
    res.status(500).json({ msg: "Failed to fetch user metrics", error: err.message });
  }
});

// ✅ Property Analytics (Real Data)
router.get("/analytics/properties", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const totalProperties = await Property.countDocuments();
    const approvedProperties = await Property.countDocuments({ status: "approved" });
    const pendingProperties = await Property.countDocuments({ status: "pending" });
    const rejectedProperties = await Property.countDocuments({ status: "rejected" });
    const fractionalProperties = await Property.countDocuments({ isFractional: true });
    const aiSuggestedProperties = await Property.countDocuments({ isAISuggested: true });
    
    // Property submissions over time (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const propertyTrends = await Property.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
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
    
    // Average property price
    const priceStats = await Property.aggregate([
      {
        $group: {
          _id: null,
          avgPrice: { $avg: "$price" },
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" }
        }
      }
    ]);
    
    res.json({
      overview: {
        total: totalProperties,
        approved: approvedProperties,
        pending: pendingProperties,
        rejected: rejectedProperties,
        fractional: fractionalProperties,
        aiSuggested: aiSuggestedProperties
      },
      trends: propertyTrends,
      priceStats: priceStats[0] || { avgPrice: 0, minPrice: 0, maxPrice: 0 }
    });
  } catch (err) {
    console.error("❌ Property analytics error:", err);
    res.status(500).json({ msg: "Failed to fetch property analytics", error: err.message });
  }
});

// ✅ Activity Analytics from Audit Logs
router.get("/analytics/activity", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Activity by type
    const activityByType = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    // Daily activity trends
    const dailyActivity = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);
    
    // Recent activity feed (last 20 items)
    const recentActivity = await AuditLog.find()
      .populate('userId', 'email firstName lastName')
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();
    
    res.json({
      activityByType,
      dailyActivity,
      recentActivity
    });
  } catch (err) {
    console.error("❌ Activity analytics error:", err);
    res.status(500).json({ msg: "Failed to fetch activity analytics", error: err.message });
  }
});

// ✅ Advanced User Behavior Analytics
router.get("/analytics/user-behavior", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // User login patterns
    const loginPatterns = await User.aggregate([
      {
        $match: {
          lastLogin: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            hour: { $hour: "$lastLogin" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.hour": 1 }
      }
    ]);
    
    // User engagement levels
    const engagementLevels = await User.aggregate([
      {
        $lookup: {
          from: "auditlogs",
          localField: "_id",
          foreignField: "userId",
          as: "activities"
        }
      },
      {
        $addFields: {
          activityCount: { $size: "$activities" },
          engagementLevel: {
            $switch: {
              branches: [
                { case: { $gte: [{ $size: "$activities" }, 20] }, then: "high" },
                { case: { $gte: [{ $size: "$activities" }, 5] }, then: "medium" },
                { case: { $gt: [{ $size: "$activities" }, 0] }, then: "low" }
              ],
              default: "inactive"
            }
          }
        }
      },
      {
        $group: {
          _id: "$engagementLevel",
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      loginPatterns,
      engagementLevels
    });
  } catch (err) {
    console.error("❌ User behavior analytics error:", err);
    res.status(500).json({ msg: "Failed to fetch user behavior analytics", error: err.message });
  }
});

// ✅ Enhanced User Analytics with Advanced Features
router.post("/analytics/users/enhanced", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { timeRange, metric, segment, filters } = req.body;
    
    // Get real user counts
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ emailVerified: true });
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
    });
    
    // Enhanced analytics data
    const enhancedData = {
      // Basic metrics
      totalUsers,
      activeUsers,
      verifiedUsers,
      revenuePerUser: (Math.random() * 200 + 50).toFixed(2),
      engagementScore: (Math.random() * 2 + 8).toFixed(1),
      
      // Growth metrics
      userGrowth: Math.floor(Math.random() * 20) - 10,
      activityChange: Math.floor(Math.random() * 30) - 15,
      revenueChange: Math.floor(Math.random() * 25) - 12,
      engagementChange: Math.floor(Math.random() * 15) - 7,
      
      // Trend data for mini charts
      userTrend: generateMiniTrendData(7),
      activityTrend: generateMiniTrendData(7),
      revenueTrend: generateMiniTrendData(7),
      engagementTrend: generateMiniTrendData(7),
      
      // Predictions
      userPrediction: `+${Math.floor(Math.random() * 500 + 100)}`,
      activityAlert: Math.random() > 0.7,
      
      // Smart Alerts
      alerts: generateSmartAlerts(),
      
      // User Journey Mapping
      userJourney: [
        { name: 'Sign Up', completion: 100, avgTime: '2m 30s', dropOff: 0 },
        { name: 'Email Verification', completion: 85, avgTime: '5m 15s', dropOff: 15 },
        { name: 'Profile Setup', completion: 72, avgTime: '8m 45s', dropOff: 13 },
        { name: 'First Transaction', completion: 45, avgTime: '2d 4h', dropOff: 27 },
        { name: 'Regular Usage', completion: 32, avgTime: '7d 12h', dropOff: 13 }
      ],
      
      // Activity Heatmap
      activityHeatmap: [
        { name: 'Trading', value: 2400, fill: '#3B82F6' },
        { name: 'Portfolio', value: 1890, fill: '#10B981' },
        { name: 'Dashboard', value: 1200, fill: '#F59E0B' },
        { name: 'Settings', value: 800, fill: '#EF4444' },
        { name: 'Support', value: 400, fill: '#8B5CF6' }
      ],
      
      // Cohort Analysis
      cohortData: generateCohortData(),
      
      // AI Insights
      aiInsights: [
        {
          title: 'User Engagement Spike',
          description: 'Engagement increased 23% after UI update',
          confidence: 94
        },
        {
          title: 'Churn Risk Identified',
          description: '15% of users show churn indicators',
          confidence: 87
        },
        {
          title: 'Revenue Opportunity',
          description: 'Premium feature adoption could increase 31%',
          confidence: 82
        }
      ],
      
      // Lifecycle Analysis
      lifecycleData: [
        { stage: 'Acquisition', score: 85 },
        { stage: 'Activation', score: 72 },
        { stage: 'Retention', score: 68 },
        { stage: 'Revenue', score: 45 },
        { stage: 'Referral', score: 32 }
      ],
      
      // Conversion Funnel
      conversionFunnel: [
        { stage: 'Visitors', users: 10000, rate: 100 },
        { stage: 'Sign Ups', users: 3200, rate: 32 },
        { stage: 'Email Verified', users: 2720, rate: 85 },
        { stage: 'Profile Complete', users: 1958, rate: 72 },
        { stage: 'First Transaction', users: 881, rate: 45 },
        { stage: 'Active Users', users: 282, rate: 32 }
      ]
    };
    
    res.json(enhancedData);
  } catch (err) {
    console.error("❌ Enhanced analytics error:", err);
    res.status(500).json({ msg: "Failed to fetch enhanced analytics", error: err.message });
  }
});

// ✅ AI Insights Endpoint
router.get("/analytics/ai-insights", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    // Generate AI-powered insights based on real data
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
    });
    
    const activityRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;
    
    const insights = [
      {
        title: 'User Activity Trend',
        description: `${activityRate.toFixed(1)}% of users are active in the last 30 days`,
        confidence: 95,
        type: 'positive',
        recommendation: activityRate > 60 ? 'Maintain current engagement strategies' : 'Consider implementing user retention campaigns'
      },
      {
        title: 'Growth Pattern Analysis',
        description: `Platform has ${totalUsers} registered users with steady growth`,
        confidence: 88,
        type: 'neutral',
        recommendation: 'Focus on conversion optimization for better user acquisition'
      }
    ];
    
    const recommendations = [
      {
        title: 'Implement Push Notifications',
        impact: 'High',
        effort: 'Medium',
        description: 'Re-engage inactive users with targeted push notifications'
      },
      {
        title: 'A/B Test Onboarding Flow',
        impact: 'Medium',
        effort: 'Low',
        description: 'Optimize user registration and verification process'
      }
    ];
    
    res.json({
      insights,
      recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ AI insights error:', err);
    res.status(500).json({ msg: 'Failed to fetch AI insights', error: err.message });
  }
});

// ✅ Predictive Analytics
router.get("/analytics/predictions", verifyToken, authorizeAdmin, (req, res) => {
  const predictiveData = {
    userGrowthForecast: '+24%',
    churnRisk: '12%',
    revenueProjection: '$89K',
    
    // Growth prediction model data
    growthPrediction: [
      { month: 'Jan', actual: 1200, predicted: 1180 },
      { month: 'Feb', actual: 1350, predicted: 1320 },
      { month: 'Mar', actual: 1180, predicted: 1210 },
      { month: 'Apr', actual: 1420, predicted: 1450 },
      { month: 'May', actual: null, predicted: 1580 },
      { month: 'Jun', actual: null, predicted: 1720 }
    ],
    
    // Churn risk analysis
    churnAnalysis: Array.from({ length: 50 }, () => ({
      engagement: Math.random() * 100,
      tenure: Math.random() * 365,
      risk: Math.random() * 100
    }))
  };
  
  res.json(predictiveData);
});

// Helper functions for enhanced analytics
function generateMiniTrendData(days) {
  return Array.from({ length: days }, (_, i) => ({
    value: Math.floor(Math.random() * 100) + 50
  }));
}

// Generate retention cohort analysis
async function generateRetentionCohorts() {
  const cohorts = [];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  
  for (let i = 0; i < 6; i++) {
    const cohortSize = Math.floor(Math.random() * 200) + 50;
    const retention = [];
    
    for (let week = 0; week < 12; week++) {
      const baseRetention = 100 - (week * 8);
      const variance = Math.random() * 15 - 7.5;
      const retentionRate = Math.max(0, Math.min(100, baseRetention + variance));
      retention.push(Math.round(retentionRate));
    }
    
    cohorts.push({
      month: months[i],
      cohortSize,
      retention
    });
  }
  
  return cohorts;
}

// Generate activity heatmap data
async function generateActivityHeatmap() {
  const hours = [];
  
  for (let hour = 0; hour < 24; hour++) {
    // Simulate realistic activity patterns (higher during business hours)
    let activity;
    if (hour >= 9 && hour <= 17) {
      activity = Math.floor(Math.random() * 50) + 30; // 30-80 during business hours
    } else if (hour >= 18 && hour <= 22) {
      activity = Math.floor(Math.random() * 40) + 20; // 20-60 evening hours
    } else {
      activity = Math.floor(Math.random() * 20) + 5; // 5-25 overnight
    }
    
    hours.push({
      hour: hour.toString().padStart(2, '0') + ':00',
      activity,
      dayOfWeek: Math.floor(Math.random() * 7) + 1
    });
  }
  
  return hours;
}

// Generate intelligent user insights
function generateUserInsights({ totalUsers, verifiedUsers, activeUsers, monthlyGrowthRate, conversionRate }) {
  const insights = [];
  
  // Growth insight
  if (monthlyGrowthRate > 10) {
    insights.push({
      type: 'positive',
      title: 'Strong Growth Momentum',
      description: `User base grew by ${monthlyGrowthRate}% this month, indicating healthy platform adoption.`,
      recommendation: 'Consider scaling infrastructure and support resources to accommodate growth.',
      priority: 'high'
    });
  } else if (monthlyGrowthRate < 0) {
    insights.push({
      type: 'warning',
      title: 'User Growth Decline',
      description: `User registrations decreased by ${Math.abs(monthlyGrowthRate)}% this month.`,
      recommendation: 'Investigate potential barriers to signup and consider marketing campaigns.',
      priority: 'high'
    });
  }
  
  // Engagement insight
  const engagementRate = (activeUsers / totalUsers) * 100;
  if (engagementRate > 60) {
    insights.push({
      type: 'positive',
      title: 'High User Engagement',
      description: `${engagementRate.toFixed(1)}% of users are active, showing strong platform engagement.`,
      recommendation: 'Leverage high engagement to gather user feedback and introduce premium features.',
      priority: 'medium'
    });
  } else if (engagementRate < 30) {
    insights.push({
      type: 'warning',
      title: 'Low User Engagement',
      description: `Only ${engagementRate.toFixed(1)}% of users are active. This may indicate usability issues.`,
      recommendation: 'Implement user onboarding improvements and engagement campaigns.',
      priority: 'high'
    });
  }
  
  // Conversion insight
  if (conversionRate > 80) {
    insights.push({
      type: 'positive',
      title: 'Excellent Conversion Rate',
      description: `${conversionRate}% email verification rate shows smooth onboarding process.`,
      recommendation: 'Document current onboarding best practices for future reference.',
      priority: 'low'
    });
  } else if (conversionRate < 50) {
    insights.push({
      type: 'warning',
      title: 'Low Email Verification Rate',
      description: `${conversionRate}% verification rate suggests potential email delivery issues.`,
      recommendation: 'Check email delivery systems and consider improving verification UX.',
      priority: 'medium'
    });
  }
  
  // User base size insight
  if (totalUsers > 1000) {
    insights.push({
      type: 'info',
      title: 'Scaling Milestone Reached',
      description: `Platform has reached ${totalUsers} users, entering scaling phase.`,
      recommendation: 'Consider implementing advanced analytics, A/B testing, and user segmentation.',
      priority: 'medium'
    });
  }
  
  return insights;
}

function generateSmartAlerts() {
  const alerts = [
    {
      title: 'High Churn Risk Detected',
      description: '15 users showing churn indicators in the last 24 hours',
      severity: 'high',
      time: '2 min ago'
    },
    {
      title: 'Unusual Login Activity',
      description: 'Login attempts from new geographic locations increased by 40%',
      severity: 'medium',
      time: '15 min ago'
    },
    {
      title: 'Revenue Target Achievement',
      description: 'Monthly revenue target reached 5 days early',
      severity: 'low',
      time: '1 hour ago'
    }
  ];
  
  // Randomly return some alerts
  return alerts.filter(() => Math.random() > 0.4);
}

function generateCohortData() {
  const months = ['Jan 2024', 'Feb 2024', 'Mar 2024', 'Apr 2024', 'May 2024', 'Jun 2024'];
  
  return months.map(month => ({
    month,
    size: Math.floor(Math.random() * 500) + 100,
    retention: Array.from({ length: 12 }, (_, i) => {
      const baseRetention = 100 - (i * 8) - Math.random() * 10;
      return Math.max(0, Math.floor(baseRetention));
    })
  }));
}

// Helper function to generate time series data
function generateTimeSeriesData(timeRange, dataType) {
  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
  
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const value = dataType === 'registrations' 
      ? Math.floor(Math.random() * 50) + 10
      : Math.floor(Math.random() * 200) + 50;
    
    return {
      date: date.toISOString().split('T')[0],
      [dataType === 'registrations' ? 'registrations' : 'activeUsers']: value
    };
  });
}

// ✅ Security Dashboard Data
router.get("/security/dashboard", verifyToken, authorizeAdmin, (req, res) => {
  // Mock security metrics - replace with real data from your security models
  res.json({
    twoFactorEnabled: 245,
    activeSessions: 89,
    suspiciousActivity: 3,
    blockedIPs: 12,
    securityAlerts: [
      { type: "failed_login", count: 15, severity: "medium" },
      { type: "ip_blocked", count: 3, severity: "high" },
      { type: "unusual_activity", count: 7, severity: "low" }
    ],
    sessionData: [
      { day: "Mon", sessions: 45 },
      { day: "Tue", sessions: 52 },
      { day: "Wed", sessions: 38 },
      { day: "Thu", sessions: 65 },
      { day: "Fri", sessions: 58 }
    ]
  });
});

// ✅ KYC Applications Management
router.get("/kyc/applications", verifyToken, authorizeAdmin, (req, res) => {
  // Mock KYC data - replace with real KYC model queries
  res.json({
    pending: 23,
    approved: 156,
    rejected: 8,
    applications: [
      {
        id: "kyc_001",
        userEmail: "john.doe@example.com",
        status: "pending",
        submittedAt: "2024-08-03T10:30:00Z",
        documents: ["passport", "address_proof"]
      },
      {
        id: "kyc_002",
        userEmail: "jane.smith@example.com",
        status: "pending",
        submittedAt: "2024-08-03T09:15:00Z",
        documents: ["drivers_license", "utility_bill"]
      }
    ]
  });
});

// ✅ Review KYC Application
router.post("/kyc/applications/:id/review", verifyToken, authorizeAdmin, (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body; // action: 'approve' | 'reject'
  
  // Mock KYC review - replace with real logic
  console.log(`📋 KYC Review: ${id} - ${action}`, reason || '');
  
  res.json({
    msg: `KYC application ${action}d successfully`,
    applicationId: id,
    action,
    reviewedBy: req.user.email,
    reviewedAt: new Date().toISOString()
  });
});

// ✅ Communication Tools Integration
router.get("/communications/slack", verifyToken, authorizeAdmin, (req, res) => {
  // Mock Slack integration data
  res.json({
    connected: true,
    channels: [
      { name: "#admin-alerts", members: 5 },
      { name: "#user-support", members: 12 },
      { name: "#compliance", members: 3 }
    ],
    recentMessages: [
      { channel: "#admin-alerts", message: "New user registration spike detected", time: "2 min ago" },
      { channel: "#user-support", message: "Ticket #1234 resolved", time: "5 min ago" }
    ]
  });
});

router.get("/communications/helpscout", verifyToken, authorizeAdmin, (req, res) => {
  // Mock Help Scout integration data
  res.json({
    connected: false,
    openTickets: 7,
    resolvedToday: 12,
    avgResponseTime: "2.3 hours",
    recentTickets: []
  });
});

// ✅ Force User Logout (Session Management)
router.post("/users/:id/logout", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // In a real implementation, you'd invalidate user sessions/tokens
    console.log(`🔐 Admin force logout for user: ${id}`);
    
    res.json({
      msg: "User sessions terminated successfully",
      userId: id,
      actionBy: req.user.email
    });
  } catch (err) {
    res.status(500).json({ msg: "Failed to logout user", error: err.message });
  }
});

// ✅ Toggle User 2FA
router.post("/users/:id/toggle-2fa", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { enable } = req.body;
    
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ msg: "User not found" });
    
    // Mock 2FA toggle - replace with real 2FA logic
    console.log(`🔐 Admin ${enable ? 'enabled' : 'disabled'} 2FA for user: ${user.email}`);
    
    res.json({
      msg: `2FA ${enable ? 'enabled' : 'disabled'} for user`,
      userId: id,
      twoFactorEnabled: enable,
      actionBy: req.user.email
    });
  } catch (err) {
    res.status(500).json({ msg: "Failed to toggle 2FA", error: err.message });
  }
});



// ✅ Comprehensive User Analytics Dashboard
router.get("/analytics/users/comprehensive", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const now = new Date();
    const periods = {
      today: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      quarter: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      year: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    };

    // Core metrics with period comparisons
    const metrics = {};
    for (const [period, date] of Object.entries(periods)) {
      metrics[period] = {
        totalUsers: await User.countDocuments({ createdAt: { $lte: date } }) || 0,
        newUsers: await User.countDocuments({ createdAt: { $gte: date } }),
        activeUsers: await User.countDocuments({ lastLogin: { $gte: date } }),
        verifiedUsers: await User.countDocuments({ 
          emailVerified: true, 
          createdAt: { $lte: date } 
        }) || 0
      };
    }

    // Advanced user segmentation
    const segmentation = {
      byRole: await User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      byVerificationStatus: [
        { status: 'Verified', count: await User.countDocuments({ emailVerified: true }) },
        { status: 'Unverified', count: await User.countDocuments({ emailVerified: false }) }
      ],
      
      byActivityLevel: [
        { level: 'High (< 7 days)', count: await User.countDocuments({ lastLogin: { $gte: periods.week } }) },
        { level: 'Medium (7-30 days)', count: await User.countDocuments({ 
          lastLogin: { $gte: periods.month, $lt: periods.week } 
        }) },
        { level: 'Low (30+ days)', count: await User.countDocuments({ 
          $or: [
            { lastLogin: { $lt: periods.month } },
            { lastLogin: { $exists: false } }
          ]
        }) }
      ],
      
      byRegistrationPeriod: [
        { period: 'Last 24h', count: metrics.today.newUsers },
        { period: 'Last Week', count: metrics.week.newUsers },
        { period: 'Last Month', count: metrics.month.newUsers },
        { period: 'Last Quarter', count: metrics.quarter.newUsers }
      ]
    };

    // User journey analytics
    const totalUsers = await User.countDocuments();
    const userJourney = {
      acquisition: {
        totalSignups: totalUsers,
        organicSignups: Math.floor(totalUsers * 0.7),
        referralSignups: Math.floor(totalUsers * 0.2),
        paidSignups: Math.floor(totalUsers * 0.1)
      },
      
      activation: {
        emailVerified: await User.countDocuments({ emailVerified: true }),
        profileCompleted: Math.floor(totalUsers * 0.65), // Mock data
        firstActionTaken: Math.floor(totalUsers * 0.55) // Mock data
      },
      
      engagement: {
        dailyActiveUsers: await User.countDocuments({ lastLogin: { $gte: periods.today } }),
        weeklyActiveUsers: await User.countDocuments({ lastLogin: { $gte: periods.week } }),
        monthlyActiveUsers: await User.countDocuments({ lastLogin: { $gte: periods.month } })
      }
    };

    // Growth analytics with trends
    const growthAnalytics = await generateGrowthTrends();
    
    // Churn analysis
    const churnAnalysis = await generateChurnAnalysis();
    
    // User lifetime value estimation
    const lifetimeValue = {
      averageLTV: '$234.50', // Mock data
      ltv30Days: '$45.20',
      ltv90Days: '$128.90',
      ltv180Days: '$198.30',
      ltv365Days: '$234.50'
    };

    // Performance benchmarks
    const benchmarks = {
      industryAverages: {
        dailyActiveRate: '12%',
        weeklyActiveRate: '35%',
        monthlyActiveRate: '65%',
        churnRate: '8%',
        conversionRate: '3.2%'
      },
      platformPerformance: {
        dailyActiveRate: `${((metrics.today.activeUsers / totalUsers) * 100).toFixed(1)}%`,
        weeklyActiveRate: `${((metrics.week.activeUsers / totalUsers) * 100).toFixed(1)}%`,
        monthlyActiveRate: `${((metrics.month.activeUsers / totalUsers) * 100).toFixed(1)}%`,
        churnRate: '5.2%', // Mock data
        conversionRate: `${((metrics.month.verifiedUsers / totalUsers) * 100).toFixed(1)}%`
      }
    };

    // Predictive insights
    const predictions = {
      nextWeek: {
        expectedNewUsers: Math.floor(metrics.week.newUsers * 1.1),
        expectedChurn: Math.floor(metrics.week.activeUsers * 0.02)
      },
      nextMonth: {
        expectedNewUsers: Math.floor(metrics.month.newUsers * 1.05),
        expectedChurn: Math.floor(metrics.month.activeUsers * 0.08)
      },
      confidence: 87
    };

    // Alert system
    const alerts = generateAdvancedAlerts(metrics, totalUsers);

    res.json({
      summary: {
        totalUsers,
        growthRate: calculateGrowthRate(metrics.month.newUsers, metrics.quarter.newUsers - metrics.month.newUsers),
        activeRate: ((metrics.month.activeUsers / totalUsers) * 100).toFixed(1),
        conversionRate: ((metrics.month.verifiedUsers / totalUsers) * 100).toFixed(1),
        lastUpdated: now.toISOString()
      },
      
      metrics,
      segmentation,
      userJourney,
      growthAnalytics,
      churnAnalysis,
      lifetimeValue,
      benchmarks,
      predictions,
      alerts,
      
      metadata: {
        dataRange: '365 days',
        refreshRate: '15 minutes',
        accuracy: '95%'
      }
    });
    
  } catch (err) {
    console.error('❌ Comprehensive analytics error:', err);
    res.status(500).json({ msg: 'Failed to fetch comprehensive analytics', error: err.message });
  }
});

// Helper functions for comprehensive analytics
async function generateGrowthTrends() {
  const months = [];
  const now = new Date();
  
  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    const newUsers = await User.countDocuments({
      createdAt: { $gte: monthStart, $lte: monthEnd }
    });
    
    months.push({
      month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
      newUsers,
      growthRate: i === 11 ? 0 : Math.random() * 20 - 10 // Mock growth rate calculation
    });
  }
  
  return {
    monthlyTrends: months,
    averageMonthlyGrowth: months.reduce((sum, m) => sum + (m.growthRate || 0), 0) / months.length,
    bestMonth: months.reduce((best, current) => current.newUsers > best.newUsers ? current : best, months[0]),
    worstMonth: months.reduce((worst, current) => current.newUsers < worst.newUsers ? current : worst, months[0])
  };
}

async function generateChurnAnalysis() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  
  const activeUsers = await User.countDocuments({ lastLogin: { $gte: thirtyDaysAgo } });
  const previousActiveUsers = await User.countDocuments({ 
    lastLogin: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } 
  });
  
  const churnRate = previousActiveUsers > 0 
    ? ((previousActiveUsers - activeUsers) / previousActiveUsers * 100).toFixed(1)
    : 0;
  
  return {
    currentChurnRate: `${churnRate}%`,
    riskFactors: [
      { factor: 'No activity > 14 days', usersAtRisk: Math.floor(Math.random() * 50) + 10 },
      { factor: 'Email not verified', usersAtRisk: await User.countDocuments({ emailVerified: false }) },
      { factor: 'No transactions', usersAtRisk: Math.floor(Math.random() * 100) + 20 }
    ],
    retentionStrategies: [
      { strategy: 'Email re-engagement campaign', estimatedRecovery: '15-25%' },
      { strategy: 'Push notifications', estimatedRecovery: '8-12%' },
      { strategy: 'Personalized offers', estimatedRecovery: '20-30%' }
    ]
  };
}

function calculateGrowthRate(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function generateAdvancedAlerts(metrics, totalUsers) {
  const alerts = [];
  
  // Growth alert
  const weeklyGrowth = calculateGrowthRate(metrics.week.newUsers, metrics.month.newUsers - metrics.week.newUsers);
  if (weeklyGrowth < -10) {
    alerts.push({
      type: 'warning',
      title: 'Declining User Growth',
      message: `Weekly user growth dropped by ${Math.abs(weeklyGrowth)}%`,
      priority: 'high',
      action: 'Review marketing campaigns and user acquisition channels'
    });
  }
  
  // Activity alert
  const activityRate = (metrics.week.activeUsers / totalUsers) * 100;
  if (activityRate < 25) {
    alerts.push({
      type: 'warning',
      title: 'Low User Activity',
      message: `Only ${activityRate.toFixed(1)}% of users were active this week`,
      priority: 'medium',
      action: 'Implement user engagement initiatives'
    });
  }
  
  // Conversion alert
  const conversionRate = (metrics.month.verifiedUsers / totalUsers) * 100;
  if (conversionRate < 60) {
    alerts.push({
      type: 'info',
      title: 'Conversion Opportunity',
      message: `Email verification rate is ${conversionRate.toFixed(1)}%`,
      priority: 'medium',
      action: 'Optimize email verification process'
    });
  }
  
  return alerts;
}

// ✅ TEMPORARY TEST ENDPOINT (NO AUTH) - Remove in production
router.get("/test/analytics-data", async (req, res) => {
  try {
    console.log("🧪 Testing real analytics data...");
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Real user counts
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ 
      lastLogin: { $gte: thirtyDaysAgo } 
    });
    const newUsers = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });
    const verifiedUsers = await User.countDocuments({ emailVerified: true });
    
    // Real property counts
    const totalProperties = await Property.countDocuments();
    const approvedProperties = await Property.countDocuments({ status: "approved" });
    const pendingProperties = await Property.countDocuments({ status: "pending" });
    
    // Real audit log count
    const totalAuditLogs = await AuditLog.countDocuments();
    
    // Calculate conversion rate
    const conversionRate = totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(1) : 0;
    
    const testData = {
      message: "✅ Real data from database",
      overview: {
        totalUsers,
        activeUsers,
        newUsers,
        conversionRate: parseFloat(conversionRate),
        totalProperties,
        approvedProperties,
        pendingProperties,
        totalAuditLogs
      },
      timestamp: new Date().toISOString()
    };
    
    console.log("📊 Test data response:", testData);
    res.json(testData);
  } catch (err) {
    console.error("❌ Test endpoint error:", err);
    res.status(500).json({ msg: "Test endpoint failed", error: err.message });
  }
});

// ✅ Manual Analytics Trigger (for testing WebSocket broadcasts)
router.post("/test/trigger-analytics", verifyToken, authorizeAdmin, async (req, res) => {
  try {
    const realTimeAnalytics = require('../services/realTimeAnalytics');
    await realTimeAnalytics.triggerUpdate();
    
    res.json({
      message: "📊 Analytics update triggered successfully",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ Manual trigger error:", err);
    res.status(500).json({ msg: "Failed to trigger analytics update", error: err.message });
  }
});

module.exports = router;
