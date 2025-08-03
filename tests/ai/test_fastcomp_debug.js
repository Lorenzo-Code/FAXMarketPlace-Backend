require("dotenv").config();
const axios = require("axios");

async function testFastComp() {
  console.log("🧪 Testing FastComp endpoint...");
  
  const testData = {
    address1: "1200 Main St",
    city: "Houston", 
    state: "TX",
    postalcode: "77002",
    lat: 29.7604,
    lng: -95.3698,
    place_id: "test123"
  };
  
  try {
    const response = await axios.post("http://localhost:5000/api/ai/fast-comp", testData, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000 // 30 second timeout
    });
    
    console.log("✅ FastComp Success!");
    console.log("📊 Response:", JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error("❌ FastComp Error:");
    console.error("Status:", error.response?.status);
    console.error("Status Text:", error.response?.statusText);
    console.error("Data:", error.response?.data);
    console.error("Message:", error.message);
  }
}

testFastComp();
