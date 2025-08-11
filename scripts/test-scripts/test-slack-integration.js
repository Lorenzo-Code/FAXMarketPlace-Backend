#!/usr/bin/env node
require('dotenv').config();

const slackService = require('./services/slackService');
const mongoose = require('mongoose');

async function testSlackIntegration() {
  console.log('🚀 Starting Slack Integration Test Suite...\n');

  try {
    // Connect to MongoDB
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('📦 Connected to MongoDB');
    }

    // Test 1: Connection Status
    console.log('🔌 Testing Slack connection...');
    const status = await slackService.getStatus();
    console.log('Connection Status:', status);
    
    if (!status.connected) {
      console.error('❌ Slack is not connected. Please check your SLACK_BOT_TOKEN');
      process.exit(1);
    }
    console.log('✅ Slack connection verified\n');

    // Test 2: User Info Lookup
    console.log('👤 Testing user info lookup...');
    const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
    const userInfoResult = await slackService.getUserInfo(testEmail);
    console.log('User Info Result:', userInfoResult.success ? 'Found user' : userInfoResult.error);
    console.log('');

    // Test 3: Security Alert
    console.log('🚨 Testing security alert...');
    const alertResult = await slackService.notifySecurityAlert(
      'suspicious_login',
      testEmail,
      'Test security alert from automated test script',
      'test-script'
    );
    console.log('Security Alert Result:', alertResult.success ? 'Sent successfully' : alertResult.error);
    console.log('');

    // Test 4: Daily Digest
    console.log('📊 Testing daily digest...');
    const digestResult = await slackService.sendDailyDigest();
    console.log('Daily Digest Result:', digestResult.success ? 'Sent successfully' : digestResult.error);
    console.log('');

    // Test 5: Ticket Sync (if tickets exist)
    console.log('🔄 Testing ticket sync...');
    const syncResult = await slackService.syncAllTickets();
    console.log('Sync Result:', syncResult);
    console.log('');

    // Test completed successfully
    console.log('🎉 All Slack integration tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('✅ Connection verified');
    console.log('✅ User lookup tested');
    console.log('✅ Security alerts tested');
    console.log('✅ Daily digest tested');
    console.log('✅ Ticket sync tested');

    console.log('\n🛠️  Available Slash Commands:');
    console.log('• /support-stats - View support ticket statistics');
    console.log('• /create-ticket [email] [subject] - [description]');
    console.log('• /user-info [email] - Get user information');
    console.log('• /reset-password [email] - Reset user password');
    console.log('• /toggle-2fa [email] [enable|disable] - Manage 2FA');
    console.log('• /manage-wallet [email] [action] [address] - Manage wallets');
    console.log('• /user-documents [email] - View user documents');
    console.log('• /user-audit [email] - View audit log');
    console.log('• /security-alert [email] [type] [details] - Send security alert');
    console.log('• /admin-help - Show all commands');

    console.log('\n🔗 Webhook Endpoints:');
    console.log(`• ${process.env.API_URL || 'http://localhost:5000'}/api/webhooks/slack`);
    console.log(`• ${process.env.API_URL || 'http://localhost:5000'}/api/webhooks/slack/slash-commands`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Close database connection
    if (mongoose.connection.readyState) {
      await mongoose.connection.close();
      console.log('\n📦 Disconnected from MongoDB');
    }
    process.exit(0);
  }
}

// Handle script execution
if (require.main === module) {
  console.log('🔐 Checking environment variables...');
  
  const requiredEnvVars = [
    'SLACK_BOT_TOKEN',
    'SLACK_SUPPORT_CHANNEL_ID',
    'SLACK_SIGNING_SECRET',
    'MONGO_URI'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.error('\nPlease add these to your .env file:');
    console.error('SLACK_BOT_TOKEN=xoxb-your-bot-token');
    console.error('SLACK_SUPPORT_CHANNEL_ID=C1234567890');
    console.error('SLACK_SIGNING_SECRET=your-signing-secret');
    console.error('MONGO_URI=mongodb://localhost:27017/fractionax');
    process.exit(1);
  }

  console.log('✅ All environment variables found');
  console.log('');

  testSlackIntegration();
}

module.exports = { testSlackIntegration };
