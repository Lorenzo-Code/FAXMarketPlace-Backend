/**
 * AI-Powered Security Analysis Service
 * Provides intelligent security insights and recommendations using OpenAI
 */

const OpenAI = require('openai');

class SecurityAnalysisService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
    this.maxTokens = {
      userAnalysis: 800,
      patternAnalysis: 1000,
      recommendations: 1200,
      threatAnalysis: 1000,
      loginRisk: 400
    };
  }

  /**
   * Analyze user security profile using AI
   */
  async analyzeUserSecurityProfile(userData) {
    try {
      const prompt = this.buildUserAnalysisPrompt(userData);
      
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a cybersecurity expert analyzing user security profiles for a financial platform. Provide detailed security assessments with specific recommendations. Always respond with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: this.maxTokens.userAnalysis,
        temperature: 0.3
      });

      return this.parseSecurityAnalysis(completion.choices[0].message.content);
    } catch (error) {
      console.error('❌ AI User Security Analysis failed:', error);
      return this.getFallbackUserAnalysis(userData);
    }
  }

  /**
   * Analyze suspicious patterns across multiple users
   */
  async analyzeSuspiciousPatterns(usersData, activityLogs = []) {
    try {
      const prompt = this.buildPatternAnalysisPrompt(usersData, activityLogs);
      
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a fraud detection specialist analyzing user behavior patterns for potential security threats, account takeovers, or coordinated attacks. Always respond with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: this.maxTokens.patternAnalysis,
        temperature: 0.2
      });

      return this.parseThreatAnalysis(completion.choices[0].message.content);
    } catch (error) {
      console.error('❌ AI Pattern Analysis failed:', error);
      return this.getFallbackPatternAnalysis();
    }
  }

  /**
   * Generate security recommendations for the entire platform
   */
  async generateSecurityRecommendations(platformData) {
    try {
      const prompt = this.buildRecommendationPrompt(platformData);
      
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a security consultant providing strategic recommendations for a financial technology platform. Focus on practical, implementable security improvements. Always respond with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: this.maxTokens.recommendations,
        temperature: 0.4
      });

      return this.parseRecommendations(completion.choices[0].message.content);
    } catch (error) {
      console.error('❌ AI Recommendations failed:', error);
      return this.getFallbackRecommendations();
    }
  }

  /**
   * Analyze threats and suspicious activities
   */
  async analyzeThreat(threatData) {
    try {
      const prompt = this.buildThreatAnalysisPrompt(threatData);
      
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a cybersecurity threat analyst specializing in identifying and analyzing security threats, suspicious activities, and potential attack vectors for financial platforms. Always respond with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: this.maxTokens.threatAnalysis,
        temperature: 0.2
      });

      return this.parseThreatAnalysis(completion.choices[0].message.content);
    } catch (error) {
      console.error('❌ AI Threat Analysis failed:', error);
      return this.getFallbackThreatAnalysis();
    }
  }

  /**
   * Real-time risk assessment for login attempts
   */
  async assessLoginRisk(loginData) {
    try {
      const prompt = this.buildLoginRiskPrompt(loginData);
      
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a real-time fraud detection system. Assess login attempts for potential security risks and provide immediate action recommendations. Always respond with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: this.maxTokens.loginRisk,
        temperature: 0.1
      });

      return this.parseLoginRisk(completion.choices[0].message.content);
    } catch (error) {
      console.error('❌ AI Login Risk Assessment failed:', error);
      return this.getFallbackLoginRisk();
    }
  }

  /**
   * Build prompts for different analysis types
   */
  buildUserAnalysisPrompt(userData) {
    return `
Analyze the security profile of this user and provide a detailed assessment:

User Profile:
- Email: ${userData.email || 'unknown'}
- Role: ${userData.role || 'user'}
- Account Age: ${userData.accountAge || 'unknown'} days
- Email Verified: ${userData.emailVerified || false}
- KYC Status: ${userData.kycStatus || 'unknown'}
- Phone Provided: ${userData.hasPhone || false}
- Last Login: ${userData.lastLogin ? new Date(userData.lastLogin).toLocaleDateString() : 'Never'}
- Suspended: ${userData.suspended || false}
- Country: ${userData.country || 'unknown'}

Please provide:
1. Overall Risk Level (LOW/MEDIUM/HIGH/CRITICAL)
2. Key Security Concerns (list 3-5 specific issues)
3. Recommended Actions (prioritized list)
4. Security Score Justification
5. Monitoring Recommendations

Format as JSON with these fields: riskLevel, concerns, actions, scoreJustification, monitoring
`;
  }

  buildPatternAnalysisPrompt(usersData, activityLogs) {
    const userSummary = usersData.slice(0, 20).map(user => ({
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      country: user.country,
      emailVerified: user.emailVerified,
      kycStatus: user.kycStatus
    }));

    return `
Analyze these users and activity logs for suspicious patterns:

Users Sample (${usersData.length} total):
${JSON.stringify(userSummary, null, 2)}

Activity Summary:
- Total Users: ${usersData.length}
- Never Logged In: ${usersData.filter(u => !u.lastLogin).length}
- Unverified Emails: ${usersData.filter(u => !u.emailVerified).length}
- No KYC: ${usersData.filter(u => u.kycStatus === 'not_submitted').length}

Look for:
- Coordinated account creation patterns
- Geographic clustering of suspicious accounts
- Unusual registration vs activity patterns
- Potential bot or automated account creation

Provide JSON response with: threats (array), riskLevel, confidence, recommendations
`;
  }

  buildRecommendationPrompt(platformData) {
    return `
Analyze this platform's security posture and provide strategic recommendations:

Platform Statistics:
- Total Users: ${platformData.totalUsers || 0}
- Active Users: ${platformData.activeUsers || 0}
- Unverified Emails: ${platformData.unverifiedEmails || 0}
- Incomplete KYC: ${platformData.incompleteKYC || 0}
- Average Security Score: ${platformData.avgSecurityScore || 'unknown'}
- Critical Issues: ${platformData.criticalIssues || 0}

Current Security Measures:
- Email verification required: ${platformData.emailRequired || false}
- KYC process: ${platformData.kycProcess || 'unknown'}
- 2FA available: ${platformData.twoFactorAvailable || false}

Provide strategic recommendations in JSON format:
- shortTerm: immediate actions (1-2 weeks)
- mediumTerm: improvements (1-3 months) 
- longTerm: strategic initiatives (3+ months)
- priority: overall priority level
- estimatedImpact: expected security improvement
`;
  }

  buildThreatAnalysisPrompt(threatData) {
    return `
Analyze the following security threat data and provide detailed analysis:

Threat Information:
- Threat Type: ${threatData.type || 'unknown'}
- Source: ${threatData.source || 'unknown'}
- Severity: ${threatData.severity || 'unknown'}
- Description: ${threatData.description || 'no description'}
- Affected Systems: ${threatData.affectedSystems || 'unknown'}
- Detection Time: ${threatData.detectionTime || 'unknown'}

Platform Context:
- User Count: ${threatData.userCount || 'unknown'}
- Active Sessions: ${threatData.activeSessions || 'unknown'}
- Recent Security Events: ${threatData.recentEvents || 'none'}

Analyze and provide JSON response with:
- threats: array of identified threats with type, severity, description
- riskLevel: overall risk assessment
- confidence: confidence level (0-1)
- recommendations: array of recommended actions
- immediateActions: urgent steps to take
`;
  }

  buildLoginRiskPrompt(loginData) {
    return `
Assess the risk of this login attempt:

Login Details:
- User: ${loginData.userEmail || 'unknown'}
- IP Address: ${loginData.ipAddress || 'unknown'}
- Location: ${loginData.location || 'unknown'}
- Device: ${loginData.deviceInfo || 'unknown'}
- Time: ${loginData.timestamp ? new Date(loginData.timestamp).toISOString() : 'unknown'}
- Previous Login: ${loginData.lastLoginTime || 'Never'}
- Failed Attempts: ${loginData.failedAttempts || 0}

User Context:
- Account Age: ${loginData.accountAge || 'unknown'} days
- Typical Login Times: ${loginData.typicalHours || 'unknown'}
- Usual Locations: ${loginData.commonLocations || 'unknown'}

Respond with JSON: riskLevel (low/medium/high/critical), confidence (0-1), action (allow/challenge/block/monitor), reasoning
`;
  }

  /**
   * Parse AI responses into structured data
   */
  parseSecurityAnalysis(aiResponse) {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback parsing if JSON not found
      return {
        riskLevel: this.extractRiskLevel(aiResponse),
        concerns: this.extractConcerns(aiResponse),
        actions: this.extractActions(aiResponse),
        scoreJustification: aiResponse.substring(0, 200) + '...',
        monitoring: ['Regular security review recommended']
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return this.getFallbackUserAnalysis();
    }
  }

  parseThreatAnalysis(aiResponse) {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return {
        threats: [],
        riskLevel: 'medium',
        confidence: 0.5,
        recommendations: ['Implement additional monitoring']
      };
    } catch (error) {
      return this.getFallbackThreatAnalysis();
    }
  }

  parseRecommendations(aiResponse) {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return this.getFallbackRecommendations();
    } catch (error) {
      return this.getFallbackRecommendations();
    }
  }

  parseLoginRisk(aiResponse) {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return this.getFallbackLoginRisk();
    } catch (error) {
      return this.getFallbackLoginRisk();
    }
  }

  /**
   * Utility methods for text parsing
   */
  extractRiskLevel(text) {
    const riskKeywords = {
      'CRITICAL': ['critical', 'severe', 'urgent', 'immediate'],
      'HIGH': ['high', 'significant', 'major', 'serious'],
      'MEDIUM': ['medium', 'moderate', 'standard'],
      'LOW': ['low', 'minimal', 'minor', 'acceptable']
    };

    for (const [level, keywords] of Object.entries(riskKeywords)) {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
        return level;
      }
    }
    return 'MEDIUM';
  }

  extractConcerns(text) {
    const concerns = [];
    const concernPatterns = [
      /unverified email/i,
      /incomplete kyc/i,
      /never logged in/i,
      /inactive account/i,
      /missing phone/i,
      /suspicious activity/i
    ];

    concernPatterns.forEach(pattern => {
      if (pattern.test(text)) {
        concerns.push(text.match(pattern)[0]);
      }
    });

    return concerns.length > 0 ? concerns : ['General security review needed'];
  }

  extractActions(text) {
    const actions = [];
    const actionPatterns = [
      /require.*verification/i,
      /implement.*2fa/i,
      /review.*kyc/i,
      /monitor.*activity/i,
      /send.*reminder/i
    ];

    actionPatterns.forEach(pattern => {
      if (pattern.test(text)) {
        actions.push(text.match(pattern)[0]);
      }
    });

    return actions.length > 0 ? actions : ['Standard security measures recommended'];
  }

  /**
   * Fallback responses when AI is unavailable
   */
  getFallbackUserAnalysis(userData = null) {
    return {
      riskLevel: 'MEDIUM',
      concerns: ['AI analysis unavailable', 'Manual review recommended'],
      actions: ['Enable AI security analysis', 'Review security manually'],
      scoreJustification: 'Fallback analysis used due to AI service unavailability',
      monitoring: ['Regular manual security reviews'],
      timestamp: new Date().toISOString(),
      aiEnabled: false
    };
  }

  getFallbackPatternAnalysis() {
    return {
      threats: [],
      riskLevel: 'medium',
      confidence: 0.5,
      recommendations: ['AI pattern analysis unavailable', 'Implement manual monitoring'],
      timestamp: new Date().toISOString(),
      aiEnabled: false
    };
  }

  getFallbackRecommendations() {
    return {
      shortTerm: ['Review user verification process', 'Enable security monitoring'],
      mediumTerm: ['Implement advanced monitoring', 'Enhance user authentication'],
      longTerm: ['Consider AI-powered fraud detection', 'Upgrade security infrastructure'],
      priority: 'medium',
      estimatedImpact: 'moderate',
      timestamp: new Date().toISOString(),
      aiEnabled: false
    };
  }

  getFallbackThreatAnalysis() {
    return {
      threats: [
        {
          type: 'Manual Review Required',
          severity: 'medium',
          description: 'AI threat analysis unavailable, manual security review recommended'
        }
      ],
      riskLevel: 'medium',
      confidence: 0.5,
      recommendations: [
        'Enable AI threat analysis',
        'Conduct manual security review',
        'Monitor system activity'
      ],
      immediateActions: ['Review system logs', 'Check for unusual activity'],
      timestamp: new Date().toISOString(),
      aiEnabled: false
    };
  }

  getFallbackLoginRisk() {
    return {
      riskLevel: 'medium',
      confidence: 0.5,
      action: 'monitor',
      reasoning: 'AI login risk assessment unavailable, using default monitoring',
      timestamp: new Date().toISOString(),
      aiEnabled: false
    };
  }
}

// Create singleton instance
const securityAnalysisService = new SecurityAnalysisService();

module.exports = securityAnalysisService;
