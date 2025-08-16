# FractionaX Daily Workflow Slack Integration

## 🎯 Overview

This system provides seamless integration between your backend, Slack, and admin panel to automate all the daily workflows you described. It handles everything from morning KPI summaries to end-of-day reports, support ticket management, ops incidents, KYC reviews, and more.

## 📋 Daily Workflow Examples Covered

✅ **Morning: Daily Kickoff**
- 9:00 AM – Backend posts Daily KPI Summary to #exec in Slack
- DAU, Searches, Open tickets, CSAT, SLA breach data

✅ **Support Workflow** 
- New ticket → Help Scout → Backend → Slack thread in #support-inbox
- Support Lead reacts ✅ → Backend marks "Assigned" in Admin
- Replies sync between Slack ↔ Help Scout ↔ Customer
- Close Ticket button in Slack → Backend updates all systems

✅ **Ops Incident Management**
- Cloudflare WAF triggers → Backend → Slack post in #ops
- DevOps reacts ✅ → Backend logs assignment
- `/ops close incident-2025-001` → Backend closes incident, logs MTTR

✅ **KYC/Compliance**
- Sumsub flags KYC → Backend → Slack post in #audit
- Compliance Officer clicks Approve → Backend updates KYC + sends email

✅ **Community & Feedback**
- User feedback → Backend → Slack post in #product-feedback
- Product Manager clicks Create Feature Request button

✅ **End-of-Day Ops**
- Stripe dispute → Backend → Slack post in #approvals
- Finance clicks Approve Refund → Backend processes refund + emails customer
- Daily ticket close-out review with summary screenshots

## 🚀 Setup Instructions

### 1. Install Dependencies

First, install the required node-cron dependency:

```bash
npm install node-cron
```

### 2. Environment Variables

Add these to your `.env` file:

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SUPPORT_CHANNEL_ID=C1234567890
SLACK_EXEC_CHANNEL_ID=C1234567891
SLACK_OPS_CHANNEL_ID=C1234567892
SLACK_AUDIT_CHANNEL_ID=C1234567893
SLACK_PRODUCT_CHANNEL_ID=C1234567894
SLACK_APPROVALS_CHANNEL_ID=C1234567895
SLACK_SIGNING_SECRET=your-signing-secret-here

# Admin Panel URL
ADMIN_URL=https://admin.fractionax.io

# Timezone for scheduled tasks
TIMEZONE=America/New_York

# Help Scout Integration
HELPSCOUT_WEBHOOK_SECRET=your-helpscout-secret

# Sumsub Integration  
SUMSUB_APP_TOKEN=your-sumsub-token
SUMSUB_SECRET_KEY=your-sumsub-secret
```

### 3. Slack App Configuration

Create a new Slack app with these scopes:

**Bot Token Scopes:**
- `channels:history` - View public channel messages
- `channels:read` - View basic public channel info
- `chat:write` - Send messages as bot
- `chat:write.public` - Send messages to non-member channels
- `commands` - Add slash commands
- `users:read` - View workspace members
- `reactions:read` - View emoji reactions
- `im:write` - Send direct messages

**Slash Commands to Create:**
- `/kpi` - Daily KPI operations
- `/ops` - Operations and incident management
- `/incident` - Incident management
- `/user` - User management
- `/system` - System operations
- `/wallet` - Wallet management  
- `/security` - Security operations
- `/support` - Support ticket management
- `/compliance` - KYC & compliance
- `/alerts` - Alert management
- `/analytics` - Reports & analytics

**Event Subscriptions:**
Set your request URL to: `https://yourdomain.com/slack/interactivity`

### 4. Webhook URLs

Configure these endpoints in your integrations:

**Slack App Settings:**
- **Event Subscriptions:** `https://yourdomain.com/slack/interactivity`
- **Interactive Components:** `https://yourdomain.com/slack/interactivity`
- **Slash Commands:** `https://yourdomain.com/slack/commands`

**Help Scout:**
- **Webhook URL:** `https://yourdomain.com/api/webhooks/helpscout`

