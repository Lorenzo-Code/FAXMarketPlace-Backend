/**
 * 🧪 Test Script for Realistic Address Generation in AI Marketplace
 */

const fetch = require('node-fetch');

async function testRealisticAddresses() {
  console.log('🏢 Testing Realistic Address Generation in AI Marketplace...\n');

  try {
    const response = await fetch('http://localhost:5000/api/ai/marketplace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: "Show me commercial properties with realistic addresses in Houston",
        location: "Houston, TX",
        maxPrice: 600000,
        minPrice: 150000,
        limit: 8,
        analysis_type: "investment_focus"
      })
    });

    const data = await response.json();

    console.log('📊 Address Generation Test Results:\n');
    console.log(`Total Properties: ${data.listings?.length || 0}`);
    console.log(`Processing Time: ${data.metadata?.processing_time}ms`);
    
    if (data.listings && data.listings.length > 0) {
      console.log('\n🏠 Property Address Samples:');
      
      data.listings.slice(0, 6).forEach((property, index) => {
        console.log(`\n   ${index + 1}. ${property.title || 'Unnamed Property'}`);
        console.log(`      Address: ${property.address}`);
        console.log(`      Property Type: ${property.propertyType}`);
        console.log(`      Price: $${property.price?.toLocaleString()}`);
        console.log(`      LoopNet ID: ${property.originalData?.loopNetId || 'N/A'}`);
        console.log(`      Data Source: ${JSON.stringify(property.originalData?.dataSource || {})}`);
        
        // Check if we have realistic addresses
        const hasGenericAddress = property.address && property.address.includes('Commercial Property');
        const hasRealisticAddress = property.address && !hasGenericAddress && property.address.length > 20;
        
        console.log(`      Address Quality: ${hasRealisticAddress ? '✅ REALISTIC' : '❌ GENERIC'}`);
      });
      
      // Summary of address quality
      const genericCount = data.listings.filter(p => 
        p.address && p.address.includes('Commercial Property')).length;
      const realisticCount = data.listings.length - genericCount;
      
      console.log('\n📈 Address Quality Summary:');
      console.log(`   ✅ Realistic Addresses: ${realisticCount}/${data.listings.length}`);
      console.log(`   ❌ Generic Addresses: ${genericCount}/${data.listings.length}`);
      
      if (realisticCount > 0) {
        console.log('\n🎉 SUCCESS: Realistic address generation is working!');
      } else {
        console.log('\n⚠️ ISSUE: All addresses are still generic - need to investigate');
      }
    }

  } catch (error) {
    console.error('❌ Test Failed:', error.message);
  }
}

testRealisticAddresses();
