/**
 * 🔍 Test Single LoopNet Listing Detail
 * 
 * Test a single listing detail endpoint to see if we can get
 * photos and detailed property information.
 */

require('dotenv').config();
const fetch = require('node-fetch');

async function testSingleListing() {
  console.log('🔍 Testing single LoopNet listing detail...\n');
  
  // We know from previous tests that listing ID '6333692' exists
  const sampleListingId = '6333692';
  
  const endpoints = [
    {
      name: 'Listing Detail',
      url: `https://loopnet-api.p.rapidapi.com/loopnet/listing/${sampleListingId}`,
      method: 'GET'
    },
    {
      name: 'Property Detail', 
      url: `https://loopnet-api.p.rapidapi.com/loopnet/property/${sampleListingId}`,
      method: 'GET'
    },
    {
      name: 'Listing Details POST',
      url: 'https://loopnet-api.p.rapidapi.com/loopnet/listing/details',
      method: 'POST',
      body: { listingId: sampleListingId }
    }
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`🔍 Testing ${endpoint.name}: ${endpoint.method} ${endpoint.url}`);
      
      const options = {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'loopnet-api.p.rapidapi.com',
          'x-rapidapi-key': process.env.RAPIDAPI_KEY
        }
      };
      
      if (endpoint.body && endpoint.method !== 'GET') {
        options.body = JSON.stringify(endpoint.body);
      }
      
      const response = await fetch(endpoint.url, options);
      console.log(`📈 Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`📦 Response keys:`, Object.keys(data));
        
        // Look for photo/image fields
        const dataStr = JSON.stringify(data, null, 2);
        const hasPhotos = dataStr.includes('photo') || dataStr.includes('image') || dataStr.includes('picture');
        const hasPrice = dataStr.includes('price') || dataStr.includes('rent') || dataStr.includes('cost');
        const hasDescription = dataStr.includes('description') || dataStr.includes('detail');
        
        console.log(`📸 Has photos: ${hasPhotos}`);
        console.log(`💰 Has price: ${hasPrice}`);
        console.log(`📝 Has description: ${hasDescription}`);
        
        if (hasPhotos) {
          console.log(`🎉 FOUND PHOTOS! This endpoint has image data.`);
        }
        
        // Show first 500 characters of response to see structure
        console.log(`📄 Sample response:`, dataStr.substring(0, 500) + '...');
        
        return data;
        
      } else {
        const errorText = await response.text();
        console.log(`❌ Error: ${errorText}`);
        
        if (response.status === 429) {
          console.log('⏰ Rate limited - waiting 5 seconds...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
    } catch (error) {
      console.error(`❌ Request failed: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
}

// Run the test
if (require.main === module) {
  testSingleListing().catch(console.error);
}

module.exports = { testSingleListing };
