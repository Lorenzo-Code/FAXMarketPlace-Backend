const crypto = require('crypto');
const axios = require('axios');

class SumsubService {
  constructor() {
    this.apiToken = process.env.SUMSUB_API_TOKEN;
    this.secretKey = process.env.SUMSUB_SECRET_KEY;
    this.baseUrl = process.env.SUMSUB_BASE_URL;
    
    // Default KYC level - can be customized per call
    // Try common Sumsub sandbox level names
    this.defaultLevel = 'basic';
    
    // Optional webhook secret
    this.webhookSecret = process.env.SUMSUB_WEBHOOK_SECRET || null;
  }

  // Generate signature for Sumsub API requests
  generateSignature(method, url, timestamp, body = '') {
    const signatureString = timestamp + method + url + (body || '');
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(signatureString)
      .digest('hex');
  }

  // Create applicant
  async createApplicant(userData) {
    try {
      const method = 'POST';
      const url = '/resources/applicants';
      const timestamp = Math.floor(Date.now() / 1000);
      
      const requestBody = {
        externalUserId: userData.userId,
        levelName: this.defaultLevel,
        info: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          dob: userData.dateOfBirth,
          country: userData.country || 'USA'
        }
      };

      const signature = this.generateSignature(method, url, timestamp, JSON.stringify(requestBody));

      const response = await axios.post(`${this.baseUrl}${url}`, requestBody, {
        headers: {
          'X-App-Token': this.apiToken,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': timestamp,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Sumsub create applicant error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get applicant status
  async getApplicantStatus(applicantId) {
    try {
      const method = 'GET';
      const url = `/resources/applicants/${applicantId}/status`;
      const timestamp = Math.floor(Date.now() / 1000);
      
      const signature = this.generateSignature(method, url, timestamp);

      const response = await axios.get(`${this.baseUrl}${url}`, {
        headers: {
          'X-App-Token': this.apiToken,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': timestamp
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Sumsub get status error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Generate access token for frontend SDK
  async generateAccessToken(userId, levelName = null) {
    try {
      const method = 'POST';
      const url = '/resources/accessTokens';
      const timestamp = Math.floor(Date.now() / 1000);
      
      const requestBody = {
        userId: userId,
        levelName: levelName || this.defaultLevel,
        ttlInSecs: 1800 // 30 minutes
      };

      const signature = this.generateSignature(method, url, timestamp, JSON.stringify(requestBody));

      const response = await axios.post(`${this.baseUrl}${url}`, requestBody, {
        headers: {
          'X-App-Token': this.apiToken,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': timestamp,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Sumsub access token error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn('⚠️ Webhook secret not configured');
      return true; // Skip verification if not configured
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Process webhook data
  processWebhook(payload) {
    const allowedTypes = [
      'applicantReviewed',
      'applicantPending',
      'applicantCompleted',
      'applicantActionPending',
      'applicantActionReviewed'
    ];

    if (!allowedTypes.includes(payload.type)) {
      return null;
    }

    return {
      type: payload.type,
      applicantId: payload.applicantId,
      externalUserId: payload.externalUserId,
      reviewStatus: payload.reviewStatus,
      reviewResult: payload.reviewResult,
      createdAt: new Date(payload.createdAtMs)
    };
  }
}

module.exports = new SumsubService();
