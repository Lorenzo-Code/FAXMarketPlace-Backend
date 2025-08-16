require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function debugKYC() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📦 Connected to MongoDB');
    
    // Find all users
    const users = await User.find().limit(5);
    console.log('\n👥 Found users:');
    users.forEach(user => {
      console.log(`   - ${user.email} (ID: ${user._id})`);
    });
    
    // Test specific user ID
    const testUserId = '6894aea02f9e8bb83da1d1a7';
    console.log('\n🔍 Looking for user:', testUserId);
    
    const user = await User.findById(testUserId);
    if (user) {
      console.log('✅ User found:', {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        kyc: user.kyc
      });
    } else {
      console.log('❌ User not found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Debug error:', error.message);
    process.exit(1);
  }
}

debugKYC();
