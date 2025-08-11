# Manual Deployment Options

## Option 1: Trigger GitHub Actions
1. Go to: https://github.com/Lorenzo-Code/FractionaX-Backend/actions
2. Find "Deploy to Droplet" workflow
3. Click "Run workflow" → "Run workflow"

## Option 2: SSH Directly to Server
```bash
ssh root@your-droplet-ip
cd /root/FAXMarketPlace-Backend
git pull origin main
docker stop fax-api || true
docker rm fax-api || true
docker build -t fax-backend .
docker run -d --env-file .env -p 8000:8000 --name fax-api fax-backend
```

## Option 3: Create Empty Commit to Trigger Deployment
```bash
git commit --allow-empty -m "Trigger deployment"
git push origin main
```

## Option 4: Check Current Production Status
1. **Slack Test**: Try `/admin-help` in Slack
2. **Endpoint Test**: https://api.fractionax.io/api/webhooks/test
3. **Docker Logs**: `docker logs fax-api` (on server)

## Verification Checklist
- [ ] GitHub Actions shows green checkmarks
- [ ] Latest commit hash matches production
- [ ] Slack commands work without "dispatch_failed"
- [ ] Webhook endpoints respond correctly
- [ ] Docker container is running latest image
