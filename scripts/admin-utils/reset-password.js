#!/usr/bin/env node

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function resetPassword() {
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
    const newPassword = args[1];
    
    if (!email || !newPassword) {
      console.log('❌ Please provide email and new password');
      console.log('Usage: node reset-password.js your.email@example.com "YourNewPassword123!"');
      console.log('\n⚠️  Password Requirements:');
      console.log('  • At least 8 characters');
      console.log('  • Contains uppercase letter');
      console.log('  • Contains lowercase letter');
      console.log('  • Contains number');
      console.log('  • Contains special character (!@#$%^&*(),.?":{}|<>)');
      process.exit(1);
    }
    
    // Validate password strength
    const validatePassword = (password) => {
      const minLength = 8;
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasNumber = /\d/.test(password);
      const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password);

      const errors = [];
      if (password.length < minLength) errors.push(`Password must be at least ${minLength} characters`);
      if (!hasUpper) errors.push("Must contain uppercase letter");
      if (!hasLower) errors.push("Must contain lowercase letter");
      if (!hasNumber) errors.push("Must contain number");
      if (!hasSymbol) errors.push("Must contain special character");

      return errors;
    };
    
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      console.log('❌ Password does not meet requirements:');
      passwordErrors.forEach(error => console.log(`  • ${error}`));
      process.exit(1);
    }
    
    // Find the user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User with email ${email} not found`);
      
      // List all users in the database
      const allUsers = await User.find({}).select('email firstName lastName role');
      console.log('\n📋 Available users:');
      allUsers.forEach((u, index) => {
        console.log(`${index + 1}. ${u.email} (${u.firstName} ${u.lastName}) - ${u.role}`);
      });
      
      process.exit(1);
    }
    
    console.log(`\n👤 Found user: ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`Role: ${user.role}`);
    console.log(`Current Status: ${user.suspended ? '⛔ SUSPENDED' : '✅ ACTIVE'}`);
    
    // Hash the new password
    console.log('\n🔐 Hashing new password...');
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update the password in the database
    user.password = hashedPassword;
    
    // Reset any account lockout info
    user.loginAttempts = 0;
    user.lockUntil = null;
    
    // Save the user
    await user.save();
    
    console.log('✅ Password updated successfully!');
    console.log('✅ Account lockout status cleared!');
    
    // Verify the password works
    console.log('\n🔍 Verifying new password...');
    const isValid = await bcrypt.compare(newPassword, hashedPassword);
    if (isValid) {
      console.log('✅ Password verification successful!');
    } else {
      console.log('❌ Password verification failed!');
    }
    
    console.log('\n🎉 Password reset complete!');
    console.log(`📧 You can now log in with:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: [YOUR NEW PASSWORD]`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📦 Disconnected from MongoDB');
  }
}

// Run the function
resetPassword();
