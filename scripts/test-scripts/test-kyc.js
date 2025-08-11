require('dotenv').config();
const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:5000';
const TEST_USER_EMAIL = 'test@fractionax.com';
const TEST_USER_PASSWORD = 'TestPassword123!';

let authToken = null;
let userId = null;

// Test functions
async function runKYCTests() {
  console.log('🧪 Starting KYC Integration Tests...\n');
  
  try {
    // Step 1: Login/Register test user
    await loginTestUser();
    
    // Step 2: Test KYC initialization
    await testKYCInitialization();
    
    // Step 3: Test KYC status check
    await testKYCStatus();
    
    // Step 4: Test access token generation
    await testAccessTokenGeneration();
    
    console.log('\n✅ All KYC tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

async function loginTestUser() {
  console.log('🔐 Step 1: Authenticating test user...');
  
  try {
    // Try to register first (in case user doesn't exist)
    const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, {
      firstName: 'Test',
      lastName: 'User',
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      phone: '+1234567890',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'CA',
        zipCode: '12345',
        country: 'USA'
      }
    });
    console.log('✅ Test user registered');
  } catch (error) {
    if (error.response?.status !== 400) {
      throw error;
    }
    console.log('ℹ️ Test user already exists, proceeding with login...');
  }
  
  // Login
  const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD
  });
  
  authToken = loginResponse.data.token;
  userId = loginResponse.data.user.id;
  
  console.log('✅ Successfully authenticated');
  console.log('   Token:', authToken.substring(0, 20) + '...');
  console.log('   User ID:', userId);
}

async function testKYCInitialization() {
  console.log('\n🎯 Step 2: Testing KYC initialization...');
  
  const response = await axios.post(`${BASE_URL}/api/kyc/initialize`, {}, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  console.log('✅ KYC initialization successful');
  console.log('   Applicant ID:', response.data.data.applicantId);
  console.log('   Access Token:', response.data.data.accessToken.substring(0, 30) + '...');
  console.log('   Status:', response.data.data.status);
  
  // Store for next tests
  global.testApplicantId = response.data.data.applicantId;
  global.testAccessToken = response.data.data.accessToken;
}

async function testKYCStatus() {
  console.log('\n📊 Step 3: Testing KYC status check...');
  
  const response = await axios.get(`${BASE_URL}/api/kyc/status`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  console.log('✅ KYC status retrieved');
  console.log('   Status:', response.data.status);
  console.log('   Applicant ID:', response.data.applicantId);
  console.log('   Submitted At:', response.data.submittedAt);
  
  if (response.data.sumsubStatus) {
    console.log('   Sumsub Status:', response.data.sumsubStatus.reviewStatus);
  }
}

async function testAccessTokenGeneration() {
  console.log('\n🔑 Step 4: Testing access token generation...');
  
  const response = await axios.post(`${BASE_URL}/api/kyc/access-token`, {}, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  console.log('✅ New access token generated');
  console.log('   Token:', response.data.accessToken.substring(0, 30) + '...');
  console.log('   Expires At:', response.data.expiresAt);
}

// Additional utility tests
async function testSumsubService() {
  console.log('\n🔧 Testing Sumsub service directly...');
  
  const sumsubService = require('./services/sumsubService');
  
  try {
    // Test environment variables
    console.log('Environment check:');
    console.log('   API Token:', process.env.SUMSUB_API_TOKEN ? '✅ Set' : '❌ Missing');
    console.log('   Secret Key:', process.env.SUMSUB_SECRET_KEY ? '✅ Set' : '❌ Missing');
    console.log('   Base URL:', process.env.SUMSUB_BASE_URL || 'Using default');
    
    // Test signature generation
    const signature = sumsubService.generateSignature('GET', '/test', 1234567890, '');
    console.log('   Signature generation: ✅ Working');
    
  } catch (error) {
    console.error('❌ Sumsub service test failed:', error.message);
  }
}

// Run tests
if (require.main === module) {
  runKYCTests().catch(console.error);
}

module.exports = {
  runKYCTests,
  testSumsubService
};
