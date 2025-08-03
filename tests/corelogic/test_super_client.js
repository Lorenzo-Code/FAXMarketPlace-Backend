/**
 * Test CoreLogic Super Client Integration
 */
require('dotenv').config();

const { CoreLogicSuperClient } = require('./utils/coreLogicSuperClient');

async function testSuperClient() {
  console.log('🧪 Testing CoreLogic Super Client...');
  
  const superClient = new CoreLogicSuperClient();
  
  try {
    console.log('🔍 Testing basic property search...');
    
    // Test basic search first
    const searchResult = await superClient.searchProperties({
      streetAddress: '123 Main St',
      city: 'Houston',
      state: 'TX',
      bestMatch: true
    });
    
    console.log('✅ Basic search successful');
    console.log('📊 Search result:', JSON.stringify(searchResult, null, 2));
    
  } catch (error) {
    console.error('❌ Basic search failed:', error.message);
    console.error('🔍 Error details:', error.response?.data || error.stack);
  }
  
  try {
    console.log('🚀 Testing comprehensive search and enrich...');
    
    const comprehensiveResult = await superClient.searchAndEnrich({
      streetAddress: '1600 Smith St',
      city: 'Houston',
      state: 'TX',
      zipCode: '77002'
    });
    
    console.log('✅ Comprehensive search successful');
    console.log('📊 Result summary:', {
      clip: comprehensiveResult.clip,
      searchResultCount: comprehensiveResult.searchResult?.properties?.length || 0,
      intelligenceDataKeys: Object.keys(comprehensiveResult.intelligence.data),
      errorCount: comprehensiveResult.intelligence.errors ? Object.keys(comprehensiveResult.intelligence.errors).length : 0
    });
    
  } catch (error) {
    console.error('❌ Comprehensive search failed:', error.message);
    console.error('🔍 Error details:', error.response?.data || error.stack);
  }
}

testSuperClient();
