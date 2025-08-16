/**
 * FXCT Pricing Observability & Guardrails System
 * 
 * Provides comprehensive monitoring, alerting, and safety mechanisms:
 * 1. Metrics collection and emission
 * 2. Alert generation for anomalies
 * 3. Strict mode enforcement
 * 4. Health monitoring and dashboards
 * 5. Automated safeguards and circuit breakers
 */

const EventEmitter = require('events');

// Import pricing services
const { priceFeedService } = require('./priceFeed');
const { fxctRatesService } = require('./fxctRates');
const { tokenIssuanceService } = require('./tokenIssuance');
const { overageHandlerService } = require('./overageHandler');

class PricingObservabilityService extends EventEmitter {
  constructor() {
    super();
    
    this.metrics = new Map();
    this.alerts = [];
    this.circuitBreakers = new Map();
    this.lastHealthCheck = null;
    this.alertThresholds = this.getAlertThresholds();
    
    // Start background monitoring
    this.startMonitoring();
  }

  /**
   * Get alert thresholds from configuration
   */
  getAlertThresholds() {
    const config = require('../config/pricing');
    
    return {
      // Price-related thresholds
      priceStalenessDays: 2,
      priceVolatilityThreshold: 0.15, // 15% daily volatility
      oraclFailureThreshold: 3,
      
      // Margin-related thresholds
      marginDropThreshold: config.MARGIN_ALERT_THRESHOLD || 0.05,
      marginUnsafeCount: 2, // Number of data types with unsafe margins
      
      // Usage-related thresholds
      overageRateThreshold: 0.10, // 10% of requests result in overages
      balanceExhaustionRate: 50, // Users per day exhausting balance
      
      // System-related thresholds
      apiErrorRateThreshold: 0.05, // 5% API error rate
      responseTimeThreshold: 2000, // 2 second response time
      
      // Rate calculation thresholds
      rateChangePercentage: 0.25, // 25% rate change triggers alert
      floorApplicationRate: 0.5 // 50% of rates using floors
    };
  }

