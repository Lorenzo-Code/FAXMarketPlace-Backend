const fetch = require('node-fetch');

async function triggerSearchAndEnrichment() {
  console.log('🚀 Triggering search to enrich and save properties to database...');
  
  try {
    const response = await fetch('http://localhost:5000/api/ai/search/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: '3 bedroom house under $280k'
      })
    });
    
    const data = await response.json();
    
    console.log('✅ Search completed successfully!');
    console.log(`📊 Found ${data.listings?.length || 0} properties`);
    console.log(`💾 From cache: ${data.fromCache}`);
    
    if (data.listings && data.listings.length > 0) {
      const propertiesWithPhotos = data.listings.filter(p => p.carouselPhotos && p.carouselPhotos.length > 0);
      console.log(`📷 Properties with multiple photos: ${propertiesWithPhotos.length}`);
      
      if (propertiesWithPhotos.length > 0) {
        console.log('📋 Sample property with photos:');
        const sample = propertiesWithPhotos[0];
        console.log(`   🏠 ZPID: ${sample.zpid}`);
        console.log(`   📷 Photos: ${sample.carouselPhotos?.length || 0}`);
        console.log(`   🎨 Data Quality: ${sample.dataQuality}`);
        console.log(`   📍 Address: ${sample.address?.oneLine || sample.address}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Search failed:', error.message);
  }
}

triggerSearchAndEnrichment();
