/**
 * AI Security Analysis Routes
 * Provides endpoints for AI-powered security analysis and recommendations
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken, authorizeAdmin } = require('../../middleware/auth');
const securityAnalysisService = require('../../services/ai/securityAnalysisService');

const router = express.Router();

// Rate limiter for AI endpoints (10 requests per minute)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    error: 'Too many AI analysis requests, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Enhanced rate limiter for expensive operations (3 requests per 5 minutes)
const heavyAILimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3,
  message: {
    error: 'Too many heavy AI analysis requests, please try again later.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   POST /api/admin/security/ai/analyze-user
 * @desc    Analyze individual user security profile using AI
 * @access  Private (Admin only)
 */
router.post('/analyze-user', verifyToken, authorizeAdmin, aiLimiter, async (req, res) => {
  try {
    const { userData, analysisType } = req.body;

    if (!userData) {
      return res.status(400).json({
        success: false,
        message: 'User data is required for analysis'
      });
    }

    console.log('🤖 Starting AI user security analysis for:', userData.email);

    const analysis = await securityAnalysisService.analyzeUserSecurityProfile(userData);

    res.status(200).json({
      success: true,
      data: {
        ...analysis,
        analysisType: analysisType || 'security_profile',
        analyzedAt: new Date().toISOString(),
        userId: userData.id || userData._id
      }
    });

    console.log('✅ AI user analysis completed for:', userData.email);
  } catch (error) {
    console.error('❌ AI User Analysis Error:', error);
    res.status(500).json({
      success: false,
      message: 'AI user security analysis failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/admin/security/ai/analyze-patterns
 * @desc    Analyze suspicious patterns across multiple users using AI
 * @access  Private (Admin only)
 */
router.post('/analyze-patterns', verifyToken, authorizeAdmin, heavyAILimiter, async (req, res) => {
  try {
    const { usersData, activityLogs, analysisType } = req.body;

    if (!usersData || !Array.isArray(usersData)) {
      return res.status(400).json({
        success: false,
        message: 'Users data array is required for pattern analysis'
      });
    }

    console.log(`🤖 Starting AI pattern analysis for ${usersData.length} users`);

    const analysis = await securityAnalysisService.analyzeSuspiciousPatterns(
      usersData, 
      activityLogs || []
    );

    res.status(200).json({
      success: true,
      data: {
        ...analysis,
        analysisType: analysisType || 'suspicious_patterns',
        analyzedAt: new Date().toISOString(),
        userCount: usersData.length,
        activityLogCount: activityLogs ? activityLogs.length : 0
      }
    });

    console.log('✅ AI pattern analysis completed');
  } catch (error) {
    console.error('❌ AI Pattern Analysis Error:', error);
    res.status(500).json({
      success: false,
      message: 'AI pattern analysis failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/admin/security/ai/recommendations
 * @desc    Generate AI-powered security recommendations for the platform
 * @access  Private (Admin only)
 */
router.post('/recommendations', verifyToken, authorizeAdmin, heavyAILimiter, async (req, res) => {
  try {
    const { platformData, analysisType } = req.body;

    if (!platformData) {
      return res.status(400).json({
        success: false,
        message: 'Platform data is required for recommendations'
      });
    }

    console.log('🤖 Starting AI security recommendations generation');

    const recommendations = await securityAnalysisService.generateSecurityRecommendations(platformData);

    res.status(200).json({
      success: true,
      data: {
        ...recommendations,
        analysisType: analysisType || 'security_recommendations',
        generatedAt: new Date().toISOString(),
        platformStats: {
          totalUsers: platformData.totalUsers,
          activeUsers: platformData.activeUsers,
          criticalIssues: platformData.criticalIssues
        }
      }
    });

    console.log('✅ AI security recommendations generated');
  } catch (error) {
    console.error('❌ AI Recommendations Error:', error);
    res.status(500).json({
      success: false,
      message: 'AI security recommendations generation failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/admin/security/ai/analyze-threats
 * @desc    Analyze security threats and suspicious activities using AI
 * @access  Private (Admin only)
 */
router.post('/analyze-threats', verifyToken, authorizeAdmin, aiLimiter, async (req, res) => {
  try {
    const { threatData, analysisType } = req.body;

    if (!threatData) {
      return res.status(400).json({
        success: false,
        message: 'Threat data is required for analysis'
      });
    }

    console.log('🤖 Starting AI threat analysis');

    const analysis = await securityAnalysisService.analyzeThreat(threatData);

    res.status(200).json({
      success: true,
      data: {
        ...analysis,
        analysisType: analysisType || 'threat_analysis',
        analyzedAt: new Date().toISOString(),
        originalThreat: {
          type: threatData.type,
          severity: threatData.severity,
          source: threatData.source
        }
      }
    });

    console.log('✅ AI threat analysis completed');
  } catch (error) {
    console.error('❌ AI Threat Analysis Error:', error);
    res.status(500).json({
      success: false,
      message: 'AI threat analysis failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/admin/security/ai/assess-login-risk
 * @desc    Assess login attempt risk using AI
 * @access  Private (Admin only)
 */
router.post('/assess-login-risk', verifyToken, authorizeAdmin, aiLimiter, async (req, res) => {
  try {
    const { loginData, analysisType } = req.body;

    if (!loginData) {
      return res.status(400).json({
        success: false,
        message: 'Login data is required for risk assessment'
      });
    }

    console.log('🤖 Starting AI login risk assessment for:', loginData.userEmail);

    const riskAssessment = await securityAnalysisService.assessLoginRisk(loginData);

    res.status(200).json({
      success: true,
      data: {
        ...riskAssessment,
        analysisType: analysisType || 'login_risk_assessment',
        assessedAt: new Date().toISOString(),
        loginAttempt: {
          userEmail: loginData.userEmail,
          ipAddress: loginData.ipAddress,
          timestamp: loginData.timestamp
        }
      }
    });

    console.log('✅ AI login risk assessment completed');
  } catch (error) {
    console.error('❌ AI Login Risk Assessment Error:', error);
    res.status(500).json({
      success: false,
      message: 'AI login risk assessment failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route   GET /api/admin/security/ai/health
 * @desc    Check AI service health and configuration
 * @access  Private (Admin only)
 */
router.get('/health', verifyToken, authorizeAdmin, (req, res) => {
  try {
    const aiEnabled = !!process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4';
    
    res.status(200).json({
      success: true,
      data: {
        aiEnabled,
        model,
        service: 'SecurityAnalysisService',
        status: 'operational',
        timestamp: new Date().toISOString(),
        endpoints: [
          'analyze-user',
          'analyze-patterns',
          'recommendations',
          'analyze-threats',
          'assess-login-risk'
        ]
      }
    });
  } catch (error) {
    console.error('❌ AI Health Check Error:', error);
    res.status(500).json({
      success: false,
      message: 'AI health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/admin/security/ai/batch-analyze
 * @desc    Batch analyze multiple users (for testing and bulk operations)
 * @access  Private (Admin only)
 */
router.post('/batch-analyze', verifyToken, authorizeAdmin, heavyAILimiter, async (req, res) => {
  try {
    const { usersData, batchSize = 3 } = req.body;

    if (!usersData || !Array.isArray(usersData)) {
      return res.status(400).json({
        success: false,
        message: 'Users data array is required for batch analysis'
      });
    }

    console.log(`🤖 Starting batch AI analysis for ${usersData.length} users`);

    const results = [];
    const errors = [];

    // Process in small batches to avoid overwhelming the AI service
    for (let i = 0; i < usersData.length; i += batchSize) {
      const batch = usersData.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (userData) => {
        try {
          return await securityAnalysisService.analyzeUserSecurityProfile(userData);
        } catch (error) {
          errors.push({
            userEmail: userData.email,
            error: error.message
          });
          return securityAnalysisService.getFallbackUserAnalysis(userData);
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < usersData.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    res.status(200).json({
      success: true,
      data: {
        results,
        totalAnalyzed: results.length,
        errors,
        batchSize,
        analyzedAt: new Date().toISOString()
      }
    });

    console.log(`✅ Batch AI analysis completed for ${results.length} users`);
  } catch (error) {
    console.error('❌ Batch AI Analysis Error:', error);
    res.status(500).json({
      success: false,
      message: 'Batch AI analysis failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
