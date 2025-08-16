/**
 * Test photo fetching by directly calling Zillow API (bypass caches)
 */

require("dotenv").config();
const axios = require("axios");

async function testPhotosDirectAPI() {
  console.log("🧪 Testing Direct Zillow API Photo Fetching...");
  
  // Get a fresh ZPID from a new search
  console.log("🏠 Step 1: Get fresh properties from Zillow search");
  
  try {
    const searchResponse = await axios.get("https://zillow-com1.p.rapidapi.com/propertyExtendedSearch", {
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
      },
      params: { 
        location: "Houston, TX",
        status_type: "ForSale",
        priceMax: "400000",
        bedsMin: "3"
      },
    });
    
    const properties = searchResponse.data?.props || [];
    console.log(`📍 Found ${properties.length} properties from search`);
    
    if (properties.length === 0) {
      console.log("❌ No properties found in search");
      return;
    }
    
    // Test image fetching for first few properties
    console.log("🖼️ Step 2: Test image fetching for first 3 properties");
    
    for (let i = 0; i < Math.min(3, properties.length); i++) {
      const property = properties[i];
      const zpid = property.zpid;
      const address = property.address;
      
      console.log(`\n🏠 Property ${i + 1}: ${address}`);
      console.log(`   ZPID: ${zpid}`);
      console.log(`   Primary image from search: ${property.imgSrc ? 'Yes' : 'No'}`);
      
      if (!zpid) {
        console.log("   ❌ No ZPID available - skipping image fetch");
        continue;
      }
      
      // Fetch additional images using the Zillow Images API
      console.log(`   📸 Fetching additional images...`);
      
      try {
        const imagesResponse = await axios.get("https://zillow-com1.p.rapidapi.com/images", {
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
          },
          params: { zpid },
        });
        
        const images = imagesResponse.data?.images || [];
        console.log(`   ✅ Fetched ${images.length} additional images from API`);
        
        if (images.length > 0) {
          console.log(`   📸 Image URLs:`);
          images.slice(0, 5).forEach((img, index) => {
            console.log(`      ${index + 1}. ${img.substring(0, 80)}...`);
          });
          if (images.length > 5) {
            console.log(`      ... and ${images.length - 5} more images`);
          }
        }
        
        // Simulate what the batch processor should return
        const formattedImages = images.map((imgSrc, index) => ({
          address1: address,
          imgSrc,
          zpid,
          imageType: index === 0 ? 'primary' : 'gallery'
        }));
        
        console.log(`   🎯 This property should have:`);
        console.log(`      - imgSrc: ${property.imgSrc || formattedImages[0]?.imgSrc || 'None'}`);
        console.log(`      - carouselPhotos: Array of ${formattedImages.length} images`);
        console.log(`      - photoCount: ${formattedImages.length}`);
        
      } catch (imageError) {
        console.error(`   ❌ Image fetch failed: ${imageError.message}`);
      }
      
      // Add delay between requests to respect rate limits
      if (i < Math.min(2, properties.length - 1)) {
        console.log("   ⏳ Waiting 1 second for rate limiting...");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`- Zillow search API works: ✅`);
    console.log(`- Zillow images API works: ✅ (if successful above)`);
    console.log(`- Multiple images available: ✅ (if 10+ images per property)`);
    console.log(`\nNext steps: The batch processor should use these images to populate carouselPhotos array`);
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPhotosDirectAPI();
