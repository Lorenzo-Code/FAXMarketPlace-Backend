/**
 * Test the complete search_v2 system to verify multiple photos are working
 */

require("dotenv").config();
const fetch = require("node-fetch");

async function testCompleteSearchV2Photos() {
  console.log("🧪 Testing Complete Search V2 System with Photos...");
  
  try {
    // Clear any existing cache first
    console.log("🧹 Clearing caches for fresh test...");
    
    // Test the search_v2 endpoint with a fresh search
    const searchQuery = {
      query: "3 bedroom houses under 350k in Houston"
    };
    
    console.log(`🔍 Testing search query: "${searchQuery.query}"`);
    console.log("📡 Calling search_v2 endpoint...");
    
    const startTime = Date.now();
    
    const response = await fetch("http://localhost:5000/api/ai/search/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(searchQuery)
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`Search API returned status ${response.status}`);
    }
    
    const data = await response.json();
    const properties = data.listings || [];
    
    console.log(`⏱️ Search completed in ${responseTime}ms`);
    console.log(`🏠 Found ${properties.length} properties`);
    console.log(`💾 From cache: ${data.fromCache ? 'Yes' : 'No'}`);
    
    if (properties.length === 0) {
      console.log("❌ No properties returned - can't test photos");
      return;
    }
    
    // Analyze photo data
    let singlePhotoCount = 0;
    let multiPhotoCount = 0;
    let noPhotoCount = 0;
    
    console.log(`\n📸 Photo Analysis:`);
    console.log(`==================`);
    
    properties.slice(0, 5).forEach((property, index) => {
      const hasImg = !!property.imgSrc;
      const hasCarousel = property.carouselPhotos && property.carouselPhotos.length > 0;
      const photoCount = property.photoCount || (property.carouselPhotos ? property.carouselPhotos.length : (hasImg ? 1 : 0));
      
      console.log(`${index + 1}. ${property.address?.oneLine || property.address || 'No address'}`);
      console.log(`   Primary image: ${hasImg ? '✅' : '❌'}`);
      console.log(`   Carousel photos: ${hasCarousel ? property.carouselPhotos.length : 0} photos`);
      console.log(`   Total photo count: ${photoCount}`);
      console.log(`   ZPID: ${property.zpid || property.id || 'None'}`);
      
      if (photoCount === 0) {
        noPhotoCount++;
      } else if (photoCount === 1) {
        singlePhotoCount++;
      } else {
        multiPhotoCount++;
      }
      
      // Show first few carousel photos if available
      if (hasCarousel && property.carouselPhotos.length > 1) {
        console.log(`   🖼️ Carousel images:`);
        property.carouselPhotos.slice(0, 3).forEach((photo, i) => {
          console.log(`      ${i + 1}. ${photo.substring(0, 60)}...`);
        });
        if (property.carouselPhotos.length > 3) {
          console.log(`      ... and ${property.carouselPhotos.length - 3} more`);
        }
      }
      console.log('');
    });
    
    console.log(`\n📊 Photo Summary:`);
    console.log(`   Properties with no photos: ${noPhotoCount}`);
    console.log(`   Properties with 1 photo: ${singlePhotoCount}`);
    console.log(`   Properties with multiple photos: ${multiPhotoCount}`);
    
    // Success criteria
    if (multiPhotoCount > 0) {
      console.log(`\n✅ SUCCESS: Found ${multiPhotoCount} properties with multiple photos!`);
    } else if (singlePhotoCount > 0) {
      console.log(`\n⚠️ PARTIAL SUCCESS: Properties have photos, but only single photos. Multiple photos feature may need investigation.`);
    } else {
      console.log(`\n❌ ISSUE: No properties have photos. This indicates a problem with the image fetching system.`);
    }
    
    // Show metadata
    if (data.metadata) {
      console.log(`\n📋 Search Metadata:`);
      console.log(`   Search type: ${data.metadata.searchType}`);
      console.log(`   Data source: ${data.metadata.dataSource}`);
      console.log(`   Total time: ${data.metadata.performanceMetrics?.totalRequestTime || responseTime}ms`);
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
  }
}

testCompleteSearchV2Photos();
