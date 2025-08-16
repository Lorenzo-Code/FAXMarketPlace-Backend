/**
 * 🧪 Comprehensive Test Suite for Search V2 Improvements
 * 
 * Tests the integration of:
 * - Enhanced cache service
 * - PropertyBatchProcessor 
 * - DataSourceRouter optimizations
 * - Performance improvements
 * - Address search vs general search routing
 */

const fetch = require('node-fetch');
const { performance } = require('perf_hooks');

// Test configuration
const BASE_URL = 'http://localhost:3000'; // Update if your server runs on different port
const SEARCH_V2_ENDPOINT = `${BASE_URL}/api/ai/search/v2`;

// Test cases
const TEST_CASES = [
  {
    name: 'General Search - City Wide (Zillow Preferred)',
    query: 'houses under 300k in Houston',
    expectedType: 'general',
    description: 'Should use Zillow for city-wide search, enhanced cache, and batch processing'
  },
  {
    name: 'General Search - Specific Criteria',
    query: '3 bedroom house under 250k',
    expectedType: 'general',
    description: 'Should parse specific criteria and use intelligent routing'
  },
  {
    name: 'Address Search - Specific Property (CoreLogic Preferred)',
    query: '123 Main Street, Houston, TX 77001',
    expectedType: 'address',
    description: 'Should verify with Google, then parallel fetch from Zillow + CoreLogic'
  },
  {
    name: 'Cache Performance Test',
    query: 'houses under 300k in Houston',
    expectedType: 'general',
    description: 'Second request should be served from enhanced cache',
    isRepeat: true
  }
];

// Performance benchmarks
const PERFORMANCE_BENCHMARKS = {
  totalRequestTime: 5000, // 5 seconds max
  cacheHitTime: 200, // 200ms max for cache hits
  detectionTime: 10, // 10ms max for search type detection
  aiParsingTime: 2000, // 2 seconds max for AI parsing
  discoveryTime: 3000, // 3 seconds max for discovery phase
};

class TestRunner {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  async runTest(testCase) {
    console.log(`\n🧪 Running Test: ${testCase.name}`);
    console.log(`📝 Description: ${testCase.description}`);
    console.log(`🔍 Query: "${testCase.query}"`);
    
    const startTime = performance.now();
    
