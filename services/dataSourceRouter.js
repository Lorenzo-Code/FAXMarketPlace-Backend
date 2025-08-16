/**
 * 🧠 Intelligent Data Source Router
 * 
 * Smart routing system that determines the optimal data source (Zillow vs CoreLogic)
 * based on search type, cost optimization, and data quality requirements.
 * 
 * Key Features:
 * - Automatic routing based on search patterns
 * - Cost-aware decision making
 * - Performance optimization
 * - Fallback strategies
 * - Quality assessment and recommendations
 */

const { performance } = require('perf_hooks');

class DataSourceRouter {
  constructor() {
    this.routingStats = {
      totalRoutes: 0,
      zillowRoutes: 0,
      coreLogicRoutes: 0,
      parallelRoutes: 0,
      costSavings: 0,
      avgDecisionTime: 0
    };

    // Cost estimates per API call
    this.costs = {
      zillow: {
        search: 0.02,
        images: 0.01,
        details: 0.03
      },
      corelogic: {
        search: 0.50,
        comprehensive: 2.00,
        intelligence: 1.00
      }
    };

    // Quality scores for different data types
    this.qualityScores = {
      zillow: {
        listings: 9,      // Excellent for current listings
        images: 10,       // Best source for property images
        prices: 8,        // Good for market prices
        details: 7,       // Basic property details
        history: 6        // Limited transaction history
      },
      corelogic: {
        listings: 6,      // Limited listing data
        images: 3,        // Poor image coverage
        prices: 9,        // Excellent for valuations
        details: 10,      // Comprehensive property details
        history: 10       // Complete transaction history
      }
    };
  }

