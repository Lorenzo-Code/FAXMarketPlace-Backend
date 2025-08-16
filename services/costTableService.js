/**
 * Provider Cost Table Service
 * 
 * Manages USD costs for various provider APIs organized by data types.
 * Supports versioning and dynamic cost updates from the configuration file.
 */

const fs = require('fs').promises;
const path = require('path');

class CostTableService {
  constructor() {
    this.costsCache = null;
    this.lastLoaded = null;
    this.configPath = path.join(__dirname, '../config/providerCosts.json');
  }

  /**
   * Load costs from configuration file with caching
   * @returns {Object} The costs configuration object
   */
  async loadCosts() {
    try {
      // Check if we need to reload (cache for 5 minutes)
      const now = Date.now();
      if (this.costsCache && this.lastLoaded && (now - this.lastLoaded < 300000)) {
        return this.costsCache;
      }

      const configData = await fs.readFile(this.configPath, 'utf8');
      this.costsCache = JSON.parse(configData);
      this.lastLoaded = now;
      
      console.log(`✅ Loaded provider costs version ${this.costsCache.version}`);
      return this.costsCache;
    } catch (error) {
      console.error('❌ Failed to load provider costs:', error.message);
      
      // Return fallback costs if file read fails
      return this.getFallbackCosts();
    }
  }

  /**
   * Get cost for a specific data type
   * @param {string} dataType - The data type (BASIC, STANDARD, PRO_LOW, PRO_HIGH)
   * @param {string} provider - Optional specific provider
   * @returns {number} The USD cost
   */
  async getCostForDataType(dataType, provider = null) {
    const costs = await this.loadCosts();
    
    if (!costs.costs[dataType]) {
      console.warn(`⚠️ Unknown data type: ${dataType}, using BASIC cost`);
      return costs.costs.BASIC.defaultCost;
    }
    
    const dataTypeCosts = costs.costs[dataType];
    
    // If specific provider requested, try to get its cost
    if (provider && dataTypeCosts.providers && dataTypeCosts.providers[provider]) {
      return dataTypeCosts.providers[provider];
    }
    
    // Return default cost for data type
    return dataTypeCosts.defaultCost;
  }

  /**
   * Get cost for a specific API endpoint by mapping it to data type
   * @param {string} endpoint - The API endpoint name
   * @param {string} provider - Optional specific provider
   * @returns {number} The USD cost
   */
  async getCostForEndpoint(endpoint, provider = null) {
    const costs = await this.loadCosts();
    
    // Map endpoint to data type
    const dataType = costs.dataTypeMapping[endpoint];
    if (!dataType) {
      console.warn(`⚠️ Unknown endpoint: ${endpoint}, using BASIC cost`);
      return costs.costs.BASIC.defaultCost;
    }
    
    return this.getCostForDataType(dataType, provider);
  }

  /**
   * Get cost for enrichment API
   * @param {string} enrichmentAPI - The enrichment API name
   * @returns {number} The USD cost
   */
  async getCostForEnrichment(enrichmentAPI) {
    const costs = await this.loadCosts();
    
    const enrichmentConfig = costs.enrichmentAPIs[enrichmentAPI];
    if (!enrichmentConfig) {
      console.warn(`⚠️ Unknown enrichment API: ${enrichmentAPI}, using BASIC cost`);
      return costs.costs.BASIC.defaultCost;
    }
    
    return enrichmentConfig.cost;
  }

  /**
   * Get all available data types and their default costs
   * @returns {Object} Object with data types and their costs
   */
  async getAllDataTypeCosts() {
    const costs = await this.loadCosts();
    
    const result = {};
    for (const [dataType, config] of Object.entries(costs.costs)) {
      result[dataType] = {
        cost: config.defaultCost,
        description: config.description
      };
    }
    
    return result;
  }

  /**
   * Update costs configuration (for admin use)
   * @param {Object} newCosts - New costs configuration
   * @returns {boolean} Success status
   */
  async updateCosts(newCosts) {
    try {
      // Validate the new costs structure
      this.validateCostsStructure(newCosts);
      
      // Update version and timestamp
      newCosts.version = this.incrementVersion(newCosts.version || '1.0.0');
      newCosts.lastUpdated = new Date().toISOString();
      
      // Write to file
      await fs.writeFile(this.configPath, JSON.stringify(newCosts, null, 2));
      
      // Clear cache to force reload
      this.costsCache = null;
      this.lastLoaded = null;
      
      console.log(`✅ Updated provider costs to version ${newCosts.version}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to update provider costs:', error.message);
      return false;
    }
  }

  /**
   * Validate costs configuration structure
   * @param {Object} costs - Costs configuration to validate
   * @throws {Error} If validation fails
   */
  validateCostsStructure(costs) {
    const requiredFields = ['version', 'description', 'costs'];
    for (const field of requiredFields) {
      if (!costs[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const requiredDataTypes = ['BASIC', 'STANDARD', 'PRO_LOW', 'PRO_HIGH'];
    for (const dataType of requiredDataTypes) {
      if (!costs.costs[dataType]) {
        throw new Error(`Missing required data type: ${dataType}`);
      }
      
      if (typeof costs.costs[dataType].defaultCost !== 'number' || costs.costs[dataType].defaultCost <= 0) {
        throw new Error(`Invalid default cost for ${dataType}`);
      }
    }
  }

  /**
   * Increment semantic version
   * @param {string} version - Current version (e.g., "1.0.0")
   * @returns {string} Next version
   */
  incrementVersion(version) {
    const parts = version.split('.');
    const patch = parseInt(parts[2]) + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  /**
   * Get fallback costs if configuration file is unavailable
   * @returns {Object} Fallback costs configuration
   */
  getFallbackCosts() {
    return {
      version: '1.0.0-fallback',
      lastUpdated: new Date().toISOString(),
      description: 'Fallback provider costs',
      costs: {
        BASIC: { defaultCost: 0.10, description: 'Basic data' },
        STANDARD: { defaultCost: 1.10, description: 'Standard data' },
        PRO_LOW: { defaultCost: 3.75, description: 'Professional data' },
        PRO_HIGH: { defaultCost: 10.18, description: 'Premium analytics' }
      },
      dataTypeMapping: {
        property_search: 'BASIC',
        property_detail: 'STANDARD',
        ownership_history: 'PRO_LOW',
        climate_risk_ar5: 'PRO_HIGH'
      },
      enrichmentAPIs: {
        greatschools: { dataType: 'BASIC', cost: 0.10 },
        walkscore: { dataType: 'BASIC', cost: 0.05 }
      }
    };
  }

  /**
   * Get costs summary for reporting
   * @returns {Object} Summary of current costs
   */
  async getCostsSummary() {
    const costs = await this.loadCosts();
    
    return {
      version: costs.version,
      lastUpdated: costs.lastUpdated,
      totalDataTypes: Object.keys(costs.costs).length,
      totalEndpoints: Object.keys(costs.dataTypeMapping || {}).length,
      totalEnrichmentAPIs: Object.keys(costs.enrichmentAPIs || {}).length,
      costRanges: {
        min: Math.min(...Object.values(costs.costs).map(c => c.defaultCost)),
        max: Math.max(...Object.values(costs.costs).map(c => c.defaultCost))
      }
    };
  }
}

// Singleton instance
const costTableService = new CostTableService();

module.exports = {
  CostTableService,
  costTableService
};
