#!/bin/bash

# Force deployment script for FractionaX Backend
# This script ensures the latest code is pulled and deployed

echo "🚀 Starting manual deployment..."

# Navigate to the existing FAXMarketPlace-Backend directory on DigitalOcean
cd /root/FAXMarketPlace-Backend
echo "📁 Using existing FAXMarketPlace-Backend directory on DigitalOcean"

# Show current remote URL
echo "🔗 Current remote URL: $(git remote get-url origin)"

# Update remote URL to the new repository location
git remote set-url origin https://github.com/Lorenzo-Code/FractionaX-Backend.git
echo "✅ Updated remote URL to: $(git remote get-url origin)"

echo "📦 Current directory: $(pwd)"
echo "🔍 Current branch: $(git branch --show-current)"

# Fetch latest changes
echo "⬇️ Fetching latest changes..."
git fetch origin main

# Show current commit
echo "📝 Current commit: $(git rev-parse HEAD)"
echo "📝 Remote commit: $(git rev-parse origin/main)"

# Hard reset to ensure we get the latest code (in case of conflicts)
echo "🔄 Hard reset to latest main branch..."
git reset --hard origin/main

# Show the latest commit after reset
echo "✅ Updated to commit: $(git rev-parse HEAD)"
echo "📋 Latest commit message: $(git log -1 --pretty=format:'%s')"

# Stop all existing containers
echo "🛑 Stopping existing containers..."
docker ps -q --filter "publish=8000" | xargs -r docker stop
docker ps -aq --filter "publish=8000" | xargs -r docker rm

# Also stop by container name
docker rm -f fax-api || true

# Clean up old images and containers
echo "🧹 Cleaning up old Docker images..."
docker image prune -f
docker container prune -f

# Build new image with no cache to ensure fresh build
echo "🔨 Building fresh Docker image..."
docker build --no-cache -t fax-backend .

# Run new container
echo "🚀 Starting new container..."
docker run -d --env-file .env -p 8000:8000 --name fax-api fax-backend

# Wait for container to start
sleep 10

# Check container status
echo "📊 Container status:"
docker ps | grep fax-api

# Check container logs
echo "📋 Container logs (last 20 lines):"
docker logs --tail 20 fax-api

echo "✅ Manual deployment complete!"
echo "🌍 API should be available at: https://api.fractionax.io"