  /**
   * 🎯 Main routing decision method
   */
  async determineOptimalRoute(searchRequest, options = {}) {
    const startTime = performance.now();
    const { 
      prioritizeSpeed = false,
      prioritizeCost = false,
      prioritizeQuality = false,
      maxCost = null,
      requiredDataTypes = []
    } = options;

    console.log(`🧠 Analyzing optimal data source route for: ${JSON.stringify(searchRequest)}`);
    
    try {
      // Analyze search patterns
      const searchAnalysis = this.analyzeSearchPattern(searchRequest);
      
      // Calculate cost implications
      const costAnalysis = this.analyzeCostImplications(searchRequest, searchAnalysis);
      
      // Assess quality requirements
      const qualityAnalysis = this.analyzeQualityRequirements(requiredDataTypes);
      
      // Make routing decision
      const routingDecision = this.makeRoutingDecision(
        searchAnalysis, 
        costAnalysis, 
        qualityAnalysis, 
        { prioritizeSpeed, prioritizeCost, prioritizeQuality, maxCost }
      );

      this.routingStats.totalRoutes++;
      this.routingStats.avgDecisionTime = (
        (this.routingStats.avgDecisionTime * (this.routingStats.totalRoutes - 1) + 
         (performance.now() - startTime)) / this.routingStats.totalRoutes
      );

      // Update routing stats
      switch (routingDecision.strategy) {
        case 'zillow_primary':
          this.routingStats.zillowRoutes++;
          break;
        case 'corelogic_primary':
          this.routingStats.coreLogicRoutes++;
          break;
        case 'parallel':
          this.routingStats.parallelRoutes++;
          break;
      }

      console.log(`🎯 Routing decision: ${routingDecision.strategy} (${(performance.now() - startTime).toFixed(2)}ms)`);
      console.log(`💰 Estimated cost: $${routingDecision.estimatedCost.toFixed(3)}`);
      console.log(`📊 Quality score: ${routingDecision.qualityScore}/10`);

      return {
        ...routingDecision,
        decisionTime: performance.now() - startTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Routing decision error:`, error.message);
      return this.getDefaultRoute(searchRequest);
    }
  }

  /**
   * 🔍 Analyze search pattern to understand data requirements
   */
  analyzeSearchPattern(searchRequest) {
    const analysis = {
      searchType: 'unknown',
      scope: 'unknown',
      specificAddress: false,
      cityWide: false,
      dataRequirements: [],
      confidence: 0
    };

    const { query, city, address, maxPrice, beds, propertyType } = searchRequest;
    
    // Detect specific address searches
    if (address || (query && this.isSpecificAddress(query))) {
      analysis.searchType = 'specific_address';
      analysis.specificAddress = true;
      analysis.scope = 'single_property';
      analysis.dataRequirements = ['detailed_info', 'valuation', 'history'];
      analysis.confidence = 0.9;
      
      console.log(`📍 Detected specific address search: ${address || query}`);
    }
    // Detect city-wide or area searches
    else if (city || (query && this.isCityWideSearch(query))) {
      analysis.searchType = 'area_search';
      analysis.cityWide = true;
      analysis.scope = 'multiple_properties';
      analysis.dataRequirements = ['listings', 'images', 'basic_info'];
      analysis.confidence = 0.8;
      
      console.log(`🌆 Detected city-wide search: ${city || query}`);
    }
    // Detect filtered searches (price, bedrooms, etc.)
    else if (maxPrice || beds || propertyType) {
      analysis.searchType = 'filtered_search';
      analysis.cityWide = true;
      analysis.scope = 'multiple_properties';
      analysis.dataRequirements = ['listings', 'images', 'filtering'];
      analysis.confidence = 0.7;
      
      console.log(`🔍 Detected filtered search with criteria`);
    }
    else {
      analysis.searchType = 'general_search';
      analysis.scope = 'multiple_properties';
      analysis.dataRequirements = ['listings', 'images'];
      analysis.confidence = 0.5;
      
      console.log(`🌐 Detected general search`);
    }

    return analysis;
  }

  /**
   * 💰 Analyze cost implications of different routing strategies
   */
  analyzeCostImplications(searchRequest, searchAnalysis) {
    const analysis = {
      zillowCost: 0,
      corelogicCost: 0,
      parallelCost: 0,
      recommendedBudget: 0
    };

    // Base costs for different strategies
    switch (searchAnalysis.searchType) {
      case 'specific_address':
        analysis.zillowCost = this.costs.zillow.search + this.costs.zillow.images;
        analysis.corelogicCost = this.costs.corelogic.comprehensive;
        analysis.parallelCost = analysis.zillowCost + this.costs.corelogic.search;
        analysis.recommendedBudget = 0.20;
        break;
        
      case 'area_search':
      case 'filtered_search':
        const expectedProperties = this.estimatePropertyCount(searchRequest);
        analysis.zillowCost = this.costs.zillow.search + (expectedProperties * 0.005); // Bulk processing discount
        analysis.corelogicCost = expectedProperties * this.costs.corelogic.search;
        analysis.parallelCost = analysis.zillowCost + (expectedProperties * 0.02);
        analysis.recommendedBudget = 0.10;
        break;
        
      default:
        analysis.zillowCost = this.costs.zillow.search;
        analysis.corelogicCost = this.costs.corelogic.search;
        analysis.parallelCost = analysis.zillowCost + analysis.corelogicCost;
        analysis.recommendedBudget = 0.05;
    }

    return analysis;
  }

  /**
   * 📊 Analyze quality requirements for data types needed
   */
  analyzeQualityRequirements(requiredDataTypes) {
    const analysis = {
      zillowQualityScore: 0,
      corelogicQualityScore: 0,
      optimalSource: 'zillow'
    };

    if (!requiredDataTypes.length) {
      // Default requirements for general searches
      requiredDataTypes = ['listings', 'images', 'prices'];
    }

    // Calculate weighted quality scores
    let zillowTotal = 0;
    let corelogicTotal = 0;
    let totalWeight = 0;

    requiredDataTypes.forEach(dataType => {
      const weight = this.getDataTypeWeight(dataType);
      zillowTotal += (this.qualityScores.zillow[dataType] || 5) * weight;
      corelogicTotal += (this.qualityScores.corelogic[dataType] || 5) * weight;
      totalWeight += weight;
    });

    analysis.zillowQualityScore = totalWeight > 0 ? zillowTotal / totalWeight : 7;
    analysis.corelogicQualityScore = totalWeight > 0 ? corelogicTotal / totalWeight : 7;
    analysis.optimalSource = analysis.zillowQualityScore >= analysis.corelogicQualityScore ? 'zillow' : 'corelogic';

    return analysis;
  }

  /**
   * 🎯 Make the final routing decision
   */
  makeRoutingDecision(searchAnalysis, costAnalysis, qualityAnalysis, preferences) {
    const { prioritizeSpeed, prioritizeCost, prioritizeQuality, maxCost } = preferences;
    
    let strategy = 'zillow_primary'; // Default
    let estimatedCost = costAnalysis.zillowCost;
    let qualityScore = qualityAnalysis.zillowQualityScore;
    let reasoning = [];

    // Priority-based decision making
    if (prioritizeSpeed) {
      if (searchAnalysis.searchType === 'specific_address') {
        strategy = 'parallel';
        estimatedCost = costAnalysis.parallelCost;
        qualityScore = Math.max(qualityAnalysis.zillowQualityScore, qualityAnalysis.corelogicQualityScore);
        reasoning.push('Parallel execution for speed on address search');
      } else {
        strategy = 'zillow_primary';
        estimatedCost = costAnalysis.zillowCost;
        qualityScore = qualityAnalysis.zillowQualityScore;
        reasoning.push('Zillow primary for fastest city-wide search');
      }
    }
    else if (prioritizeCost) {
      if (costAnalysis.zillowCost <= costAnalysis.corelogicCost) {
        strategy = 'zillow_primary';
        estimatedCost = costAnalysis.zillowCost;
        qualityScore = qualityAnalysis.zillowQualityScore;
        reasoning.push('Zillow primary for cost optimization');
      } else {
        strategy = 'corelogic_primary';
        estimatedCost = costAnalysis.corelogicCost;
        qualityScore = qualityAnalysis.corelogicQualityScore;
        reasoning.push('CoreLogic primary despite higher cost');
      }
    }
    else if (prioritizeQuality) {
      if (qualityAnalysis.zillowQualityScore >= qualityAnalysis.corelogicQualityScore) {
        strategy = 'zillow_primary';
        estimatedCost = costAnalysis.zillowCost;
        qualityScore = qualityAnalysis.zillowQualityScore;
        reasoning.push('Zillow primary for quality requirements');
      } else {
        strategy = 'corelogic_primary';
        estimatedCost = costAnalysis.corelogicCost;
        qualityScore = qualityAnalysis.corelogicQualityScore;
        reasoning.push('CoreLogic primary for quality requirements');
      }
    }
    else {
      // Smart default routing based on search pattern
      switch (searchAnalysis.searchType) {
        case 'specific_address':
          strategy = 'parallel';
          estimatedCost = costAnalysis.parallelCost;
          qualityScore = 9; // High quality for parallel approach
          reasoning.push('Parallel execution optimal for address-specific searches');
          break;
          
        case 'area_search':
        case 'filtered_search':
          strategy = 'zillow_primary';
          estimatedCost = costAnalysis.zillowCost;
          qualityScore = qualityAnalysis.zillowQualityScore;
          reasoning.push('Zillow primary optimal for area/filtered searches');
          break;
          
        default:
          strategy = 'zillow_primary';
          estimatedCost = costAnalysis.zillowCost;
          qualityScore = qualityAnalysis.zillowQualityScore;
          reasoning.push('Zillow primary as safe default');
      }
    }

    // Cost limit check
    if (maxCost && estimatedCost > maxCost) {
      if (costAnalysis.zillowCost <= maxCost) {
        strategy = 'zillow_primary';
        estimatedCost = costAnalysis.zillowCost;
        qualityScore = qualityAnalysis.zillowQualityScore;
        reasoning.push(`Cost limit enforced: switched to Zillow (under $${maxCost})`);
      } else {
        reasoning.push(`Warning: All options exceed cost limit of $${maxCost}`);
      }
    }

    return {
      strategy,
      estimatedCost,
      qualityScore,
      reasoning,
      alternatives: this.getAlternatives(costAnalysis, qualityAnalysis),
      confidence: searchAnalysis.confidence,
      searchAnalysis,
      costAnalysis,
      qualityAnalysis
    };
  }

  /**
   * 🔧 Get alternative routing strategies
   */
  getAlternatives(costAnalysis, qualityAnalysis) {
    return [
      {
        strategy: 'zillow_primary',
        cost: costAnalysis.zillowCost,
        quality: qualityAnalysis.zillowQualityScore,
        speed: 'fast',
        description: 'Zillow-first with fast results and good coverage'
      },
      {
        strategy: 'corelogic_primary',
        cost: costAnalysis.corelogicCost,
        quality: qualityAnalysis.corelogicQualityScore,
        speed: 'medium',
        description: 'CoreLogic-first with detailed property intelligence'
      },
      {
        strategy: 'parallel',
        cost: costAnalysis.parallelCost,
        quality: Math.max(qualityAnalysis.zillowQualityScore, qualityAnalysis.corelogicQualityScore),
        speed: 'fast',
        description: 'Parallel execution for maximum speed and data coverage'
      }
    ];
  }

  /**
   * 🔍 Helper: Detect if query is for specific address
   */
  isSpecificAddress(query) {
    const addressPatterns = [
      /\d+\s+[A-Za-z\s]+(st|street|ave|avenue|dr|drive|rd|road|ct|court|ln|lane|way|blvd|boulevard)/i,
      /^\d+\s+[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}/i
    ];
    
    return addressPatterns.some(pattern => pattern.test(query.trim()));
  }

  /**
   * 🌆 Helper: Detect if query is city-wide search
   */
  isCityWideSearch(query) {
    const cityPatterns = [
      /in\s+(houston|dallas|austin|san antonio)/i,
      /houses?\s+in\s+\w+/i,
      /properties?\s+in\s+\w+/i
    ];
    
    return cityPatterns.some(pattern => pattern.test(query));
  }

  /**
   * 📊 Helper: Estimate property count for cost calculation
   */
  estimatePropertyCount(searchRequest) {
    const { maxPrice, beds, propertyType, city } = searchRequest;
    
    let baseEstimate = 20; // Default
    
    // Adjust based on filters
    if (maxPrice && maxPrice < 200000) baseEstimate *= 0.5; // Fewer low-price properties
    if (maxPrice && maxPrice > 1000000) baseEstimate *= 0.3; // Fewer luxury properties
    if (beds && beds > 4) baseEstimate *= 0.4; // Fewer large properties
    if (propertyType && propertyType !== 'any') baseEstimate *= 0.7; // Type filtering
    
    return Math.max(5, Math.min(50, Math.round(baseEstimate)));
  }

  /**
   * 📊 Helper: Get weight for different data types
   */
  getDataTypeWeight(dataType) {
    const weights = {
      listings: 10,     // Very important
      images: 8,        // Important
      prices: 9,        // Very important
      details: 7,       // Moderately important
      history: 6,       // Less important for general searches
      valuation: 8      // Important for analysis
    };
    
    return weights[dataType] || 5;
  }

  /**
   * 🔄 Get default safe route
   */
  getDefaultRoute(searchRequest) {
    return {
      strategy: 'zillow_primary',
      estimatedCost: this.costs.zillow.search,
      qualityScore: 7,
      reasoning: ['Default safe route due to decision error'],
      confidence: 0.5,
      isDefault: true
    };
  }

  /**
   * 📊 Get routing statistics
   */
  getRoutingStats() {
    const total = this.routingStats.totalRoutes;
    
    return {
      totalRoutes: total,
      distribution: {
        zillow: {
          count: this.routingStats.zillowRoutes,
          percentage: total > 0 ? ((this.routingStats.zillowRoutes / total) * 100).toFixed(1) : 0
        },
        corelogic: {
          count: this.routingStats.coreLogicRoutes,
          percentage: total > 0 ? ((this.routingStats.coreLogicRoutes / total) * 100).toFixed(1) : 0
        },
        parallel: {
          count: this.routingStats.parallelRoutes,
          percentage: total > 0 ? ((this.routingStats.parallelRoutes / total) * 100).toFixed(1) : 0
        }
      },
      performance: {
        avgDecisionTime: parseFloat(this.routingStats.avgDecisionTime.toFixed(2)),
        estimatedCostSavings: parseFloat(this.routingStats.costSavings.toFixed(2))
      }
    };
  }

  /**
   * 📊 Log routing statistics
   */
  logRoutingStats() {
    const stats = this.getRoutingStats();
    
    console.log(`\n🧠 DATA SOURCE ROUTING STATISTICS`);
    console.log(`==========================================`);
    console.log(`Total Routing Decisions: ${stats.totalRoutes}`);
    console.log(`\nRouting Distribution:`);
    console.log(`  Zillow Primary: ${stats.distribution.zillow.count} (${stats.distribution.zillow.percentage}%)`);
    console.log(`  CoreLogic Primary: ${stats.distribution.corelogic.count} (${stats.distribution.corelogic.percentage}%)`);
    console.log(`  Parallel Execution: ${stats.distribution.parallel.count} (${stats.distribution.parallel.percentage}%)`);
    console.log(`\nPerformance:`);
    console.log(`  Average Decision Time: ${stats.performance.avgDecisionTime}ms`);
    console.log(`  Estimated Cost Savings: $${stats.performance.estimatedCostSavings}`);
    console.log(`==========================================`);
  }
}

module.exports = { DataSourceRouter };
