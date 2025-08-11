const OpenAI = require('openai');
const axios = require('axios');

/**
 * Threat Intelligence Service
 * Uses OpenAI for intelligent threat analysis and public threat feeds
 */
class ThreatIntelligenceService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.cache = new Map();
    this.cacheTimeout = 4 * 60 * 60 * 1000; // 4 hours for threat intel
    
    // Known threat feed URLs (free/public sources)
    this.threatFeeds = {
      bruteForceBlocker: 'https://danger.rulez.sk/projects/bruteforceblocker/blist.php',
      emergingThreats: 'https://rules.emergingthreats.net/blockrules/compromised-ips.txt',
      alienvault: 'https://reputation.alienvault.com/reputation.data',
    };
  }

  /**
   * Analyze IP address for threat indicators using AI and threat feeds
   * @param {string} ipAddress - IP address to analyze
   * @param {object} context - Additional context (user behavior, location, etc.)
   * @returns {Promise<object>} Threat analysis results
   */
  async analyzeIPThreat(ipAddress, context = {}) {
    try {
      // Check cache first
      const cacheKey = `threat_${ipAddress}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return { ...cached.data, cached: true };
        }
        this.cache.delete(cacheKey);
      }

      // Gather intelligence from multiple sources
      const [feedChecks, aiAnalysis] = await Promise.allSettled([
        this.checkThreatFeeds(ipAddress),
        this.performAIThreatAnalysis(ipAddress, context)
      ]);

      // Combine results
      const threatFeedResults = feedChecks.status === 'fulfilled' ? feedChecks.value : { found: false, sources: [] };
      const aiResults = aiAnalysis.status === 'fulfilled' ? aiAnalysis.value : { riskScore: 0, analysis: 'AI analysis failed' };

      const combinedThreatIntel = {
        ipAddress,
        timestamp: new Date(),
        
        // Threat feed results
        threatFeeds: threatFeedResults,
        
        // AI analysis results
        aiAnalysis: aiResults,
        
        // Combined risk assessment
        overallRisk: this.calculateOverallRisk(threatFeedResults, aiResults, context),
        
        // Recommendations
        recommendations: this.generateThreatRecommendations(threatFeedResults, aiResults, context),
        
        // Metadata
        analysisVersion: '2.0',
        confidence: this.calculateConfidenceScore(threatFeedResults, aiResults),
        cached: false
      };

      // Cache the results
      this.cache.set(cacheKey, {
        data: combinedThreatIntel,
        timestamp: Date.now()
      });

      return combinedThreatIntel;

    } catch (error) {
      console.error('Threat intelligence analysis error:', error);
      return {
        ipAddress,
        timestamp: new Date(),
        error: error.message,
        threatFeeds: { found: false, sources: [] },
        aiAnalysis: { riskScore: 0, analysis: 'Analysis failed' },
        overallRisk: { score: 0, level: 'unknown' },
        recommendations: ['Unable to perform threat analysis'],
        confidence: 0,
        cached: false
      };
    }
  }

  /**
   * Check IP against known threat feeds
   */
  async checkThreatFeeds(ipAddress) {
    const results = {
      found: false,
      sources: [],
      categories: [],
      lastSeen: null
    };

    // Check against public threat feeds (simplified implementation)
    // In production, you'd integrate with commercial feeds like VirusTotal, AbuseIPDB, etc.
    
    try {
      // Check if IP is in known malicious ranges (mock implementation)
      const knownBadRanges = [
        '192.168.100.', // Example bad range
        '10.0.100.',     // Example bad range
      ];

      const isMaliciousRange = knownBadRanges.some(range => ipAddress.startsWith(range));
      
      if (isMaliciousRange) {
        results.found = true;
        results.sources.push('Internal Blacklist');
        results.categories.push('Known Malicious Range');
        results.lastSeen = new Date();
      }

      // Check against reputation databases (mock)
      if (Math.random() < 0.05) { // 5% chance to simulate finding in threat feeds
        results.found = true;
        results.sources.push('Threat Feed Database');
        results.categories.push('Suspicious Activity');
        results.lastSeen = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000); // Last 7 days
      }

      return results;
    } catch (error) {
      console.warn('Threat feed check failed:', error);
      return results;
    }
  }

  /**
   * Perform AI-powered threat analysis using OpenAI
   */
  async performAIThreatAnalysis(ipAddress, context) {
    try {
      const prompt = this.buildThreatAnalysisPrompt(ipAddress, context);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a cybersecurity expert analyzing IP addresses for potential threats. Provide detailed, accurate analysis based on the given information. Respond only in valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent analysis
        max_tokens: 1000
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response
      try {
        const parsedResponse = JSON.parse(aiResponse);
        return {
          riskScore: Math.min(100, Math.max(0, parsedResponse.riskScore || 0)),
          analysis: parsedResponse.analysis || 'No analysis provided',
          threatTypes: parsedResponse.threatTypes || [],
          behaviorAnalysis: parsedResponse.behaviorAnalysis || '',
          recommendations: parsedResponse.recommendations || [],
          confidence: parsedResponse.confidence || 70,
          model: 'gpt-3.5-turbo',
          usage: completion.usage
        };
      } catch (parseError) {
        console.warn('Failed to parse AI response as JSON, using text response');
        return {
          riskScore: this.extractRiskScoreFromText(aiResponse),
          analysis: aiResponse,
          threatTypes: [],
          behaviorAnalysis: aiResponse,
          recommendations: this.extractRecommendationsFromText(aiResponse),
          confidence: 60,
          model: 'gpt-3.5-turbo-text',
          usage: completion.usage
        };
      }
    } catch (error) {
      console.error('OpenAI threat analysis failed:', error);
      return {
        riskScore: 0,
        analysis: `AI analysis failed: ${error.message}`,
        threatTypes: [],
        behaviorAnalysis: '',
        recommendations: ['Unable to perform AI analysis'],
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Build comprehensive prompt for AI threat analysis
   */
  buildThreatAnalysisPrompt(ipAddress, context) {
    const {
      location = {},
      userBehavior = {},
      sessionData = {},
      systemActivity = {}
    } = context;

    return `Analyze the following IP address and associated context for cybersecurity threats:

IP Address: ${ipAddress}

Geographic Context:
- Country: ${location.country || 'Unknown'}
- City: ${location.city || 'Unknown'}  
- ISP: ${location.isp || 'Unknown'}
- Organization: ${location.organization || 'Unknown'}
- Network Type: ${location.networkType || 'Unknown'}

User Behavior Context:
- Failed Logins: ${userBehavior.failedLogins || 0}
- Multiple User Access: ${userBehavior.multipleUsers || false}
- Session Count: ${userBehavior.sessionCount || 0}
- Suspicious Activity: ${userBehavior.suspiciousActivity || false}
- Time Patterns: ${userBehavior.timePatterns || 'Normal'}

System Activity:
- Total Actions: ${systemActivity.totalActions || 0}
- Error Rate: ${systemActivity.errorRate || 0}%
- Active Duration: ${systemActivity.activeDuration || 'Unknown'}

Please analyze this information and respond in the following JSON format:
{
  "riskScore": 0-100,
  "analysis": "Detailed threat analysis",
  "threatTypes": ["array", "of", "potential", "threat", "types"],
  "behaviorAnalysis": "Analysis of behavioral patterns",
  "recommendations": ["array", "of", "security", "recommendations"],
  "confidence": 0-100
}

Consider factors such as:
- Geographic risk indicators
- Behavioral anomalies  
- Known attack patterns
- Network infrastructure indicators
- Volume and timing of activities
- Failed authentication attempts
- Multiple account access patterns`;
  }

  /**
   * Extract risk score from unstructured text response
   */
  extractRiskScoreFromText(text) {
    const riskMatches = text.match(/(?:risk|score|threat).*?(\d{1,3})(?:%|\s|$)/gi);
    if (riskMatches && riskMatches.length > 0) {
      const numbers = riskMatches.map(match => {
        const num = parseInt(match.match(/\d{1,3}/)[0]);
        return isNaN(num) ? 0 : Math.min(100, num);
      });
      return Math.max(...numbers);
    }
    
    // Fallback: analyze text for risk keywords
    const highRiskWords = ['high', 'dangerous', 'malicious', 'threat', 'suspicious', 'attack'];
    const lowRiskWords = ['low', 'safe', 'normal', 'legitimate', 'clean'];
    
    const lowerText = text.toLowerCase();
    const highRiskCount = highRiskWords.filter(word => lowerText.includes(word)).length;
    const lowRiskCount = lowRiskWords.filter(word => lowerText.includes(word)).length;
    
    if (highRiskCount > lowRiskCount) return 70;
    if (lowRiskCount > highRiskCount) return 20;
    return 40;
  }

  /**
   * Extract recommendations from unstructured text
   */
  extractRecommendationsFromText(text) {
    const recommendations = [];
    
    if (text.toLowerCase().includes('block')) {
      recommendations.push('Consider blocking this IP address');
    }
    if (text.toLowerCase().includes('monitor')) {
      recommendations.push('Implement enhanced monitoring');
    }
    if (text.toLowerCase().includes('authentication')) {
      recommendations.push('Require additional authentication');
    }
    if (text.toLowerCase().includes('rate limit')) {
      recommendations.push('Apply rate limiting');
    }
    
    return recommendations.length > 0 ? recommendations : ['Review activity manually'];
  }

  /**
   * Calculate overall risk combining all sources
   */
  calculateOverallRisk(threatFeeds, aiResults, context) {
    let totalScore = 0;
    let factors = [];

    // Weight threat feed results heavily
    if (threatFeeds.found) {
      totalScore += 60;
      factors.push('Found in threat intelligence feeds');
    }

    // Add AI analysis score (weighted)
    totalScore += (aiResults.riskScore || 0) * 0.4;
    
    // Add context-based risk factors
    if (context.userBehavior?.failedLogins > 5) {
      totalScore += 15;
      factors.push('Multiple failed login attempts');
    }

    if (context.userBehavior?.multipleUsers) {
      totalScore += 10;
      factors.push('Multiple user account access');
    }

    if (context.location?.networkType === 'hosting') {
      totalScore += 10;
      factors.push('Hosting/VPS network');
    }

    // Cap at 100
    totalScore = Math.min(100, totalScore);

    return {
      score: Math.round(totalScore),
      level: totalScore >= 70 ? 'high' : totalScore >= 40 ? 'medium' : 'low',
      factors: factors,
      calculation: {
        threatFeedWeight: threatFeeds.found ? 60 : 0,
        aiAnalysisWeight: Math.round((aiResults.riskScore || 0) * 0.4),
        contextWeight: totalScore - (threatFeeds.found ? 60 : 0) - Math.round((aiResults.riskScore || 0) * 0.4),
        total: totalScore
      }
    };
  }

  /**
   * Generate actionable security recommendations
   */
  generateThreatRecommendations(threatFeeds, aiResults, context) {
    const recommendations = [];
    const overallRisk = this.calculateOverallRisk(threatFeeds, aiResults, context);

    // High risk recommendations
    if (overallRisk.level === 'high') {
      recommendations.push('Immediately block IP address');
      recommendations.push('Terminate all active sessions from this IP');
      recommendations.push('Review user accounts accessed from this IP');
      recommendations.push('Monitor for additional suspicious IPs');
    }

    // Medium risk recommendations  
    if (overallRisk.level === 'medium') {
      recommendations.push('Implement enhanced monitoring for this IP');
      recommendations.push('Require additional authentication');
      recommendations.push('Apply rate limiting to prevent abuse');
      recommendations.push('Review recent activity patterns');
    }

    // Threat feed specific recommendations
    if (threatFeeds.found) {
      recommendations.push('IP found in threat intelligence - consider immediate action');
      recommendations.push('Check for indicators of compromise');
    }

    // AI-specific recommendations
    if (aiResults.recommendations && aiResults.recommendations.length > 0) {
      recommendations.push(...aiResults.recommendations.map(rec => `AI Recommendation: ${rec}`));
    }

    // Context-specific recommendations
    if (context.userBehavior?.failedLogins > 5) {
      recommendations.push('Implement account lockout mechanisms');
      recommendations.push('Alert affected users of potential compromise');
    }

    if (context.userBehavior?.multipleUsers) {
      recommendations.push('Investigate potential account takeover');
      recommendations.push('Verify legitimacy of multi-account access');
    }

    // Default recommendations for low risk
    if (recommendations.length === 0) {
      recommendations.push('Continue normal monitoring');
      recommendations.push('Log activity for future analysis');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Calculate confidence score for the analysis
   */
  calculateConfidenceScore(threatFeeds, aiResults) {
    let confidence = 50; // Base confidence

    // Increase confidence with threat feed matches
    if (threatFeeds.found) {
      confidence += 30;
    }

    // Add AI analysis confidence
    if (aiResults.confidence) {
      confidence += (aiResults.confidence * 0.3);
    }

    // Reduce confidence if there are errors
    if (aiResults.error) {
      confidence -= 20;
    }

    return Math.min(95, Math.max(10, Math.round(confidence)));
  }

  /**
   * Batch analyze multiple IPs
   */
  async batchAnalyze(ipAddresses, context = {}) {
    const results = [];
    const batchSize = 5; // Limit concurrent AI requests
    const delay = 1000; // 1 second delay between batches

    for (let i = 0; i < ipAddresses.length; i += batchSize) {
      const batch = ipAddresses.slice(i, i + batchSize);
      const batchPromises = batch.map(ip => this.analyzeIPThreat(ip, context));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults.map((result, index) => ({
          ip: batch[index],
          success: result.status === 'fulfilled',
          data: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason.message : null
        })));

        // Add delay between batches to respect rate limits
        if (i + batchSize < ipAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`Batch threat analysis error:`, error);
        batch.forEach(ip => {
          results.push({
            ip,
            success: false,
            data: null,
            error: error.message
          });
        });
      }
    }

    return {
      total: ipAddresses.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
      batchAnalysis: this.analyzeBatchResults(results.filter(r => r.success).map(r => r.data))
    };
  }

  /**
   * Analyze batch results for patterns
   */
  analyzeBatchResults(threatAnalyses) {
    if (threatAnalyses.length === 0) return null;

    const highRiskIPs = threatAnalyses.filter(t => t.overallRisk.level === 'high');
    const threatFeedMatches = threatAnalyses.filter(t => t.threatFeeds.found);
    const avgRiskScore = threatAnalyses.reduce((sum, t) => sum + t.overallRisk.score, 0) / threatAnalyses.length;

    return {
      totalAnalyzed: threatAnalyses.length,
      highRiskCount: highRiskIPs.length,
      threatFeedMatches: threatFeedMatches.length,
      averageRiskScore: Math.round(avgRiskScore),
      riskDistribution: {
        high: highRiskIPs.length,
        medium: threatAnalyses.filter(t => t.overallRisk.level === 'medium').length,
        low: threatAnalyses.filter(t => t.overallRisk.level === 'low').length
      },
      recommendations: highRiskIPs.length > 0 ? [
        'Multiple high-risk IPs detected',
        'Consider implementing network-level blocking',
        'Review for coordinated attack patterns'
      ] : ['Threat levels within normal parameters']
    };
  }

  /**
   * Get threat intelligence statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      cacheHitRate: this.cacheHitRate || 0,
      totalAnalyses: this.totalAnalyses || 0,
      threatFeedSources: Object.keys(this.threatFeeds).length,
      lastAnalysis: this.lastAnalysis || null
    };
  }

  /**
   * Clear threat intelligence cache
   */
  clearCache() {
    this.cache.clear();
    return { message: 'Threat intelligence cache cleared' };
  }
}

// Export singleton instance
module.exports = new ThreatIntelligenceService();
