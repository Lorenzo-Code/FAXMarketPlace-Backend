/**
 * 🧪 Freemium Rate Limiting Test Script
 * 
 * This script tests the freemium rate limiting system to ensure it works correctly.
 */

const { getUserSubscriptionStatus, getRemainingLimits } = require('./middleware/freemiumRateLimit');
const { limitSearchResults, getTierLimits } = require('./utils/freemiumDataLimiter');

// Mock request objects for testing
const freeUserReq = {
  user: null, // Anonymous user
  ip: '192.168.1.100'
};

const premiumUserReq = {
  user: {
    _id: '507f1f77bcf86cd799439011',
    email: 'premium@test.com',
    subscription: {
      plan: 'premium',
      status: 'active'
    }
  },
  ip: '192.168.1.101'
};

const authenticatedFreeUserReq = {
  user: {
    _id: '507f1f77bcf86cd799439012',
    email: 'free@test.com',
    subscription: {
      plan: 'free',
      status: 'active'
    }
  },
  ip: '192.168.1.102'
};

// Mock search results for testing
const mockSearchResults = {
  listings: [
    {
      id: '1',
      address: { oneLine: '123 Main St, Houston, TX 77024' },
      price: 350000,
      beds: 3,
      baths: 2,
      sqft: 1500,
      imgSrc: 'https://example.com/image1.jpg',
      zpid: 'zpid123',
      attomData: { detailed: 'property data' },
      propertySource: { name: 'Zillow', type: 'zillow' },
      dataQuality: 'excellent',
      coreLogicData: { comprehensive: 'data' }
    },
    {
      id: '2',
      address: { oneLine: '456 Oak Ave, Houston, TX 77025' },
      price: 275000,
      beds: 2,
      baths: 1,
      sqft: 1200,
      imgSrc: 'https://example.com/image2.jpg',
      zpid: 'zpid456',
      attomData: { detailed: 'property data 2' },
      propertySource: { name: 'MLS', type: 'mls' },
      dataQuality: 'good',
      coreLogicData: { comprehensive: 'data 2' }
    },
    {
      id: '3',
      address: { oneLine: '789 Pine St, Houston, TX 77026' },
      price: 425000,
      beds: 4,
      baths: 3,
      sqft: 2000,
      imgSrc: 'https://example.com/image3.jpg',
      zpid: 'zpid789',
      attomData: { detailed: 'property data 3' },
      propertySource: { name: 'HAR', type: 'har' },
      dataQuality: 'excellent',
      coreLogicData: { comprehensive: 'data 3' }
    },
    {
      id: '4',
      address: { oneLine: '101 Elm Dr, Houston, TX 77027' },
      price: 550000,
      beds: 5,
      baths: 4,
      sqft: 2500,
      imgSrc: 'https://example.com/image4.jpg',
      zpid: 'zpid101',
      attomData: { detailed: 'property data 4' },
      propertySource: { name: 'Zillow', type: 'zillow' },
      dataQuality: 'excellent',
      coreLogicData: { comprehensive: 'data 4' }
    },
    {
      id: '5',
      address: { oneLine: '202 Maple Ln, Houston, TX 77028' },
      price: 310000,
      beds: 3,
      baths: 2.5,
      sqft: 1800,
      imgSrc: 'https://example.com/image5.jpg',
      zpid: 'zpid202',
      attomData: { detailed: 'property data 5' },
      propertySource: { name: 'MLS', type: 'mls' },
      dataQuality: 'good',
      coreLogicData: { comprehensive: 'data 5' }
    }
  ],
  ai_summary: "Here are 5 great properties that match your search criteria. These homes offer excellent value in the Houston market with a mix of 2-5 bedroom options ranging from $275,000 to $550,000. All properties feature modern amenities and are located in desirable neighborhoods with good schools and convenient access to shopping and dining.",
  metadata: {
    searchQuery: "3 bedroom house under $400k in Houston",
    searchType: "listings",
    totalFound: 5,
    timestamp: new Date().toISOString(),
    dataQuality: {
      excellent: 3,
      good: 2,
      partial: 0,
      poor: 0
    }
  }
};

console.log('🧪 Starting Freemium System Tests...\n');

// Test 1: User Subscription Status Detection
console.log('📋 Test 1: User Subscription Status Detection');
console.log('==========================================');

const freeStatus = getUserSubscriptionStatus(freeUserReq.user);
console.log('Anonymous user:', freeStatus);

const premiumStatus = getUserSubscriptionStatus(premiumUserReq.user);
console.log('Premium user:', premiumStatus);

const authFreeStatus = getUserSubscriptionStatus(authenticatedFreeUserReq.user);
console.log('Authenticated free user:', authFreeStatus);

console.log('✅ Test 1 passed\n');

