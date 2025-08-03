require("dotenv").config();
const { getCoreLogicAccessToken } = require("./utils/coreLogicAuth");

async function testAuth() {
  try {
    console.log("🔬 Testing CoreLogic Authentication...");
    const token = await getCoreLogicAccessToken();
    console.log("✅ Authentication successful!");
    console.log("🔑 Token (first 50 chars):", token.substring(0, 50) + "...");
  } catch (error) {
    console.error("❌ Authentication failed:", error.message);
  }
}

testAuth();
