const OpenAI = require('openai');
const NodeCache = require('node-cache');
const fs = require('fs').promises;
const path = require('path');

/**
 * Automated IP Blocking Service
 * Uses AI-powered threat analysis to automatically block malicious IPs
 */
class IPBlockingService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Cache for blocking decisions (TTL: 1 hour)
    this.decisionCache = new NodeCache({ stdTTL: 3600 });
    
    // Cache for blocked IPs (TTL: 24 hours)
    this.blockedIPsCache = new NodeCache({ stdTTL: 86400 });
    
    // Configuration
    this.config = {
      // Risk thresholds for automated blocking (0-100)
      autoBlockThreshold: 85, // Block IPs with risk score >= 85
      reviewThreshold: 70,    // Flag for manual review if risk >= 70
      
      // Rate limiting thresholds
      maxRequestsPerMinute: 60,
      maxFailedAttemptsPerHour: 10,
      maxConnectionsPerIP: 5,
      
      // Geolocation blocking
      blockedCountries: ['CN', 'RU', 'KP'], // Can be configured
      allowedCountries: [], // If specified, only these are allowed
      
      // Time-based blocking
      temporaryBlockDuration: 24 * 60 * 60 * 1000, // 24 hours
      permanentBlockThreshold: 3, // After 3 temporary blocks, make permanent
      
      // Whitelist for trusted IPs
      whitelist: [
        '127.0.0.1',
        '::1',
        // Add your trusted IPs here
      ],
      
      // Categories for blocking
      blockCategories: {
        'malware': { severity: 95, action: 'block' },
        'botnet': { severity: 90, action: 'block' },
        'scanning': { severity: 75, action: 'review' },
        'spam': { severity: 60, action: 'monitor' },
        'tor': { severity: 50, action: 'monitor' },
        'vpn': { severity: 30, action: 'allow' }
      }
    };
    
    // In-memory storage (replace with database in production)
    this.blockedIPs = new Map();
    this.suspiciousActivity = new Map();
    this.blockingHistory = [];
    
    // Statistics
    this.stats = {
      totalBlocked: 0,
      autoBlocked: 0,
      manualBlocked: 0,
      falsePositives: 0,
      reviewQueue: 0
    };
    
    this.initializeService();
  }

  /**
   * Initialize the IP blocking service
   */
  async initializeService() {
    try {
      await this.loadBlockedIPs();
      await this.loadConfiguration();
      this.startPeriodicTasks();
      console.log('🛡️ IP Blocking Service initialized');
    } catch (error) {
      console.error('Error initializing IP Blocking Service:', error);
    }
  }

  /**
   * Analyze IP and determine if it should be blocked
   * @param {string} ipAddress - IP address to analyze
   * @param {object} context - Additional context (user activity, geolocation, etc.)
   * @returns {object} - Blocking decision with reasoning
   */
  async analyzeIP(ipAddress, context = {}) {
    try {
      // Check cache first
      const cacheKey = `decision_${ipAddress}`;
      const cachedDecision = this.decisionCache.get(cacheKey);
      if (cachedDecision) {
        return cachedDecision;
      }

      // Check whitelist
      if (this.isWhitelisted(ipAddress)) {
        const decision = {
          action: 'allow',
          reason: 'IP is whitelisted',
          riskScore: 0,
          confidence: 100,
          timestamp: new Date()
        };
        this.decisionCache.set(cacheKey, decision);
        return decision;
      }

      // Check if already blocked
      if (this.isBlocked(ipAddress)) {
        return {
          action: 'blocked',
          reason: 'IP is already blocked',
          riskScore: 100,
          confidence: 100,
          timestamp: new Date()
        };
      }

      // Gather threat intelligence
      const threatData = await this.gatherThreatIntelligence(ipAddress, context);
      
      // Use OpenAI for intelligent analysis
      const aiAnalysis = await this.performAIAnalysis(ipAddress, threatData, context);
      
      // Calculate final risk score
      const finalRiskScore = this.calculateFinalRiskScore(threatData, aiAnalysis, context);
      
      // Make blocking decision
      const decision = this.makeBlockingDecision(ipAddress, finalRiskScore, aiAnalysis, context);
      
      // Cache decision
      this.decisionCache.set(cacheKey, decision);
      
      // Execute action if needed
      if (decision.action === 'block') {
        await this.executeBlock(ipAddress, decision);
      }
      
      return decision;

    } catch (error) {
      console.error(`Error analyzing IP ${ipAddress}:`, error);
      return {
        action: 'error',
        reason: 'Analysis failed',
        error: error.message,
        riskScore: 0,
        confidence: 0,
        timestamp: new Date()
      };
    }
  }

  /**
   * Gather threat intelligence data for an IP
   */
  async gatherThreatIntelligence(ipAddress, context) {
    try {
      // Get geolocation data
      const ipGeolocation = require('./ipGeolocation');
      const locationData = await ipGeolocation.getIPLocation(ipAddress);
      
      // Get threat intelligence
      const threatIntelligence = require('./threatIntelligence');
      const threatData = await threatIntelligence.analyzeIPThreat(ipAddress);
      
      // Get activity patterns
      const activityData = this.getActivityPatterns(ipAddress);
      
      // Get reputation data (mock - replace with real service)
      const reputationData = await this.getIPReputation(ipAddress);
      
      return {
        location: locationData,
        threat: threatData,
        activity: activityData,
        reputation: reputationData,
        context
      };
    } catch (error) {
      console.error('Error gathering threat intelligence:', error);
      return {
        location: null,
        threat: null,
        activity: null,
        reputation: null,
        context,
        error: error.message
      };
    }
  }

  /**
   * Use OpenAI to perform intelligent IP analysis
   */
  async performAIAnalysis(ipAddress, threatData, context) {
    try {
      const prompt = this.buildAnalysisPrompt(ipAddress, threatData, context);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a cybersecurity expert analyzing IP addresses for potential threats. 
            Provide a JSON response with risk assessment, recommendations, and confidence scores.
            Consider factors like geolocation, known threat feeds, behavioral patterns, and context.
            Risk scores should be 0-100 where 0 is safe and 100 is maximum threat.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      
      return {
        ...analysis,
        model: "gpt-4",
        timestamp: new Date(),
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens
      };

    } catch (error) {
      console.error('OpenAI analysis error:', error);
      
      // Fallback to rule-based analysis
      return this.performRuleBasedAnalysis(ipAddress, threatData, context);
    }
  }

  /**
   * Build analysis prompt for OpenAI
   */
  buildAnalysisPrompt(ipAddress, threatData, context) {
    return `Analyze this IP address for security threats:

IP Address: ${ipAddress}

Geolocation Data:
${JSON.stringify(threatData.location, null, 2)}

Threat Intelligence:
${JSON.stringify(threatData.threat, null, 2)}

Activity Patterns:
${JSON.stringify(threatData.activity, null, 2)}

Reputation Data:
${JSON.stringify(threatData.reputation, null, 2)}

Context:
${JSON.stringify(context, null, 2)}

Please provide a JSON response with the following structure:
{
  "riskScore": 0-100,
  "confidence": 0-100,
  "category": "malware|botnet|scanning|spam|tor|vpn|legitimate",
  "reasoning": "detailed explanation of the assessment",
  "indicators": ["list", "of", "risk", "indicators"],
  "recommendation": "block|review|monitor|allow",
  "severity": "low|medium|high|critical",
  "falsePositiveRisk": 0-100,
  "additionalContext": "any additional insights"
}`;
  }

  /**
   * Fallback rule-based analysis when AI is not available
   */
  performRuleBasedAnalysis(ipAddress, threatData, context) {
    let riskScore = 0;
    const indicators = [];
    let category = 'legitimate';
    
    // Analyze geolocation
    if (threatData.location) {
      if (this.config.blockedCountries.includes(threatData.location.country)) {
        riskScore += 40;
        indicators.push(`Location: ${threatData.location.country} (blocked country)`);
        category = 'geographic';
      }
      
      if (threatData.location.isTor) {
        riskScore += 30;
        indicators.push('Tor exit node detected');
        category = 'tor';
      }
      
      if (threatData.location.isProxy || threatData.location.isVpn) {
        riskScore += 20;
        indicators.push('Proxy/VPN detected');
        category = 'vpn';
      }
    }
    
    // Analyze threat intelligence
    if (threatData.threat) {
      riskScore += threatData.threat.riskScore || 0;
      if (threatData.threat.category) {
        category = threatData.threat.category;
      }
      if (threatData.threat.indicators) {
        indicators.push(...threatData.threat.indicators);
      }
    }
    
    // Analyze activity patterns
    if (threatData.activity) {
      if (threatData.activity.requestRate > this.config.maxRequestsPerMinute) {
        riskScore += 25;
        indicators.push('High request rate detected');
      }
      
      if (threatData.activity.failedAttempts > this.config.maxFailedAttemptsPerHour) {
        riskScore += 35;
        indicators.push('Multiple failed authentication attempts');
      }
    }
    
    // Determine recommendation
    let recommendation = 'allow';
    if (riskScore >= this.config.autoBlockThreshold) {
      recommendation = 'block';
    } else if (riskScore >= this.config.reviewThreshold) {
      recommendation = 'review';
    } else if (riskScore >= 30) {
      recommendation = 'monitor';
    }
    
    return {
      riskScore: Math.min(riskScore, 100),
      confidence: 75, // Rule-based analysis has moderate confidence
      category,
      reasoning: `Rule-based analysis identified ${indicators.length} risk indicators`,
      indicators,
      recommendation,
      severity: riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
      falsePositiveRisk: 20, // Rule-based has higher false positive risk
      additionalContext: 'Analysis performed using rule-based fallback system'
    };
  }

  /**
   * Calculate final risk score combining all factors
   */
  calculateFinalRiskScore(threatData, aiAnalysis, context) {
    const baseScore = aiAnalysis.riskScore || 0;
    const confidence = aiAnalysis.confidence || 50;
    
    // Apply confidence weighting
    let adjustedScore = baseScore * (confidence / 100);
    
    // Apply context adjustments
    if (context.isFirstVisit && baseScore < 50) {
      adjustedScore *= 0.8; // Reduce score for first-time visitors with low base score
    }
    
    if (context.hasValidSession && baseScore < 70) {
      adjustedScore *= 0.9; // Reduce score for users with valid sessions
    }
    
    if (context.suspiciousUserAgent) {
      adjustedScore += 10; // Increase score for suspicious user agents
    }
    
    return Math.min(Math.max(adjustedScore, 0), 100);
  }

  /**
   * Make final blocking decision
   */
  makeBlockingDecision(ipAddress, riskScore, aiAnalysis, context) {
    let action = 'allow';
    let reason = 'IP appears safe';
    
    if (riskScore >= this.config.autoBlockThreshold) {
      action = 'block';
      reason = `High risk score: ${riskScore.toFixed(1)}`;
    } else if (riskScore >= this.config.reviewThreshold) {
      action = 'review';
      reason = `Moderate risk score requires manual review: ${riskScore.toFixed(1)}`;
    } else if (riskScore >= 30) {
      action = 'monitor';
      reason = `Low-moderate risk, monitoring recommended: ${riskScore.toFixed(1)}`;
    }
    
    return {
      action,
      reason,
      riskScore: riskScore,
      confidence: aiAnalysis.confidence,
      category: aiAnalysis.category,
      indicators: aiAnalysis.indicators || [],
      aiAnalysis,
      timestamp: new Date()
    };
  }

  /**
   * Execute IP blocking
   */
  async executeBlock(ipAddress, decision) {
    try {
      const blockData = {
        ipAddress,
        reason: decision.reason,
        riskScore: decision.riskScore,
        category: decision.category,
        indicators: decision.indicators,
        timestamp: new Date(),
        expiresAt: decision.action === 'permanent' 
          ? null 
          : new Date(Date.now() + this.config.temporaryBlockDuration),
        isAutomatic: true,
        source: 'ai-analysis'
      };
      
      // Store in blocked IPs
      this.blockedIPs.set(ipAddress, blockData);
      this.blockedIPsCache.set(ipAddress, blockData);
      
      // Update statistics
      this.stats.totalBlocked++;
      this.stats.autoBlocked++;
      
      // Add to history
      this.blockingHistory.unshift({
        ...blockData,
        action: 'blocked'
      });
      
      // Keep history limited
      if (this.blockingHistory.length > 1000) {
        this.blockingHistory = this.blockingHistory.slice(0, 1000);
      }
      
      // Save to persistent storage
      await this.saveBlockedIPs();
      
      // Notify WebSocket service if available
      try {
        const websocketService = require('./websocketService');
        websocketService.sendAlert({
          type: 'ip-blocked',
          severity: decision.riskScore >= 90 ? 'critical' : 'high',
          message: `IP ${ipAddress} automatically blocked`,
          ipAddress,
          reason: decision.reason,
          riskScore: decision.riskScore,
          category: decision.category
        });
      } catch (wsError) {
        console.log('WebSocket service not available for alert');
      }
      
      console.log(`🚫 Automatically blocked IP: ${ipAddress} (Risk: ${decision.riskScore})`);
      
    } catch (error) {
      console.error(`Error executing block for IP ${ipAddress}:`, error);
    }
  }

  /**
   * Check if IP is whitelisted
   */
  isWhitelisted(ipAddress) {
    return this.config.whitelist.includes(ipAddress);
  }

  /**
   * Check if IP is currently blocked
   */
  isBlocked(ipAddress) {
    if (this.blockedIPs.has(ipAddress)) {
      const blockData = this.blockedIPs.get(ipAddress);
      
      // Check if temporary block has expired
      if (blockData.expiresAt && blockData.expiresAt < new Date()) {
        this.unblockIP(ipAddress, 'Temporary block expired');
        return false;
      }
      
      return true;
    }
    
    return this.blockedIPsCache.has(ipAddress);
  }

  /**
   * Manually unblock an IP
   */
  async unblockIP(ipAddress, reason = 'Manual unblock') {
    if (this.blockedIPs.has(ipAddress)) {
      const blockData = this.blockedIPs.get(ipAddress);
      this.blockedIPs.delete(ipAddress);
      this.blockedIPsCache.del(ipAddress);
      
      // Add to history
      this.blockingHistory.unshift({
        ipAddress,
        action: 'unblocked',
        reason,
        timestamp: new Date(),
        previousBlock: blockData
      });
      
      await this.saveBlockedIPs();
      
      console.log(`✅ Unblocked IP: ${ipAddress} - ${reason}`);
      return true;
    }
    
    return false;
  }

  /**
   * Get activity patterns for an IP
   */
  getActivityPatterns(ipAddress) {
    const activity = this.suspiciousActivity.get(ipAddress) || {
      requestCount: 0,
      failedAttempts: 0,
      lastSeen: null,
      userAgents: [],
      endpoints: [],
      timePattern: []
    };
    
    return {
      requestRate: activity.requestCount,
      failedAttempts: activity.failedAttempts,
      lastActivity: activity.lastSeen,
      uniqueUserAgents: activity.userAgents.length,
      endpointsAccessed: activity.endpoints.length,
      isNew: !activity.lastSeen,
      suspiciousPattern: this.detectSuspiciousPattern(activity)
    };
  }

  /**
   * Detect suspicious activity patterns
   */
  detectSuspiciousPattern(activity) {
    const patterns = [];
    
    if (activity.requestCount > this.config.maxRequestsPerMinute) {
      patterns.push('high_request_rate');
    }
    
    if (activity.failedAttempts > this.config.maxFailedAttemptsPerHour) {
      patterns.push('multiple_failures');
    }
    
    if (activity.userAgents.length > 10) {
      patterns.push('user_agent_rotation');
    }
    
    if (activity.endpoints.includes('/admin') || activity.endpoints.includes('/wp-admin')) {
      patterns.push('admin_scanning');
    }
    
    return patterns;
  }

  /**
   * Mock IP reputation service (replace with real service)
   */
  async getIPReputation(ipAddress) {
    // This would integrate with real reputation services like:
    // - VirusTotal
    // - AbuseIPDB
    // - IBM X-Force
    // - etc.
    
    return {
      isKnownThreat: false,
      reputationScore: Math.floor(Math.random() * 100),
      lastSeen: null,
      categories: [],
      confidence: Math.floor(Math.random() * 100)
    };
  }

  /**
   * Record suspicious activity
   */
  recordActivity(ipAddress, activityData) {
    const existing = this.suspiciousActivity.get(ipAddress) || {
      requestCount: 0,
      failedAttempts: 0,
      lastSeen: null,
      userAgents: [],
      endpoints: [],
      timePattern: []
    };
    
    existing.requestCount++;
    existing.lastSeen = new Date();
    
    if (activityData.failed) {
      existing.failedAttempts++;
    }
    
    if (activityData.userAgent && !existing.userAgents.includes(activityData.userAgent)) {
      existing.userAgents.push(activityData.userAgent);
    }
    
    if (activityData.endpoint && !existing.endpoints.includes(activityData.endpoint)) {
      existing.endpoints.push(activityData.endpoint);
    }
    
    existing.timePattern.push({
      timestamp: new Date(),
      endpoint: activityData.endpoint,
      statusCode: activityData.statusCode
    });
    
    // Keep only last 100 time patterns
    if (existing.timePattern.length > 100) {
      existing.timePattern = existing.timePattern.slice(-100);
    }
    
    this.suspiciousActivity.set(ipAddress, existing);
    
    // Check if this activity triggers analysis
    if (this.shouldTriggerAnalysis(existing)) {
      this.analyzeIP(ipAddress, activityData).catch(error => {
        console.error(`Error in triggered analysis for ${ipAddress}:`, error);
      });
    }
  }

  /**
   * Determine if activity should trigger immediate analysis
   */
  shouldTriggerAnalysis(activity) {
    return (
      activity.requestCount % 20 === 0 || // Every 20 requests
      activity.failedAttempts >= 5 ||     // After 5 failed attempts
      activity.userAgents.length >= 5     // After 5 different user agents
    );
  }

  /**
   * Start periodic maintenance tasks
   */
  startPeriodicTasks() {
    // Clean expired blocks every hour
    setInterval(() => {
      this.cleanExpiredBlocks();
    }, 60 * 60 * 1000);
    
    // Update threat intelligence every 6 hours
    setInterval(() => {
      this.updateThreatIntelligence();
    }, 6 * 60 * 60 * 1000);
    
    // Generate reports every 24 hours
    setInterval(() => {
      this.generateDailyReport();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Clean expired temporary blocks
   */
  async cleanExpiredBlocks() {
    let cleaned = 0;
    const now = new Date();
    
    for (const [ipAddress, blockData] of this.blockedIPs.entries()) {
      if (blockData.expiresAt && blockData.expiresAt < now) {
        this.blockedIPs.delete(ipAddress);
        this.blockedIPsCache.del(ipAddress);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      await this.saveBlockedIPs();
      console.log(`🧹 Cleaned ${cleaned} expired IP blocks`);
    }
  }

  /**
   * Update threat intelligence feeds
   */
  async updateThreatIntelligence() {
    try {
      // This would update from external threat feeds
      console.log('🔄 Updating threat intelligence feeds...');
      // Implementation would depend on your threat intelligence providers
    } catch (error) {
      console.error('Error updating threat intelligence:', error);
    }
  }

  /**
   * Generate daily blocking report
   */
  async generateDailyReport() {
    const report = {
      date: new Date(),
      statistics: { ...this.stats },
      topBlockedCountries: this.getTopBlockedCountries(),
      topCategories: this.getTopBlockCategories(),
      recentBlocks: this.blockingHistory.slice(0, 50),
      recommendations: this.generateRecommendations()
    };
    
    console.log('📊 Daily IP Blocking Report:', JSON.stringify(report, null, 2));
    
    // Save report to file
    try {
      const reportPath = path.join(__dirname, '../logs', `ip-blocking-report-${new Date().toISOString().split('T')[0]}.json`);
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    } catch (error) {
      console.error('Error saving daily report:', error);
    }
  }

  /**
   * Get statistics about top blocked countries
   */
  getTopBlockedCountries() {
    const countries = {};
    for (const [_, blockData] of this.blockedIPs.entries()) {
      // This would use actual geolocation data
      const country = blockData.country || 'Unknown';
      countries[country] = (countries[country] || 0) + 1;
    }
    
    return Object.entries(countries)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
  }

  /**
   * Get statistics about top block categories
   */
  getTopBlockCategories() {
    const categories = {};
    for (const [_, blockData] of this.blockedIPs.entries()) {
      const category = blockData.category || 'unknown';
      categories[category] = (categories[category] || 0) + 1;
    }
    
    return Object.entries(categories)
      .sort(([,a], [,b]) => b - a);
  }

  /**
   * Generate recommendations for improving security
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.stats.falsePositives > this.stats.autoBlocked * 0.1) {
      recommendations.push('Consider adjusting auto-block threshold to reduce false positives');
    }
    
    if (this.stats.reviewQueue > 50) {
      recommendations.push('Review queue is growing, consider lowering review threshold');
    }
    
    return recommendations;
  }

  /**
   * Load blocked IPs from persistent storage
   */
  async loadBlockedIPs() {
    try {
      const filePath = path.join(__dirname, '../data', 'blocked-ips.json');
      const data = await fs.readFile(filePath, 'utf8');
      const blockedData = JSON.parse(data);
      
      for (const [ip, blockData] of Object.entries(blockedData)) {
        this.blockedIPs.set(ip, {
          ...blockData,
          timestamp: new Date(blockData.timestamp),
          expiresAt: blockData.expiresAt ? new Date(blockData.expiresAt) : null
        });
      }
      
      console.log(`📁 Loaded ${this.blockedIPs.size} blocked IPs from storage`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading blocked IPs:', error);
      }
    }
  }

  /**
   * Save blocked IPs to persistent storage
   */
  async saveBlockedIPs() {
    try {
      const dataDir = path.join(__dirname, '../data');
      const filePath = path.join(dataDir, 'blocked-ips.json');
      
      // Ensure data directory exists
      try {
        await fs.access(dataDir);
      } catch {
        await fs.mkdir(dataDir, { recursive: true });
      }
      
      const blockedData = {};
      for (const [ip, blockData] of this.blockedIPs.entries()) {
        blockedData[ip] = blockData;
      }
      
      await fs.writeFile(filePath, JSON.stringify(blockedData, null, 2));
    } catch (error) {
      console.error('Error saving blocked IPs:', error);
    }
  }

  /**
   * Load configuration from file
   */
  async loadConfiguration() {
    try {
      const configPath = path.join(__dirname, '../config', 'ip-blocking.json');
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Merge with default config
      this.config = { ...this.config, ...config };
      
      console.log('⚙️ IP blocking configuration loaded');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading configuration:', error);
      }
    }
  }

  /**
   * Get current service status and statistics
   */
  getStatus() {
    return {
      isActive: true,
      blockedIPsCount: this.blockedIPs.size,
      statistics: { ...this.stats },
      configuration: {
        autoBlockThreshold: this.config.autoBlockThreshold,
        reviewThreshold: this.config.reviewThreshold,
        blockedCountries: this.config.blockedCountries,
        whitelistSize: this.config.whitelist.length
      },
      cacheStats: {
        decisionCacheSize: this.decisionCache.keys().length,
        blockedIPsCacheSize: this.blockedIPsCache.keys().length
      },
      lastUpdate: new Date()
    };
  }
}

// Export singleton instance
module.exports = new IPBlockingService();
