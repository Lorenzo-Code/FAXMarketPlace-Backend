const geoip = require('geoip-lite');
const { IPinfo } = require('node-ipinfo');
const axios = require('axios');

/**
 * IP Geolocation Service
 * Supports multiple providers: GeoIP-Lite (free), IPInfo (API), and fallback services
 */
class IPGeolocationService {
  constructor() {
    // Initialize IPInfo if API token is provided
    this.ipinfo = process.env.IPINFO_API_TOKEN ? new IPinfo(process.env.IPINFO_API_TOKEN) : null;
    this.cache = new Map();
    this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Get comprehensive geolocation data for an IP address
   * @param {string} ipAddress - IP address to geolocate
   * @param {object} options - Options for geolocation lookup
   * @returns {Promise<object>} Geolocation data
   */
  async getIPLocation(ipAddress, options = {}) {
    try {
      // Validate IP address
      if (!this.isValidIP(ipAddress)) {
        throw new Error('Invalid IP address format');
      }

      // Check if IP is private/local
      if (this.isPrivateIP(ipAddress)) {
        return this.getPrivateIPLocation(ipAddress);
      }

      // Check cache first
      const cacheKey = `geo_${ipAddress}`;
      if (this.cache.has(cacheKey) && !options.bypassCache) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return { ...cached.data, cached: true };
        }
        this.cache.delete(cacheKey);
      }

      // Try primary provider (IPInfo if available, otherwise GeoIP-Lite)
      let locationData = null;
      let provider = 'unknown';

      try {
        if (this.ipinfo && options.provider !== 'geoip-lite') {
          locationData = await this.getIPInfoLocation(ipAddress);
          provider = 'ipinfo';
        } else {
          locationData = await this.getGeoIPLiteLocation(ipAddress);
          provider = 'geoip-lite';
        }
      } catch (primaryError) {
        console.warn(`Primary geolocation provider failed:`, primaryError.message);
        
        // Fallback to alternative provider
        try {
          if (provider === 'ipinfo') {
            locationData = await this.getGeoIPLiteLocation(ipAddress);
            provider = 'geoip-lite-fallback';
          } else if (this.ipinfo) {
            locationData = await this.getIPInfoLocation(ipAddress);
            provider = 'ipinfo-fallback';
          }
        } catch (fallbackError) {
          console.warn(`Fallback geolocation provider failed:`, fallbackError.message);
          // Use free API as last resort
          try {
            locationData = await this.getFreeAPILocation(ipAddress);
            provider = 'free-api';
          } catch (finalError) {
            locationData = this.getUnknownLocation(ipAddress);
            provider = 'unknown';
          }
        }
      }

      // Enhance with additional data
      const enhancedData = await this.enhanceLocationData(locationData, ipAddress);

      // Cache the result
      this.cache.set(cacheKey, {
        data: enhancedData,
        timestamp: Date.now()
      });

      return {
        ...enhancedData,
        provider,
        cached: false,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('IP Geolocation Service Error:', error);
      return this.getUnknownLocation(ipAddress, error.message);
    }
  }

  /**
   * Get location data from IPInfo service
   */
  async getIPInfoLocation(ipAddress) {
    const response = await this.ipinfo.lookupIp(ipAddress);
    
    // Parse coordinates
    const [lat, lng] = response.loc ? response.loc.split(',').map(parseFloat) : [null, null];
    
    return {
      ip: ipAddress,
      country: response.country || 'Unknown',
      countryCode: response.country || 'XX',
      region: response.region || 'Unknown',
      regionCode: response.region || 'XX',
      city: response.city || 'Unknown',
      zipCode: response.postal || null,
      coordinates: {
        lat: lat || null,
        lng: lng || null
      },
      timezone: response.timezone || null,
      isp: response.org || 'Unknown ISP',
      organization: response.org || 'Unknown',
      asn: null, // IPInfo doesn't provide ASN in basic plan
      accuracy: 'high'
    };
  }

  /**
   * Get location data from GeoIP-Lite (offline database)
   */
  async getGeoIPLiteLocation(ipAddress) {
    const geo = geoip.lookup(ipAddress);
    
    if (!geo) {
      throw new Error('IP not found in GeoIP database');
    }

    return {
      ip: ipAddress,
      country: geo.country || 'Unknown',
      countryCode: geo.country || 'XX',
      region: geo.region || 'Unknown',
      regionCode: geo.region || 'XX',
      city: geo.city || 'Unknown',
      zipCode: null,
      coordinates: {
        lat: geo.ll ? geo.ll[0] : null,
        lng: geo.ll ? geo.ll[1] : null
      },
      timezone: geo.timezone || null,
      isp: 'Unknown ISP',
      organization: 'Unknown',
      asn: null,
      accuracy: 'medium'
    };
  }

  /**
   * Get location data from free API service (last resort)
   */
  async getFreeAPILocation(ipAddress) {
    try {
      const response = await axios.get(`http://ip-api.com/json/${ipAddress}`, {
        timeout: 5000,
        params: {
          fields: 'status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as'
        }
      });

      if (response.data.status === 'fail') {
        throw new Error(response.data.message || 'API lookup failed');
      }

      return {
        ip: ipAddress,
        country: response.data.country || 'Unknown',
        countryCode: response.data.countryCode || 'XX',
        region: response.data.regionName || 'Unknown',
        regionCode: response.data.region || 'XX',
        city: response.data.city || 'Unknown',
        zipCode: response.data.zip || null,
        coordinates: {
          lat: response.data.lat || null,
          lng: response.data.lon || null
        },
        timezone: response.data.timezone || null,
        isp: response.data.isp || 'Unknown ISP',
        organization: response.data.org || 'Unknown',
        asn: response.data.as || null,
        accuracy: 'medium'
      };
    } catch (error) {
      throw new Error(`Free API geolocation failed: ${error.message}`);
    }
  }

