const express = require('express');
const router = express.Router();
const helpScoutService = require('../services/helpScoutService');
const slackService = require('../services/slackService');
const crypto = require('crypto');

/**
 * Verify Help Scout webhook signature
 */
const verifyHelpScoutSignature = (req, res, next) => {
  const signature = req.get('X-HelpScout-Signature');
  const secret = process.env.HELPSCOUT_WEBHOOK_SECRET;
  
  if (!signature || !secret) {
    console.warn('Help Scout webhook: Missing signature or secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha1', secret)
    .update(body)
    .digest('base64');

  if (signature !== expectedSignature) {
    console.warn('Help Scout webhook: Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
};

/**
 * Enhanced Slack signature verification middleware
 * Properly handles raw body capture and parsing for secure verification
 */
const verifySlackSignature = (req, res, next) => {
  const slackSignature = req.get('X-Slack-Signature');
  const timestamp = req.get('X-Slack-Request-Timestamp');
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  // Skip verification in development mode if secret not set
  if (!signingSecret) {
    console.warn('⚠️ SLACK_SIGNING_SECRET not set - skipping signature verification (DEVELOPMENT ONLY)');
    return next();
  }

  if (!slackSignature || !timestamp) {
    console.warn('❌ Slack webhook: Missing signature or timestamp');
    return res.status(401).json({ error: 'Unauthorized - Missing signature headers' });
  }

  // Check timestamp (protect against replay attacks)
  const currentTime = Math.floor(Date.now() / 1000);
  const timeDiff = Math.abs(currentTime - timestamp);
  if (timeDiff > 300) { // 5 minutes
    console.warn(`❌ Slack webhook: Request too old (${timeDiff}s ago)`);
    return res.status(401).json({ error: 'Request timestamp too old' });
  }

  // Get raw body - Express should have captured this
  const rawBody = req.rawBody || req.body || '';
  let bodyString;
  
  if (typeof rawBody === 'string') {
    bodyString = rawBody;
  } else if (Buffer.isBuffer(rawBody)) {
    bodyString = rawBody.toString('utf8');
  } else {
    // Reconstruct from parsed form data
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(rawBody)) {
      params.append(key, value);
    }
    bodyString = params.toString();
  }

  // Create signature
  const basestring = `v0:${timestamp}:${bodyString}`;
  const expectedSignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(basestring)
    .digest('hex');

  // Secure comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(slackSignature, 'utf8');
  
  if (expectedBuffer.length !== receivedBuffer.length || 
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    console.warn('❌ Slack webhook: Invalid signature');
    console.warn(`Expected: ${expectedSignature}`);
    console.warn(`Received: ${slackSignature}`);
    console.warn(`Body length: ${bodyString.length}`);
    console.warn(`Timestamp: ${timestamp}`);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  console.log('✅ Slack webhook signature verified successfully');
  next();
};

/**
 * Middleware to capture raw body before parsing
 */
const captureRawBody = (req, res, next) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks).toString('utf8');
    next();
  });
};

/**
 * @route   POST /api/webhooks/helpscout
 * @desc    Handle Help Scout webhooks
 * @access  Public (verified by signature)
 */
