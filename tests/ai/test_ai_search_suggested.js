require("dotenv").config();
const axios = require("axios");

async function testAISuggested() {
  console.log("🤖 Testing AI Search - AI Suggested...");
  
  const aiSuggestedQuery = {
    query: "Find me properties with 10+ doors suitable for investing in Houston"
  };
  
  try {
    console.log(`🎯 Query: "${aiSuggestedQuery.query}"`);
    
    const response = await axios.post("http://localhost:5000/api/ai/search", aiSuggestedQuery, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000 // 60 second timeout for AI processing
    });
    
    console.log("✅ AI Suggested Success!");
    console.log("📊 Response Summary:");
    console.log("- From Cache:", response.data.fromCache || false);
    console.log("- Listings Found:", response.data.listings?.length || 0);
    console.log("- Parsed Filter:", JSON.stringify(response.data.parsedFilter, null, 2));
    
    if (response.data.listings?.length > 0) {
      console.log("🏠 Sample Listing:");
      const sample = response.data.listings[0];
      console.log("- Address:", sample.address);
      console.log("- Price:", sample.price);
      console.log("- Beds/Baths:", `${sample.bedrooms}/${sample.bathrooms}`);
      console.log("- Attom Data:", sample.attomData ? "✅ Available" : "❌ Not Available");
    }
    
  } catch (error) {
    console.error("❌ AI Suggested Error:");
    console.error("Status:", error.response?.status);
    console.error("Status Text:", error.response?.statusText);
    console.error("Data:", error.response?.data);
    console.error("Message:", error.message);
  }
}

testAISuggested();
