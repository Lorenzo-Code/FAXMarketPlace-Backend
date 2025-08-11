require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI)
.then(async () => {
  console.log('Connected to MongoDB');
  
  // Find and check your account
  const user = await User.findOne({ email: 'lorenzo@fxst.io' });
  if (user) {
    console.log('\n=== Current user status ===');
    console.log('Email:', user.email);
    console.log('Login attempts:', user.loginAttempts || 0);
    console.log('Account locked until:', user.lockUntil || 'Not locked');
    console.log('Suspended:', user.suspended || false);
    console.log('Password exists:', user.password ? 'Yes' : 'No');
    console.log('Password hash preview:', user.password ? user.password.substring(0, 30) + '...' : 'None');
    console.log('Password full length:', user.password ? user.password.length : 'N/A');
    console.log('Password starts with $2b$:', user.password ? user.password.startsWith('$2b$') : 'N/A');
    
    // Clear login attempts and unlock account
    await User.findByIdAndUpdate(user._id, {
      $unset: { loginAttempts: 1, lockUntil: 1 }
    });
    
    console.log('\n✅ Account unlocked and login attempts reset');
    console.log('🔍 You can now try logging in again');
  } else {
    console.log('❌ User not found with email: lorenzo@fxst.io');
  }
  
  mongoose.connection.close();
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});
