# FractionaX Slack Admin Integration

## 🎯 Overview

This integration provides comprehensive admin user management features through Slack, aligned with FractionaX's admin requirements for managing internal wallets, user accounts, KYC verification, and security operations.

## 🚀 Features

### ✅ **Support Management**
- Real-time ticket notifications
- Interactive button responses
- Thread-based ticket management
- Daily digest reports
- Urgent ticket alerts

### 🔐 **Admin User Management**
- **Password Reset**: Generate temporary passwords with expiration
- **2FA Management**: Enable/disable two-factor authentication
- **Wallet Management**: Add, suspend, remove, or reactivate wallets
- **Document Verification**: Check KYC documents and contract status
- **Audit Logging**: View user activity history
- **Security Alerts**: Send real-time security notifications

## 🛠️ Setup Instructions

### 1. **Slack App Configuration**
Create a new Slack app with the following scopes:

**Bot Token Scopes:**
```
channels:history     - View public channel messages
channels:read        - View basic public channel info
chat:write          - Send messages as bot
chat:write.public   - Send messages to non-member channels
commands            - Add slash commands
groups:history      - View private channel messages
groups:read         - View basic private channel info
reactions:read      - View emoji reactions
users:read          - View workspace members
users:read.email    - View member email addresses
```

**Additional Recommended Scopes:**
```
im:write            - Send direct messages
files:read          - Read file attachments (for document verification)
team:read           - Workspace-level admin operations
```

### 2. **Environment Variables**
Add to your `.env` file:

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SUPPORT_CHANNEL_ID=C1234567890
SLACK_SIGNING_SECRET=your-signing-secret-here
ADMIN_URL=https://admin.fractionax.io

# Optional Test Configuration
TEST_USER_EMAIL=test@example.com
```

### 3. **Slack App URLs Configuration**

Configure these endpoints in your Slack app:

**Event Subscriptions:** `https://yourdomain.com/api/webhooks/slack`
**Interactive Components:** `https://yourdomain.com/api/webhooks/slack`
**Slash Commands:** `https://yourdomain.com/api/webhooks/slack/slash-commands`

## 📋 Available Slash Commands

### **Support Commands**
- `/support-stats` - View current ticket statistics
- `/create-ticket [email] [subject] - [description]` - Create new support ticket

### **User Management Commands**
- `/user-info [email]` - Get comprehensive user information
- `/reset-password [email]` - Reset user password (generates 24hr temp password)
- `/toggle-2fa [email] [enable|disable]` - Manage two-factor authentication
- `/manage-wallet [email] [action] [address] [reason]` - Manage user wallets
  - Actions: `add`, `suspend`, `remove`, `reactivate`
- `/user-documents [email]` - View KYC documents and verification status
- `/user-audit [email] [limit]` - View user activity audit log
- `/security-alert [email] [type] [details]` - Send security alert notification

### **Help Command**
- `/admin-help` - Display all available commands

## 🏗️ Architecture

### **Core Components**
1. **SlackService** (`services/slackService.js`) - Main service handling all Slack operations
2. **Webhook Handlers** (`routes/webhooks.js`) - HTTP endpoints for Slack events
3. **User Management Methods** - Specialized admin functions

### **Key Features Implementation**

#### **Internal Wallet Management** 🪙
```javascript
// Add wallet to user account
await slackService.manageUserWallet(
  'user@example.com', 
  'add', 
  { address: '0x123...', type: 'internal' }, 
  'admin-user'
);

// Suspend suspicious wallet
await slackService.manageUserWallet(
  'user@example.com', 
  'suspend', 
  { address: '0x123...', reason: 'Suspicious activity detected' }, 
  'admin-user'
);
```

#### **Password & 2FA Management** 🔐
```javascript
// Reset password (24-hour temporary password)
const result = await slackService.resetUserPassword('user@example.com', 'admin-user');

// Toggle 2FA
await slackService.toggle2FA('user@example.com', true, 'admin-user');
```

#### **Document Verification** 📄
```javascript
// Check user documents and KYC status
const docs = await slackService.getUserDocuments('user@example.com');
console.log(docs.verificationStatus);
// { identity: true, documents: true, contracts: false }
```

## 🔄 Workflow Examples