**Sumsub:**
- **Webhook URL:** `https://yourdomain.com/api/kyc/webhook`

**Stripe:**
- **Webhook URL:** `https://yourdomain.com/api/webhooks/stripe`

## 📱 Available Slash Commands

### Daily Workflow Commands

```bash
# KPI Operations
/kpi summary          # Send daily KPI summary to #exec
/kpi now             # Show current KPI snapshot

# Operations Management
/ops alert Cloudflare WAF_Spike High traffic detected
/ops summary         # Send daily operations summary
/ops health          # System health overview

# Incident Management  
/incident close incident-123456 Fixed WAF rules
/incident list       # List active incidents
```

### Complete Command List

```bash
# User Management
/user info john@example.com
/user lock user@example.com Suspicious activity
/user stats

# System Operations
/system status       # Complete system health check
/system sync        # Sync external data sources

# Wallet Management
/wallet activity user@example.com 30
/wallet pending     # Show pending withdrawals

# Security Operations
/security lock user@example.com Suspicious activity
/security alerts    # Security alert dashboard

# Support Management
/support stats      # Support statistics
/support list open  # List open tickets

# Compliance & KYC
/compliance status user@example.com
/compliance pending # List pending KYC reviews

# Analytics & Reports
/analytics daily    # Daily operations report
/analytics users    # User growth metrics
```

## 🔄 Automated Schedules

The system automatically runs these tasks:

**Daily Schedules:**
- **9:00 AM** - Morning KPI Summary to #exec
- **4:30 PM** - End-of-day summary to #exec  
- **12:00 AM** - Cleanup old logs and sessions

**Weekly Schedules:**
- **Monday 8:00 AM** - Weekly digest report

**Hourly Schedules:**
- **9 AM - 6 PM** - System health checks (business hours only)

## 🛠️ Workflow Examples

### 1. Morning Kickoff (Automated)

```
🌅 9:00 AM - Automated KPI Summary
┌─ Calculate DAU, searches, tickets, CSAT, SLA breaches
├─ Format data into Slack blocks
└─ Post to #exec channel
```

Manual trigger: `/kpi summary`

### 2. Support Ticket Workflow

```
📧 New Help Scout ticket received
├─ Create ticket in database
├─ Post to #support-inbox Slack channel with action buttons
├─ Support agent reacts ✅ → Auto-assign in admin
├─ Replies sync between Slack ↔ Help Scout ↔ Customer
└─ Close button in Slack → Update all systems + archive thread
```

### 3. Ops Incident Management

```
🚨 Cloudflare WAF alert triggered  
├─ Backend receives alert via webhook/monitoring
├─ Post incident to #ops channel with buttons
├─ DevOps reacts ✅ → Backend logs assignment
├─ Investigation and resolution happen
└─ /ops close incident-123456 Resolution text → Log MTTR
```

Manual trigger: `/ops alert Cloudflare WAF_Spike High traffic detected`

### 4. KYC Approval Process

```
🛡️ Sumsub flags KYC for manual review
├─ Backend receives webhook from Sumsub  
├─ Post to #audit channel with user details
├─ Compliance Officer clicks Approve button
├─ Backend updates KYC status in database
└─ Send approval email to customer
```

### 5. Product Feedback Processing

```
💡 User submits feedback via marketplace form
├─ Backend receives form submission
├─ Post to #product-feedback with feedback content
├─ Product Manager clicks "Create Feature Request"
└─ Backend logs in Admin Community Page for roadmap
```

### 6. Financial Dispute Management

```
💳 Stripe dispute notification received
├─ Backend receives webhook from Stripe
├─ Post to #approvals with dispute details  
├─ Finance clicks "Approve Refund" button
├─ Backend triggers refund in Stripe
├─ Update Admin Billing Page
└─ Send confirmation email to customer
```

## 🔧 Custom Configuration

### Adding New Channels

To add support for additional Slack channels, update the `dailyWorkflowService.js`:

