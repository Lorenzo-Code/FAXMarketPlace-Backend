/**
 * Test raw Zillow API calls to check image responses
 */

require("dotenv").config();
const axios = require("axios");

async function testRawZillowAPI() {
  console.log("🧪 Testing Raw Zillow API...");
  
  try {
    // Test 1: Get ZPID for a known property
    console.log("📍 Step 1: Getting ZPID...");
    const addressResponse = await axios.get("https://zillow-com1.p.rapidapi.com/property", {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "zillow-com1.p.rapidapi.com",
      },
      params: { 
        address1: "1265 Lombard St, San Francisco, CA 94109" // Use a well-known address
      },
    });
    
    const zpid = addressResponse.data?.zpid;
    console.log(`📍 Found ZPID: ${zpid}`);
    
    if (!zpid) {
      console.log("❌ No ZPID found - can't test images");
      return;
    }
    
    // Test 2: Get images for this ZPID
    console.log("📸 Step 2: Getting images...");
    const imagesResponse = await axios.get("https://zillow-com1.p.rapidapi.com/images", {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "zillow-com1.p.rapidapi.com",
      },
      params: { zpid },
    });
    
    const images = imagesResponse.data?.images || [];
    console.log(`📸 Zillow API returned ${images.length} images:`);
    
    if (images.length > 0) {
      images.slice(0, 5).forEach((img, index) => {
        console.log(`   ${index + 1}. ${typeof img === 'string' ? img.substring(0, 80) : JSON.stringify(img).substring(0, 80)}...`);
      });
      
      if (images.length > 5) {
        console.log(`   ... and ${images.length - 5} more images`);
      }
    } else {
      console.log("❌ No images returned from Zillow API");
    }
    
    // Test 3: Check what a property search returns for images
    console.log("🏠 Step 3: Testing property search for image data...");
    const searchResponse = await axios.get("https://zillow-com1.p.rapidapi.com/propertyExtendedSearch", {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "zillow-com1.p.rapidapi.com",
      },
      params: { 
        location: "Houston, TX",
        status_type: "ForSale",
        priceMax: "500000"
      },
    });
    
    const properties = searchResponse.data?.props || [];
    console.log(`🏠 Search returned ${properties.length} properties`);
    
    if (properties.length > 0) {
      const firstProp = properties[0];
      console.log("📸 First property image data:");
      console.log(`   imgSrc: ${firstProp.imgSrc ? firstProp.imgSrc.substring(0, 80) + "..." : "None"}`);
      console.log(`   carouselPhotos: ${firstProp.carouselPhotos ? firstProp.carouselPhotos.length + " photos" : "Not present"}`);
      console.log(`   Has other image fields: ${Object.keys(firstProp).filter(k => k.toLowerCase().includes('image') || k.toLowerCase().includes('photo')).join(', ')}`);
    }
    
  } catch (error) {
    console.error("❌ API Test failed:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

testRawZillowAPI();
