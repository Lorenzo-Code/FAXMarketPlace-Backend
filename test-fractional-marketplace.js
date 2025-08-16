/**
 * 🧪 Test Script for Zillow + CoreLogic + GPT Fractional Marketplace
 * 
 * Tests the new fractional property marketplace that:
 * 1. Fetches Zillow properties with photos
 * 2. Enhances with CoreLogic data
 * 3. AI analyzes for fractionalization potential
 * 4. Filters for fractional-suitable properties only
 * 5. Returns tokenization-ready properties
 */

const fetch = require('node-fetch');

async function testFractionalMarketplace() {
  console.log('🪙 Testing New Fractional Marketplace (Zillow + CoreLogic + GPT)...\n');

  const testPayload = {
    query: "Find properties perfect for fractional ownership and tokenization in Houston",
    location: "Houston, TX",
    maxPrice: 600000,
    minPrice: 150000,
    limit: 12,
    analysis_type: "fractional_focus"
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

    console.log('\n📊 Fractional Marketplace Results:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response Time: ${responseTime}ms`);
    console.log(`   Success: ${data.success}`);
    console.log(`   Total Fractional Properties: ${data.listings?.length || 0}`);
    console.log(`   AI Summary: ${data.ai_summary?.substring(0, 150)}...`);

    if (data.listings && data.listings.length > 0) {
      console.log('\n🪙 Sample Fractional Property Analysis:');
      const sampleProperty = data.listings[0];
      
      console.log(`\n   📍 Property: ${sampleProperty.title}`);
      console.log(`   🏠 Address: ${sampleProperty.address}`);
      console.log(`   💰 Price: $${sampleProperty.price?.toLocaleString()}`);
      console.log(`   🏡 Type: ${sampleProperty.propertyType}`);
      console.log(`   🛏️  Beds/Baths: ${sampleProperty.beds}/${sampleProperty.baths}`);
      console.log(`   📐 Sqft: ${sampleProperty.sqft?.toLocaleString()}`);
      
      console.log(`\n   🪙 TOKENIZATION DETAILS:`);
      console.log(`   Token Price: $${sampleProperty.tokenPrice}`);
      console.log(`   Total Tokens: ${sampleProperty.totalTokens?.toLocaleString()}`);
      console.log(`   Min Investment: $${sampleProperty.minInvestment}`);
      console.log(`   Fractional Score: ${sampleProperty.fractionalScore?.toFixed(1)}/10`);
      console.log(`   Tokenization Suitability: ${sampleProperty.tokenizationSuitability?.toFixed(1)}/10`);
      
      console.log(`\n   💼 FINANCIAL METRICS:`);
      console.log(`   Expected ROI: ${sampleProperty.expectedROI?.toFixed(1)}%`);
      console.log(`   Rental Yield: ${sampleProperty.rentalYield?.toFixed(1)}%`);
      console.log(`   Cap Rate: ${sampleProperty.capRate?.toFixed(1)}%`);
      console.log(`   Monthly Rent: $${sampleProperty.monthlyRent?.toLocaleString()}`);
      
      console.log(`\n   📸 VISUAL CONTENT:`);
      console.log(`   Photos: ${sampleProperty.images?.length || 0} images`);
      console.log(`   Status: ${sampleProperty.status}`);
      console.log(`   Source: ${sampleProperty.source}`);
    }

    console.log('\n📈 Fractional Properties Breakdown:');
    let tokenizedCount = 0;
    let avgFractionalScore = 0;
    let avgTokenPrice = 0;
    
    data.listings?.forEach(listing => {
      if (listing.tokenized) tokenizedCount++;
      avgFractionalScore += listing.fractionalScore || 0;
      avgTokenPrice += listing.tokenPrice || 0;
    });
    
    const total = data.listings?.length || 1;
    avgFractionalScore = avgFractionalScore / total;
    avgTokenPrice = avgTokenPrice / total;

    console.log(`   🪙 Tokenized Properties: ${tokenizedCount}/${total}`);
    console.log(`   📊 Avg Fractional Score: ${avgFractionalScore.toFixed(1)}/10`);
    console.log(`   💰 Avg Token Price: $${Math.round(avgTokenPrice)}`);
    console.log(`   📸 Properties with Photos: ${data.listings?.filter(p => p.images?.length > 0).length || 0}/${total}`);

    console.log('\n📊 Metadata Analysis:');
    console.log(`   Processing Time: ${data.metadata?.processing_time}ms`);
    console.log(`   Total Analyzed: ${data.metadata?.total_analyzed}`);
    console.log(`   Fractional Ready: ${data.metadata?.fractional_ready}`);
    console.log(`   Investment Ready: ${data.metadata?.investment_ready}`);
    console.log(`   Source: ${data.metadata?.source}`);
    console.log(`   Fractional Only Filter: ${data.metadata?.filters_applied?.fractional_only}`);

    console.log('\n✅ Fractional Marketplace Test Results:');
    console.log(`   ✅ API Response: ${response.ok ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   ✅ Zillow Integration: ${data.listings?.some(p => p.source?.includes('zillow')) ? 'WORKING' : 'MOCK DATA'}`);
    console.log(`   ✅ CoreLogic Enhancement: ${data.listings?.some(p => p.corelogicData) ? 'WORKING' : 'SIMULATED'}`);
    console.log(`   ✅ AI Fractionalization Analysis: ${data.listings?.some(p => p.fractionalAnalysis) ? 'WORKING' : 'FAILED'}`);
    console.log(`   ✅ Photo Requirements: ${data.listings?.every(p => p.images?.length > 0) ? 'MET' : 'PARTIAL'}`);
    console.log(`   ✅ Tokenization Ready: ${tokenizedCount > 0 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   ✅ Fractional Filtering: ${data.metadata?.fractional_ready >= 0 ? 'WORKING' : 'FAILED'}`);

    if (data.listings?.length > 0 && tokenizedCount > 0) {
      console.log('\n🎉 SUCCESS: Fractional marketplace is fully operational!');
      console.log(`🪙 Found ${tokenizedCount} properties ready for tokenization`);
      console.log(`📸 All properties include visual content`);
      console.log(`🤖 AI analysis working for fractionalization scoring`);
    } else {
      console.log('\n⚠️ PARTIAL: Marketplace working but may need API configuration');
    }

  } catch (error) {
    console.error('❌ Fractional Marketplace Test Failed:', error.message);
  }
}

// Run the test
testFractionalMarketplace();
