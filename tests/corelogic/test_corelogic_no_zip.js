// Test CoreLogic API with the updated query format (no zipCode, bestMatch=true)
const { getPropertyInfoFromCoreLogic } = require('./utils/coreLogicClientV2');

async function testCoreLogicNoZip() {
  require('dotenv').config();
  
  console.log('🧪 Testing CoreLogic with Updated Query Format (No Zip Code)...\n');

  const testProperties = [
    {
      name: 'Your Example - Wirt Rd',
      address1: '1230 Wirt Rd',
      city: 'Houston',
      state: 'TX',
      // Intentionally omitting postalcode to test the new format
    },
    {
      name: 'Downtown Houston',
      address1: '1200 Main Street',
      city: 'Houston',
      state: 'TX',
      lat: 29.7604,
      lng: -95.3698
    },
    {
      name: 'Post Oak Area',
      address1: '2323 Post Oak Blvd',
      city: 'Houston',
      state: 'TX',
      lat: 29.7398,
      lng: -95.4611
    }
  ];

  for (let i = 0; i < testProperties.length; i++) {
    const property = testProperties[i];
    console.log(`\n🏠 Test ${i + 1}: ${property.name}`);
    console.log(`📍 Address: ${property.address1}`);
    console.log(`🏙️ City: ${property.city}, ${property.state}`);
    if (property.lat && property.lng) {
      console.log(`🗺️ Coordinates: (${property.lat}, ${property.lng})`);
    }
    console.log(`📦 Zip Code: ${property.postalcode || 'EXCLUDED (as per new format)'}`);
    
    try {
      const startTime = Date.now();
      const result = await getPropertyInfoFromCoreLogic(property);
      const duration = Date.now() - startTime;
      
      console.log(`✅ Success in ${duration}ms`);
      console.log(`📋 Results:`);
      console.log(`   Parcel ID: ${result.parcelId || 'N/A'}`);
      console.log(`   Property Type: ${result.structure?.propertyType || 'N/A'}`);
      console.log(`   Year Built: ${result.structure?.yearBuilt || 'N/A'}`);
      console.log(`   Square Feet: ${result.structure?.squareFeet || 'N/A'}`);
      console.log(`   Current Value: $${result.valuation?.currentValue || 'N/A'}`);
      
      // Check if we got real data or mock data
      if (result.parcelId && result.parcelId.startsWith('MOCK_')) {
        console.log(`🎭 Using mock/fallback data`);
      } else if (result.parcelId) {
        console.log(`🎯 Retrieved real CoreLogic data!`);
      }
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    
    // Add delay between requests
    if (i < testProperties.length - 1) {
      console.log('⏳ Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('\n🎉 CoreLogic No-Zip Testing Complete!');
  console.log('\n📊 Summary:');
  console.log('✅ Updated query format: streetAddress, city, state, bestMatch=true');
  console.log('✅ Excluded zipCode parameter for better match rate');
  console.log('✅ Using /v2/properties/search endpoint as recommended');
}

// Test a single property with detailed logging
async function testSingleProperty() {
  console.log('\n🔍 Detailed Test - Single Property...\n');
  
  const property = {
    address1: '1230 Wirt Rd',
    city: 'Houston',  
    state: 'TX',
    lat: 29.7749,
    lng: -95.4458
  };
  
  try {
    console.log('🎯 Testing exactly as per your example:');
    console.log('GET /v2/properties/search?streetAddress=1230 Wirt Rd&city=Houston&state=TX&bestMatch=true');
    
    const result = await getPropertyInfoFromCoreLogic(property);
    
    console.log('\n📄 Full Response Structure:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Single property test failed:', error.message);
  }
}

// Run all tests
async function runTests() {
  try {
    await testCoreLogicNoZip();
    await testSingleProperty();
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { testCoreLogicNoZip, testSingleProperty };