  /**
   * Start background monitoring processes
   */
  startMonitoring() {
    // Health check every 5 minutes
    setInterval(() => {
      this.performHealthCheck().catch(console.error);
    }, 5 * 60 * 1000);

    // Metrics collection every minute
    setInterval(() => {
      this.collectMetrics().catch(console.error);
    }, 60 * 1000);

    // Alert evaluation every 2 minutes
    setInterval(() => {
      this.evaluateAlerts().catch(console.error);
    }, 2 * 60 * 1000);

    // Circuit breaker evaluation every 30 seconds
    setInterval(() => {
      this.evaluateCircuitBreakers().catch(console.error);
    }, 30 * 1000);

    console.log('📊 Pricing observability monitoring started');
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    try {
      const startTime = Date.now();
      
      const [priceHealth, ratesHealth, issuanceHealth] = await Promise.all([
        this.checkPriceFeedHealth(),
        this.checkRatesHealth(),
        this.checkIssuanceHealth()
      ]);

      const healthCheck = {
        timestamp: new Date().toISOString(),
        overall_status: this.determineOverallHealth([priceHealth, ratesHealth, issuanceHealth]),
        response_time_ms: Date.now() - startTime,
        components: {
          price_feed: priceHealth,
          fxct_rates: ratesHealth,
          token_issuance: issuanceHealth
        }
      };

      this.lastHealthCheck = healthCheck;
      this.emitMetric('health_check_duration', Date.now() - startTime);
      this.emitMetric('overall_health_status', healthCheck.overall_status === 'healthy' ? 1 : 0);

      return healthCheck;

    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      this.emitAlert('HEALTH_CHECK_FAILED', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      return {
        overall_status: 'critical',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check price feed health
   */
  async checkPriceFeedHealth() {
    try {
      const health = await priceFeedService.healthCheck();
      const sevenDayAvg = await priceFeedService.getSevenDayAverage();
      
      const issues = [];
      
      // Check staleness
      if (sevenDayAvg.isStale) {
        issues.push(`Price data is stale (${sevenDayAvg.staleness}h)`);
      }
      
      // Check data points
      if (sevenDayAvg.dataPoints < 5) {
        issues.push(`Insufficient price data points (${sevenDayAvg.dataPoints}/7)`);
      }
      
      // Check volatility
      const { priceRange } = sevenDayAvg;
      const volatility = (priceRange.max - priceRange.min) / ((priceRange.max + priceRange.min) / 2);
      if (volatility > this.alertThresholds.priceVolatilityThreshold) {
        issues.push(`High price volatility (${(volatility * 100).toFixed(1)}%)`);
      }

      return {
        status: issues.length === 0 ? 'healthy' : 'degraded',
        price: sevenDayAvg.price,
        staleness_hours: sevenDayAvg.staleness,
        data_points: sevenDayAvg.dataPoints,
        volatility: volatility,
        issues
      };

    } catch (error) {
      return {
        status: 'critical',
        error: error.message
      };
    }
  }

  /**
   * Check FXCT rates health
   */
  async checkRatesHealth() {
    try {
      const currentRates = await fxctRatesService.getCurrentRates();
      const marginAnalysis = await fxctRatesService.getMarginAnalysis();
      
      const issues = [];
      
      // Check if all required data types have rates
      const requiredTypes = ['BASIC', 'STANDARD', 'PRO_LOW', 'PRO_HIGH'];
      const missingTypes = requiredTypes.filter(type => !currentRates[type]);
      if (missingTypes.length > 0) {
        issues.push(`Missing rates for: ${missingTypes.join(', ')}`);
      }
      
      // Check margin safety
      const unsafeMargins = Object.entries(marginAnalysis.analysis)
        .filter(([type, analysis]) => !analysis.isMarginSafe);
      
      if (unsafeMargins.length > this.alertThresholds.marginUnsafeCount) {
        issues.push(`Unsafe margins for: ${unsafeMargins.map(([type]) => type).join(', ')}`);
      }
      
      // Check floor application rate
      const ratesWithFloors = Object.values(currentRates)
        .filter(rate => rate.metadata?.appliedFloor);
      
      const floorRate = ratesWithFloors.length / Object.keys(currentRates).length;
      if (floorRate > this.alertThresholds.floorApplicationRate) {
        issues.push(`High floor application rate (${(floorRate * 100).toFixed(1)}%)`);
      }

      return {
        status: issues.length === 0 ? 'healthy' : 'degraded',
        total_rates: Object.keys(currentRates).length,
        unsafe_margins: unsafeMargins.length,
        floor_application_rate: floorRate,
        price_stale: marginAnalysis.priceStale,
        issues
      };

    } catch (error) {
      return {
        status: 'critical',
        error: error.message
      };
    }
  }

  /**
   * Check token issuance health
   */
  async checkIssuanceHealth() {
    try {
      // Get recent issuance statistics
      const issuanceStats = await tokenIssuanceService.getSystemIssuanceStats();
      const overageStats = await overageHandlerService.getSystemOverageStats(7);
      
      const issues = [];
      
      // Check overage rate
      const totalRequests = 1000; // Placeholder - would get from actual metrics
      const overageRate = overageStats.summary.totalOverageEvents / totalRequests;
      
      if (overageRate > this.alertThresholds.overageRateThreshold) {
        issues.push(`High overage rate (${(overageRate * 100).toFixed(1)}%)`);
      }
      
      // Check recent issuance activity
      if (issuanceStats.length === 0) {
        issues.push('No recent token issuance activity');
      }

      return {
        status: issues.length === 0 ? 'healthy' : 'degraded',
        recent_issuances: issuanceStats.length,
        overage_rate: overageRate,
        total_overages: overageStats.summary.totalOverageEvents,
        issues
      };

    } catch (error) {
      return {
        status: 'critical',
        error: error.message
      };
    }
  }

  /**
   * Determine overall health status
   */
  determineOverallHealth(componentHealths) {
    const statuses = componentHealths.map(h => h.status);
    
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('degraded')) return 'degraded';
    return 'healthy';
  }

  /**
   * Collect key metrics
   */
  async collectMetrics() {
    try {
      const timestamp = Date.now();
      
      // Price metrics
      const sevenDayAvg = await priceFeedService.getSevenDayAverage();
      this.emitMetric('fxct_usd_price_7d_avg', sevenDayAvg.price, timestamp);
      this.emitMetric('price_data_points', sevenDayAvg.dataPoints, timestamp);
      this.emitMetric('price_is_stale', sevenDayAvg.isStale ? 1 : 0, timestamp);
      this.emitMetric('price_staleness_hours', sevenDayAvg.staleness, timestamp);

      // Rates metrics
      const currentRates = await fxctRatesService.getCurrentRates();
      const marginAnalysis = await fxctRatesService.getMarginAnalysis();
      
      for (const [dataType, rate] of Object.entries(currentRates)) {
        this.emitMetric(`fxct_rate_${dataType.toLowerCase()}`, rate.fxctRate, timestamp);
        this.emitMetric(`usd_cost_${dataType.toLowerCase()}`, rate.usdCost, timestamp);
      }
      
      // Margin metrics
      let avgMargin = 0;
      let marginSafeCount = 0;
      for (const [dataType, analysis] of Object.entries(marginAnalysis.analysis)) {
        avgMargin += analysis.actualMargin;
        if (analysis.isMarginSafe) marginSafeCount++;
        
        this.emitMetric(`margin_${dataType.toLowerCase()}`, analysis.actualMargin, timestamp);
        this.emitMetric(`margin_safe_${dataType.toLowerCase()}`, analysis.isMarginSafe ? 1 : 0, timestamp);
      }
      
      this.emitMetric('avg_margin', avgMargin / Object.keys(marginAnalysis.analysis).length, timestamp);
      this.emitMetric('margin_safe_count', marginSafeCount, timestamp);

      console.log(`📊 Collected metrics at ${new Date(timestamp).toISOString()}`);

    } catch (error) {
      console.error('❌ Failed to collect metrics:', error.message);
    }
  }

  /**
   * Emit a metric (in production, this would send to monitoring system)
   */
  emitMetric(name, value, timestamp = Date.now()) {
    const metric = {
      name,
      value,
      timestamp,
      tags: {
        service: 'fxct-pricing',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    // Store locally
    const key = `${name}_${timestamp}`;
    this.metrics.set(key, metric);
    
    // Emit event
    this.emit('metric', metric);
    
    // In production, send to monitoring system (DataDog, CloudWatch, etc.)
    console.log(`📈 Metric: ${name}=${value} @${new Date(timestamp).toISOString()}`);
    
    // Clean old metrics (keep last 1000)
    if (this.metrics.size > 1000) {
      const oldestKey = this.metrics.keys().next().value;
      this.metrics.delete(oldestKey);
    }
  }

  /**
   * Evaluate alerts based on current state
   */
  async evaluateAlerts() {
    try {
      if (!this.lastHealthCheck) return;
      
      const alerts = [];
      
      // Price-related alerts
      if (this.lastHealthCheck.components.price_feed.status === 'critical') {
        alerts.push({
          type: 'PRICE_FEED_CRITICAL',
          severity: 'critical',
          message: 'Price feed is in critical state',
          data: this.lastHealthCheck.components.price_feed
        });
      }
      
      if (this.lastHealthCheck.components.price_feed.staleness_hours > this.alertThresholds.priceStalenessDays * 24) {
        alerts.push({
          type: 'PRICE_DATA_STALE',
          severity: 'high',
          message: `Price data is stale for ${this.lastHealthCheck.components.price_feed.staleness_hours} hours`,
          data: { staleness: this.lastHealthCheck.components.price_feed.staleness_hours }
        });
      }
      
      // Margin-related alerts
      if (this.lastHealthCheck.components.fxct_rates.unsafe_margins > this.alertThresholds.marginUnsafeCount) {
        alerts.push({
          type: 'UNSAFE_MARGINS',
          severity: 'high',
          message: `${this.lastHealthCheck.components.fxct_rates.unsafe_margins} data types have unsafe margins`,
          data: { unsafe_count: this.lastHealthCheck.components.fxct_rates.unsafe_margins }
        });
      }
      
      // Overage-related alerts
      if (this.lastHealthCheck.components.token_issuance.overage_rate > this.alertThresholds.overageRateThreshold) {
        alerts.push({
          type: 'HIGH_OVERAGE_RATE',
          severity: 'medium',
          message: `Overage rate is ${(this.lastHealthCheck.components.token_issuance.overage_rate * 100).toFixed(1)}%`,
          data: { overage_rate: this.lastHealthCheck.components.token_issuance.overage_rate }
        });
      }
      
      // Process alerts
      for (const alert of alerts) {
        await this.emitAlert(alert.type, alert);
      }

    } catch (error) {
      console.error('❌ Failed to evaluate alerts:', error.message);
    }
  }

  /**
   * Emit an alert
   */
  async emitAlert(type, data) {
    const alert = {
      type,
      timestamp: new Date().toISOString(),
      data,
      id: `${type}_${Date.now()}`
    };
    
    // Store alert
    this.alerts.push(alert);
    
    // Emit event
    this.emit('alert', alert);
    
    // Log alert
    console.warn(`🚨 Alert [${alert.type}]: ${data.message || 'No message'}`);
    
    // In production, send to alerting system (PagerDuty, Slack, etc.)
    
    // Clean old alerts (keep last 100)
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
    
    // Check for strict mode activation
    if (this.shouldActivateStrictMode(alert)) {
      await this.activateStrictMode(alert);
    }
  }

  /**
   * Check if strict mode should be activated
   */
  shouldActivateStrictMode(alert) {
    const strictModeAlerts = ['PRICE_DATA_STALE', 'UNSAFE_MARGINS', 'HIGH_OVERAGE_RATE'];
    const config = require('../config/pricing');
    
    return strictModeAlerts.includes(alert.type) && !config.PRICING_STRICT_MODE;
  }

  /**
   * Activate strict mode automatically
   */
  async activateStrictMode(triggerAlert) {
    try {
      console.warn(`⚠️ Auto-activating strict mode due to alert: ${triggerAlert.type}`);
      
      // Enable strict mode
      process.env.PRICING_STRICT_MODE = 'true';
      
      // Recompute rates with strict mode
      await fxctRatesService.computeAllRates(true);
      
      // Emit alert about strict mode activation
      await this.emitAlert('STRICT_MODE_ACTIVATED', {
        severity: 'medium',
        message: 'Strict pricing mode activated automatically',
        trigger_alert: triggerAlert.type,
        data: { activated_at: new Date().toISOString() }
      });

    } catch (error) {
      console.error('❌ Failed to activate strict mode:', error.message);
    }
  }

  /**
   * Evaluate circuit breakers
   */
  async evaluateCircuitBreakers() {
    // Price feed circuit breaker
    await this.evaluatePriceFeedCircuitBreaker();
    
    // Rate computation circuit breaker
    await this.evaluateRateComputationCircuitBreaker();
    
    // Token issuance circuit breaker
    await this.evaluateTokenIssuanceCircuitBreaker();
  }

  /**
   * Evaluate price feed circuit breaker
   */
  async evaluatePriceFeedCircuitBreaker() {
    const breakerId = 'price_feed';
    let breaker = this.circuitBreakers.get(breakerId);
    
    if (!breaker) {
      breaker = {
        state: 'closed', // closed, open, half-open
        failureCount: 0,
        lastFailure: null,
        threshold: 3,
        timeout: 5 * 60 * 1000 // 5 minutes
      };
      this.circuitBreakers.set(breakerId, breaker);
    }
    
    try {
      // Test price feed
      await priceFeedService.getSevenDayAverage();
      
      // Success - reset failure count
      if (breaker.failureCount > 0) {
        breaker.failureCount = 0;
        breaker.state = 'closed';
        console.log(`✅ Price feed circuit breaker reset`);
      }
      
    } catch (error) {
      breaker.failureCount++;
      breaker.lastFailure = Date.now();
      
      if (breaker.failureCount >= breaker.threshold && breaker.state === 'closed') {
        breaker.state = 'open';
        
        await this.emitAlert('CIRCUIT_BREAKER_OPENED', {
          severity: 'critical',
          message: 'Price feed circuit breaker opened',
          data: { breaker_id: breakerId, failure_count: breaker.failureCount }
        });
        
        console.error(`🔴 Price feed circuit breaker OPENED after ${breaker.failureCount} failures`);
      }
    }
  }

  /**
   * Evaluate rate computation circuit breaker
   */
  async evaluateRateComputationCircuitBreaker() {
    const breakerId = 'rate_computation';
    let breaker = this.circuitBreakers.get(breakerId);
    
    if (!breaker) {
      breaker = {
        state: 'closed',
        failureCount: 0,
        lastFailure: null,
        threshold: 2,
        timeout: 10 * 60 * 1000 // 10 minutes
      };
      this.circuitBreakers.set(breakerId, breaker);
    }
    
    try {
      // Test rate computation
      await fxctRatesService.getCurrentRates();
      
      if (breaker.failureCount > 0) {
        breaker.failureCount = 0;
        breaker.state = 'closed';
      }
      
    } catch (error) {
      breaker.failureCount++;
      breaker.lastFailure = Date.now();
      
      if (breaker.failureCount >= breaker.threshold && breaker.state === 'closed') {
        breaker.state = 'open';
        
        await this.emitAlert('CIRCUIT_BREAKER_OPENED', {
          severity: 'critical',
          message: 'Rate computation circuit breaker opened',
          data: { breaker_id: breakerId, failure_count: breaker.failureCount }
        });
      }
    }
  }

  /**
   * Evaluate token issuance circuit breaker
   */
  async evaluateTokenIssuanceCircuitBreaker() {
    const breakerId = 'token_issuance';
    let breaker = this.circuitBreakers.get(breakerId);
    
    if (!breaker) {
      breaker = {
        state: 'closed',
        failureCount: 0,
        lastFailure: null,
        threshold: 5,
        timeout: 15 * 60 * 1000 // 15 minutes
      };
      this.circuitBreakers.set(breakerId, breaker);
    }
    
    // Token issuance is more resilient, so we have a higher threshold
  }

  /**
   * Get current observability status
   */
  getStatus() {
    return {
      last_health_check: this.lastHealthCheck,
      total_metrics: this.metrics.size,
      active_alerts: this.alerts.length,
      circuit_breakers: Object.fromEntries(this.circuitBreakers),
      monitoring_active: true,
      uptime: process.uptime()
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit = 20) {
    return this.alerts.slice(-limit);
  }

  /**
   * Get metrics for time range
   */
  getMetrics(metricName, startTime, endTime) {
    const results = [];
    
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.name === metricName && 
          metric.timestamp >= startTime && 
          metric.timestamp <= endTime) {
        results.push(metric);
      }
    }
    
    return results.sort((a, b) => a.timestamp - b.timestamp);
  }
}

// Create and export singleton instance
const observabilityService = new PricingObservabilityService();

module.exports = {
  PricingObservabilityService,
  observabilityService
};
