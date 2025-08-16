/**
 * 🗺️ Google Address Verification Service
 * 
 * Mandatory verification before expensive CoreLogic calls
 * Prevents wasted API costs on invalid addresses
 */

const fetch = require("node-fetch");
const { getAsync, setAsync } = require("../utils/redisClient");

class GoogleAddressVerificationService {
  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_KEY;
    if (!this.apiKey) {
      console.warn('⚠️ Google Maps API key not configured - address verification disabled');
    }
  }

  /**
   * 🔍 Verify and normalize address using Google Maps Geocoding API
   * @param {string} address - Raw address string
   * @returns {Promise<Object>} Verification result with normalized components
   */
  async verifyAndNormalizeAddress(address) {
    if (!this.apiKey) {
      console.warn('⚠️ Google verification skipped - no API key');
      return { 
        valid: false, 
        error: 'Google Maps API not configured',
        fallbackParsed: this.fallbackAddressParse(address)
      };
    }

    const cacheKey = `google_address_verify:${address.toLowerCase().replace(/\s+/g, '_')}`;
    
    // Check cache first (addresses don't change often - 7 day cache)
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log('💾 Google address verification served from cache');
      try {
        return JSON.parse(cached);
      } catch (error) {
        console.warn('⚠️ Failed to parse cached Google verification, fetching fresh');
      }
    }

    try {
      console.log(`🗺️ Verifying address with Google: "${address}"`);
      
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Google API returned status ${response.status}`);
      }

      const data = await response.json();
      console.log(`📍 Google API status: ${data.status}`);

      if (data.status === 'OK' && data.results.length > 0) {
        const result = data.results[0];
        const verification = this.parseGoogleResult(result, address);
        
        // Cache successful verification for 7 days
        await setAsync(cacheKey, JSON.stringify(verification), 7 * 24 * 60 * 60);
        
        console.log('✅ Address verified by Google:', verification.normalizedAddress);
        return verification;
      } else {
        const verification = {
          valid: false,
          error: `Google verification failed: ${data.status}`,
          googleStatus: data.status,
          originalAddress: address,
          suggestion: data.status === 'ZERO_RESULTS' 
            ? 'Try using more specific address details or check spelling'
            : 'Please verify the address format'
        };

        // Cache failed verification for 1 hour (addresses might be corrected)
        await setAsync(cacheKey, JSON.stringify(verification), 60 * 60);
        
        console.log('❌ Address verification failed:', verification.error);
        return verification;
      }

    } catch (error) {
      console.error('❌ Google address verification error:', error.message);
      
      return {
        valid: false,
        error: `Verification service unavailable: ${error.message}`,
        originalAddress: address,
        fallbackParsed: this.fallbackAddressParse(address),
        suggestion: 'Address verification temporarily unavailable - using fallback parsing'
      };
    }
  }

  /**
   * 📝 Parse Google Geocoding API result into normalized format
   */
  parseGoogleResult(result, originalAddress) {
    const components = result.address_components;
    const geometry = result.geometry;

    const verification = {
      valid: true,
      originalAddress,
      normalizedAddress: result.formatted_address,
      confidence: this.calculateConfidence(result),
      
      // Address components
      streetNumber: this.extractComponent(components, 'street_number') || '',
      streetName: this.extractComponent(components, 'route') || '',
      city: this.extractComponent(components, 'locality') || 
            this.extractComponent(components, 'sublocality') || '',
      county: this.extractComponent(components, 'administrative_area_level_2') || '',
      state: this.extractComponent(components, 'administrative_area_level_1') || '',
      stateCode: this.extractComponent(components, 'administrative_area_level_1', 'short_name') || '',
      zipCode: this.extractComponent(components, 'postal_code') || '',
      country: this.extractComponent(components, 'country') || 'US',
      countryCode: this.extractComponent(components, 'country', 'short_name') || 'US',

      // Geographic data
      coordinates: {
        latitude: geometry.location.lat,
        longitude: geometry.location.lng
      },
      
      // Bounds for area searches
      bounds: geometry.bounds ? {
        northeast: geometry.bounds.northeast,
        southwest: geometry.bounds.southwest
      } : null,

      // Quality indicators
      locationType: geometry.location_type,
      placeId: result.place_id,
      types: result.types,
      
      // Formatted for different uses
      fullStreetAddress: this.buildFullStreetAddress(components),
      cityStateZip: this.buildCityStateZip(components),
      
      // For API calls
      coreLogicFormat: this.formatForCoreLogic(components),
      zillowFormat: this.formatForZillow(result.formatted_address),
      
      // Metadata
      verifiedAt: new Date().toISOString(),
      googlePlaceId: result.place_id
    };

    return verification;
  }

  /**
   * 📊 Calculate confidence score based on Google result quality
   */
  calculateConfidence(result) {
    let confidence = 50; // Base confidence

    // Location type scoring
    const locationTypeScores = {
      'ROOFTOP': 40,           // Highest precision
      'RANGE_INTERPOLATED': 30, // Good precision
      'GEOMETRIC_CENTER': 20,   // Moderate precision
      'APPROXIMATE': 10         // Lower precision
    };

    confidence += locationTypeScores[result.geometry.location_type] || 0;

    // Place type scoring
    if (result.types.includes('street_address')) confidence += 10;
    if (result.types.includes('premise')) confidence += 5;
    if (result.types.includes('subpremise')) confidence += 5;

    return Math.min(confidence, 100);
  }

  /**
   * 🔧 Extract component by type from Google result
   */
  extractComponent(components, type, nameType = 'long_name') {
    const component = components.find(c => c.types.includes(type));
    return component ? component[nameType] : '';
  }

  /**
   * 🏠 Build full street address
   */
  buildFullStreetAddress(components) {
    const streetNumber = this.extractComponent(components, 'street_number');
    const streetName = this.extractComponent(components, 'route');
    
    if (streetNumber && streetName) {
      return `${streetNumber} ${streetName}`;
    } else if (streetName) {
      return streetName;
    }
    
    return '';
  }

  /**
   * 🏙️ Build city, state, zip format
   */
  buildCityStateZip(components) {
    const city = this.extractComponent(components, 'locality') || 
                 this.extractComponent(components, 'sublocality');
    const state = this.extractComponent(components, 'administrative_area_level_1', 'short_name');
    const zip = this.extractComponent(components, 'postal_code');

    const parts = [city, state, zip].filter(Boolean);
    return parts.join(', ');
  }

  /**
   * 🏢 Format address for CoreLogic API
   */
  formatForCoreLogic(components) {
    return {
      streetAddress: this.buildFullStreetAddress(components),
      city: this.extractComponent(components, 'locality'),
      state: this.extractComponent(components, 'administrative_area_level_1', 'short_name'),
      zipCode: this.extractComponent(components, 'postal_code')
    };
  }

  /**
   * 🏠 Format address for Zillow API
   */
  formatForZillow(formattedAddress) {
    return formattedAddress; // Zillow works well with Google's formatted address
  }

  /**
   * 🔄 Fallback address parsing when Google is unavailable
   */
  fallbackAddressParse(address) {
    console.log('🔄 Using fallback address parsing');
    
    const parts = address.split(',').map(s => s.trim());
    
    if (parts.length >= 3) {
      const street = parts[0];
      const city = parts[1];
      const stateZip = parts[2];
      
      // Basic state/zip extraction
      const stateZipMatch = stateZip.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      const state = stateZipMatch ? stateZipMatch[1] : '';
      const zip = stateZipMatch ? stateZipMatch[2] : '';

      return {
        parsed: true,
        fullStreetAddress: street,
        city: city,
        state: state,
        zipCode: zip,
        coreLogicFormat: {
          streetAddress: street,
          city: city,
          state: state,
          zipCode: zip
        },
        confidence: 25, // Low confidence for fallback parsing
        warning: 'Parsed without Google verification - may be inaccurate'
      };
    }

    return {
      parsed: false,
      error: 'Unable to parse address components',
      suggestion: 'Please provide address in format: Street, City, State ZIP'
    };
  }

  /**
   * 🔍 Validate address meets minimum requirements for expensive API calls
   */
  isValidForExpensiveAPIs(verification) {
    if (!verification.valid) return false;
    
    // Require minimum components
    const hasStreet = verification.streetNumber && verification.streetName;
    const hasCity = verification.city;
    const hasState = verification.stateCode;
    const hasZip = verification.zipCode;
    
    const hasMinimumComponents = hasStreet && hasCity && hasState;
    const hasGoodConfidence = verification.confidence >= 60;
    
    return hasMinimumComponents && hasGoodConfidence;
  }

  /**
   * 📊 Get verification statistics
   */
  async getVerificationStats() {
    // This would track verification success rates, cache hits, etc.
    return {
      service: 'Google Address Verification',
      status: this.apiKey ? 'active' : 'disabled',
      cacheEnabled: true
    };
  }
}

module.exports = new GoogleAddressVerificationService();
