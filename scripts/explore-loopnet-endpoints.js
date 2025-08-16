/**
 * 🔍 LoopNet API Endpoint Explorer
 * 
 * This script explores the LoopNet RapidAPI to find endpoints
 * that provide detailed listing data including photos, descriptions,
 * prices, and other property details.
 */

require('dotenv').config();
const fetch = require('node-fetch');

const BASE_URL = 'https://loopnet-api.p.rapidapi.com';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-rapidapi-host': 'loopnet-api.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPIDAPI_KEY
};

async function testEndpoint(endpoint, method = 'GET', body = null) {
  try {
    console.log(`🔍 Testing: ${method} ${endpoint}`);
    
    const options = {
      method,
      headers: HEADERS
    };
    
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    console.log(`📈 Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`📦 Response structure:`, Object.keys(data));
      
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        console.log(`📋 First item keys:`, Object.keys(data.data[0]));
        console.log(`📄 Sample data:`, JSON.stringify(data.data[0], null, 2));
      } else if (data.properties && Array.isArray(data.properties) && data.properties.length > 0) {
        console.log(`📋 First property keys:`, Object.keys(data.properties[0]));
        console.log(`📄 Sample property:`, JSON.stringify(data.properties[0], null, 2));
      } else {
        console.log(`📄 Full response:`, JSON.stringify(data, null, 2));
      }
      
      return data;
    } else {
      const errorText = await response.text();
      console.error(`❌ Error: ${errorText}`);
      return null;
    }
    
  } catch (error) {
    console.error(`❌ Request failed: ${error.message}`);
    return null;
  }
}

async function testListingDetails(listingId) {
  console.log(`\n🏠 Testing listing details for ID: ${listingId}`);
  
  // Try common listing detail endpoints
  const detailEndpoints = [
    `/loopnet/listing/${listingId}`,
    `/loopnet/property/${listingId}`,
    `/loopnet/details/${listingId}`,
    `/loopnet/listing/details/${listingId}`,
    `/listing/${listingId}`,
    `/property/${listingId}`
  ];
  
  for (const endpoint of detailEndpoints) {
    await testEndpoint(endpoint);
    console.log('---');
  }
  
  // Try POST endpoints for listing details
  const postEndpoints = [
    '/loopnet/listing/details',
    '/loopnet/property/details',
    '/loopnet/listing/info'
  ];
  
  for (const endpoint of postEndpoints) {
    await testEndpoint(endpoint, 'POST', { listingId });
    console.log('---');
  }
}

async function exploreAvailableEndpoints() {
  console.log('🚀 Exploring LoopNet API Endpoints\n');
  console.log('='.repeat(80));
  
  // Test different possible endpoints
  const endpoints = [
    // Basic search endpoints
    { path: '/loopnet/search', method: 'POST', body: { location: 'Houston, TX', limit: 1 } },
    { path: '/loopnet/properties', method: 'GET' },
    { path: '/loopnet/listings', method: 'GET' },
    
    // Detail endpoints
    { path: '/loopnet/listing', method: 'GET' },
    { path: '/loopnet/property', method: 'GET' },
    
    // We know this one works
    { path: '/loopnet/lease/searchByCoordination', method: 'POST', body: {
      coordination: [-95.3698, 29.7604],
      radius: 5,
      page: 1
    }},
    
    // Try sale endpoints
    { path: '/loopnet/sale/searchByCoordination', method: 'POST', body: {
      coordination: [-95.3698, 29.7604],
      radius: 5,
      page: 1
    }}
  ];
  
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint.path, endpoint.method, endpoint.body);
    console.log('\n' + '='.repeat(80) + '\n');
  }
  
  // Get a sample listing ID from our working endpoint
  console.log('🔍 Getting sample listing IDs...');
  const searchResult = await testEndpoint('/loopnet/lease/searchByCoordination', 'POST', {
    coordination: [-95.3698, 29.7604],
    radius: 5,
    page: 1,
    limit: 5
  });
  
  if (searchResult && searchResult.data && searchResult.data.length > 0) {
    const sampleListingId = searchResult.data[0].listingId;
    console.log(`📋 Using sample listing ID: ${sampleListingId}`);
    
    // Test detail endpoints with real listing ID
    await testListingDetails(sampleListingId);
  }
}

// Run the exploration
if (require.main === module) {
  exploreAvailableEndpoints().catch(console.error);
}

module.exports = { testEndpoint, testListingDetails, exploreAvailableEndpoints };
