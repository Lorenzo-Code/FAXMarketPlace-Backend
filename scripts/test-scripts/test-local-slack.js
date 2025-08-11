const axios = require('axios');

const baseURL = 'http://localhost:5000';

// Function to simulate a Slack command
async function testSlackCommand(command, text = '') {
  const payload = {
    command: command,
    text: text,
    user_id: 'U123456789',
    user_name: 'test_user',
    channel_id: 'C123456789',
    team_id: 'T123456789',
    response_url: 'https://hooks.slack.com/commands/1234/5678'
  };

  try {
    console.log(`\n🧪 Testing: ${command} ${text}`);
    console.log(`⏰ Starting at: ${new Date().toISOString()}`);
    
    const startTime = Date.now();
    const response = await axios.post(`${baseURL}/slack/commands-insecure`, 
      new URLSearchParams(payload), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000 // 5 second timeout
      }
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ Response received in ${duration}ms`);
    console.log(`📝 Status: ${response.status}`);
    
    if (response.data.text) {
      console.log(`📄 Response text: ${response.data.text.substring(0, 100)}...`);
    } else if (response.data.blocks) {
      console.log(`📄 Response blocks: ${response.data.blocks.length} blocks`);
    } else {
      console.log(`📄 Full response:`, response.data);
    }
    
    return { success: true, duration, response: response.data };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ Error after ${duration}ms:`, error.message);
    return { success: false, duration, error: error.message };
  }
}

// Test different commands
async function runTests() {
  console.log('🚀 Starting local Slack command tests...\n');
  
  const tests = [
    { command: '/ping' },
    { command: '/test' },
    { command: '/health' },
    { command: '/admin-help' },
    { command: '/system', text: 'status' },
    { command: '/user', text: 'info test@example.com' }
  ];

  for (const test of tests) {
    await testSlackCommand(test.command, test.text || '');
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between tests
  }
  
  console.log('\n✅ All tests completed!');
}

runTests().catch(console.error);
