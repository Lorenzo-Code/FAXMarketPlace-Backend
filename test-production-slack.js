const https = require('https');

// Function to test a Slack webhook endpoint
function testSlackEndpoint(host, path, data) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      command: '/ping',
      text: '',
      user_name: 'test_user',
      user_id: 'U1234567890',
      channel_id: 'C1234567890',
      response_url: 'https://hooks.slack.com/commands/1234/5678'
    }).toString();

    const options = {
      hostname: host,
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Slackbot 1.0 (+https://api.slack.com/robots)',
        'X-Slack-Signature': 'v0=test-signature',  // This will be invalid but tests connectivity
        'X-Slack-Request-Timestamp': Math.floor(Date.now() / 1000).toString()
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: data.substring(0, 200) + (data.length > 200 ? '...' : '')
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('🧪 Testing Production Slack Endpoints...\n');
  
  const endpoints = [
    '/slack/commands',
    '/slack/commands-insecure', 
    '/slack/test-slack'
  ];
  
  for (const endpoint of endpoints) {
    console.log(`Testing: https://api.fractionax.io${endpoint}`);
    try {
      const result = await testSlackEndpoint('api.fractionax.io', endpoint);
      console.log(`✅ Status: ${result.statusCode} ${result.statusMessage}`);
      console.log(`📝 Response: ${result.body}\n`);
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
  }
}

main().catch(console.error);
