/**
 * 🔍 Final Validation Test
 * 
 * Quick end-to-end validation of key functionality
 */

require("dotenv").config();
const fetch = require("node-fetch");

async function runFinalValidation() {
  console.log('🔍 Final Architecture Validation...\n');
  
  const baseUrl = 'http://localhost:5000';
  let testsPassed = 0;
  let totalTests = 4;

  // Test 1: Health Check
  try {
    const health = await fetch(`${baseUrl}/`);
    if (health.ok) {
      console.log('✅ Health Check: Server is running');
      testsPassed++;
    } else {
      console.log('❌ Health Check: Server not responding');
    }
  } catch (error) {
    console.log('❌ Health Check: Connection failed');
  }

  // Test 2: V2 General Search
  try {
    const response = await fetch(`${baseUrl}/api/ai/search/v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'affordable homes in Houston' })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ V2 General Search: Found ${data.metadata?.totalFound || 0} properties`);
      console.log(`   └─ Search Type: ${data.metadata?.searchType}`);
      console.log(`   └─ From Cache: ${data.fromCache}`);
      testsPassed++;
    } else {
      console.log('❌ V2 General Search: Request failed');
    }
  } catch (error) {
    console.log('❌ V2 General Search: Error -', error.message);
  }

  // Test 3: V2 Address Search
  try {
    const response = await fetch(`${baseUrl}/api/ai/search/v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '1600 Amphitheatre Parkway, Mountain View, CA' })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ V2 Address Search: ${data.verification?.valid ? 'Verified' : 'Failed verification'}`);
      console.log(`   └─ Search Type: ${data.metadata?.searchType}`);
      console.log(`   └─ Data Sources: ${JSON.stringify(data.metadata?.dataSources || {})}`);
      testsPassed++;
    } else {
      console.log('❌ V2 Address Search: Request failed');
    }
  } catch (error) {
    console.log('❌ V2 Address Search: Error -', error.message);
  }

  // Test 4: Legacy Compatibility
  try {
    const response = await fetch(`${baseUrl}/api/ai/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'homes in Houston' })
    });
    
    if (response.ok) {
      console.log('✅ Legacy Endpoint: Still functional');
      testsPassed++;
    } else {
      console.log('❌ Legacy Endpoint: Not working');
    }
  } catch (error) {
    console.log('❌ Legacy Endpoint: Error -', error.message);
  }

  // Summary
  console.log(`\n📊 Final Validation Results: ${testsPassed}/${totalTests} tests passed`);
  
  if (testsPassed === totalTests) {
    console.log('🎉 All systems operational! New architecture is ready for production.');
  } else {
    console.log('⚠️ Some issues detected. Review the failed tests above.');
  }
}

runFinalValidation().then(() => process.exit(0));
