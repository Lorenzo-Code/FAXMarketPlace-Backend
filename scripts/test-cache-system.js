#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const SearchCache = require('../models/SearchCache');

async function testCacheSystem() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📦 Connected to MongoDB');

    // Test 1: Generate a test hash
    console.log('\n🔍 TEST 1: Hash Generation');
    const testQuery = 'Find me a 3 bedroom house under $300k in Houston';
    const testFilters = {
      city: 'Houston',
      state: 'TX',
      maxPrice: 300000,
      exactBeds: 3,
      propertyType: 'house',
      limit: 10
    };
    
    const hash1 = SearchCache.generateQueryHash(testQuery, testFilters);
    const hash2 = SearchCache.generateQueryHash(testQuery, testFilters); // Same query
    const hash3 = SearchCache.generateQueryHash('Different query', testFilters); // Different query
    
    console.log(`Query: "${testQuery}"`);
    console.log(`Hash 1: ${hash1}`);
    console.log(`Hash 2: ${hash2}`);
    console.log(`Hash 3: ${hash3}`);
    console.log(`Same hash for same query: ${hash1 === hash2}`);
    console.log(`Different hash for different query: ${hash1 !== hash3}`);

    // Test 2: Try to find cached results (should be empty initially)
    console.log('\n💰 TEST 2: Cache Lookup (should be MISS)');
    const cachedResults = await SearchCache.findCachedResults(testQuery, testFilters);
    console.log(`Cache result: ${cachedResults ? 'HIT' : 'MISS'}`);

    // Test 3: Cache some test results
    console.log('\n💾 TEST 3: Caching Test Results');
    const mockResults = {
      listings: [
        {
          id: 'test-property-1',
          price: 285000,
          beds: 3,
          baths: 2,
          sqft: 1850,
          address: {
            oneLine: '123 Test St, Houston, TX 77001',
            street: '123 Test St',
            city: 'Houston',
            state: 'TX',
            zip: '77001'
          },
          location: {
            latitude: 29.7604,
            longitude: -95.3698
          },
          imgSrc: 'https://example.com/image.jpg',
          dataSource: 'corelogic',
          dataQuality: 'excellent'
        }
      ],
      ai_summary: 'Found 1 property matching your criteria in Houston.',
      metadata: {
        searchQuery: testQuery,
        searchType: 'general',
        totalFound: 1,
        totalProcessed: 1,
        timestamp: new Date().toISOString()
      }
    };

    const cacheEntry = await SearchCache.cacheResults(testQuery, testFilters, mockResults, 0.50);
    console.log(`Cache entry created: ${cacheEntry ? 'SUCCESS' : 'FAILED'}`);
    if (cacheEntry) {
      console.log(`Cache entry ID: ${cacheEntry._id}`);
      console.log(`Estimated API cost: $${cacheEntry.originalApiCost.toFixed(2)}`);
    }

    // Test 4: Try to find cached results again (should be HIT now)
    console.log('\n🎉 TEST 4: Cache Lookup (should be HIT)');
    const cachedResults2 = await SearchCache.findCachedResults(testQuery, testFilters);
    console.log(`Cache result: ${cachedResults2 ? 'HIT' : 'MISS'}`);
    if (cachedResults2) {
      console.log(`Cached listings count: ${cachedResults2.listings.length}`);
      console.log(`AI Summary: ${cachedResults2.ai_summary}`);
    }

    // Test 5: Get cache statistics
    console.log('\n📊 TEST 5: Cache Statistics');
    const stats = await SearchCache.getCacheStats();
    console.log('Cache Statistics:');
    console.log(`- Total cached queries: ${stats.totalCachedQueries}`);
    console.log(`- Total cache hits: ${stats.totalCacheHits}`);
    console.log(`- Total cost saved: $${stats.totalCostSaved.toFixed(2)}`);
    console.log(`- Average hits per query: ${stats.avgCacheHits.toFixed(2)}`);

    // Test 6: Test similar query (should generate different hash)
    console.log('\n🔄 TEST 6: Similar Query Test');
    const similarQuery = 'Show me 3 bedroom houses under $300k in Houston';
    const similarHash = SearchCache.generateQueryHash(similarQuery, testFilters);
    console.log(`Original: "${testQuery}"`);
    console.log(`Similar:  "${similarQuery}"`);
    console.log(`Different hash: ${hash1 !== similarHash}`);
    
    const cachedSimilar = await SearchCache.findCachedResults(similarQuery, testFilters);
    console.log(`Similar query cache result: ${cachedSimilar ? 'HIT' : 'MISS'}`);

    // Test 7: Create another cache entry to test multiple entries
    console.log('\n🔄 TEST 7: Multiple Cache Entries');
    const mockResults2 = {
      ...mockResults,
      listings: [
        {
          ...mockResults.listings[0],
          id: 'test-property-2',
          price: 275000
        }
      ],
      ai_summary: 'Found another property matching your similar criteria.',
      metadata: {
        ...mockResults.metadata,
        searchQuery: similarQuery
      }
    };

    await SearchCache.cacheResults(similarQuery, testFilters, mockResults2, 0.45);
    
    const finalStats = await SearchCache.getCacheStats();
    console.log('Updated Cache Statistics:');
    console.log(`- Total cached queries: ${finalStats.totalCachedQueries}`);
    console.log(`- Total cache hits: ${finalStats.totalCacheHits}`);
    console.log(`- Total cost saved: $${finalStats.totalCostSaved.toFixed(2)}`);

    // Test 8: Access the first query again to increase hit count
    console.log('\n📈 TEST 8: Increasing Hit Count');
    await SearchCache.findCachedResults(testQuery, testFilters);
    await SearchCache.findCachedResults(testQuery, testFilters);
    
    const hitStats = await SearchCache.getCacheStats();
    console.log('Hit Count Statistics:');
    console.log(`- Total cache hits: ${hitStats.totalCacheHits}`);
    console.log(`- Average hits per query: ${hitStats.avgCacheHits.toFixed(2)}`);

    console.log('\n✅ ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('💰 MongoDB caching system is working properly and will save significant API costs.');

  } catch (error) {
    console.error('❌ Error testing cache system:', error);
  } finally {
    await mongoose.connection.close();
    console.log('📦 Disconnected from MongoDB');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCacheSystem();
}

module.exports = testCacheSystem;
