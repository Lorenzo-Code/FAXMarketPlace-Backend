require("dotenv").config();
const { getPropertyInfoFromCoreLogic } = require("./utils/coreLogicClient");

async function testCoreLogicDirect() {
  console.log("🔬 Testing CoreLogic client directly...");
  
  const testParams = {
    address1: "1200 Main St",
    city: "Houston", 
    state: "TX",
    postalcode: "77002",
    lat: 29.7604,
    lng: -95.3698
  };
  
  try {
    const result = await getPropertyInfoFromCoreLogic(testParams);
    console.log("✅ CoreLogic Direct Test Success!");
    console.log("📊 Result:", JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error("❌ CoreLogic Direct Test Error:");
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
  }
}

testCoreLogicDirect();