```javascript
this.channels = {
  exec: process.env.SLACK_EXEC_CHANNEL_ID,
  support: process.env.SLACK_SUPPORT_CHANNEL_ID,
  ops: process.env.SLACK_OPS_CHANNEL_ID,
  audit: process.env.SLACK_AUDIT_CHANNEL_ID,
  productFeedback: process.env.SLACK_PRODUCT_CHANNEL_ID,
  approvals: process.env.SLACK_APPROVALS_CHANNEL_ID,
  yourNewChannel: process.env.SLACK_YOUR_NEW_CHANNEL_ID  // Add here
};
```

### Modifying Scheduled Times

Edit `scheduledTaskService.js` to change when automated tasks run:

```javascript
// Change from 9:00 AM to 8:30 AM
this.tasks.set('morning-kpi', cron.schedule('30 8 * * *', async () => {
  await dailyWorkflowService.sendDailyKPISummary();
}));
```

### Adding New Slash Commands

1. Add the command to your Slack app configuration
2. Add a new case in `webhooks.js`:

```javascript
case '/yournewcommand':
  return await handleYourNewCommands(res, subcommand, args, { user_name, user_id });
```

3. Implement the handler function

## 🧪 Testing

### Test Slack Integration

```bash
# Test basic connectivity
curl -X POST http://localhost:5000/slack/test-slack \
  -d "command=/test&text=&user_name=testuser"

# Test specific command
curl -X POST http://localhost:5000/slack/commands-insecure \
  -d "command=/kpi&text=summary&user_name=admin"
```

### Manual Triggers

Use these for testing without waiting for scheduled times:

```bash
# In your backend console or API endpoint
const scheduledTaskService = require('./services/scheduledTaskService');
await scheduledTaskService.triggerMorningKPI();
await scheduledTaskService.triggerEODSummary(); 
await scheduledTaskService.triggerHealthCheck();
```

## 🚨 Troubleshooting

### Common Issues

**1. Slack Commands Not Working**
- Check `SLACK_SIGNING_SECRET` is set correctly
- Verify webhook URLs in Slack app match your server
- Check server logs for signature verification errors

**2. Automated Tasks Not Running**
- Verify `node-cron` is installed: `npm install node-cron`
- Check server timezone: `console.log(new Date().toLocaleString())`
- Look for cron service startup message in logs

**3. Channel Messages Not Appearing**  
- Ensure bot is added to target channels
- Verify channel IDs in environment variables
- Check bot has `chat:write` permission

**4. Button Interactions Not Working**
- Confirm Interactive Components URL is set
- Check `/slack/interactivity` endpoint is accessible
- Verify payload parsing in webhook handler

### Debug Commands

```bash
# Check scheduled task status
curl http://localhost:5000/api/admin/scheduled-tasks/status

# View system health
curl http://localhost:5000/api/security/health

# Test webhook endpoints
curl http://localhost:5000/api/webhooks/test
```

## 🔐 Security Features

- **Signature Verification**: All Slack requests are cryptographically verified
- **Rate Limiting**: Protection against API abuse  
- **Audit Logging**: All admin actions are logged with timestamps
- **IP Monitoring**: Suspicious activity detection and blocking
- **Secure Secrets**: Sensitive data uses Slack's spoiler formatting

## 📊 Monitoring

The system provides comprehensive monitoring:

- **Real-time Dashboards**: WebSocket updates to admin panel
- **Automated Alerts**: System health checks every hour
- **Audit Trails**: Complete action logging for compliance
- **Performance Metrics**: Response times, success rates, error tracking

## 🎉 Benefits

✅ **No Duplicate Work**: Actions in Slack instantly reflect in Admin
✅ **Fast Decision Making**: All context in one Slack message  
✅ **Automated Workflows**: Morning reports, health checks, cleanup
✅ **Audit Compliance**: Every action logged and traceable
✅ **Team Visibility**: Everyone sees the same real-time data
✅ **Mobile Ready**: Full Slack mobile app support

Your backend is now the central traffic controller, ensuring all data stays synced between Slack, Admin, Help Scout, Stripe, and other systems while providing the fast, action-oriented workflow you described!
