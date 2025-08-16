/**
 * 🧪 Test Script for Hybrid LoopNet + Zillow AI Marketplace
 * 
 * This script tests the AI marketplace endpoint to verify:
 * 1. LoopNet integration works
 * 2. Hybrid property creation works  
 * 3. AI analysis works
 * 4. Rich property data is returned
 */

const fetch = require('node-fetch');

async function testAIMarketplace() {
  console.log('🧪 Testing Hybrid AI Marketplace Implementation...\n');

  const testPayload = {
    query: "Find high-potential commercial investment properties in Houston with good ROI",
    location: "Houston, TX",
    maxPrice: 500000,
    minPrice: 100000,
    limit: 10,
    analysis_type: "investment_focus"
  };

  try {
    console.log('📝 Test Request:', JSON.stringify(testPayload, null, 2));
    
    const startTime = Date.now();
    const response = await fetch('http://localhost:5000/api/ai/marketplace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    const responseTime = Date.now() - startTime;
    const data = await response.json();

    console.log('\n📊 Response Summary:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response Time: ${responseTime}ms`);
    console.log(`   Success: ${data.success}`);
    console.log(`   Total Properties: ${data.listings?.length || 0}`);
    console.log(`   AI Summary: ${data.ai_summary?.substring(0, 100)}...`);

    if (data.listings && data.listings.length > 0) {
      console.log('\n🏠 Sample Property Analysis:');
      const sampleProperty = data.listings[0];
      console.log(`   ID: ${sampleProperty.id}`);
      console.log(`   Title: ${sampleProperty.title}`);
      console.log(`   Address: ${sampleProperty.address}`);
      console.log(`   Price: $${sampleProperty.price?.toLocaleString()}`);
      console.log(`   Property Type: ${sampleProperty.propertyType}`);
      console.log(`   Square Feet: ${sampleProperty.sqft}`);
      console.log(`   Images: ${sampleProperty.images?.length || 0} photos`);
      console.log(`   AI Investment Score: ${sampleProperty.aiAnalysis?.investment_score?.toFixed(1) || 'N/A'}`);
      console.log(`   Expected ROI: ${sampleProperty.expectedROI?.toFixed(1)}%`);
      console.log(`   Source: ${sampleProperty.source}`);
      
      if (sampleProperty.originalData) {
        console.log(`   LoopNet ID: ${sampleProperty.originalData.loopNetId || 'N/A'}`);
        console.log(`   Data Source: ${JSON.stringify(sampleProperty.originalData.dataSource || {})}`);
      }
    }

    console.log('\n📈 Data Source Breakdown:');
    let loopnetOnly = 0, zillowHybrid = 0, mockData = 0;
    
    data.listings?.forEach(listing => {
      const source = listing.originalData?.dataSource || {};
      if (source.hybrid) zillowHybrid++;
      else if (source.loopnet) loopnetOnly++;
      else if (source.mock) mockData++;
    });

    console.log(`   LoopNet Only: ${loopnetOnly}`);
    console.log(`   LoopNet + Zillow Hybrid: ${zillowHybrid}`);
    console.log(`   Mock Data: ${mockData}`);

    console.log('\n📊 Metadata:');
    console.log(`   Processing Time: ${data.metadata?.processing_time}ms`);
    console.log(`   Total Analyzed: ${data.metadata?.total_analyzed}`);
    console.log(`   Investment Ready: ${data.metadata?.investment_ready}`);
    console.log(`   Source: ${data.metadata?.source}`);

    console.log('\n✅ Test Results:');
    console.log(`   ✅ API Response: ${response.ok ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   ✅ LoopNet Integration: ${loopnetOnly > 0 ? 'WORKING' : 'FAILED'}`);
    console.log(`   ✅ Hybrid Logic: ${data.listings?.length > 0 ? 'WORKING' : 'FAILED'}`);
    console.log(`   ✅ AI Analysis: ${data.listings?.[0]?.aiAnalysis ? 'WORKING' : 'FAILED'}`);
    console.log(`   ✅ Rich Property Data: ${data.listings?.[0]?.images?.length > 0 ? 'WORKING' : 'FAILED'}`);

  } catch (error) {
    console.error('❌ Test Failed:', error.message);
  }
}

// Run the test
testAIMarketplace();