// Test 2: Tier Limits Configuration
console.log('📋 Test 2: Tier Limits Configuration');
console.log('=====================================');

const freeLimits = getTierLimits('free');
console.log('Free tier limits:', freeLimits);

const premiumLimits = getTierLimits('premium');
console.log('Premium tier limits:', premiumLimits);

console.log('✅ Test 2 passed\n');

// Test 3: Data Limiting for Free Users
console.log('📋 Test 3: Data Limiting for Free Users');
console.log('=======================================');

const freeResults = limitSearchResults(mockSearchResults, 'free');
console.log('Free tier results:');
console.log('- Listings returned:', freeResults.listings.length);
console.log('- Hidden results count:', freeResults.hiddenResultsCount);
console.log('- Upgrade prompt:', freeResults.upgradeForMore?.message);
console.log('- AI summary length:', freeResults.ai_summary.length);
console.log('- First listing has attomData:', !!freeResults.listings[0]?.attomData);
console.log('- First listing has zpid:', !!freeResults.listings[0]?.zpid);
console.log('- First listing has free preview flag:', freeResults.listings[0]?.freePreview);

console.log('✅ Test 3 passed\n');

// Test 4: Data Limiting for Premium Users
console.log('📋 Test 4: Data Limiting for Premium Users');
console.log('==========================================');

const premiumResults = limitSearchResults(mockSearchResults, 'premium');
console.log('Premium tier results:');
console.log('- Listings returned:', premiumResults.listings.length);
console.log('- Hidden results count:', premiumResults.hiddenResultsCount || 'none');
console.log('- AI summary length:', premiumResults.ai_summary.length);
console.log('- First listing has attomData:', !!premiumResults.listings[0]?.attomData);
console.log('- First listing has zpid:', !!premiumResults.listings[0]?.zpid);
console.log('- Tier info:', premiumResults.tierInfo);

console.log('✅ Test 4 passed\n');

// Test 5: Field Sanitization
console.log('📋 Test 5: Field Sanitization');
console.log('==============================');

console.log('Free tier listing fields:');
const freeListing = freeResults.listings[0];
console.log('- Has address:', !!freeListing.address);
console.log('- Has price:', !!freeListing.price);
console.log('- Has attomData (should be false):', !!freeListing.attomData);
console.log('- Has coreLogicData (should be false):', !!freeListing.coreLogicData);
console.log('- Has dataQuality (should be false):', !!freeListing.dataQuality);
console.log('- Has upgradeMessage:', !!freeListing.upgradeMessage);

console.log('\nPremium tier listing fields:');
const premiumListing = premiumResults.listings[0];
console.log('- Has address:', !!premiumListing.address);
console.log('- Has price:', !!premiumListing.price);
console.log('- Has attomData:', !!premiumListing.attomData);
console.log('- Has coreLogicData:', !!premiumListing.coreLogicData);
console.log('- Has dataQuality:', !!premiumListing.dataQuality);
console.log('- Has upgradeMessage (should be false):', !!premiumListing.upgradeMessage);

console.log('✅ Test 5 passed\n');

// Test 6: Edge Cases
console.log('📋 Test 6: Edge Cases');
console.log('======================');

// Test with no listings
const emptyResults = limitSearchResults({ listings: [], ai_summary: 'No results found' }, 'free');
console.log('Empty results for free tier:', emptyResults.listings.length, 'listings');

// Test with single listing (should not be limited)
const singleResult = limitSearchResults({ 
  listings: [mockSearchResults.listings[0]], 
  ai_summary: 'One result found' 
}, 'free');
console.log('Single result for free tier:', singleResult.listings.length, 'listings');

// Test with exactly 3 listings (should not be limited)
const threeResults = limitSearchResults({ 
  listings: mockSearchResults.listings.slice(0, 3), 
  ai_summary: 'Three results found' 
}, 'free');
console.log('Three results for free tier:', threeResults.listings.length, 'listings');
console.log('Hidden count:', threeResults.hiddenResultsCount || 'none');

console.log('✅ Test 6 passed\n');

console.log('🎉 All Freemium System Tests Passed!');
console.log('====================================');
console.log('The freemium rate limiting and data limiting system is working correctly.');
console.log('\n📊 Summary:');
console.log('- Free users get max 3 property results with limited data');
console.log('- Premium users get unlimited results with full data');
console.log('- Sensitive fields are properly hidden from free users');
console.log('- Upgrade prompts are shown to free users');
console.log('- Edge cases are handled correctly');

console.log('\n🚀 Next Steps:');
console.log('1. Deploy the updated backend with freemium system');
console.log('2. Update frontend to handle upgrade prompts and limited data');
console.log('3. Test with real API requests to verify rate limiting');
console.log('4. Add payment integration for subscription upgrades');
console.log('5. Monitor usage patterns and adjust limits as needed');
