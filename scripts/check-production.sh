#!/bin/bash

echo "🔍 Checking Production Server Status..."
echo "========================================="

# Test if server is reachable
echo "1. Testing server connectivity..."
curl -s -o /dev/null -w "%{http_code}" https://api.fractionax.io/ || echo "❌ Server unreachable"

# Check if latest commit is deployed
echo "2. Checking deployed version..."
LATEST_COMMIT=$(git rev-parse --short HEAD)
echo "   Local latest commit: $LATEST_COMMIT"

# Test webhook endpoints
echo "3. Testing webhook endpoints..."
curl -s -o /dev/null -w "Status: %{http_code}\n" https://api.fractionax.io/api/webhooks/test
curl -s -o /dev/null -w "Status: %{http_code}\n" https://api.fractionax.io/slack/test

echo "4. Testing Slack command endpoint..."
curl -X POST https://api.fractionax.io/slack/test-slack \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "command=/test&text=&user_name=test" \
  -w "Status: %{http_code}\n"

echo "========================================="
echo "✅ Production check complete!"
