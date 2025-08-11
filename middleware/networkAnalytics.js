const NetworkAnalytics = require('../models/NetworkAnalytics');
const { estimateProviderCost, getMonthlyUsageStats } = require('../config/providerPricing');

/**
 * Extract OpenAI model and token information from request/response
 */
function extractOpenAITokenInfo(requestData, responseData) {
  let model = 'gpt-3.5-turbo'; // default
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    // Extract model from request
    if (requestData && requestData.model) {
      model = requestData.model;
    }

    // Extract token usage from response
    if (responseData && responseData.usage) {
      inputTokens = responseData.usage.prompt_tokens || 0;
      outputTokens = responseData.usage.completion_tokens || 0;
    } else if (requestData) {
      // Estimate tokens if not provided in response
      const text = JSON.stringify(requestData);
      inputTokens = Math.ceil(text.length / 4); // Rough estimation: 4 chars per token
    }

    return { model, inputTokens, outputTokens };
  } catch (error) {
    console.warn('Failed to extract OpenAI token info:', error.message);
    return { model, inputTokens, outputTokens };
  }
}

/**
 * Extract request metrics for different providers
 */
function extractRequestMetrics(provider, requestData, responseData) {
  const metrics = {
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    messageCount: 1,
    verificationCount: 1
  };

  switch (provider.toLowerCase()) {
    case 'openai':
      const tokenInfo = extractOpenAITokenInfo(requestData, responseData);
      Object.assign(metrics, tokenInfo);
      break;

    case 'twilio':
    case 'sendgrid':
      // For messaging services, check if it's a bulk operation
      if (requestData && Array.isArray(requestData.to)) {
        metrics.messageCount = requestData.to.length;
      } else if (requestData && Array.isArray(requestData.personalizations)) {
        metrics.messageCount = requestData.personalizations.length;
      }
      break;

    case 'sumsub':
    case 'jumio':
      // For KYC services, usually 1 verification per call
      metrics.verificationCount = 1;
      break;
  }

  return metrics;
}

/**
 * Enhanced cost calculation using real pricing models
 */
async function getEstimatedCost(provider, endpoint, requestData, responseData, userId = null) {
  try {
    // Extract metrics specific to the provider
    const metrics = extractRequestMetrics(provider, requestData, responseData);
    
    // Add userId for volume tier calculation
    metrics.userId = userId;
    
    const costInDollars = await estimateProviderCost(provider, endpoint, metrics);
    
    // Convert to cents for storage (database expects cost in cents)
    const costInCents = Math.round(costInDollars * 100);
    
    return costInCents;
  } catch (error) {
    console.warn(`Cost estimation failed for ${provider}/${endpoint}:`, error.message);
    return 0;
  }
}

/**
 * Sanitize request parameters to remove sensitive data
 */
