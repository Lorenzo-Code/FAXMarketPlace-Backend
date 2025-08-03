/**
 * CoreLogic Super Client - Built from Official OpenAPI v2 Specification
 * 
 * Base URL: https://property.corelogicapi.com
 * 
 * This client implements all major CoreLogic Property API v2 endpoints
 * for comprehensive property intelligence and data enrichment.
 */
const axios = require('axios');
require('dotenv').config();

const { getCoreLogicAccessToken } = require('./coreLogicAuth');
const { getAsync, setAsync } = require('./redisClient');

// Official CoreLogic API Base URL from OpenAPI spec
const BASE_URL = 'https://property.corelogicapi.com';

class CoreLogicSuperClient {
  constructor() {
    this.baseURL = BASE_URL;
    this.headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  async getAuthHeaders() {
    const token = await getCoreLogicAccessToken();
    return {
      ...this.headers,
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * 🔍 SEARCH ENDPOINTS
   */

  // Property Search - Main search endpoint
  async searchProperties({ streetAddress, city, state, zipCode, apn, county, countyCode, bestMatch = true }) {
    // 💰 AGGRESSIVE CACHING - Properties don't change often
    const cacheKey = `cl:search:${JSON.stringify({ streetAddress, city, state, zipCode, apn, county, countyCode, bestMatch })}`;
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log(`💾 Cache HIT: Property search`);
      return cached;
    }

    const headers = await this.getAuthHeaders();
    const params = { streetAddress, city, state, zipCode, apn, county, countyCode, bestMatch };
    
    // Remove undefined parameters
    Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
    
    console.log(`🔍 💸 CoreLogic Property Search (EXPENSIVE CALL):`, params);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/search`, {
        headers,
        params,
        timeout: 15000
      });
      
      console.log(`✅ Property search successful`);
      
      // Cache for 24 hours - property data is relatively stable
      await setAsync(cacheKey, response.data, 86400);
      console.log(`💾 Cached property search for 24h`);
      
      return response.data;
    } catch (error) {
      console.error(`❌ Property search failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Property Search by Owner
  async searchPropertiesByOwner({ streetAddress, city, state, zipCode, owner, apn, county, countyCode }) {
    const headers = await this.getAuthHeaders();
    const params = { streetAddress, city, state, zipCode, owner, apn, county, countyCode };
    
    Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
    
    console.log(`👤 CoreLogic Owner Search:`, params);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/search/owner`, {
        headers,
        params,
        timeout: 15000
      });
      
      console.log(`✅ Owner search successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Owner search failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Geocode Search - Gets property with geocoding data
  async searchPropertiesWithGeocode({ streetAddress, city, state, zipCode, apn, county, countyCode, bestMatch = true }) {
    const headers = await this.getAuthHeaders();
    const params = { streetAddress, city, state, zipCode, apn, county, countyCode, bestMatch };
    
    Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
    
    console.log(`🗺️ CoreLogic Geocode Search:`, params);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/search/geocode`, {
        headers,
        params,
        timeout: 15000
      });
      
      console.log(`✅ Geocode search successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Geocode search failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Address TypeAhead - For autocomplete functionality
  async getAddressTypeAhead(input) {
    const headers = await this.getAuthHeaders();
    
    console.log(`⌨️ CoreLogic TypeAhead:`, input);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/typeahead`, {
        headers,
        params: { input },
        timeout: 10000
      });
      
      console.log(`✅ TypeAhead successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ TypeAhead failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * 🏠 PROPERTY DETAIL ENDPOINTS
   */

  // Property Detail - Comprehensive property report
  async getPropertyDetail(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`🏠 CoreLogic Property Detail: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/property-detail`, {
        headers,
        timeout: 20000
      });
      
      console.log(`✅ Property detail successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Property detail failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Buildings - Detailed building information
  async getBuildings(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`🏗️ CoreLogic Buildings: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/buildings`, {
        headers,
        timeout: 15000
      });
      
      console.log(`✅ Buildings data successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Buildings data failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Site Location - Property location and legal details
  async getSiteLocation(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`📍 CoreLogic Site Location: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/site-location`, {
        headers,
        timeout: 15000
      });
      
      console.log(`✅ Site location successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Site location failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Tax Assessments - Latest tax assessment data
  async getTaxAssessments(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`💰 CoreLogic Tax Assessments: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/tax-assessments/latest`, {
        headers,
        timeout: 15000
      });
      
      console.log(`✅ Tax assessments successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Tax assessments failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * 👥 OWNERSHIP & TRANSFER ENDPOINTS
   */

  // Ownership - Current property ownership details
  async getOwnership(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`👥 CoreLogic Ownership: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/ownership`, {
        headers,
        timeout: 15000
      });
      
      console.log(`✅ Ownership data successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Ownership data failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Ownership Transfers - Sales history
  async getOwnershipTransfers(clip, saleType = 'all', latest = 'latest') {
    const headers = await this.getAuthHeaders();
    
    console.log(`📊 CoreLogic Ownership Transfers: ${clip} (${saleType}/${latest})`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/ownership-transfers/${saleType}/${latest}`, {
        headers,
        timeout: 15000
      });
      
      console.log(`✅ Ownership transfers successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Ownership transfers failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Transaction History - Complete transaction history
  async getTransactionHistory(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`📋 CoreLogic Transaction History: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/transaction-history`, {
        headers,
        timeout: 20000
      });
      
      console.log(`✅ Transaction history successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Transaction history failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * 🏦 MORTGAGE & LIEN ENDPOINTS
   */

  // Current Mortgage - Active mortgage information
  async getCurrentMortgage(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`🏦 CoreLogic Current Mortgage: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/mortgage/current`, {
        headers,
        timeout: 15000
      });
      
      console.log(`✅ Current mortgage successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Current mortgage failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Mortgage History - Complete mortgage history
  async getMortgageHistory(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`📊 CoreLogic Mortgage History: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/mortgage`, {
        headers,
        timeout: 20000
      });
      
      console.log(`✅ Mortgage history successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Mortgage history failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Liens Summary - Open lien equity and LTV
  async getLiensSummary(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`⚖️ CoreLogic Liens Summary: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/liens`, {
        headers,
        timeout: 15000
      });
      
      console.log(`✅ Liens summary successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Liens summary failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Involuntary Liens - Tax liens, mechanic liens, etc.
  async getInvoluntaryLiens(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`⚠️ CoreLogic Involuntary Liens: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/liens/involuntary-liens/${clip}`, {
        headers,
        timeout: 15000
      });
      
      console.log(`✅ Involuntary liens successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Involuntary liens failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * 📊 COMPARABLES & VALUATION
   */

  // Property Comparables - Recently sold similar properties
  async getComparables(clip, options = {}) {
    const headers = await this.getAuthHeaders();
    const params = {
      maxComps: 10,
      searchDistance: 0.5,
      monthsBack: 9,
      sortBy: 'Distance',
      ...options
    };
    
    console.log(`📊 CoreLogic Comparables: ${clip}`, params);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/comparables`, {
        headers,
        params,
        timeout: 20000
      });
      
      console.log(`✅ Comparables successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Comparables failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  // Rent Amount Model - Estimated rental value
  async getRentAmountModel(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`🏠 CoreLogic Rent Amount Model: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/avms/ram`, {
        headers,
        params: { clip },
        timeout: 15000
      });
      
      console.log(`✅ Rent amount model successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Rent amount model failed:`, error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * 🎯 PROPENSITY SCORES
   */

  // Propensity to List for Sale
  async getSalePropensity(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`🎯 CoreLogic Sale Propensity: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/propensity-scores/${clip}/sale-score`, {
        headers,
        timeout: 15000
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ Sale propensity failed:`, error.response?.status);
      throw error;
    }
  }

  // Propensity to List for Rent
  async getRentPropensity(clip) {
    const headers = await this.getAuthHeaders();
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/propensity-scores/${clip}/rent-score`, {
        headers,
        timeout: 15000
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ Rent propensity failed:`, error.response?.status);
      throw error;
    }
  }

  // Propensity to Refinance
  async getRefinancePropensity(clip) {
    const headers = await this.getAuthHeaders();
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/propensity-scores/${clip}/refinance-score`, {
        headers,
        timeout: 15000
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ Refinance propensity failed:`, error.response?.status);
      throw error;
    }
  }

  // Propensity for HELOC
  async getHelocPropensity(clip) {
    const headers = await this.getAuthHeaders();
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/propensity-scores/${clip}/heloc-score`, {
        headers,
        timeout: 15000
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ HELOC propensity failed:`, error.response?.status);
      throw error;
    }
  }

  /**
   * 🌍 CLIMATE RISK ANALYTICS
   */

  // Climate Risk Analytics - Comprehensive
  async getClimateRiskAnalytics(clip) {
    const headers = await this.getAuthHeaders();
    
    console.log(`🌍 CoreLogic Climate Risk Analytics: ${clip}`);
    
    try {
      const response = await axios.get(`${this.baseURL}/v2/properties/${clip}/climate-risk-analytics/ar6/comprehensive`, {
        headers,
        timeout: 20000
      });
      
      console.log(`✅ Climate risk analytics successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ Climate risk analytics failed:`, error.response?.status);
      throw error;
    }
  }

  /**
   * 🔧 UTILITY METHODS
   */

  // Comprehensive Property Intelligence - Combines multiple endpoints
  async getComprehensivePropertyIntelligence(clip) {
    console.log(`🧠 Getting comprehensive property intelligence for CLIP: ${clip}`);
    
    // 💰 SUPER AGGRESSIVE CACHING - This is the most expensive operation!
    const cacheKey = `cl:comprehensive:${clip}`;
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log(`💾 💰 Cache HIT: Comprehensive intelligence (SAVED BIG MONEY!)`);
      return cached;
    }
    
    console.log(`💸💸 VERY EXPENSIVE: Making 8+ CoreLogic API calls for ${clip}`);
    
    const results = {};
    const errors = {};

    // Core property data (essential)
    try {
      results.propertyDetail = await this.getPropertyDetail(clip);
    } catch (error) {
      errors.propertyDetail = error.message;
    }

    try {
      results.buildings = await this.getBuildings(clip);
    } catch (error) {
      errors.buildings = error.message;
    }

    try {
      results.siteLocation = await this.getSiteLocation(clip);
    } catch (error) {
      errors.siteLocation = error.message;
    }

    // Financial data
    try {
      results.taxAssessments = await this.getTaxAssessments(clip);
    } catch (error) {
      errors.taxAssessments = error.message;
    }

    try {
      results.liensSummary = await this.getLiensSummary(clip);
    } catch (error) {
      errors.liensSummary = error.message;
    }

    // Transaction history
    try {
      results.transactionHistory = await this.getTransactionHistory(clip);
    } catch (error) {
      errors.transactionHistory = error.message;
    }

    // Market comparables
    try {
      results.comparables = await this.getComparables(clip);
    } catch (error) {
      errors.comparables = error.message;
    }

    // Investment intelligence
    try {
      results.rentAmountModel = await this.getRentAmountModel(clip);
    } catch (error) {
      errors.rentAmountModel = error.message;
    }

    // Propensity scores (parallel requests)
    const propensityPromises = [
      this.getSalePropensity(clip).catch(err => ({ error: err.message })),
      this.getRentPropensity(clip).catch(err => ({ error: err.message })),
      this.getRefinancePropensity(clip).catch(err => ({ error: err.message })),
      this.getHelocPropensity(clip).catch(err => ({ error: err.message }))
    ];

    const [salePropensity, rentPropensity, refinancePropensity, helocPropensity] = await Promise.all(propensityPromises);
    
    results.propensityScores = {
      sale: salePropensity,
      rent: rentPropensity,
      refinance: refinancePropensity,
      heloc: helocPropensity
    };

    console.log(`✅ Comprehensive property intelligence complete for ${clip}`);
    console.log(`📊 Successful calls: ${Object.keys(results).length}, Errors: ${Object.keys(errors).length}`);

    return {
      clip,
      data: results,
      errors: Object.keys(errors).length > 0 ? errors : null,
      timestamp: new Date().toISOString()
    };
  }

  // Search and Enrich - Complete property search with full enrichment
  async searchAndEnrich({ streetAddress, city, state, zipCode }) {
    console.log(`🔍➕ SEARCH AND ENRICH START: ${streetAddress}, ${city}, ${state}`);
    console.log('📍 Input parameters:');
    console.log('  - streetAddress:', streetAddress);
    console.log('  - city:', city);
    console.log('  - state:', state);
    console.log('  - zipCode:', zipCode);

    // Step 1: Search for property
    console.log('🔍 Step 1: Searching for property with geocode...');
    let searchResult;
    try {
      searchResult = await this.searchPropertiesWithGeocode({
        streetAddress,
        city,
        state,
        zipCode,
        bestMatch: true
      });
      console.log('✅ Property search completed successfully');
      console.log('📊 Search result structure:', Object.keys(searchResult || {}));
      console.log('🏠 Properties found:', searchResult?.items?.length || 0);
    } catch (searchError) {
      console.error('❌ Property search failed:');
      console.error('  - Error message:', searchError.message);
      console.error('  - Error status:', searchError.response?.status);
      console.error('  - Error data:', JSON.stringify(searchError.response?.data, null, 2));
      throw searchError;
    }

    if (!searchResult?.items || searchResult.items.length === 0) {
      console.error('❌ No properties found in search result');
      console.error('📊 Full search result:', JSON.stringify(searchResult, null, 2));
      throw new Error('No properties found for the given address');
    }

    const property = searchResult.items[0];
    console.log('🏠 First property found:', JSON.stringify(property, null, 2));
    const clip = property.clip;

    if (!clip) {
      console.error('❌ No CLIP ID in property result');
      console.error('🏠 Property object keys:', Object.keys(property));
      throw new Error('Property found but no CLIP ID available');
    }

    console.log(`🎯 Found property with CLIP: ${clip}`);

    // Step 2: Get comprehensive intelligence
    console.log('🧠 Step 2: Getting comprehensive property intelligence...');
    let intelligence;
    try {
      intelligence = await this.getComprehensivePropertyIntelligence(clip);
      console.log('✅ Comprehensive intelligence completed successfully');
      console.log('📊 Intelligence data keys:', Object.keys(intelligence?.data || {}));
      console.log('❌ Intelligence errors:', Object.keys(intelligence?.errors || {}));
    } catch (intelligenceError) {
      console.error('❌ Comprehensive intelligence failed:');
      console.error('  - Error message:', intelligenceError.message);
      console.error('  - Error status:', intelligenceError.response?.status);
      console.error('  - Error data:', JSON.stringify(intelligenceError.response?.data, null, 2));
      throw intelligenceError;
    }

    const result = {
      searchResult,
      clip,
      intelligence,
      timestamp: new Date().toISOString()
    };

    console.log('✅ SEARCH AND ENRICH COMPLETE');
    console.log('📋 Final result structure:', Object.keys(result));
    
    return result;
  }
}

module.exports = { CoreLogicSuperClient };
