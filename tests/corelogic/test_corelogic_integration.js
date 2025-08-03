// CoreLogic Integration Test Script
// Tests the complete flow as described in FractionaX_API_WrapConsole_Integration.md

const { getPropertyInfoFromCoreLogic } = require('./utils/coreLogicClient');
const { getCoreLogicAccessToken } = require('./utils/coreLogicAuth');

async function testCoreLogicIntegration() {
  console.log('🔍 Testing CoreLogic Integration...\n');

  // Test 1: Authentication
  console.log('📝 Test 1: OAuth2 Token Authentication');
  try {
    const token = await getCoreLogicAccessToken();
    console.log('✅ Token obtained:', token ? 'SUCCESS' : 'FAILED');
    console.log('🔑 Token length:', token ? token.length : 'N/A');
  } catch (err) {
    console.error('❌ Token test failed:', err.message);
    return;
  }

  // Test 2: Property Lookup Flow (as per document guidelines)
  console.log('\n📝 Test 2: Property Data Flow (Spatial → Property → AVM)');
  
  const testProperties = [
    {
      name: 'Houston Downtown Property',
      address1: '1200 Main St',
      city: 'Houston',
      state: 'TX',
      postalcode: '77002',
      lat: 29.7604,
      lng: -95.3698
    },
    {
      name: 'Houston Residential Property',
      address1: '123 Oak Street',
      city: 'Houston',
      state: 'TX',
      postalcode: '77024',
      lat: 29.7749,
      lng: -95.4458
    }
  ];

  for (const property of testProperties) {
    console.log(`\n🏠 Testing: ${property.name}`);
    console.log(`📍 Address: ${property.address1}, ${property.city}, ${property.state} ${property.postalcode}`);
    console.log(`🗺️ Coordinates: ${property.lat}, ${property.lng}`);
    
    try {
      const result = await getPropertyInfoFromCoreLogic(property);
      
      console.log('✅ Property lookup successful');
      console.log('📋 Results:');
      console.log(`   Parcel ID: ${result.parcelId}`);
      console.log(`   Property Type: ${result.structure?.propertyType || 'N/A'}`);
      console.log(`   Year Built: ${result.structure?.yearBuilt || 'N/A'}`);
      console.log(`   Square Feet: ${result.structure?.squareFeet || 'N/A'}`);
      console.log(`   Current Value: $${result.valuation?.currentValue || 'N/A'}`);
      console.log(`   Assessed Value: $${result.valuation?.assessedValue || 'N/A'}`);
      
    } catch (err) {
      console.error(`❌ Property lookup failed for ${property.name}:`, err.message);
    }
  }

  // Test 3: Error Handling
  console.log('\n📝 Test 3: Error Handling with Invalid Coordinates');
  try {
    await getPropertyInfoFromCoreLogic({
      address1: 'Invalid Address',
      city: 'InvalidCity',
      state: 'XX',
      postalcode: '00000',
      lat: 999,
      lng: 999
    });
  } catch (err) {
    console.log('✅ Error handling working correctly:', err.message);
  }

  console.log('\n🎉 CoreLogic Integration Test Complete!');
}

// Run the test
if (require.main === module) {
  require('dotenv').config();
  testCoreLogicIntegration().catch(console.error);
}

module.exports = { testCoreLogicIntegration };