### **User Account Lockout Response**
1. Security system detects suspicious activity
2. Admin receives Slack alert via `/security-alert`
3. Admin runs `/user-info [email]` to check account status
4. Admin runs `/manage-wallet [email] suspend [address]` if needed
5. Admin runs `/reset-password [email]` to secure account
6. All actions are logged in audit trail

### **KYC Verification Process**
1. User submits KYC documents
2. Admin runs `/user-documents [email]` to check status
3. Admin verifies required documents are present
4. Admin can track verification history via `/user-audit [email]`

### **Wallet Management Workflow**
1. User requests wallet connection
2. Admin runs `/user-info [email]` to verify account
3. Admin runs `/manage-wallet [email] add [address]` to authorize
4. System tracks wallet activity
5. If issues arise, admin can suspend via `/manage-wallet [email] suspend [address]`

## 📊 Monitoring & Alerts

### **Automated Notifications**
- 🚨 **Urgent Tickets** - Immediate channel alerts with @channel mention
- 📊 **Daily Digest** - Morning summary of support metrics
- 🔔 **Security Alerts** - Real-time notifications for suspicious activity
- ✅ **Action Confirmations** - Immediate feedback for admin actions

### **Audit Trail**
All admin actions through Slack are logged with:
- Admin user who performed action
- Target user email
- Action type and details
- Timestamp
- Reason/context (where applicable)

## 🧪 Testing

Run the comprehensive test suite:

```bash
node test-slack-integration.js
```

This will test:
- ✅ Slack API connection
- ✅ User lookup functionality
- ✅ Security alert system
- ✅ Daily digest generation
- ✅ Ticket synchronization

## 🚨 Security Considerations

### **Access Control**
- Slash commands verify Slack signature for authenticity
- Admin actions require valid Slack workspace membership
- All sensitive operations are logged and audited

### **Data Protection**
- Temporary passwords are securely hashed
- 2FA secrets are encrypted
- Sensitive information uses Slack's spoiler tags (`||password||`)

### **Rate Limiting**
- Built-in rate limiting for API calls
- Graceful error handling for Slack API limits
- Exponential backoff for failed requests

## 📝 Customization

### **Adding New Commands**
1. Add command handler in `routes/webhooks.js`
2. Add corresponding method in `services/slackService.js`
3. Update help text in `/admin-help` command
4. Add tests in `test-slack-integration.js`

### **Custom Alerts**
Extend the `notifySecurityAlert` method with new alert types:

```javascript
const alertEmojis = {
  'suspicious_login': '🚨',
  'multiple_failed_attempts': '⚠️',
  'unusual_activity': '👀',
  'account_locked': '🔒',
  'wallet_activity': '💰',
  'kyc_issue': '🛡️',
  'your_custom_alert': '🔥'  // Add your custom alerts here
};
```

## 🎯 Integration with Admin Rules

This integration fully supports the admin user management requirements:

✅ **Internal Wallet Management**
- Create and manage internal FCT/FXST token wallets
- Connect/disconnect external wallets
- Suspend and reactivate wallet access

✅ **User Account Administration**
- Reset temporary passwords with expiration
- Clear/reset 2FA for locked accounts
- Manage linked crypto wallets
- Access user identification documents
- Track signed contract status

✅ **Compliance & Security**
- Maintain audit trails for all admin actions
- Ensure required document verification
- Real-time security alert system
- Comprehensive user activity monitoring

## 🔗 Related Files

- `services/slackService.js` - Main Slack service implementation
- `routes/webhooks.js` - Webhook endpoints and slash command handlers
- `utils/slackClient.js` - Legacy Slack client (maintained for compatibility)
- `test-slack-integration.js` - Comprehensive test suite
- `models/User.js` - User model with wallet and KYC fields
- `models/AuditLog.js` - Audit logging for admin actions

---

## 🎉 Conclusion

This Slack integration provides a powerful, secure, and user-friendly interface for FractionaX admin operations. It streamlines user management, wallet administration, and security monitoring while maintaining comprehensive audit trails and real-time notifications.

The integration is production-ready and includes comprehensive testing, error handling, and security features aligned with FractionaX's requirements for managing Fractionax tokens (FCT and FXST) and user accounts.
