/**
 * 🔍 LoopNet Details API Test
 * 
 * Tests the new LoopNet API that provides detailed property information
 * including photos, prices, descriptions, and full listing details.
 */

require('dotenv').config();
const fetch = require('node-fetch');

const NEW_LOOPNET_BASE_URL = 'https://loopnet-com.p.rapidapi.com';
const HEADERS = {
  'x-rapidapi-host': 'loopnet-com.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPIDAPI_KEY
};

async function testListingDetails(listingId) {
  console.log(`🏠 Testing LoopNet Details API for listing ID: ${listingId}\n`);
  
  try {
    const url = `${NEW_LOOPNET_BASE_URL}/properties/details?listingId=${listingId}`;
    console.log(`🔍 GET ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: HEADERS
    });

    console.log(`📈 Status: ${response.status} ${response.statusText}`);
    console.log(`📊 Response Headers:`, Object.fromEntries(response.headers));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status}`);
      console.error(`📝 Error Details: ${errorText}`);
      return null;
    }

    const data = await response.json();
    console.log('\n📦 Response Analysis:');
    console.log(`✓ Response type: ${typeof data}`);
    console.log(`✓ Response keys: ${Object.keys(data)}`);
    
    // Analyze the response for key property data
    const dataStr = JSON.stringify(data, null, 2);
    
    // Look for important fields
    const hasPhotos = dataStr.includes('photo') || dataStr.includes('image') || dataStr.includes('picture') || dataStr.includes('media');
    const hasPrice = dataStr.includes('price') || dataStr.includes('rent') || dataStr.includes('cost') || dataStr.includes('lease');
    const hasDescription = dataStr.includes('description') || dataStr.includes('detail') || dataStr.includes('summary');
    const hasAddress = dataStr.includes('address') || dataStr.includes('location') || dataStr.includes('street');
    const hasSqft = dataStr.includes('sqft') || dataStr.includes('square') || dataStr.includes('area') || dataStr.includes('size');
    
    console.log(`📸 Has photos/images: ${hasPhotos ? '✅' : '❌'}`);
    console.log(`💰 Has price/rent: ${hasPrice ? '✅' : '❌'}`);
    console.log(`📝 Has description: ${hasDescription ? '✅' : '❌'}`);
    console.log(`📍 Has address: ${hasAddress ? '✅' : '❌'}`);
    console.log(`📏 Has square feet: ${hasSqft ? '✅' : '❌'}`);
    
    if (hasPhotos) {
      console.log(`\n🎉 EXCELLENT! This API includes image data!`);
      
      // Try to find and display photo URLs
      const photoMatches = dataStr.match(/"[^"]*(?:photo|image|picture|media)[^"]*":\s*"[^"]+"/gi);
      if (photoMatches) {
        console.log(`📸 Found photo fields:`);
        photoMatches.slice(0, 3).forEach(match => console.log(`  • ${match}`));
      }
    }
    
    if (hasPrice) {
      console.log(`\n💰 GREAT! This API includes pricing data!`);
      
      // Try to find price information
      const priceMatches = dataStr.match(/"[^"]*(?:price|rent|cost|lease)[^"]*":\s*[^,}]+/gi);
      if (priceMatches) {
        console.log(`💵 Found price fields:`);
        priceMatches.slice(0, 3).forEach(match => console.log(`  • ${match}`));
      }
    }
    
    // Show first 1000 characters of response to see structure
    console.log(`\n📄 Sample response data:`);
    console.log(dataStr.substring(0, 1000) + (dataStr.length > 1000 ? '...' : ''));
    
    console.log(`\n📊 Full response size: ${dataStr.length} characters`);
    
    return data;
    
  } catch (error) {
    console.error(`❌ Request failed: ${error.message}`);
    console.error(`📚 Stack: ${error.stack}`);
    return null;
  }
}

async function testMultipleListings() {
  console.log('🚀 Testing LoopNet Details API\n');
  console.log('='.repeat(80));
  
  // Test with the provided listing ID and a few from our previous search
  const testListingIds = [
    '31333515',  // Provided in the curl example
    '6333692',   // From our previous LoopNet search
    '26224251',  // Another from previous search
    '22934646'   // One more test
  ];
  
  for (const listingId of testListingIds) {
    console.log(`\n📋 Testing Listing ID: ${listingId}`);
    console.log('='.repeat(50));
    
    const result = await testListingDetails(listingId);
    
    if (result) {
      console.log(`✅ Successfully retrieved property details for ${listingId}`);
    } else {
      console.log(`❌ Failed to retrieve details for ${listingId}`);
    }
    
    // Wait between requests to respect rate limits
    console.log('\n⏰ Waiting 5 seconds before next request...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('\n' + '='.repeat(80));
  }
  
  console.log('\n🏁 All Tests Complete!');
}

// Also test if there are search endpoints
async function testSearchEndpoints() {
  console.log('\n🔍 Testing potential search endpoints...');
  
  const searchEndpoints = [
    '/properties/search',
    '/properties/list', 
    '/search',
    '/listings'
  ];
  
  for (const endpoint of searchEndpoints) {
    try {
      console.log(`\n🔍 Testing: GET ${endpoint}`);
      
      const response = await fetch(`${NEW_LOOPNET_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: HEADERS
      });
      
      console.log(`📈 Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${endpoint} exists!`);
        console.log(`📦 Response keys: ${Object.keys(data)}`);
      } else if (response.status === 400) {
        console.log(`⚠️ ${endpoint} exists but needs parameters`);
      } else {
        console.log(`❌ ${endpoint} not available`);
      }
      
    } catch (error) {
      console.log(`❌ ${endpoint} test failed: ${error.message}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Run all tests
async function runAllTests() {
  await testMultipleListings();
  await testSearchEndpoints();
}

// Execute if run directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testListingDetails, testMultipleListings, testSearchEndpoints };