  /**
   * Handle private/local IP addresses
   */
  getPrivateIPLocation(ipAddress) {
    return {
      ip: ipAddress,
      country: 'Private Network',
      countryCode: 'XX',
      region: 'Local',
      regionCode: 'XX',
      city: 'Local Network',
      zipCode: null,
      coordinates: {
        lat: null,
        lng: null
      },
      timezone: null,
      isp: 'Private Network',
      organization: 'Local Network',
      asn: null,
      isPrivate: true,
      accuracy: 'exact',
      provider: 'local-detection',
      cached: false,
      timestamp: new Date()
    };
  }

  /**
   * Return unknown location data when all methods fail
   */
  getUnknownLocation(ipAddress, error = null) {
    return {
      ip: ipAddress,
      country: 'Unknown',
      countryCode: 'XX',
      region: 'Unknown',
      regionCode: 'XX',
      city: 'Unknown',
      zipCode: null,
      coordinates: {
        lat: null,
        lng: null
      },
      timezone: null,
      isp: 'Unknown ISP',
      organization: 'Unknown',
      asn: null,
      accuracy: 'none',
      error: error,
      provider: 'fallback',
      cached: false,
      timestamp: new Date()
    };
  }

  /**
   * Enhance location data with additional intelligence
   */
  async enhanceLocationData(locationData, ipAddress) {
    try {
      // Add risk indicators based on location
      const riskFactors = this.calculateLocationRisk(locationData);
      
      // Add network type detection
      const networkType = this.detectNetworkType(ipAddress, locationData);
      
      return {
        ...locationData,
        riskFactors,
        networkType,
        enhanced: true
      };
    } catch (error) {
      console.warn('Failed to enhance location data:', error);
      return locationData;
    }
  }

  /**
   * Calculate location-based risk factors
   */
  calculateLocationRisk(locationData) {
    const riskFactors = [];
    let riskScore = 0;

    // High-risk countries (example list - customize based on your needs)
    const highRiskCountries = ['XX', 'Unknown'];
    if (highRiskCountries.includes(locationData.countryCode)) {
      riskFactors.push('Unknown or high-risk country');
      riskScore += 30;
    }

    // VPN/Proxy indicators
    if (locationData.organization && 
        (locationData.organization.toLowerCase().includes('vpn') ||
         locationData.organization.toLowerCase().includes('proxy') ||
         locationData.organization.toLowerCase().includes('hosting'))) {
      riskFactors.push('Potential VPN/Proxy/Hosting provider');
      riskScore += 25;
    }

    // Unknown or suspicious ISP
    if (locationData.isp === 'Unknown ISP') {
      riskFactors.push('Unknown ISP');
      riskScore += 15;
    }

    return {
      score: Math.min(100, riskScore),
      factors: riskFactors,
      level: riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low'
    };
  }

  /**
   * Detect network type (residential, business, hosting, mobile, etc.)
   */
  detectNetworkType(ipAddress, locationData) {
    const org = (locationData.organization || '').toLowerCase();
    const isp = (locationData.isp || '').toLowerCase();
    
    if (org.includes('mobile') || isp.includes('mobile') || isp.includes('cellular')) {
      return 'mobile';
    }
    if (org.includes('hosting') || org.includes('server') || org.includes('data center')) {
      return 'hosting';
    }
    if (org.includes('business') || org.includes('corporate')) {
      return 'business';
    }
    if (org.includes('university') || org.includes('education') || org.includes('school')) {
      return 'education';
    }
    if (org.includes('government') || org.includes('gov')) {
      return 'government';
    }
    
    return 'residential';
  }

  /**
   * Validate IP address format
   */
  isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Check if IP is private/local
   */
  isPrivateIP(ip) {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fe80:/i
    ];
    return privateRanges.some(range => range.test(ip));
  }

  /**
   * Bulk lookup for multiple IPs (with rate limiting)
   */
  async bulkLookup(ipAddresses, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    const delay = options.delay || 100; // ms between requests

    for (let i = 0; i < ipAddresses.length; i += batchSize) {
      const batch = ipAddresses.slice(i, i + batchSize);
      const batchPromises = batch.map(ip => this.getIPLocation(ip, options));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults.map((result, index) => ({
          ip: batch[index],
          success: result.status === 'fulfilled',
          data: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason.message : null
        })));

        // Add delay between batches to respect rate limits
        if (i + batchSize < ipAddresses.length && delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`Batch geolocation error for batch starting at index ${i}:`, error);
        // Add failed results for this batch
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
      results
    };
  }

  /**
   * Clear geolocation cache
   */
  clearCache() {
    this.cache.clear();
    return { message: 'Geolocation cache cleared' };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
      oldestEntry: this.cache.size > 0 ? Math.min(...Array.from(this.cache.values()).map(v => v.timestamp)) : null,
      newestEntry: this.cache.size > 0 ? Math.max(...Array.from(this.cache.values()).map(v => v.timestamp)) : null
    };
  }
}

// Export singleton instance
module.exports = new IPGeolocationService();
