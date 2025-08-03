// Test the updated CoreLogic client implementation
const { getPropertyInfoFromCoreLogic } = require('./utils/coreLogicClientV2');

async function testUpdatedCoreLogic() {
  require('dotenv').config();
  
  console.log('🧪 Testing Updated CoreLogic Client Implementation...\n');

  const testProperties = [
    {
      name: 'Houston Downtown Commercial',
      address1: '1200 Main Street',
      city: 'Houston',
      state: 'TX',
      postalcode: '77002',
      lat: 29.7604,
      lng: -95.3698
    },
    {
      name: 'Houston Residential',
      address1: '2323 Post Oak Blvd',
      city: 'Houston',
      state: 'TX',
      postalcode: '77056',
      lat: 29.7398,
      lng: -95.4611
    },
    {
      name: 'Test Without Coordinates',
      address1: '123 Main Street',
      city: 'Houston',
      state: 'TX',
      postalcode: '77001'
      // No lat/lng to test address-only search
    }
  ];

  for (let i = 0; i < testProperties.length; i++) {
    const property = testProperties[i];
    console.log(`\n🏠 Test ${i + 1}: ${property.name}`);
    console.log(`📍 ${property.address1}, ${property.city}, ${property.state} ${property.postalcode}`);
    if (property.lat && property.lng) {
      console.log(`🗺️ Coordinates: (${property.lat}, ${property.lng})`);
    }
    
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
      console.log(`   Bedrooms: ${result.structure?.bedrooms || 'N/A'}`);
      console.log(`   Bathrooms: ${result.structure?.bathrooms || 'N/A'}`);
      console.log(`   Current Value: $${result.valuation?.currentValue || 'N/A'}`);
      console.log(`   Assessed Value: $${result.valuation?.assessedValue || 'N/A'}`);
      
      // Log data completeness
      const structureFields = Object.keys(result.structure || {}).filter(key => result.structure[key] != null).length;
      const valuationFields = Object.keys(result.valuation || {}).filter(key => result.valuation[key] != null).length;
      console.log(`📊 Data Completeness: Structure (${structureFields} fields), Valuation (${valuationFields} fields)`);
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    
    // Add delay between requests to avoid rate limiting
    if (i < testProperties.length - 1) {
      console.log('⏳ Waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n🎉 CoreLogic V2 Testing Complete!');
}

// Performance and error handling test
async function testErrorHandling() {
  console.log('\n🧪 Testing Error Handling...');
  
  const invalidProperties = [
    {
      name: 'Invalid Address',
      address1: 'NonExistent Street 99999',
      city: 'NonExistentCity',
      state: 'XX',
      postalcode: '00000',
      lat: 999,
      lng: 999
    },
    {
      name: 'Missing Required Fields',
      address1: '',
      postalcode: ''
    }
  ];

  for (const property of invalidProperties) {
    console.log(`\n🚫 Testing: ${property.name}`);
    try {
      const result = await getPropertyInfoFromCoreLogic(property);
      console.log(`✅ Handled gracefully with fallback data`);
      console.log(`📋 Fallback Type: ${result.structure?.propertyType || 'Mock Data'}`);
    } catch (error) {
      console.log(`❌ Error (expected): ${error.message}`);
    }
  }
}

// Run all tests
async function runAllTests() {
  try {
    await testUpdatedCoreLogic();
    await testErrorHandling();
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

if (require.main === module) {
  runAllTests();
}

module.exports = { testUpdatedCoreLogic, testErrorHandling };
