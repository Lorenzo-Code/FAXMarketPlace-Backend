#!/usr/bin/env node

const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function unlockAccount() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/fractionax', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('📦 Connected to MongoDB');
    
    // Get command line arguments
    const args = process.argv.slice(2);
    const email = args[0];
    
    if (!email) {
      console.log('❌ Please provide an email address');
      console.log('Usage: node unlock-account.js your.email@example.com');
      process.exit(1);
    }
    
    // Find the user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User with email ${email} not found`);
      
      // List all users in the database
      const allUsers = await User.find({}).select('email firstName lastName role suspended loginAttempts lockUntil');
      console.log('\n📋 All users in database:');
      allUsers.forEach((u, index) => {
        const lockStatus = u.lockUntil && u.lockUntil > new Date() ? '🔒 LOCKED' : '🔓 UNLOCKED';
        const suspendedStatus = u.suspended ? '⛔ SUSPENDED' : '✅ ACTIVE';
        console.log(`${index + 1}. ${u.email} (${u.firstName} ${u.lastName}) - ${u.role} - ${lockStatus} - ${suspendedStatus} - Failed attempts: ${u.loginAttempts || 0}`);
      });
      
      process.exit(1);
    }
    
    console.log('\n👤 User Details:');
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.firstName} ${user.lastName}`);
    console.log(`Role: ${user.role}`);
    console.log(`Suspended: ${user.suspended ? '⛔ YES' : '✅ NO'}`);
    console.log(`Email Verified: ${user.emailVerified ? '✅ YES' : '❌ NO'}`);
    console.log(`2FA Enabled: ${user.twoFactorEnabled ? '🔐 YES' : '❌ NO'}`);
    console.log(`Failed Login Attempts: ${user.loginAttempts || 0}`);
    console.log(`Account Locked Until: ${user.lockUntil ? user.lockUntil.toISOString() : '❌ NOT LOCKED'}`);
    console.log(`Last Login: ${user.lastLogin ? user.lastLogin.toISOString() : '❌ NEVER'}`);
    console.log(`Created: ${user.createdAt.toISOString()}`);
    
    // Check if account is currently locked
    const isLocked = user.lockUntil && user.lockUntil > new Date();
    
    if (isLocked) {
      console.log('\n🔒 ACCOUNT IS CURRENTLY LOCKED');
      const timeLeft = Math.ceil((user.lockUntil - new Date()) / (1000 * 60));
      console.log(`Time remaining: ${timeLeft} minutes`);
      
      // Unlock the account
      console.log('\n🔓 Unlocking account...');
      user.loginAttempts = 0;
      user.lockUntil = null;
      await user.save();
      console.log('✅ Account unlocked successfully!');
    } else {
      console.log('\n✅ Account is not locked');
      
      // Reset failed login attempts anyway
      if (user.loginAttempts > 0) {
        console.log(`🔄 Resetting ${user.loginAttempts} failed login attempts...`);
        user.loginAttempts = 0;
        await user.save();
        console.log('✅ Failed login attempts reset!');
      }
    }
    
    // Check if account is suspended
    if (user.suspended) {
      console.log('\n⛔ WARNING: Account is suspended');
      console.log(`Suspended at: ${user.suspendedAt ? user.suspendedAt.toISOString() : 'Unknown'}`);
      console.log(`Reason: ${user.suspensionReason || 'No reason provided'}`);
      console.log('You need to unsuspend this account to allow login.');
    }
    
    console.log('\n🎉 Account status updated. You should now be able to log in.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📦 Disconnected from MongoDB');
  }
}

// Run the function
unlockAccount();
