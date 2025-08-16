/**
 * Test MongoDB connection to debug the timeout issue
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function testMongoConnection() {
  console.log("🧪 Testing MongoDB Connection...");
  console.log(`📍 Connection string: ${process.env.MONGO_URI ? 'Present' : 'Missing'}`);
  
  try {
    // Set connection timeout to 10 seconds
    const options = {
      serverSelectionTimeoutMS: 10000, // 10 seconds
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000
    };
    
    console.log("🔌 Attempting to connect to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, options);
    
    console.log("✅ MongoDB connected successfully");
    
    // Test basic operations
    console.log("📝 Testing basic database operations...");
    
    // Test if we can access a simple collection
    const testCollection = mongoose.connection.db.collection('test');
    const result = await testCollection.insertOne({ 
      test: true, 
      timestamp: new Date(),
      message: "Connection test successful"
    });
    
    console.log(`✅ Test document inserted with ID: ${result.insertedId}`);
    
    // Clean up the test document
    await testCollection.deleteOne({ _id: result.insertedId });
    console.log("✅ Test document cleaned up");
    
    // Test the ZillowImageCache model specifically
    console.log("🖼️ Testing ZillowImageCache model...");
    const ZillowImageCache = require("../models/ZillowImageCache");
    
    // Try to find any document (should not timeout)
    const cacheTest = await ZillowImageCache.findOne({}).maxTimeMS(5000);
    console.log(`✅ ZillowImageCache query successful. Found: ${cacheTest ? 'document' : 'no documents'}`);
    
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    
    if (error.name === 'MongooseServerSelectionError') {
      console.error("🔍 Server selection error - possible causes:");
      console.error("   - Network connectivity issues");
      console.error("   - MongoDB Atlas IP whitelist restrictions");
      console.error("   - Invalid connection string");
      console.error("   - MongoDB service is down");
    }
    
    if (error.name === 'MongoNetworkError') {
      console.error("🔍 Network error - check your internet connection");
    }
    
    if (error.message.includes('buffering timed out')) {
      console.error("🔍 Buffering timeout - operations are queued but connection is not established");
    }
  } finally {
    console.log("🔌 Closing MongoDB connection...");
    await mongoose.connection.close();
    console.log("✅ Connection closed");
    process.exit(0);
  }
}

testMongoConnection();
