/**
 * Quick test to check if Zillow image fetching returns multiple photos
 */

require("dotenv").config();
const { fetchZillowPhotos } = require("../services/fetchZillow");

async function testZillowImages() {
  console.log("🧪 Testing Zillow Image Fetching...");
  
  // Test with a known Houston address
  const testAddress = "123 Main St, Houston, TX 77002";
  
  try {
    console.log(`📍 Testing address: ${testAddress}`);
    
    const images = await fetchZillowPhotos(testAddress, "77002");
    
    console.log(`📸 Fetched ${images.length} images:`);
    images.forEach((img, index) => {
      console.log(`   ${index + 1}. ${img.imageType}: ${img.imgSrc.substring(0, 80)}...`);
    });
    
    if (images.length === 0) {
      console.log("❌ No images returned - check API connectivity and address validity");
    } else if (images.length === 1) {
      console.log("⚠️ Only 1 image returned - this might be the issue");
    } else {
      console.log("✅ Multiple images returned successfully");
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testZillowImages();
