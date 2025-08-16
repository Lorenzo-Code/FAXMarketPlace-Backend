/**
 * Test the improved photo fetching system with existing ZPID
 */

require("dotenv").config();
const { fetchZillowPhotos } = require("../services/fetchZillow");

async function testImprovedPhotoFetching() {
  console.log("🧪 Testing Improved Photo Fetching System...");
  
  // Test data - using a ZPID from our earlier debug
  const testProperty = {
    address: "8014 Wray Ct, Houston, TX 77088",
    zpid: "28164905", // From our debug output
    zip: "77088"
  };
  
  try {
    console.log(`📍 Testing with property: ${testProperty.address}`);
    console.log(`🏷️ Using existing ZPID: ${testProperty.zpid}`);
    
    // Test 1: With existing ZPID (should be faster)
    console.log("\n🚀 Test 1: Using existing ZPID");
    const startTime = Date.now();
    
    const images = await fetchZillowPhotos(
      testProperty.address, 
      testProperty.zip, 
      testProperty.zpid
    );
    
    const responseTime = Date.now() - startTime;
    
    console.log(`⏱️ Response time: ${responseTime}ms`);
    console.log(`📸 Fetched ${images.length} images:`);
    
    images.forEach((img, index) => {
      console.log(`   ${index + 1}. ${img.imageType}: ${img.imgSrc.substring(0, 80)}...`);
      console.log(`      ZPID: ${img.zpid}`);
    });
    
    // Test 2: Without existing ZPID (should still work but slower)
    console.log("\n🚀 Test 2: Without existing ZPID (lookup required)");
    const startTime2 = Date.now();
    
    const images2 = await fetchZillowPhotos(
      testProperty.address, 
      testProperty.zip,
      null // No existing ZPID
    );
    
    const responseTime2 = Date.now() - startTime2;
    
    console.log(`⏱️ Response time: ${responseTime2}ms`);
    console.log(`📸 Fetched ${images2.length} images (should match previous test)`);
    
    // Summary
    console.log(`\n📊 Performance Summary:`);
    console.log(`   With ZPID: ${responseTime}ms`);
    console.log(`   Without ZPID: ${responseTime2}ms`);
    console.log(`   Speed improvement: ${((responseTime2 - responseTime) / responseTime2 * 100).toFixed(1)}%`);
    
    if (images.length === 0) {
      console.log("❌ No images returned - this might indicate an API issue");
    } else if (images.length === 1) {
      console.log("⚠️ Only 1 image returned - check if Zillow has more photos for this property");
    } else {
      console.log("✅ Multiple images returned successfully!");
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
  }
}

testImprovedPhotoFetching();