    try {
      const response = await fetch(SEARCH_V2_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: testCase.query })
      });

      const responseTime = performance.now() - startTime;
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data.error || 'Unknown error'}`);
      }

      // Analyze results
      const analysis = this.analyzeResponse(data, testCase, responseTime);
      this.results.push(analysis);

      if (analysis.passed) {
        this.passed++;
        console.log(`✅ PASSED: ${testCase.name}`);
      } else {
        this.failed++;
        console.log(`❌ FAILED: ${testCase.name}`);
        console.log(`   Issues: ${analysis.issues.join(', ')}`);
      }

      return analysis;

    } catch (error) {
      const analysis = {
        testName: testCase.name,
        passed: false,
        responseTime: performance.now() - startTime,
        error: error.message,
        issues: [`Request failed: ${error.message}`]
      };
      
      this.results.push(analysis);
      this.failed++;
      console.log(`❌ FAILED: ${testCase.name} - ${error.message}`);
      return analysis;
    }
  }

  analyzeResponse(data, testCase, responseTime) {
    const issues = [];
    let passed = true;

    // 1. Basic Response Structure
    if (!data.metadata) {
      issues.push('Missing metadata');
      passed = false;
    }

    if (!data.listings || !Array.isArray(data.listings)) {
      issues.push('Missing or invalid listings array');
      passed = false;
    }

    // 2. Search Type Detection
    if (data.metadata && data.metadata.searchType !== testCase.expectedType) {
      issues.push(`Expected search type '${testCase.expectedType}', got '${data.metadata.searchType}'`);
      passed = false;
    }

    // 3. Performance Metrics
    if (data.metadata && data.metadata.performanceMetrics) {
      const metrics = data.metadata.performanceMetrics;
      
      if (metrics.totalRequestTime > PERFORMANCE_BENCHMARKS.totalRequestTime) {
        issues.push(`Request too slow: ${metrics.totalRequestTime.toFixed(2)}ms > ${PERFORMANCE_BENCHMARKS.totalRequestTime}ms`);
        passed = false;
      }

      if (data.fromCache && responseTime > PERFORMANCE_BENCHMARKS.cacheHitTime) {
        issues.push(`Cache hit too slow: ${responseTime.toFixed(2)}ms > ${PERFORMANCE_BENCHMARKS.cacheHitTime}ms`);
        passed = false;
      }

      if (metrics.detectionTime && metrics.detectionTime > PERFORMANCE_BENCHMARKS.detectionTime) {
        issues.push(`Detection too slow: ${metrics.detectionTime.toFixed(2)}ms > ${PERFORMANCE_BENCHMARKS.detectionTime}ms`);
        passed = false;
      }
    }

    // 4. Enhanced Cache Integration
    if (testCase.isRepeat && !data.fromCache) {
      issues.push('Expected cache hit on repeat request');
      passed = false;
    }

    // 5. Data Quality
    if (data.listings && data.listings.length > 0) {
      const firstListing = data.listings[0];
      
      if (!firstListing.id) {
        issues.push('Listings missing IDs');
        passed = false;
      }

      if (!firstListing.address || !firstListing.address.oneLine) {
        issues.push('Listings missing address information');
        passed = false;
      }
    }

    // 6. AI Summary
    if (!data.ai_summary || data.ai_summary.length < 10) {
      issues.push('Missing or insufficient AI summary');
      passed = false;
    }

    // 7. Routing Decision (for general searches)
    if (testCase.expectedType === 'general' && data.metadata && data.metadata.dataSource) {
      if (!['zillow', 'enhanced_cache'].includes(data.metadata.dataSource)) {
        issues.push(`Unexpected data source for general search: ${data.metadata.dataSource}`);
        passed = false;
      }
    }

    return {
      testName: testCase.name,
      passed,
      issues,
      responseTime,
      data,
      metrics: {
        totalListings: data.listings ? data.listings.length : 0,
        fromCache: data.fromCache,
        searchType: data.metadata ? data.metadata.searchType : null,
        dataSource: data.metadata ? data.metadata.dataSource : null,
        performanceMetrics: data.metadata ? data.metadata.performanceMetrics : null
      }
    };
  }

  printSummary() {
    console.log(`\n\n📊 TEST SUMMARY`);
    console.log(`==========================================`);
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${this.passed} ✅`);
    console.log(`Failed: ${this.failed} ❌`);
    console.log(`Success Rate: ${((this.passed / this.results.length) * 100).toFixed(1)}%`);

    if (this.failed > 0) {
      console.log(`\n❌ FAILED TESTS:`);
      this.results.filter(r => !r.passed).forEach(result => {
        console.log(`  - ${result.testName}`);
        result.issues.forEach(issue => console.log(`    * ${issue}`));
      });
    }

    console.log(`\n📈 PERFORMANCE ANALYSIS:`);
    this.results.forEach(result => {
      if (result.metrics) {
        console.log(`\n${result.testName}:`);
        console.log(`  Response Time: ${result.responseTime.toFixed(2)}ms`);
        console.log(`  From Cache: ${result.metrics.fromCache ? 'Yes' : 'No'}`);
        console.log(`  Listings Found: ${result.metrics.totalListings}`);
        console.log(`  Search Type: ${result.metrics.searchType}`);
        console.log(`  Data Source: ${result.metrics.dataSource}`);
        
        if (result.metrics.performanceMetrics) {
          const pm = result.metrics.performanceMetrics;
          if (pm.totalRequestTime) console.log(`  Total Request Time: ${pm.totalRequestTime.toFixed(2)}ms`);
          if (pm.detectionTime) console.log(`  Detection Time: ${pm.detectionTime.toFixed(2)}ms`);
          if (pm.aiParsingTime) console.log(`  AI Parsing Time: ${pm.aiParsingTime.toFixed(2)}ms`);
          if (pm.discoveryTime) console.log(`  Discovery Time: ${pm.discoveryTime.toFixed(2)}ms`);
          if (pm.summaryTime) console.log(`  Summary Time: ${pm.summaryTime.toFixed(2)}ms`);
        }
      }
    });

    console.log(`\n🎯 INTEGRATION STATUS:`);
    console.log(`✅ Enhanced Cache Service: ${ this.results.some(r => r.metrics && r.metrics.fromCache) ? 'Working' : 'Not Detected'}`);
    console.log(`✅ Search Type Detection: ${ this.results.every(r => r.metrics && r.metrics.searchType) ? 'Working' : 'Failed'}`);
    console.log(`✅ Performance Metrics: ${ this.results.some(r => r.metrics && r.metrics.performanceMetrics) ? 'Working' : 'Not Detected'}`);
    console.log(`✅ AI Summary Generation: ${ this.results.every(r => r.data && r.data.ai_summary) ? 'Working' : 'Failed'}`);
  }
}

async function runTests() {
  console.log('🚀 Starting Search V2 Improvements Test Suite');
  console.log('===============================================');
  console.log(`Testing endpoint: ${SEARCH_V2_ENDPOINT}`);
  
  const runner = new TestRunner();

  // Test server availability
  try {
    console.log('\n🔍 Testing server availability...');
    const healthCheck = await fetch(`${BASE_URL}/health`).catch(() => 
      fetch(`${BASE_URL}`).catch(() => null)
    );
    
    if (!healthCheck) {
      console.log('⚠️ Server may not be running. Attempting tests anyway...');
    } else {
      console.log('✅ Server is responding');
    }
  } catch (error) {
    console.log('⚠️ Could not verify server status. Proceeding with tests...');
  }

  // Run all test cases
  for (const testCase of TEST_CASES) {
    await runner.runTest(testCase);
    
    // Add small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Print comprehensive summary
  runner.printSummary();

  // Exit with appropriate code
  process.exit(runner.failed > 0 ? 1 : 0);
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests, TestRunner };
