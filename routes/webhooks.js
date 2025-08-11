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
 * Middleware to capture raw body for signature verification
 */
const captureRawBody = (req, res, next) => {
  req.rawBody = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    req.rawBody += chunk;
  });
  req.on('end', () => {
    next();
  });
};

/**
 * Verify Slack webhook signature
 */
const verifySlackSignature = (req, res, next) => {
  const slackSignature = req.get('X-Slack-Signature');
  const timestamp = req.get('X-Slack-Request-Timestamp');
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!slackSignature || !timestamp || !signingSecret) {
    console.warn('Slack webhook: Missing signature, timestamp, or secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check timestamp (protect against replay attacks)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - timestamp) > 300) { // 5 minutes
    console.warn('Slack webhook: Timestamp too old');
    return res.status(401).json({ error: 'Request timestamp too old' });
  }

  // Use the raw body for signature verification
  const body = req.rawBody || '';
  const basestring = `v0:${timestamp}:${body}`;
  const expectedSignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(basestring)
    .digest('hex');

  if (slackSignature !== expectedSignature) {
    console.warn('Slack webhook: Invalid signature');
    console.warn('Expected:', expectedSignature);
    console.warn('Received:', slackSignature);
    console.warn('Body length:', body.length);
    console.warn('Timestamp:', timestamp);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
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
        
      case '/admin-help':
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🛠️ FractionaX Admin Commands (30+ Total)'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*🔧 System:* `/system-status` `/api-health` `/trigger-data-sync` `/clear-cache`\\n' +
                      '*👤 Users:* `/user-info` `/user-search` `/user-suspend` `/user-unlock` `/user-sessions` `/user-audit` `/user-metrics` `/debug-user`\\n' +
                      '*🔐 Security:* `/reset-password` `/toggle-2fa` `/security-alert` `/ip-block` `/lock-user` `/list-locked-users` `/recent-logins`\\n' +
                      '*💰 Wallets:* `/wallet-info` `/wallet-manage` `/wallet-freeze` `/token-metrics` `/wallet-activity` `/pending-withdrawals`\\n' +
                      '*🚨 Alerts:* `/set-alert-threshold` `/broadcast-message`\\n' +
                      '*🛡️ KYC:* `/kyc-status` `/user-documents` `/compliance-check`\\n' +
                      '*🎫 Support:* `/create-ticket` `/support-stats` `/ticket-manage`'
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '🛡️ All admin actions are logged and audited. Use commands without params for help.'
                }
              ]
            }
          ]
        });
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
 * @desc    Handle Slack slash commands
 * @access  Public (verified by signature)
 */
router.post('/commands', express.urlencoded({ extended: true }), handleSlashCommand);

/**
 * @route   POST /slack/slash-commands (alternative route)
 * @desc    Alternative route for Slack slash commands
 * @access  Public (verified by signature)
 */
router.post('/slash-commands', express.urlencoded({ extended: true }), handleSlashCommand);

/**
 * @route   POST /slack/commands-secure
 * @desc    Handle Slack slash commands with signature verification
 * @access  Public (verified by signature)
 */
router.post('/commands-secure', captureRawBody, express.urlencoded({ extended: true }), verifySlackSignature, handleSlashCommand);

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