function sanitizeRequestParams(params) {
  if (!params || typeof params !== 'object') return {};
  
  const sensitiveKeys = ['key', 'token', 'password', 'secret', 'api_key', 'apikey', 'authorization'];
  const sanitized = { ...params };
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Track network analytics for external API calls with enhanced cost calculation
 */
async function trackNetworkRequest({
  provider,
  endpoint,
  method = 'GET',
  status,
  responseTime,
  statusCode,
  requestSize = 0,
  responseSize = 0,
  errorMessage,
  userId,
  ipAddress,
  userAgent,
  requestParams,
  responseData,
  cacheHit = false,
  rateLimitRemaining,
  rateLimitResetTime,
  metadata
}) {
  try {
    // Calculate cost using enhanced pricing system with real provider data
    const cost = await getEstimatedCost(provider, endpoint, requestParams, responseData, userId);
    const sanitizedParams = sanitizeRequestParams(requestParams);
    
    const analyticsData = {
      provider: provider.toLowerCase(),
      endpoint,
      method,
      status,
      responseTime,
      statusCode,
      requestSize,
      responseSize,
      cost,
      errorMessage,
      userId,
      ipAddress,
      userAgent,
      requestParams: sanitizedParams,
      cacheHit,
      rateLimitRemaining,
      rateLimitResetTime,
      metadata
    };
    
    // Create analytics record
    const analytics = new NetworkAnalytics(analyticsData);
    await analytics.save();
    
    // Log important metrics
    console.log(`📊 Network Analytics: ${provider}/${endpoint} - ${status} (${responseTime}ms) ${cacheHit ? '[CACHED]' : ''}`);
    
    // Alert on errors or slow responses
    if (status === 'error') {
      console.error(`🚨 Network Error: ${provider}/${endpoint} - ${errorMessage} (Status: ${statusCode})`);
    } else if (responseTime > 5000) { // Alert on responses > 5 seconds
      console.warn(`⚠️ Slow Response: ${provider}/${endpoint} - ${responseTime}ms`);
    }
    
    return analytics;
  } catch (error) {
    console.error('❌ Failed to track network analytics:', error.message);
    // Don't throw - analytics failure shouldn't break the main flow
    return null;
  }
}

/**
 * Axios interceptor for automatic tracking
 */
function createAxiosInterceptor(provider, defaultUserId = null) {
  return {
    request: (config) => {
      // Add timing start
      config.metadata = {
        ...config.metadata,
        startTime: Date.now(),
        provider,
        userId: config.userId || defaultUserId
      };
      return config;
    },
    
    response: async (response) => {
      const { config } = response;
      const endTime = Date.now();
      const responseTime = endTime - config.metadata.startTime;
      
      // Extract endpoint from URL
      const url = new URL(config.url);
      const endpoint = url.pathname.replace(/^\/+/, '');
      
      // Track successful request
      await trackNetworkRequest({
        provider,
        endpoint,
        method: config.method.toUpperCase(),
        status: 'success',
        responseTime,
        statusCode: response.status,
        requestSize: JSON.stringify(config.data || {}).length,
        responseSize: JSON.stringify(response.data || {}).length,
        userId: config.metadata.userId,
        requestParams: { 
          ...config.params, 
          ...config.data 
        },
        responseData: response.data, // Pass response data for cost calculation
        cacheHit: response.headers['x-cache'] === 'HIT',
        rateLimitRemaining: parseInt(response.headers['x-ratelimit-remaining']),
        rateLimitResetTime: response.headers['x-ratelimit-reset'] ? 
          new Date(parseInt(response.headers['x-ratelimit-reset']) * 1000) : null,
        metadata: {
          url: config.url,
          userAgent: config.headers['User-Agent']
        }
      });
      
      return response;
    },
    
    error: async (error) => {
      const { config } = error;
      if (!config || !config.metadata) return Promise.reject(error);
      
      const endTime = Date.now();
      const responseTime = endTime - config.metadata.startTime;
      
      // Extract endpoint from URL
      const url = new URL(config.url);
      const endpoint = url.pathname.replace(/^\/+/, '');
      
      // Determine error status
      let status = 'error';
      if (error.code === 'ECONNABORTED') {
        status = 'timeout';
      } else if (error.response?.status === 429) {
        status = 'rate_limited';
      }
      
      // Track failed request
      await trackNetworkRequest({
        provider,
        endpoint,
        method: config.method.toUpperCase(),
        status,
        responseTime,
        statusCode: error.response?.status,
        requestSize: JSON.stringify(config.data || {}).length,
        responseSize: 0,
        errorMessage: error.message,
        userId: config.metadata.userId,
        requestParams: { 
          ...config.params, 
          ...config.data 
        },
        rateLimitRemaining: parseInt(error.response?.headers['x-ratelimit-remaining']),
        rateLimitResetTime: error.response?.headers['x-ratelimit-reset'] ? 
          new Date(parseInt(error.response.headers['x-ratelimit-reset']) * 1000) : null,
        metadata: {
          url: config.url,
          userAgent: config.headers['User-Agent'],
          errorCode: error.code
        }
      });
      
      return Promise.reject(error);
    }
  };
}

/**
 * Express middleware to track internal API requests
 */
function expressNetworkMiddleware(provider, endpoint) {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    // Override res.json to capture response
    const originalJson = res.json;
    res.json = function(data) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Track the request
      trackNetworkRequest({
        provider: 'internal',
        endpoint: endpoint || req.route?.path || req.path,
        method: req.method,
        status: res.statusCode >= 400 ? 'error' : 'success',
        responseTime,
        statusCode: res.statusCode,
        requestSize: JSON.stringify(req.body || {}).length,
        responseSize: JSON.stringify(data || {}).length,
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        requestParams: {
          query: req.query,
          params: req.params,
          body: req.body
        },
        metadata: {
          path: req.path,
          originalUrl: req.originalUrl
        }
      });
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

module.exports = {
  trackNetworkRequest,
  createAxiosInterceptor,
  expressNetworkMiddleware,
  getEstimatedCost,
  sanitizeRequestParams
};
