/**
 * 🧪 LoopNet API Connection Test
 * 
 * Tests the LoopNet API connection, credentials, and response format
 * to ensure everything is working before full integration.
 */

require('dotenv').config();
const fetch = require('node-fetch');

async function testLoopNetAPI() {
  console.log('🧪 Testing LoopNet API Connection...\n');
  
  // Check environment variables
  console.log('📋 Environment Check:');
  console.log(`✓ RAPIDAPI_KEY: ${process.env.RAPIDAPI_KEY ? '***set***' : '❌ MISSING'}`);
  console.log(`✓ LOOPNET_RAPIDAPI_HOST: ${process.env.LOOPNET_RAPIDAPI_HOST || '❌ MISSING'}`);
  console.log(`✓ LOOPNET_API_URL: ${process.env.LOOPNET_API_URL || '❌ MISSING'}`);
  console.log(`✓ LOOPNET_LEASE_SEARCH_ENDPOINT: ${process.env.LOOPNET_LEASE_SEARCH_ENDPOINT || '❌ MISSING'}\n`);

  if (!process.env.RAPIDAPI_KEY || !process.env.LOOPNET_RAPIDAPI_HOST) {
    console.error('❌ Missing required environment variables!');
    return;
  }

  // Test LoopNet API call
  try {
    console.log('🔍 Testing LoopNet API call...');
    
    // Houston coordinates for test
    const requestBody = {
      coordination: [-95.3698, 29.7604], // Houston, TX
      radius: 5, // 5 mile radius
      page: 1
    };

    console.log('📤 Request:', JSON.stringify(requestBody, null, 2));
    console.log(`📡 Endpoint: ${process.env.LOOPNET_API_URL}${process.env.LOOPNET_LEASE_SEARCH_ENDPOINT}`);

    const response = await fetch(`${process.env.LOOPNET_API_URL}${process.env.LOOPNET_LEASE_SEARCH_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': process.env.LOOPNET_RAPIDAPI_HOST,
        'x-rapidapi-key': process.env.RAPIDAPI_KEY
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📈 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📊 Response Headers:`, Object.fromEntries(response.headers));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status}`);
      console.error(`📝 Error Details: ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log('\n📦 Response Data Structure:');
    console.log(`✓ Response type: ${typeof data}`);
    console.log(`✓ Response keys: ${Object.keys(data)}`);
    
    // Analyze response structure
    if (data.properties && Array.isArray(data.properties)) {
      console.log(`✓ Found ${data.properties.length} properties`);
      if (data.properties.length > 0) {
        console.log(`✓ First property keys: ${Object.keys(data.properties[0])}`);
        console.log(`✓ Sample property:`, JSON.stringify(data.properties[0], null, 2));
      }
    } else if (data.listings && Array.isArray(data.listings)) {
      console.log(`✓ Found ${data.listings.length} listings`);
      if (data.listings.length > 0) {
        console.log(`✓ First listing keys: ${Object.keys(data.listings[0])}`);
        console.log(`✓ Sample listing:`, JSON.stringify(data.listings[0], null, 2));
      }
    } else if (data.results && Array.isArray(data.results)) {
      console.log(`✓ Found ${data.results.length} results`);
      if (data.results.length > 0) {
        console.log(`✓ First result keys: ${Object.keys(data.results[0])}`);
        console.log(`✓ Sample result:`, JSON.stringify(data.results[0], null, 2));
      }
    } else {
      console.log(`✓ Full response:`, JSON.stringify(data, null, 2));
    }

    console.log('\n✅ LoopNet API Test SUCCESSFUL!');
    console.log('🎯 API is working and returning data');

  } catch (error) {
    console.error('\n❌ LoopNet API Test FAILED:');
    console.error(`📝 Error: ${error.message}`);
    console.error(`📚 Stack: ${error.stack}`);
  }
}

// Test sale endpoint as well
async function testLoopNetSaleAPI() {
  console.log('\n🏠 Testing LoopNet SALE API...');
  
  if (!process.env.LOOPNET_SALE_SEARCH_ENDPOINT) {
    console.warn('⚠️ LOOPNET_SALE_SEARCH_ENDPOINT not set, skipping sale API test');
    return;
  }

  try {
    const requestBody = {
      coordination: [-95.3698, 29.7604], // Houston, TX
      radius: 5,
      page: 1
    };

    const response = await fetch(`${process.env.LOOPNET_API_URL}${process.env.LOOPNET_SALE_SEARCH_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': process.env.LOOPNET_RAPIDAPI_HOST,
        'x-rapidapi-key': process.env.RAPIDAPI_KEY
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📈 Sale API Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      const properties = data.properties || data.listings || data.results || [];
      console.log(`✅ Sale API working! Found ${properties.length} properties for sale`);
    } else {
      const errorText = await response.text();
      console.warn(`⚠️ Sale API Error: ${response.status} - ${errorText}`);
    }

  } catch (error) {
    console.error(`❌ Sale API Test Error: ${error.message}`);
  }
}

// Run tests
async function runAllTests() {
  console.log('🚀 Starting LoopNet API Tests\n');
  console.log('=' .repeat(60));
  
  await testLoopNetAPI();
  await testLoopNetSaleAPI();
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 Tests Complete!');
}

// Execute if run directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testLoopNetAPI, testLoopNetSaleAPI, runAllTests };
