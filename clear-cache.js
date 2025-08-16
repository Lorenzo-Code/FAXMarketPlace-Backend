const { deletePatternAsync } = require('./utils/redisClient');

async function clearAllCaches() {
  console.log('🗑️ Clearing all caches...');
  
  try {
    // Clear discovery cache
    await deletePatternAsync('discovery:*');
    console.log('✅ Cleared discovery cache');
    
    // Clear enhanced cache
    await deletePatternAsync('enhanced:*');
    console.log('✅ Cleared enhanced cache');
    
    // Clear search results cache
    await deletePatternAsync('search_results:*');
    console.log('✅ Cleared search results cache');
    
    // Clear property cache
    await deletePatternAsync('property:*');
    console.log('✅ Cleared property cache');
    
    console.log('🎉 All caches cleared successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to clear caches:', error.message);
    process.exit(1);
  }
}

clearAllCaches();
