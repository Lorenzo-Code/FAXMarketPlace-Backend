# 🔐 Slack Security Configuration Guide

## 🚀 Quick Setup (Production Ready)

### 1. Get Your Slack Signing Secret

1. Go to [Your Slack Apps](https://api.slack.com/apps)
2. Select "FractionaX Ops Bot"
3. Go to **Settings** → **Basic Information**
4. Scroll down to **App Credentials**
5. Copy the **Signing Secret** (starts with a hex string)

### 2. Add to Production Environment

Add this to your production server's `.env` file:
```env
SLACK_SIGNING_SECRET=your_signing_secret_here
```

### 3. Restart Your Production Server

After adding the secret, restart your Docker container:
```bash
ssh root@your-droplet-ip
cd /root/FAXMarketPlace-Backend
docker restart fax-api
```

## 🛡️ Security Features Enabled

### ✅ Signature Verification
- **HMAC-SHA256** signature validation
- **Timestamp verification** (5-minute window)
- **Timing-safe comparison** (prevents timing attacks)
- **Raw body reconstruction** for proper signature validation

### ✅ Development Mode Fallback
- If `SLACK_SIGNING_SECRET` is not set, commands still work (development only)
- Production mode automatically enables full security when secret is present

### ✅ Multiple Security Levels

| Endpoint | Security Level | Use Case |
|----------|---------------|----------|
| `/slack/commands` | 🔐 **SECURE** | Production (signature verified) |
| `/slack/slash-commands` | 🔐 **SECURE** | Production (signature verified) |
| `/slack/commands-insecure` | ⚠️ **INSECURE** | Emergency fallback only |
| `/slack/test-slack` | ⚠️ **INSECURE** | Testing/debugging only |

## 🔧 Configuration Steps

### Step 1: Update Environment Variables

Your production `.env` should include:
```env
# Slack Configuration
SLACK_SIGNING_SECRET=your_hex_signing_secret
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SUPPORT_CHANNEL_ID=C1234567890

# Optional: Additional Security
NODE_ENV=production
```

### Step 2: Update Slack App Manifest

Ensure all commands point to secure endpoints:
```json
{
  "command": "/admin-help",
  "url": "https://api.fractionax.io/slack/commands",
  "description": "Show all available admin commands"
}
```

### Step 3: Test Security

1. **Test with valid secret**: Commands should work normally
2. **Test without secret**: Should show development warning
3. **Test with invalid secret**: Should return 401 Unauthorized

## 🚨 Security Monitoring

### What Gets Logged

```
✅ Slack webhook signature verified successfully
⚠️ SLACK_SIGNING_SECRET not set - skipping signature verification (DEVELOPMENT ONLY)
❌ Slack webhook: Invalid signature
❌ Slack webhook: Request too old (325s ago)
❌ Slack webhook: Missing signature or timestamp
```

### Monitoring Commands

Check logs for security events:
```bash
# On your production server
docker logs fax-api | grep "Slack webhook"
```

## 🔄 Migration Plan

### Phase 1: Deploy Secure Code ✅
- [x] Enhanced signature verification implemented
- [x] Raw body capture working
- [x] Secure endpoints ready

### Phase 2: Add Signing Secret (Do This Now)
```bash
# 1. SSH to production server
ssh root@your-droplet-ip

# 2. Edit environment file
nano /root/FAXMarketPlace-Backend/.env

# 3. Add this line:
SLACK_SIGNING_SECRET=your_actual_secret_here

# 4. Restart container
docker restart fax-api

# 5. Test commands
# Commands should work with security enabled
```

### Phase 3: Verify Security
- [ ] Commands work with signature verification
- [ ] Logs show "signature verified successfully"
- [ ] Invalid requests get rejected with 401

## 🚨 Emergency Procedures

### If Secure Endpoints Fail

1. **Quick Fallback**: Change Slack app URLs to `/slack/commands-insecure`
2. **Check Logs**: `docker logs fax-api | tail -50`
3. **Verify Secret**: Ensure signing secret is correctly set
4. **Test Manually**: Use `/slack/test-slack` for debugging

### Security Incident Response

If unauthorized access suspected:
1. **Immediately** change Slack app signing secret
2. Update `.env` with new secret
3. Restart production server
4. Review logs for suspicious activity
5. Notify team of security incident

## 📊 Health Check Commands

Test your security setup:

```bash
# Check if signing secret is set
echo $SLACK_SIGNING_SECRET | head -c 10

# Check container environment
docker exec fax-api env | grep SLACK

# Test endpoint connectivity
curl -X POST https://api.fractionax.io/slack/test-slack \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "command=/test&user_name=security-test"
```

## 🎯 Success Criteria

Your setup is secure when:
- [x] ✅ All commands work normally
- [x] 🔐 Signature verification is enabled
- [x] 📝 Security events are logged
- [x] ⚠️ Invalid requests are rejected
- [x] 🚨 Emergency fallbacks exist

---

**Next Step**: Add your Slack signing secret to production environment and restart the server!
