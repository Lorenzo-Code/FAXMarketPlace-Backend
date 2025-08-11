# Test Scripts 🧪

Development and testing utilities for various system components.

## 🚀 Available Test Scripts

### **1. Slack Integration Tests**

Test Slack integration and webhook functionality.

**Files:**
- `test-slack-integration.js` - Full Slack integration testing
- `test-local-slack.js` - Local Slack webhook testing

**Usage:**
```bash
# Test full Slack integration
node scripts/test-scripts/test-slack-integration.js

# Test local Slack webhooks
node scripts/test-scripts/test-local-slack.js
```

**What they test:**
- ✅ Slack webhook endpoints
- ✅ Signature verification
- ✅ Command parsing
- ✅ Response formatting
- ✅ Error handling

### **2. KYC System Test**

Test Know Your Customer (KYC) verification system.

**File:** `test-kyc.js`

**Usage:**
```bash
node scripts/test-scripts/test-kyc.js
```

**What it tests:**
- ✅ KYC document upload
- ✅ Verification workflow
- ✅ Status updates
- ✅ Database integration

### **3. Redis Connection Test**

Test Redis caching and connection.

**File:** `testRedis.js`

**Usage:**
```bash
node scripts/test-scripts/testRedis.js
```

**What it tests:**
- ✅ Redis connection
- ✅ Cache set/get operations
- ✅ Performance metrics
- ✅ Error handling

## 🔧 Test Categories

### **Unit Tests**
Located in `tests/` directory:
- **AI Search Tests** - Deal finder and suggestion algorithms
- **CoreLogic Tests** - Property data API integration
- **Endpoint Tests** - API route testing

### **Integration Tests**
Test complete workflows:
- User registration and verification
- Property search and caching
- Payment and wallet operations
- Admin operations via Slack

### **Performance Tests**
- Redis caching performance
- API response times
- Database query optimization
- Memory usage monitoring

## 🛠️ Running Tests

### **Individual Scripts**
```bash
# Run specific test script
node scripts/test-scripts/[script-name].js

# Examples:
node scripts/test-scripts/test-kyc.js
node scripts/test-scripts/testRedis.js
```

### **Test Suites**
```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:performance
```

### **Development Testing**
```bash
# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

## 🔍 Test Configuration

### **Environment Variables**
Ensure these are set in your `.env` file:

```env
# Test Database
MONGO_URI_TEST=mongodb://localhost:27017/fractionax_test

# Redis Test
REDIS_URL_TEST=redis://localhost:6379/1

# Slack Test
SLACK_WEBHOOK_TEST_URL=http://localhost:5000/slack/commands-insecure

# API Test
API_BASE_URL=http://localhost:5000/api
```

### **Test Data**
Test scripts use mock data and test databases:
- Separate test MongoDB database
- Redis test namespace
- Mock external API responses
- Test user accounts

## 📊 Test Output Examples

### **Successful Redis Test:**
```
🧪 Testing Redis Connection...
✅ Redis connected successfully
✅ Set test key: redis:test:12345
✅ Retrieved value: test-value-12345
✅ Cache performance: 2ms
✅ Redis disconnected
🎉 All Redis tests passed!
```

### **Slack Integration Test:**
```
🧪 Testing Slack Integration...
✅ Webhook endpoint responding
✅ Signature verification working
✅ Command parsing: /admin -> help
✅ Response format: Valid JSON blocks
✅ Error handling: Unknown commands handled
🎉 Slack integration tests completed!
```

### **KYC Test Results:**
```
🧪 Testing KYC System...
✅ Document upload simulation
✅ Status update: pending -> approved
✅ Database record created
✅ Notification sent
🎉 KYC workflow test passed!
```

## 🚨 Troubleshooting Tests

### **Common Issues:**

1. **MongoDB Connection Failed**
   ```
   Solution: Check MongoDB service is running
   Check MONGO_URI_TEST environment variable
   ```

2. **Redis Connection Failed**
   ```
   Solution: Start Redis server
   Verify REDIS_URL_TEST configuration
   ```

3. **Slack Tests Failing**
   ```
   Solution: Check if local server is running on port 5000
   Verify webhook endpoints are accessible
   ```

4. **API Tests Timing Out**
   ```
   Solution: Increase test timeout values
   Check server performance and load
   ```

### **Debug Mode**
Run tests with debug information:

```bash
# Enable debug logging
DEBUG=test:* node scripts/test-scripts/test-slack-integration.js

# Verbose output
NODE_ENV=test VERBOSE=true npm test
```

## 🔐 Test Security

### **Test Isolation**
- Tests use separate databases
- No production data access
- Mock external services
- Isolated environment variables

### **Data Cleanup**
Tests automatically clean up:
- Test user accounts
- Cache entries
- File uploads
- Database records

### **Sensitive Data**
- No real API keys in tests
- Mock authentication tokens
- Fake user data only
- No external service calls

## 📈 Test Metrics

### **Performance Benchmarks**
- Redis operations: < 5ms
- API responses: < 500ms
- Database queries: < 100ms
- Slack webhook: < 1s

### **Coverage Goals**
- Unit tests: > 80%
- Integration tests: > 70%
- Critical paths: 100%
- Error handling: 100%

---

**🧪 Keep testing to keep quality high!** 

Run tests frequently during development and always before deployments.