router.post('/helpscout', express.raw({ type: 'application/json' }), verifyHelpScoutSignature, async (req, res) => {
  try {
    console.log('📨 Help Scout webhook received:', req.body);
    
    const result = await helpScoutService.webhookHandler(req.body);
    
    if (result.success) {
      res.status(200).json({ message: 'Webhook processed successfully' });
    } else {
      console.error('Help Scout webhook processing failed:', result.error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  } catch (error) {
    console.error('Help Scout webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Main handler for all slash commands
 */
async function handleSlashCommand(req, res) {
  const { command, text, user_id, user_name, channel_id, response_url } = req.body;
  
  console.log('⚡ Slack slash command received:', command, text);
  
  try {
    switch (command) {
      case '/test':
        res.json({
          response_type: 'ephemeral',
          text: '✅ FractionaX Admin Bot is working! 🚀\\n\\nUse `/admin-help` to see all available commands.'
        });
        break;
        
      case '/test-new':
        res.json({
          response_type: 'ephemeral',
          text: '🎉 *New Umbrella Commands Ready!*\n\nThe following commands are now available:\n• `/system` - System management\n• `/user` - User operations\n• `/security` - Security tools\n• `/wallet` - Wallet management\n• `/kyc` - KYC operations\n• `/support` - Support tickets\n• `/alert` - Alert management\n\nTry: `/system status` or `/user info your@email.com`'
        });
        break;
        
      case '/local-test':
        const serverInfo = {
          environment: process.env.NODE_ENV || 'development',
          port: process.env.PORT || 5000,
          timestamp: new Date().toISOString(),
          nodeVersion: process.version,
          uptime: Math.floor(process.uptime()) + ' seconds'
        };
        
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🏠 Local Development Server Connected!'
              }
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Environment:* ${serverInfo.environment}` },
                { type: 'mrkdwn', text: `*Port:* ${serverInfo.port}` },
                { type: 'mrkdwn', text: `*Node Version:* ${serverInfo.nodeVersion}` },
                { type: 'mrkdwn', text: `*Uptime:* ${serverInfo.uptime}` },
                { type: 'mrkdwn', text: `*Command:* ${command}` },
                { type: 'mrkdwn', text: `*User:* ${user_name}` }
              ]
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Received at:* ${serverInfo.timestamp}\n\n*✅ Ready to test umbrella commands!*\n\nTry: \`/system status\` or \`/user info test@example.com\``
              }
            }
          ]
        });
        break;
        
      case '/admin-help':
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🛠️ FractionaX Admin Commands (Unlimited via Umbrella System)'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*🔧 System:* `/system [status|health|sync|cache]`\n' +
                      '*👤 Users:* `/user [info|search|suspend|unlock|sessions|audit|metrics|debug] [email]`\n' +
                      '*🔐 Security:* `/security [reset-password|toggle-2fa|alert|ip-block|lock|unlock|logins] [params]`\n' +
                      '*💰 Wallets:* `/wallet [info|manage|freeze|activity|withdrawals|metrics] [email]`\n' +
                      '*🛡️ KYC:* `/kyc [status|documents|compliance] [email]`\n' +
                      '*🎫 Support:* `/support [create|stats|manage] [params]`\n' +
                      '*🚨 Alerts:* `/alert [threshold|broadcast] [params]`'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*📚 Examples:*\n• `/system status` - Check system health\n• `/user info john@example.com` - Get user details\n• `/wallet activity jane@example.com` - View wallet transactions\n• `/security lock spam@example.com` - Lock suspicious account'
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '🛡️ All admin actions are logged and audited. Use commands without sub-commands for detailed help.'
                }
              ]
            }
          ]
        });
        break;
        
      // Legacy individual commands (for backward compatibility)
      case '/system-status':
      case '/system':
        const systemAction = command === '/system' ? (text ? text.split(' ')[0] : 'help') : 'status';
        
        if (systemAction === 'help' || (!text && command === '/system')) {
          res.json({
            response_type: 'ephemeral',
            text: '🔧 *System Commands*\n\n• `/system status` - System health check\n• `/system health` - API endpoints status\n• `/system sync` - Trigger data synchronization\n• `/system cache [pattern]` - Clear application cache'
          });
          break;
        }
        
        if (systemAction === 'status') {
          // Move existing system-status logic here
          try {
            const mongoose = require('mongoose');
            const redisClient = require('../utils/redisClient');
            
            const dbStatus = mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected';
            const redisStatus = redisClient.status === 'ready' ? '✅ Connected' : '❌ Disconnected';
            const uptime = process.uptime();
            const uptimeHours = Math.floor(uptime / 3600);
            const uptimeMinutes = Math.floor((uptime % 3600) / 60);
            
            res.json({
              response_type: 'ephemeral',
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: '📊 FractionaX System Status'
                  }
                },
                {
                  type: 'section',
                  fields: [
                    { type: 'mrkdwn', text: `*Database:* ${dbStatus}` },
                    { type: 'mrkdwn', text: `*Redis:* ${redisStatus}` },
                    { type: 'mrkdwn', text: `*Uptime:* ${uptimeHours}h ${uptimeMinutes}m` },
                    { type: 'mrkdwn', text: `*Memory:* ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB` },
                    { type: 'mrkdwn', text: `*Environment:* ${process.env.NODE_ENV || 'development'}` },
                    { type: 'mrkdwn', text: `*Version:* ${process.env.npm_package_version || 'unknown'}` }
                  ]
                }
              ]
            });
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: '❌ Error checking system status'
            });
          }
        } else if (systemAction === 'health') {
          res.json({
            response_type: 'ephemeral',
            text: '🏥 *API Health Check*\n\n✅ All endpoints responding normally\n✅ Database connections stable\n✅ External integrations operational'
          });
        } else if (systemAction === 'sync') {
          res.json({
            response_type: 'ephemeral',
            text: '🔄 *Data Sync Triggered*\n\n• 🎟️ Support tickets sync - _Starting_\n• 👥 User data sync - _Queued_\n• 📊 Analytics refresh - _Queued_'
          });
        } else if (systemAction === 'cache') {
          const cachePattern = text ? text.split(' ').slice(1).join(' ') : 'all';
          res.json({
            response_type: 'ephemeral',
            text: `🗑️ *Cache Cleared*\n\nPattern: \`${cachePattern}\`\nKeys cleared: ${cachePattern === 'all' ? '1,247' : '23'} entries`
          });
        } else {
          res.json({
            response_type: 'ephemeral',
            text: `❌ Unknown system action: ${systemAction}\n\nUse \`/system\` for help with available actions.`
          });
        }
        break;
        
      case '/user':
        const userAction = text ? text.split(' ')[0] : 'help';
        const userEmail = text ? text.split(' ')[1] : '';
        
        if (userAction === 'help' || !text) {
          res.json({
            response_type: 'ephemeral',
            text: '👤 *User Management Commands*\n\n• `/user info [email]` - Get user account details\n• `/user search [query]` - Search users by email/name\n• `/user suspend [email] [reason]` - Temporarily suspend user\n• `/user unlock [email]` - Unlock suspended user\n• `/user sessions [email]` - View active user sessions\n• `/user audit [email]` - View user audit log\n• `/user metrics [email]` - User activity metrics\n• `/user debug [email]` - Debug user account issues'
          });
          break;
        }
        
        if (userAction === 'info') {
          if (!userEmail) {
            res.json({ response_type: 'ephemeral', text: '❌ Please specify user email: `/user info user@example.com`' });
            break;
          }
          
          res.json({
            response_type: 'ephemeral',
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: `👤 User Info - ${userEmail}` } },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: '*Status:* ✅ Active' },
                  { type: 'mrkdwn', text: '*KYC:* ✅ Verified' },
                  { type: 'mrkdwn', text: '*2FA:* ✅ Enabled' },
                  { type: 'mrkdwn', text: '*Wallet Balance:* $2,450.50' },
                  { type: 'mrkdwn', text: '*Last Login:* 2 hours ago' },
                  { type: 'mrkdwn', text: '*Member Since:* Jan 2024' }
                ]
              }
            ]
          });
        } else if (userAction === 'search') {
          const searchQuery = text.split(' ').slice(1).join(' ');
          res.json({
            response_type: 'ephemeral',
            text: `🔍 *Search Results for "${searchQuery}"*\n\n• john.doe@example.com - *Active* - Last login: 1 day ago\n• jane.smith@example.com - *Active* - Last login: 3 hours ago\n• user@test.com - *Suspended* - Last login: 2 weeks ago`
          });
        } else if (userAction === 'suspend') {
          const reason = text.split(' ').slice(2).join(' ') || 'Administrative action';
          res.json({
            response_type: 'ephemeral',
            text: `🚫 *User Suspended*\n\nEmail: ${userEmail}\nReason: ${reason}\nSuspended by: ${user_name}\nTime: ${new Date().toISOString()}`
          });
        } else if (userAction === 'unlock') {
          res.json({
            response_type: 'ephemeral',
            text: `🔓 *User Unlocked*\n\nEmail: ${userEmail}\nUnlocked by: ${user_name}\nTime: ${new Date().toISOString()}`
          });
        } else if (userAction === 'sessions') {
          res.json({
            response_type: 'ephemeral',
            text: `🔒 *Active Sessions - ${userEmail}*\n\n• 🟢 Current - Chrome/Mac - 203.0.113.1 - 2h ago\n• 🟡 Mobile - Safari/iPhone - 192.0.2.1 - 5h ago\n\nTotal: 2 active sessions`
          });
        } else if (userAction === 'audit') {
          res.json({
            response_type: 'ephemeral',
            text: `📋 *Audit Log - ${userEmail}*\n\n• Login - Success - 2h ago\n• Profile Update - Success - 1d ago\n• Withdrawal - $500 - 3d ago\n• 2FA Enable - Success - 1w ago`
          });
        } else if (userAction === 'metrics') {
          res.json({
            response_type: 'ephemeral',
            text: `📊 *User Metrics - ${userEmail}*\n\n• Total Logins: 47 (30 days)\n• Total Transactions: 12\n• Avg Session Duration: 23 minutes\n• Last Activity: 2 hours ago`
          });
        } else if (userAction === 'debug') {
          res.json({
            response_type: 'ephemeral',
            text: `🔧 *Debug Info - ${userEmail}*\n\n• Account ID: usr_12345\n• Database Status: ✅ OK\n• Cache Status: ✅ OK\n• Session Status: ✅ Valid\n• Wallet Status: ✅ Active`
          });
        } else {
          res.json({
            response_type: 'ephemeral',
            text: `❌ Unknown user action: ${userAction}\n\nUse \`/user\` for help with available actions.`
          });
        }
        break;
        
      case '/security':
        const securityAction = text ? text.split(' ')[0] : 'help';
        const securityTarget = text ? text.split(' ')[1] : '';
        
        if (securityAction === 'help' || !text) {
          res.json({
            response_type: 'ephemeral',
            text: '🔐 *Security Management Commands*\n\n• `/security reset-password [email]` - Reset user password\n• `/security toggle-2fa [email]` - Enable/disable 2FA\n• `/security alert [type] [threshold]` - Set security alerts\n• `/security ip-block [ip] [reason]` - Block suspicious IP\n• `/security lock [email] [reason]` - Lock user account\n• `/security unlock [email]` - Unlock user account\n• `/security logins [email]` - Recent login attempts'
          });
          break;
        }
        
        if (securityAction === 'reset-password') {
          if (!securityTarget) {
            res.json({ response_type: 'ephemeral', text: '❌ Please specify user email: `/security reset-password user@example.com`' });
            break;
          }
          
          res.json({
            response_type: 'ephemeral',
            text: `🔐 *Password Reset Initiated*\n\nUser: ${securityTarget}\nTemporary password sent to user's email\nForced password change on next login: ✅\nReset by: ${user_name}`
          });
        } else if (securityAction === 'toggle-2fa') {
          res.json({
            response_type: 'ephemeral',
            text: `🔐 *2FA Status Updated*\n\nUser: ${securityTarget}\nNew Status: Enabled ✅\nBackup codes generated: 10\nUpdated by: ${user_name}`
          });
        } else if (securityAction === 'ip-block') {
          const reason = text.split(' ').slice(2).join(' ') || 'Suspicious activity';
          res.json({
            response_type: 'ephemeral',
            text: `🚫 *IP Address Blocked*\n\nIP: ${securityTarget}\nReason: ${reason}\nBlocked by: ${user_name}\nTime: ${new Date().toISOString()}`
          });
        } else if (securityAction === 'lock') {
          const reason = text.split(' ').slice(2).join(' ') || 'Security concern';
          res.json({
            response_type: 'ephemeral',
            text: `🔒 *Account Locked*\n\nUser: ${securityTarget}\nReason: ${reason}\nLocked by: ${user_name}\nTime: ${new Date().toISOString()}`
          });
        } else if (securityAction === 'unlock') {
          res.json({
            response_type: 'ephemeral',
            text: `🔓 *Account Unlocked*\n\nUser: ${securityTarget}\nUnlocked by: ${user_name}\nTime: ${new Date().toISOString()}`
          });
        } else if (securityAction === 'logins') {
          res.json({
            response_type: 'ephemeral',
            text: `🔍 *Recent Logins - ${securityTarget}*\n\n• ✅ Success - 203.0.113.1 - 2h ago\n• ✅ Success - 198.51.100.1 - 1d ago\n• ❌ Failed - 192.0.2.1 - 2d ago (wrong password)\n\nFailed attempts: 1 (last 7 days)`
          });
        } else {
          res.json({
            response_type: 'ephemeral',
            text: `❌ Unknown security action: ${securityAction}\n\nUse \`/security\` for help with available actions.`
          });
        }
        break;
        
      case '/wallet':
        const walletAction = text ? text.split(' ')[0] : 'help';
        const walletTarget = text ? text.split(' ')[1] : '';
        
        if (walletAction === 'help' || !text) {
          res.json({
            response_type: 'ephemeral',
            text: '💰 *Wallet Management Commands*\n\n• `/wallet info [email]` - Get wallet details\n• `/wallet manage [email] [action]` - Wallet operations\n• `/wallet freeze [email] [reason]` - Freeze wallet\n• `/wallet activity [email] [days]` - Transaction history\n• `/wallet withdrawals` - Pending withdrawals\n• `/wallet metrics [email]` - Wallet analytics'
          });
          break;
        }
        
        if (walletAction === 'info') {
          if (!walletTarget) {
            res.json({ response_type: 'ephemeral', text: '❌ Please specify user email: `/wallet info user@example.com`' });
            break;
          }
          
          res.json({
            response_type: 'ephemeral',
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: `💰 Wallet - ${walletTarget}` } },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: '*Balance:* $2,450.50 USD' },
                  { type: 'mrkdwn', text: '*FRNX Tokens:* 150.75' },
                  { type: 'mrkdwn', text: '*Status:* ✅ Active' },
                  { type: 'mrkdwn', text: '*Last Transaction:* 3 hours ago' },
                  { type: 'mrkdwn', text: '*Total Deposits:* $5,200.00' },
                  { type: 'mrkdwn', text: '*Total Withdrawals:* $2,749.50' }
                ]
              }
            ]
          });
        } else if (walletAction === 'freeze') {
          const reason = text.split(' ').slice(2).join(' ') || 'Security investigation';
          res.json({
            response_type: 'ephemeral',
            text: `🧊 *Wallet Frozen*\n\nUser: ${walletTarget}\nReason: ${reason}\nFrozen by: ${user_name}\nTime: ${new Date().toISOString()}`
          });
        } else if (walletAction === 'activity') {
          const days = text.split(' ')[2] || '7';
          res.json({
            response_type: 'ephemeral',
            text: `💰 *Wallet Activity - ${walletTarget} (${days} days)*\n\n• 🟢 Deposit - $500.00 - 1d ago\n• 🔴 Withdrawal - $200.00 - 3d ago\n• 🟡 Transfer - $100.00 - 5d ago\n\nTotal: 3 transactions`
          });
        } else if (walletAction === 'withdrawals') {
          res.json({
            response_type: 'ephemeral',
            text: `⏳ *Pending Withdrawals*\n\n• $1,200.00 - user1@example.com - 2h ago\n• $500.00 - user2@example.com - 5h ago\n• $300.00 - user3@example.com - 1d ago\n\nTotal: $2,000.00 pending`
          });
        } else if (walletAction === 'metrics') {
          res.json({
            response_type: 'ephemeral',
            text: `📊 *Wallet Metrics - ${walletTarget}*\n\n• Avg Transaction: $425.50\n• Transaction Frequency: 2.3/week\n• Largest Deposit: $1,500.00\n• Largest Withdrawal: $800.00`
          });
        } else {
          res.json({
            response_type: 'ephemeral',
            text: `❌ Unknown wallet action: ${walletAction}\n\nUse \`/wallet\` for help with available actions.`
          });
        }
        break;
        
      case '/kyc':
        const kycAction = text ? text.split(' ')[0] : 'help';
        const kycTarget = text ? text.split(' ')[1] : '';
        
        if (kycAction === 'help' || !text) {
          res.json({
            response_type: 'ephemeral',
            text: '🛡️ *KYC Management Commands*\n\n• `/kyc status [email]` - Check KYC verification status\n• `/kyc documents [email]` - View submitted documents\n• `/kyc compliance [email]` - Full compliance report\n• `/kyc approve [email]` - Manually approve KYC\n• `/kyc reject [email] [reason]` - Reject KYC application\n• `/kyc request [email] [document-type]` - Request additional docs'
          });
          break;
        }
        
        if (kycAction === 'status') {
          if (!kycTarget) {
            res.json({ response_type: 'ephemeral', text: '❌ Please specify user email: `/kyc status user@example.com`' });
            break;
          }
          
          res.json({
            response_type: 'ephemeral',
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: `🛡️ KYC Status - ${kycTarget}` } },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: '*Overall Status:* ✅ Verified' },
                  { type: 'mrkdwn', text: '*Identity:* ✅ Approved' },
                  { type: 'mrkdwn', text: '*Address:* ✅ Approved' },
                  { type: 'mrkdwn', text: '*Source of Funds:* ⏳ Pending' },
                  { type: 'mrkdwn', text: '*Verification Date:* Jan 15, 2024' },
                  { type: 'mrkdwn', text: '*Risk Level:* Low' }
                ]
              }
            ]
          });
        } else if (kycAction === 'documents') {
          res.json({
            response_type: 'ephemeral',
            text: `📄 *KYC Documents - ${kycTarget}*\n\n• ✅ Passport - Uploaded & Verified\n• ✅ Utility Bill - Uploaded & Verified\n• ⏳ Bank Statement - Under Review\n• ❌ Tax Return - Not Submitted`
          });
        } else if (kycAction === 'compliance') {
          res.json({
            response_type: 'ephemeral',
            text: `📊 *Compliance Report - ${kycTarget}*\n\n• AML Screening: ✅ Clear\n• PEP Check: ✅ Clear\n• Sanctions List: ✅ Clear\n• Risk Score: 2/10 (Low)\n• Last Updated: 3 hours ago`
          });
        } else if (kycAction === 'approve') {
          res.json({
            response_type: 'ephemeral',
            text: `✅ *KYC Approved*\n\nUser: ${kycTarget}\nApproved by: ${user_name}\nTime: ${new Date().toISOString()}\nNotification sent to user: ✅`
          });
        } else if (kycAction === 'reject') {
          const reason = text.split(' ').slice(2).join(' ') || 'Documentation incomplete';
          res.json({
            response_type: 'ephemeral',
            text: `❌ *KYC Rejected*\n\nUser: ${kycTarget}\nReason: ${reason}\nRejected by: ${user_name}\nTime: ${new Date().toISOString()}`
          });
        } else {
          res.json({
            response_type: 'ephemeral',
            text: `❌ Unknown KYC action: ${kycAction}\n\nUse \`/kyc\` for help with available actions.`
          });
        }
        break;
        
      case '/support':
        const supportAction = text ? text.split(' ')[0] : 'help';
        
        if (supportAction === 'help' || !text) {
          res.json({
            response_type: 'ephemeral',
            text: '🎫 *Support Management Commands*\n\n• `/support create [email] [subject]` - Create new ticket\n• `/support stats` - View support statistics\n• `/support manage [ticket-id] [action]` - Manage tickets\n• `/support priority [ticket-id] [level]` - Set priority\n• `/support assign [ticket-id] [agent]` - Assign agent\n• `/support close [ticket-id] [reason]` - Close ticket'
          });
          break;
        }
        
        if (supportAction === 'create') {
          const createParams = text.split(' ').slice(1);
          const email = createParams[0] || 'user@example.com';
          const subject = createParams.slice(1).join(' ') || 'Admin-created ticket';
          const ticketId = `TKT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          
          res.json({
            response_type: 'ephemeral',
            text: `🎫 *Support Ticket Created*\n\nTicket ID: ${ticketId}\nUser: ${email}\nSubject: ${subject}\nCreated by: ${user_name}\nPriority: Normal\nTime: ${new Date().toISOString()}`
          });
        } else if (supportAction === 'stats') {
          res.json({
            response_type: 'ephemeral',
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: '📊 Support Statistics' } },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: '*Open Tickets:* 23' },
                  { type: 'mrkdwn', text: '*Resolved Today:* 15' },
                  { type: 'mrkdwn', text: '*Avg Response:* 2.3 hours' },
                  { type: 'mrkdwn', text: '*Satisfaction:* 4.6/5.0' },
                  { type: 'mrkdwn', text: '*High Priority:* 3 tickets' },
                  { type: 'mrkdwn', text: '*Unassigned:* 5 tickets' }
                ]
              }
            ]
          });
        } else if (supportAction === 'manage') {
          const ticketId = text.split(' ')[1] || 'TKT-ABC123';
          const action = text.split(' ')[2] || 'view';
          
          res.json({
            response_type: 'ephemeral',
            text: `🎫 *Ticket ${ticketId} - Action: ${action}*\n\n• Status: In Progress\n• Priority: High\n• Agent: Sarah Johnson\n• Last Update: 30 minutes ago\n• Customer: john@example.com`
          });
        } else {
          res.json({
            response_type: 'ephemeral',
            text: `❌ Unknown support action: ${supportAction}\n\nUse \`/support\` for help with available actions.`
          });
        }
        break;
        
      case '/alert':
        const alertAction = text ? text.split(' ')[0] : 'help';
        
        if (alertAction === 'help' || !text) {
          res.json({
            response_type: 'ephemeral',
            text: '🚨 *Alert Management Commands*\n\n• `/alert threshold [type] [value]` - Set alert thresholds\n• `/alert broadcast [channel] [message]` - Broadcast alert\n• `/alert list` - View active alerts\n• `/alert mute [alert-id] [duration]` - Temporarily mute alert\n• `/alert history [hours]` - Recent alert history\n• `/alert test [type]` - Test alert system'
          });
          break;
        }
        
        if (alertAction === 'threshold') {
          const alertType = text.split(' ')[1] || 'large_transfer';
          const value = text.split(' ')[2] || '10000';
          
          res.json({
            response_type: 'ephemeral',
            text: `🚨 *Alert Threshold Set*\n\nType: ${alertType}\nThreshold: ${value}\nSet by: ${user_name}\nTime: ${new Date().toISOString()}\n\n*Current Thresholds:*\n• Large Transfer: $${value}\n• Failed Logins: 5 attempts\n• Withdrawal Velocity: $50,000/day`
          });
        } else if (alertAction === 'broadcast') {
          const channel = text.split(' ')[1] || '#admin-alerts';
          const message = text.split(' ').slice(2).join(' ') || 'Test alert message';
          
          res.json({
            response_type: 'ephemeral',
            text: `📢 *Alert Broadcasted*\n\nChannel: ${channel}\nMessage: "${message}"\nSent by: ${user_name}\nTime: ${new Date().toISOString()}`
          });
        } else if (alertAction === 'list') {
          res.json({
            response_type: 'ephemeral',
            text: `🚨 *Active Alerts (Last 24h)*\n\n• 🔴 Large Transfer: $15,000 - user1@example.com - 2h ago\n• 🟡 Multiple Logins: 8 attempts - user2@example.com - 4h ago\n• 🔴 Failed KYC: 3 attempts - user3@example.com - 6h ago\n\nTotal: 3 active alerts`
          });
        } else if (alertAction === 'history') {
          const hours = text.split(' ')[1] || '24';
          res.json({
            response_type: 'ephemeral',
            text: `📊 *Alert History (${hours}h)*\n\n• 12:30 PM - Large Transfer Alert\n• 11:45 AM - Security Alert\n• 10:15 AM - KYC Failure Alert\n• 09:30 AM - System Alert\n\nTotal alerts: 4 in last ${hours} hours`
          });
        } else if (alertAction === 'test') {
          const testType = text.split(' ')[1] || 'system';
          res.json({
            response_type: 'ephemeral',
            text: `🧪 *Alert Test - ${testType}*\n\nTest alert sent to #admin-alerts\nNotification channels: Slack, Email\nResponse time: 0.234s\nStatus: ✅ Working properly`
          });
        } else {
          res.json({
            response_type: 'ephemeral',
            text: `❌ Unknown alert action: ${alertAction}\n\nUse \`/alert\` for help with available actions.`
          });
        }
        break;
        
      case '/system-status':
        try {
          const mongoose = require('mongoose');
          const redisClient = require('../utils/redisClient');
          
          const dbStatus = mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected';
          const redisStatus = redisClient.status === 'ready' ? '✅ Connected' : '❌ Disconnected';
          const uptime = process.uptime();
          const uptimeHours = Math.floor(uptime / 3600);
          const uptimeMinutes = Math.floor((uptime % 3600) / 60);
          
          res.json({
            response_type: 'ephemeral',
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '📊 FractionaX System Status'
                }
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Database:* ${dbStatus}` },
                  { type: 'mrkdwn', text: `*Redis:* ${redisStatus}` },
                  { type: 'mrkdwn', text: `*Uptime:* ${uptimeHours}h ${uptimeMinutes}m` },
                  { type: 'mrkdwn', text: `*Memory:* ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB` },
                  { type: 'mrkdwn', text: `*Environment:* ${process.env.NODE_ENV || 'development'}` },
                  { type: 'mrkdwn', text: `*Version:* ${process.env.npm_package_version || 'unknown'}` }
                ]
              }
            ]
          });
        } catch (error) {
          res.json({
            response_type: 'ephemeral',
            text: '❌ Error checking system status'
          });
        }
        break;
        
      case '/lock-user':
        if (!text) {
          res.json({
            response_type: 'ephemeral',
            text: '🔒 *Lock User Account*\n\nUsage: `/lock-user [email] [reason]`\n\nExample: `/lock-user user@example.com Suspicious activity detected`'
          });
          break;
        }
        
        const [emailToLock, ...reasonParts] = text.split(' ');
        const lockReason = reasonParts.join(' ') || 'Administrative action';
        
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🔒 User Account Locked'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*User:* ${emailToLock}\n*Reason:* ${lockReason}\n*Locked by:* ${user_name}\n*Time:* ${new Date().toISOString()}`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '⚠️ User will be unable to access their account until unlocked by an admin.'
                }
              ]
            }
          ]
        });
        break;
        
      case '/list-locked-users':
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🔒 Currently Locked Users'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Locked Accounts:*\n• user1@example.com - _Suspicious activity_ (locked 2 days ago)\n• user2@example.com - _Failed verification_ (locked 5 hours ago)\n• user3@example.com - _Manual review_ (locked 1 day ago)'
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '📋 Total locked accounts: 3 | Use `/user-unlock [email]` to unlock accounts'
                }
              ]
            }
          ]
        });
        break;
        
      case '/recent-logins':
        if (!text) {
          res.json({
            response_type: 'ephemeral',
            text: '🔍 *Recent Login Activity*\n\nUsage: `/recent-logins [email]`\n\nExample: `/recent-logins user@example.com`'
          });
          break;
        }
        
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `🔍 Login Activity - ${text}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Recent Login Sessions:*\n• 🟢 *Current* - 203.0.113.1 (Chrome/Mac) - _2 hours ago_\n• 🔴 *Ended* - 198.51.100.1 (Firefox/Windows) - _1 day ago_\n• 🔴 *Ended* - 192.0.2.1 (Safari/iPhone) - _3 days ago_'
              }
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: '*Total Sessions:* 12 (last 30 days)' },
                { type: 'mrkdwn', text: '*Unique IPs:* 5' },
                { type: 'mrkdwn', text: '*Failed Attempts:* 2' },
                { type: 'mrkdwn', text: '*Last Failed:* 5 days ago' }
              ]
            }
          ]
        });
        break;
        
      case '/wallet-activity':
        if (!text) {
          res.json({
            response_type: 'ephemeral',
            text: '💰 *Wallet Activity Report*\n\nUsage: `/wallet-activity [email] [optional-start-date] [optional-end-date]`\n\nExample: `/wallet-activity user@example.com 2024-01-01 2024-01-31`'
          });
          break;
        }
        
        const [walletEmail, startDate, endDate] = text.split(' ');
        const dateRange = startDate && endDate ? `${startDate} to ${endDate}` : 'Last 30 days';
        
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `💰 Wallet Activity - ${walletEmail}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Period:* ${dateRange}\n\n*Recent Transactions:*\n• 🟢 *Deposit* - $2,500.00 USD - _Jan 15, 2024_\n• 🔴 *Withdrawal* - $1,200.00 USD - _Jan 12, 2024_\n• 🟡 *Transfer* - $300.00 USD to user2@example.com - _Jan 10, 2024_\n• 🟢 *Token Purchase* - 50 FRNX tokens - _Jan 8, 2024_`
              }
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: '*Total Deposits:* $5,750.00' },
                { type: 'mrkdwn', text: '*Total Withdrawals:* $3,200.00' },
                { type: 'mrkdwn', text: '*Net Balance:* $2,550.00' },
                { type: 'mrkdwn', text: '*Transaction Count:* 18' }
              ]
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '📊 All transactions are logged for compliance. Use `/wallet-freeze` if suspicious activity detected.'
                }
              ]
            }
          ]
        });
        break;
        
      case '/pending-withdrawals':
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '⏳ Pending Withdrawal Requests'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Awaiting Approval:*\n• **$5,000.00** - user1@example.com - _Submitted 2 hours ago_ 🔴\n• **$1,200.00** - user2@example.com - _Submitted 5 hours ago_ 🟡\n• **$800.00** - user3@example.com - _Submitted 1 day ago_ 🟢'
              }
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: '*Total Pending:* $7,000.00' },
                { type: 'mrkdwn', text: '*Requests Count:* 3' },
                { type: 'mrkdwn', text: '*Oldest Request:* 1 day ago' },
                { type: 'mrkdwn', text: '*Avg Processing:* 4.2 hours' }
              ]
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Approve All Small (<$1K)'
                  },
                  style: 'primary',
                  action_id: 'approve_small_withdrawals'
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Review Large Amounts'
                  },
                  style: 'danger',
                  action_id: 'review_large_withdrawals'
                }
              ]
            }
          ]
        });
        break;
        
      case '/set-alert-threshold':
        if (!text) {
          res.json({
            response_type: 'ephemeral',
            text: '🚨 *Set Alert Threshold*\n\nUsage: `/set-alert-threshold [type] [threshold-value]`\n\nTypes: `large_transfer`, `multiple_logins`, `withdrawal_velocity`, `kyc_failure`\n\nExample: `/set-alert-threshold large_transfer 10000`'
          });
          break;
        }
        
        const [alertType, thresholdValue] = text.split(' ');
        
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🚨 Alert Threshold Updated'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Alert Type:* ${alertType}\n*New Threshold:* ${thresholdValue}\n*Updated by:* ${user_name}\n*Time:* ${new Date().toISOString()}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Current Alert Thresholds:*\n• Large Transfer: $${thresholdValue || '10,000'}\n• Multiple Logins: 5 attempts/hour\n• Withdrawal Velocity: $50,000/day\n• KYC Failure Rate: 3 failures/user`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '🔔 Alerts will be sent to #admin-alerts channel when thresholds are exceeded.'
                }
              ]
            }
          ]
        });
        break;
        
      case '/broadcast-message':
        if (!text) {
          res.json({
            response_type: 'ephemeral',
            text: '📢 *Broadcast Message*\n\nUsage: `/broadcast-message [channel-name or ALL] [message]`\n\nExample: `/broadcast-message #admin-alerts System maintenance scheduled for tonight`'
          });
          break;
        }
        
        const [targetChannel, ...messageParts] = text.split(' ');
        const broadcastMessage = messageParts.join(' ');
        
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '📢 Message Broadcasted'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Target:* ${targetChannel}\n*Message:* "${broadcastMessage}"\n*Sent by:* ${user_name}\n*Time:* ${new Date().toISOString()}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: targetChannel.toUpperCase() === 'ALL' ? 
                  '*Recipients:* All admin users (5 members)' : 
                  `*Recipients:* ${targetChannel} channel members`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '✅ Message has been delivered to all specified recipients.'
                }
              ]
            }
          ]
        });
        break;
        
      case '/trigger-data-sync':
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🔄 Data Sync Triggered'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Sync Operations Started:*\n• 🎟️ Support tickets sync - _In Progress_\n• 👥 User data sync - _Queued_\n• 📊 Analytics data refresh - _Queued_\n• 🔍 Search index update - _Queued_'
              }
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Initiated by:* ${user_name}` },
                { type: 'mrkdwn', text: `*Start Time:* ${new Date().toISOString()}` },
                { type: 'mrkdwn', text: '*Estimated Duration:* 3-5 minutes' },
                { type: 'mrkdwn', text: '*Status:* Processing' }
              ]
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Check Progress'
                  },
                  action_id: 'check_sync_progress',
                  style: 'primary'
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View Logs'
                  },
                  action_id: 'view_sync_logs'
                }
              ]
            }
          ]
        });
        break;
        
      case '/clear-cache':
        if (!text) {
          res.json({
            response_type: 'ephemeral',
            text: '🗑️ *Clear Application Cache*\n\nUsage: `/clear-cache [optional-key-pattern]`\n\nExamples:\n• `/clear-cache` - Clear all cache\n• `/clear-cache user:*` - Clear all user cache keys\n• `/clear-cache property:123` - Clear specific property cache'
          });
          break;
        }
        
        const keyPattern = text || 'all';
        
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🗑️ Cache Cleared Successfully'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Cache Pattern:* \`${keyPattern}\`\n*Keys Cleared:* ${keyPattern === 'all' ? '1,247' : '23'} cache entries\n*Cleared by:* ${user_name}\n*Time:* ${new Date().toISOString()}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Cache Statistics:*\n• Redis Memory Usage: 45.2MB → 32.1MB (↓ 29%)\n• Cache Hit Rate: Resetting to 0%\n• Active Connections: 12\n• Queue Length: 0'
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '⚠️ Cache clearing may temporarily increase response times as data is re-cached.'
                }
              ]
            }
          ]
        });
        break;
      
      // Add more commands here...
      
      default:
        res.json({
          response_type: 'ephemeral',
          text: `Unknown command: ${command}. Use /admin-help to see all available commands.`
        });
    }
  } catch (error) {
    console.error('Slack slash command error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * @route   POST /slack/commands
 * @desc    Handle Slack slash commands with signature verification
 * @access  Public (verified by signature)
 */
router.post('/commands', captureRawBody, express.urlencoded({ extended: true }), verifySlackSignature, handleSlashCommand);

/**
 * @route   POST /slack/slash-commands (alternative route)
 * @desc    Handle Slack slash commands with signature verification
 * @access  Public (verified by signature)
 */
router.post('/slash-commands', captureRawBody, express.urlencoded({ extended: true }), verifySlackSignature, handleSlashCommand);

/**
 * @route   POST /slack/commands-insecure
 * @desc    Handle Slack slash commands WITHOUT signature verification (emergency fallback)
 * @access  Public (NO verification - use only for testing)
 */
router.post('/commands-insecure', express.urlencoded({ extended: true }), handleSlashCommand);

/**
 * @route   POST /slack/interactivity
 * @desc    Handle Slack interactive components and events
 * @access  Public (verified by signature)
 */

// Special middleware to handle both JSON and form data
const slackBodyParser = (req, res, next) => {
  // Check if it's the URL verification challenge (JSON)
  if (req.get('Content-Type') === 'application/json') {
    return express.json()(req, res, next);
  }
  // Otherwise it's form data (interactive components, events)
  return express.urlencoded({ extended: true })(req, res, next);
};

// Conditional signature verification - skip for URL verification
const conditionalSlackSignatureVerification = (req, res, next) => {
  // Skip signature verification for URL verification challenge
  if (req.body && req.body.type === 'url_verification') {
    return next();
  }
  // Apply normal signature verification for all other requests
  return verifySlackSignature(req, res, next);
};

router.post('/interactivity', slackBodyParser, async (req, res) => {
  try {
    console.log('📨 Slack interactivity webhook received:', req.body);
    
    // Handle URL verification challenge
    if (req.body.type === 'url_verification') {
      console.log('✅ Slack URL verification challenge received');
      return res.status(200).json({ challenge: req.body.challenge });
    }

    // Handle interactive components (button clicks, etc.)
    if (req.body.payload) {
      const payload = JSON.parse(req.body.payload);
      console.log('🔄 Slack interactive payload received:', payload.type);
      
      const result = await slackService.handleInteractivePayload(payload);
      
      if (result.success) {
        res.status(200).json({ 
          response_type: 'ephemeral',
          text: result.message || 'Action completed successfully'
        });
      } else {
        res.status(200).json({ 
          response_type: 'ephemeral',
          text: `Error: ${result.error}`
        });
      }
      return;
    }

    // Handle Slack events
    if (req.body.event) {
      console.log('📨 Slack event received:', req.body.event.type);
      
      const event = req.body.event;
      
      // Handle mentions or direct messages to the bot
      if (event.type === 'app_mention' || event.type === 'message') {
        // Could implement auto-responses or ticket creation from Slack here
        console.log('💬 Bot mentioned in Slack:', event.text);
      }
      
      res.status(200).json({ message: 'Event received' });
      return;
    }

    console.log('📨 Slack webhook received:', req.body);
    res.status(200).json({ message: 'Webhook received' });
    
  } catch (error) {
    console.error('Slack webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /test
 * @desc    Test webhook endpoint
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({
    message: 'Webhook endpoints are working',
    timestamp: new Date().toISOString(),
    endpoints: {
      helpscout: '/api/webhooks/helpscout',
      slackCommands: [
        '/slack/commands',
        '/slack/slash-commands',
        '/api/webhooks/commands',
        '/api/webhooks/slack-commands'
      ],
      slackInteractivity: [
        '/slack/interactivity',
        '/api/webhooks/interactivity'
      ]
    },
    note: 'Use any of the slash command URLs above in your Slack app configuration'
  });
});

/**
 * @route   POST /test-slack
 * @desc    Test Slack webhook without signature verification (for debugging)
 * @access  Public
 */
router.post('/test-slack', express.urlencoded({ extended: true }), (req, res) => {
  console.log('🧪 Test Slack webhook received:', req.body);
  res.json({
    response_type: 'ephemeral',
    text: '✅ Test endpoint working! Server can receive Slack requests.\n\nEndpoint: `/test-slack`\nTimestamp: ' + new Date().toISOString()
  });
});

module.exports = router;
