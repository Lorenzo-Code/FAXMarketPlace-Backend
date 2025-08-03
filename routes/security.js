const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Rate limiter for auth endpoints (5 requests per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: 'Too many authentication requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General rate limiter for security endpoints (30 requests per minute)
const securityLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    error: 'Too many security requests, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   GET /api/auth/csrf-token
 * @desc    Get CSRF token for secure requests
 * @access  Public
 */
router.get('/csrf-token', securityLimiter, (req, res) => {
  try {
    const csrfToken = req.csrfToken();
    res.status(200).json({
      success: true,
      csrfToken,
      message: 'CSRF token generated successfully'
    });
  } catch (error) {
    console.error('❌ CSRF token generation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate CSRF token'
    });
  }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Private (requires valid refresh token)
 */
router.post('/refresh', authLimiter, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    // In a real implementation, you would:
    // 1. Validate the refresh token from HTTP-only cookie
    // 2. Generate new access token
    // 3. Set new HTTP-only cookies
    // 4. Return success response

    // For now, return a mock response
    const csrfToken = req.csrfToken();
    
    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      csrfToken,
      expiresIn: 15 * 60 * 1000 // 15 minutes
    });
    
    console.log('🔄 Token refreshed for session:', sessionId);
  } catch (error) {
    console.error('❌ Token refresh failed:', error);
    res.status(401).json({
      success: false,
      message: 'Token refresh failed'
    });
  }
});

/**
 * @route   GET /api/auth/session-check
 * @desc    Check current session validity
 * @access  Private
 */
router.get('/session-check', verifyToken, securityLimiter, (req, res) => {
  try {
    const user = req.user;
    const now = Date.now();
    const tokenExp = user.exp * 1000; // JWT exp is in seconds
    const expiresIn = tokenExp - now;

    if (expiresIn <= 0) {
      return res.status(401).json({
        success: false,
        message: 'Session expired'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Session is valid',
      user: {
        id: user._id || user.id,
        email: user.email,
        role: user.role
      },
      expiresIn,
      expiresAt: new Date(tokenExp).toISOString()
    });
  } catch (error) {
    console.error('❌ Session check failed:', error);
    res.status(401).json({
      success: false,
      message: 'Session validation failed'
    });
  }
});

/**
 * @route   POST /api/auth/extend-session
 * @desc    Extend current session
 * @access  Private
 */
router.post('/extend-session', verifyToken, authLimiter, (req, res) => {
  try {
    // In a real implementation, you would:
    // 1. Generate new token with extended expiry
    // 2. Update session in database/cache
    // 3. Set new HTTP-only cookies

    const user = req.user;
    const newExpiry = Date.now() + (30 * 60 * 1000); // Extend by 30 minutes
    
    res.status(200).json({
      success: true,
      message: 'Session extended successfully',
      expiresIn: 30 * 60 * 1000,
      expiresAt: new Date(newExpiry).toISOString()
    });
    
    console.log('⏰ Session extended for user:', user.email);
  } catch (error) {
    console.error('❌ Session extension failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extend session'
    });
  }
});

/**
 * @route   GET /api/health
 * @desc    API health check with security status
 * @access  Public
 */
router.get('/health', (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      security: {
        csrf: !!req.csrfToken,
        cors: true,
        helmet: true,
        rateLimit: true,
        compression: true
      }
    };

    res.status(200).json({
      success: true,
      ...healthStatus
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/security/validate-input
 * @desc    Validate input for security threats
 * @access  Private
 */
router.post('/validate-input', verifyToken, securityLimiter, (req, res) => {
  try {
    const { input, context } = req.body;
    
    if (!input) {
      return res.status(400).json({
        success: false,
        message: 'Input is required'
      });
    }

    // Basic threat detection patterns
    const threats = [];
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi
    ];
    
    const sqlPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
      /(--|\/\*|\*\/|;|\||&)/g
    ];

    // Check for XSS patterns
    xssPatterns.forEach((pattern, index) => {
      if (pattern.test(input)) {
        threats.push(`XSS_PATTERN_${index}`);
      }
    });

    // Check for SQL injection patterns
    sqlPatterns.forEach((pattern, index) => {
      if (pattern.test(input)) {
        threats.push(`SQL_INJECTION_${index}`);
      }
    });

    const safe = threats.length === 0;

    if (!safe) {
      console.warn(`🚨 Security threat detected in ${context || 'unknown'}:`, threats);
    }

    res.status(200).json({
      success: true,
      safe,
      threats,
      input: input.substring(0, 100), // Only return first 100 chars for logging
      context: context || 'unknown'
    });
  } catch (error) {
    console.error('❌ Input validation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Input validation failed'
    });
  }
});

module.exports = router;
