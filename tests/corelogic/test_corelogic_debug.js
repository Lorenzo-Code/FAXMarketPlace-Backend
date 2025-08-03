// Debug CoreLogic API endpoints to understand the exact API structure

const axios = require('axios');
const { getCoreLogicAccessToken } = require('./utils/coreLogicAuth');

async function debugCoreLogicAPI() {
  require('dotenv').config();
  
  console.log('🐛 Debugging CoreLogic API...\n');
  
  const token = await getCoreLogicAccessToken();
  const BASE = process.env.CORELOGIC_BASE_URL;
  
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  console.log('🔍 Base URL:', BASE);
  console.log('🔑 Token:', token.substring(0, 10) + '...');

  // Test different endpoint patterns
  const endpoints = [
    // Spatial endpoints
    `${BASE}/spatial/v1/properties?lat=29.7604&lon=-95.3698`,
    `${BASE}/spatial/v1/properties?lat=29.7604&lng=-95.3698`,
    `${BASE}/spatial/v2/properties?lat=29.7604&lon=-95.3698`,
    
    // Property endpoints  
    `${BASE}/property/v1/properties?address=1200%20Main%20St&city=Houston&state=TX&zip=77002`,
    `${BASE}/property/v2/property/address?address=1200%20Main%20St&city=Houston&state=TX&zip=77002`,
    `${BASE}/property/v2/properties/search?address=1200%20Main%20St&city=Houston&state=TX&zip=77002`,
    
    // Basic info endpoint
    `${BASE}/api/info`,
    `${BASE}/info`,
    `${BASE}/status`,
  ];

  for (const endpoint of endpoints) {
    console.log(`\n🧪 Testing: ${endpoint}`);
    try {
      const response = await axios.get(endpoint, { headers, timeout: 10000 });
      console.log('✅ SUCCESS:', response.status);
      console.log('📄 Response keys:', Object.keys(response.data));
      if (response.data.properties && Array.isArray(response.data.properties)) {
        console.log('🏠 Properties found:', response.data.properties.length);
      }
    } catch (error) {
      console.log('❌ FAILED:', error.response?.status || 'No response');
      console.log('📋 Error:', error.response?.data || error.message);
    }
  }

  // Test with params object instead of query string
  console.log('\n🧪 Testing with params object:');
  try {
    const response = await axios.get(`${BASE}/spatial/v1/properties`, {
      headers,
      params: {
        lat: 29.7604,
        lon: -95.3698,
        radius: 100
      },
      timeout: 10000
    });
    console.log('✅ Params object SUCCESS:', response.status);
    console.log('📄 Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Params object FAILED:', error.response?.status || 'No response');
    console.log('📋 Error details:', error.response?.data || error.message);
  }
}

debugCoreLogicAPI().catch(console.error);
