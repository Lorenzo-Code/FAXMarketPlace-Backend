/**
 * 🧪 Test Script: Optimized CoreLogic-First Search Flow
 * 
 * This script tests the new optimized approach:
 * 1. CoreLogic first for property intelligence (cached)
 * 2. Zillow second for images enhancement
 * 3. Comprehensive caching for cost savings
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function testOptimizedSearch() {
  console.log('🚀 Testing Optimized CoreLogic-First Search Flow');
  console.log('===============================================');
  
  const testQueries = [
    {
      name: "Basic Houston Search",
      query: "3 bedroom houses under $300k in Houston"
    },
    {
      name: "Specific Area Search", 
      query: "2+ bedroom properties under $250k near downtown Houston"
    },
    {
      name: "Investment Property Search",
      query: "rental properties under $200k in Houston with good ROI potential"
    }
  ];

  for (const test of testQueries) {
    console.log(`\n🎯 Test: ${test.name}`);
    console.log(`📝 Query: "${test.query}"`);
    console.log('-------------------');
    
    const startTime = Date.now();
    
    try {
      const response = await axios.post(`${BASE_URL}/api/ai/search`, {
        query: test.query
      }, {
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`✅ Response Status: ${response.status}`);
      console.log(`⏱️ Response Time: ${duration}ms`);
      console.log(`📊 Results Found: ${response.data.listings?.length || 0}`);
      console.log(`💾 From Cache: ${response.data.fromCache ? 'Yes' : 'No'}`);
      
      if (response.data.metadata) {
        const meta = response.data.metadata;
        console.log(`📈 Data Quality:`);
        console.log(`   - Excellent: ${meta.dataQuality?.breakdown?.excellent || 0}`);
        console.log(`   - Good: ${meta.dataQuality?.breakdown?.good || 0}`);
        console.log(`   - Partial: ${meta.dataQuality?.breakdown?.partial || 0}`);
        console.log(`   - Poor: ${meta.dataQuality?.breakdown?.poor || 0}`);
        
        if (meta.enrichmentStats) {
          console.log(`🔧 Enrichment:`);
          console.log(`   - Attom Success: ${meta.enrichmentStats.attomSuccess}`);
          console.log(`   - Attom Errors: ${meta.enrichmentStats.attomErrors}`);
          console.log(`   - Success Rate: ${meta.enrichmentStats.attomSuccessRate?.toFixed(1)}%`);
        }
      }
      
      // Check first property for data completeness
      if (response.data.listings && response.data.listings.length > 0) {
        const firstProperty = response.data.listings[0];
        console.log(`🏠 Sample Property:`);
        console.log(`   - Address: ${firstProperty.address?.oneLine || 'N/A'}`);
        console.log(`   - Price: $${firstProperty.price?.toLocaleString() || 'N/A'}`);
        console.log(`   - Beds/Baths: ${firstProperty.beds || 'N/A'}/${firstProperty.baths || 'N/A'}`);
        console.log(`   - Image: ${firstProperty.zillowImage ? 'Present' : 'Missing'}`);
        console.log(`   - Data Source: ${firstProperty.dataSource || 'Unknown'}`);
        console.log(`   - Quality: ${firstProperty.dataQuality || 'Unknown'}`);
      }
      
      console.log(`🤖 AI Summary: ${response.data.ai_summary?.substring(0, 100)}...`);
      
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`❌ Error after ${duration}ms:`);
      console.log(`   Status: ${error.response?.status || 'No Response'}`);
      console.log(`   Message: ${error.message}`);
      
      if (error.response?.data) {
        console.log(`   Details: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }
    
    console.log('-------------------');
    
    // Add delay between tests to avoid rate limiting
    if (testQueries.indexOf(test) < testQueries.length - 1) {
      console.log('⏳ Waiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n🏁 All tests completed!');
}

// Test individual components
async function testCoreLogicCache() {
  console.log('\n🧪 Testing CoreLogic Cache Wrapper');
  console.log('==================================');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/ai/cache/health`);
    console.log('✅ Cache Health Check:', response.data);
  } catch (error) {
    console.log('❌ Cache health check failed:', error.message);
  }
}

async function testPipeline() {
  console.log('\n🧪 Testing AI Pipeline (CoreLogic Integration)');
  console.log('=============================================');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/ai/pipeline`, {
      prompt: "Find me a 3 bedroom house under $250k in Houston, TX"
    });
    
    console.log('✅ Pipeline Response:', {
      status: response.status,
      sessionId: response.data.session_id,
      hasEnrichedData: !!response.data.enriched_data,
      corelogicData: !!response.data.enriched_data?.corelogic
    });
    
  } catch (error) {
    console.log('❌ Pipeline test failed:', error.response?.data || error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Comprehensive API Tests');
  console.log('====================================');
  
  await testOptimizedSearch();
  await testCoreLogicCache();
  await testPipeline();
  
  console.log('\n🎉 Test Suite Completed!');
  console.log('========================');
  console.log('✅ Check the logs above for performance metrics');
  console.log('💰 Look for cache hit rates to measure cost savings');
  console.log('📊 Review data quality metrics for optimization opportunities');
}

// Allow running individual tests or all tests
if (require.main === module) {
  const testType = process.argv[2];
  
  switch (testType) {
    case 'search':
      testOptimizedSearch();
      break;
    case 'cache':
      testCoreLogicCache();
      break;
    case 'pipeline':
      testPipeline();
      break;
    default:
      runAllTests();
  }
}

module.exports = {
  testOptimizedSearch,
  testCoreLogicCache,
  testPipeline,
  runAllTests
};
