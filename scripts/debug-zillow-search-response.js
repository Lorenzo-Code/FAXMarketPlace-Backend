/**
 * Debug what the Zillow search API actually returns for images
 */

require("dotenv").config();
const fetch = require("node-fetch");

async function debugZillowSearchResponse() {
  console.log("🔍 Debugging Zillow Search Response...");
  
  try {
    // Replicate the exact search from search_v2.js
    const searchParams = new URLSearchParams({
      location: "Houston, TX",
      status_type: "ForSale",
      priceMax: "400000"
    });
    
    console.log(`🔗 URL: https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${searchParams.toString()}`);
    
    const response = await fetch(`https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${searchParams.toString()}`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
      },
    });

    if (!response.ok) {
      throw new Error(`Zillow API returned status ${response.status}`);
    }

    const data = await response.json();
    const properties = data.props || [];
    
    console.log(`🏠 Found ${properties.length} properties`);
    
    if (properties.length > 0) {
      const firstProp = properties[0];
      
      console.log("\n📸 Image fields in first property:");
      console.log("=====================================");
      
      // Check all image-related fields
      const imageFields = {};
      Object.keys(firstProp).forEach(key => {
        if (key.toLowerCase().includes('image') || 
            key.toLowerCase().includes('photo') || 
            key.toLowerCase().includes('img') ||
            key.toLowerCase().includes('pic')) {
          imageFields[key] = firstProp[key];
        }
      });
      
      console.log("Image-related fields:", JSON.stringify(imageFields, null, 2));
      
      // Check if there's a photos array or similar
      if (firstProp.photos && Array.isArray(firstProp.photos)) {
        console.log(`\n📸 Photos array found with ${firstProp.photos.length} items:`);
        firstProp.photos.slice(0, 3).forEach((photo, i) => {
          console.log(`   ${i + 1}. ${typeof photo === 'string' ? photo.substring(0, 60) + '...' : JSON.stringify(photo)}`);
        });
      }
      
      // Check for carousel or gallery fields
      ['carousel', 'gallery', 'images', 'photoList', 'mediaList'].forEach(field => {
        if (firstProp[field]) {
          console.log(`\n📸 Found ${field}:`, 
            Array.isArray(firstProp[field]) ? `Array with ${firstProp[field].length} items` : typeof firstProp[field]
          );
        }
      });
      
      // Show full structure of first property (truncated)
      console.log("\n🏠 Full property structure (first 20 fields):");
      console.log("==========================================");
      Object.keys(firstProp).slice(0, 20).forEach(key => {
        const value = firstProp[key];
        const displayValue = typeof value === 'string' && value.length > 50 ? 
          value.substring(0, 50) + '...' : 
          JSON.stringify(value);
        console.log(`   ${key}: ${displayValue}`);
      });
      
      if (Object.keys(firstProp).length > 20) {
        console.log(`   ... and ${Object.keys(firstProp).length - 20} more fields`);
      }
    }
    
  } catch (error) {
    console.error("❌ Debug failed:", error.message);
  }
}

debugZillowSearchResponse();
