/**
 * 🧪 AI Marketplace Endpoint Test
 * 
 * Tests our new /api/ai/marketplace endpoint to ensure it's working
 * with LoopNet data integration and AI analysis.
 */

require('dotenv').config();
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5000';

async function testAIMarketplaceEndpoint() {
  console.log('🧪 Testing AI Marketplace Endpoint...\n');
  
  const testCases = [
    {
      name: 'Basic Houston Investment Properties',
      payload: {
        query: 'Find high-potential investment properties in Houston, TX area',
        location: 'Houston, TX',
        maxPrice: 500000,
        minPrice: 100000,
        limit: 5
      }
    },
    {
      name: 'Higher Price Range',
      payload: {
        query: 'Find commercial investment properties suitable for fractionalization',
        location: 'Houston, TX',
        maxPrice: 1000000,
        minPrice: 500000,
        limit: 3
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`🔍 Testing: ${testCase.name}`);
    console.log(`📤 Request: ${JSON.stringify(testCase.payload, null, 2)}`);
    
    try {
      const startTime = Date.now();
      
      const response = await fetch(`${BASE_URL}/api/ai/marketplace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testCase.payload)
      });

      const responseTime = Date.now() - startTime;
      
      console.log(`📈 Response Status: ${response.status} ${response.statusText}`);
      console.log(`⏱️ Response Time: ${responseTime}ms`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error: ${response.status}`);
        console.error(`📝 Error Details: ${errorText}`);
        continue;
      }

      const data = await response.json();
      
      console.log('\n📦 Response Analysis:');
      console.log(`✓ Success: ${data.success}`);
      console.log(`✓ Listings Count: ${data.listings ? data.listings.length : 0}`);
      console.log(`✓ Has AI Summary: ${!!data.ai_summary}`);
      console.log(`✓ Data Source: ${data.metadata?.source || 'unknown'}`);
      console.log(`✓ Processing Time: ${data.metadata?.processing_time || 'unknown'}ms`);
      
      if (data.listings && data.listings.length > 0) {
        const firstListing = data.listings[0];
        console.log('\n🏠 Sample Listing:');
        console.log(`  • ID: ${firstListing.id}`);
        console.log(`  • Title: ${firstListing.title}`);
        console.log(`  • Address: ${firstListing.address}`);
        console.log(`  • Price: $${firstListing.price?.toLocaleString() || 'N/A'}`);
        console.log(`  • Property Type: ${firstListing.propertyType}`);
        console.log(`  • Expected ROI: ${firstListing.expectedROI}%`);
        console.log(`  • AI Generated: ${firstListing.aiGenerated}`);
        
        if (firstListing.aiAnalysis) {
          console.log(`  • Investment Score: ${firstListing.aiAnalysis.investment_score}`);
          console.log(`  • Fractionalization Score: ${firstListing.aiAnalysis.fractionalization_score}`);
          console.log(`  • Risk Level: ${firstListing.aiAnalysis.risk_level}`);
        }
      }
      
      if (data.ai_summary) {
        console.log(`\n🤖 AI Summary: "${data.ai_summary}"`);
      }

      console.log('\n✅ Test PASSED!');
      
    } catch (error) {
      console.error('\n❌ Test FAILED:');
      console.error(`📝 Error: ${error.message}`);
      console.error(`📚 Stack: ${error.stack}`);
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
  }
}

// Test health check first
async function testHealthCheck() {
  console.log('🔍 Testing server health...');
  try {
    const response = await fetch(`${BASE_URL}/`);
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Server is healthy: ${data.status}`);
      return true;
    } else {
      console.log(`⚠️ Server responded with ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Server is not responding: ${error.message}`);
    return false;
  }
}

// Run tests
async function runAllTests() {
  console.log('🚀 Starting AI Marketplace Tests\n');
  console.log('=' .repeat(80));
  
  const isHealthy = await testHealthCheck();
  if (!isHealthy) {
    console.log('\n❌ Cannot run tests - server is not healthy');
    return;
  }
  
  console.log('\n');
  await testAIMarketplaceEndpoint();
  
  console.log('🏁 All Tests Complete!');
}

// Execute if run directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testAIMarketplaceEndpoint, testHealthCheck, runAllTests };
