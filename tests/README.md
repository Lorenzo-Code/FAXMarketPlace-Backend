# 🧪 Tests Directory

This directory contains all test files, examples, and debugging utilities for the FAXMarketPlace Backend.

## 📁 Directory Structure

```
tests/
├── ai/                     # AI & Search functionality tests
├── corelogic/             # CoreLogic API integration tests  
├── examples/              # Example implementations and demos
├── test_endpoints.ps1     # PowerShell endpoint testing script
└── README.md             # This file
```

## 🤖 AI Tests (`/ai/`)

Tests for AI-powered search and property analysis features:

- `test_ai_search_dealfinder.js` - Tests deal finder AI search functionality
- `test_ai_search_suggested.js` - Tests AI suggested search results
- `test_fastcomp_debug.js` - Debug utilities for fast comparison endpoint

**To run AI tests:**
```bash
node tests/ai/test_ai_search_dealfinder.js
node tests/ai/test_ai_search_suggested.js
node tests/ai/test_fastcomp_debug.js
```

## 🏠 CoreLogic Tests (`/corelogic/`)

Tests for CoreLogic API integration and property data services:

- `test_corelogic_auth.js` - Tests CoreLogic authentication
- `test_corelogic_debug.js` - Debug utilities for CoreLogic API calls
- `test_corelogic_direct.js` - Direct CoreLogic API testing
- `test_corelogic_integration.js` - Integration tests for CoreLogic services
- `test_corelogic_no_zip.js` - Tests property lookup without ZIP code
- `test_corelogic_v2.js` - Tests for CoreLogic API v2 client
- `test_super_client.js` - Tests for the comprehensive CoreLogic super client

**To run CoreLogic tests:**
```bash
node tests/corelogic/test_corelogic_auth.js
node tests/corelogic/test_corelogic_v2.js
node tests/corelogic/test_super_client.js
# ... and others
```

## 📋 Examples (`/examples/`)

Example implementations and demos:

- `FastAddressLookup.html` - Complete HTML demo of the fast address lookup feature with UI

**To view examples:**
- Open `FastAddressLookup.html` in a web browser (with server running on localhost:5000)

## 🔧 Endpoint Testing

- `test_endpoints.ps1` - PowerShell script for testing multiple API endpoints

**To run endpoint tests:**
```powershell
.\tests\test_endpoints.ps1
```

## 🚀 Quick Test Commands

### Test Fast Address Lookup:
```bash
# Using the existing fast-comp endpoint
curl -X GET "http://localhost:5000/api/ai/fast-comp?address=1234%20Main%20St&zip=77002&city=Houston&state=TX"
```

### Test Comprehensive Analysis:
```bash
# Using the comprehensive endpoint
curl -X POST http://localhost:5000/api/ai/comprehensive \
  -H "Content-Type: application/json" \
  -d '{"prompt": "1234 Main St, Houston, TX"}'
```

### Test CoreLogic Integration:
```bash
node tests/corelogic/test_corelogic_v2.js
```

## 📊 Performance Testing

The fast address lookup endpoint (`/api/ai/fast-comp`) is optimized for speed:
- **Target Response Time**: < 2 seconds
- **Caching**: Redis-based caching for frequent lookups
- **Parallel Processing**: CoreLogic + Zillow data fetched simultaneously

## 🐛 Debugging

If tests fail, check:
1. **Server Status**: Ensure the backend server is running on port 5000
2. **Environment Variables**: Check that all required API keys are set
3. **Network Connectivity**: Verify external API access (CoreLogic, Zillow, OpenAI)
4. **Redis Connection**: Ensure Redis is running and accessible

## 📝 Adding New Tests

When adding new tests:
1. Place them in the appropriate subdirectory (`/ai/`, `/corelogic/`, etc.)
2. Follow the naming convention: `test_[feature]_[description].js`
3. Include error handling and descriptive console output
4. Update this README with documentation

## 🔗 Related Documentation

- [Fast Address Pipeline Documentation](../docs/Fast-Address-Pipeline.md)
- [CoreLogic API Integration Guide](../docs/)
- [Main Project README](../README.md)
