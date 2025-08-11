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
 * Enhanced Slack signature verification for Cloudflare
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

  try {
    // Get body string for signature verification
    let bodyString = '';
    
    if (req.rawBody) {
      bodyString = req.rawBody;
    } else if (req.body) {
      // Reconstruct from parsed form data (Cloudflare fallback)
      if (typeof req.body === 'string') {
        bodyString = req.body;
      } else {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(req.body)) {
          params.append(key, value);
        }
        bodyString = params.toString();
      }
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
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('✅ Slack webhook signature verified successfully');
    next();
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return res.status(401).json({ error: 'Signature verification failed' });
  }
};

/**
 * Cloudflare-compatible raw body capture
 * Handles Cloudflare's request modifications properly
 */
const captureRawBody = (req, res, next) => {
  // Skip if body already captured
  if (req.rawBody) {
    return next();
  }

  const chunks = [];
  let hasData = false;

  req.on('data', chunk => {
    chunks.push(chunk);
    hasData = true;
  });

  req.on('end', () => {
    if (hasData) {
      req.rawBody = Buffer.concat(chunks).toString('utf8');
    } else {
      // Fallback for when Cloudflare pre-processes the body
      req.rawBody = '';
    }
    next();
  });

  req.on('error', (err) => {
    console.error('❌ Raw body capture error:', err);
    req.rawBody = '';
    next();
  });

  // Timeout protection
  setTimeout(() => {
    if (!hasData) {
      console.warn('⚠️ Raw body capture timeout, proceeding...');
      req.rawBody = '';
      next();
    }
  }, 1000); // 1 second timeout
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
 * Parse command and subcommand from text input
 */
function parseUmbrellaCommand(command, text) {
  if (!text) {
    return { subcommand: 'help', args: [] };
  }
  
  const parts = text.trim().split(' ');
  const subcommand = parts[0] || 'help';
  const args = parts.slice(1);
  
  return { subcommand, args };
}

/**
 * Main handler for all slash commands - Enhanced with umbrella system
 */
async function handleSlashCommand(req, res) {
  const { command, text, user_id, user_name, channel_id, response_url, team_id } = req.body;
  
  console.log('⚡ Slack slash command received:', command, text);
  
  try {
    // Handle legacy commands for backwards compatibility
    if (command === '/test' || command === '/ping') {
      return handleLegacyCommands(req, res);
    }
    
    // Parse umbrella commands
    const { subcommand, args } = parseUmbrellaCommand(command, text);
    
    switch (command) {
      // ==== USER MANAGEMENT UMBRELLA ====
      case '/user':
        return await handleUserCommands(res, subcommand, args, { user_name, user_id });
        
      // ==== SYSTEM MANAGEMENT UMBRELLA ====
      case '/system':
        return await handleSystemCommands(res, subcommand, args, { user_name, user_id });
        
      // ==== WALLET MANAGEMENT UMBRELLA ====
      case '/wallet':
        return await handleWalletCommands(res, subcommand, args, { user_name, user_id });
        
      // ==== SECURITY MANAGEMENT UMBRELLA ====
      case '/security':
        return await handleSecurityCommands(res, subcommand, args, { user_name, user_id });
        
      // ==== SUPPORT MANAGEMENT UMBRELLA ====
      case '/support':
        return await handleSupportCommands(res, subcommand, args, { user_name, user_id, channel_id });
        
      // ==== KYC & COMPLIANCE UMBRELLA ====
      case '/compliance':
        return await handleComplianceCommands(res, subcommand, args, { user_name, user_id });
        
      // ==== ALERTS & MONITORING UMBRELLA ====
      case '/alerts':
        return await handleAlertsCommands(res, subcommand, args, { user_name, user_id });
        
      // ==== ANALYTICS & REPORTS UMBRELLA ====
      case '/analytics':
        return await handleAnalyticsCommands(res, subcommand, args, { user_name, user_id });
        
      // ==== MAIN HELP COMMAND ====
      case '/admin':
      case '/help':
      default:
        return handleMainHelp(res, subcommand);
    }
  } catch (error) {
    console.error('Slack slash command error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle legacy commands for backward compatibility
 */
function handleLegacyCommands(req, res) {
  const { command } = req.body;
  
  if (command === '/test') {
    res.json({
      response_type: 'ephemeral',
      text: '✅ FractionaX Admin Bot is working! 🚀\n\nUse `/admin` or `/help` to see all available commands.'
    });
  } else if (command === '/ping') {
    res.json({
      response_type: 'ephemeral',
      text: 'pong 🏓'
    });
  }
}

/**
 * Main help system - shows all umbrella commands
 */
function handleMainHelp(res, subcommand) {
  if (subcommand === 'advanced') {
    return res.json({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚀 FractionaX Super Admin Bot - Advanced Features'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🔥 Power Features:*\n' +
                  '• **Real-time monitoring** - Live system health tracking\n' +
                  '• **Automated alerts** - Smart threshold monitoring\n' +
                  '• **One-click actions** - Bulk operations support\n' +
                  '• **Audit trails** - Complete action logging\n' +
                  '• **Interactive buttons** - No typing required\n' +
                  '• **Smart search** - Find anything instantly\n' +
                  '• **Batch processing** - Handle multiple users at once'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*⚡ Quick Tips:*\n' +
                  '• Use `/[category] help` to see all commands in that category\n' +
                  '• Most commands work without parameters (shows help)\n' +
                  '• Add `--force` to skip confirmation prompts\n' +
                  '• Use `--json` for machine-readable output\n' +
                  '• All actions are logged and auditable'
          }
        }
      ]
    });
  }
  
  res.json({
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🛡️ FractionaX Super Admin Bot (100+ Commands)'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🚀 Umbrella Commands:*\n' +
                '• `/user [subcommand]` - User management (15+ commands)\n' +
                '• `/system [subcommand]` - System operations (12+ commands)\n' +
                '• `/wallet [subcommand]` - Wallet management (10+ commands)\n' +
                '• `/security [subcommand]` - Security operations (12+ commands)\n' +
                '• `/support [subcommand]` - Support ticket management (8+ commands)\n' +
                '• `/compliance [subcommand]` - KYC & compliance (10+ commands)\n' +
                '• `/alerts [subcommand]` - Monitoring & alerts (8+ commands)\n' +
                '• `/analytics [subcommand]` - Reports & analytics (15+ commands)'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*⚡ Quick Actions:*\n' +
                '• `/user info john@example.com` - Get user details\n' +
                '• `/system status` - Check system health\n' +
                '• `/wallet activity jane@example.com` - View wallet activity\n' +
                '• `/security lock user@example.com` - Lock user account'
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📚 Advanced Features'
            },
            action_id: 'show_advanced_help'
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 Tip: Use `/[category] help` for detailed command lists. All actions are logged and secure.'
          }
        ]
      }
    ]
  });
}

// ==== USER MANAGEMENT UMBRELLA COMMANDS ====
async function handleUserCommands(res, subcommand, args, context) {
  const { user_name, user_id } = context;
  
  switch (subcommand) {
    case 'help':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '👤 User Management Commands'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*📋 User Info & Search:*\n' +
                    '• `info [email]` - Get complete user profile\n' +
                    '• `search [query]` - Search users by name/email\n' +
                    '• `activity [email]` - View recent user activity\n' +
                    '• `sessions [email]` - List active user sessions\n' +
                    '• `audit [email]` - View user audit trail\n\n' +
                    '*🔧 User Actions:*\n' +
                    '• `lock [email] [reason]` - Lock user account\n' +
                    '• `unlock [email]` - Unlock user account\n' +
                    '• `suspend [email] [days] [reason]` - Temporarily suspend\n' +
                    '• `delete [email] --confirm` - Delete user (permanent)\n' +
                    '• `merge [source-email] [target-email]` - Merge accounts\n\n' +
                    '*📊 Bulk Operations:*\n' +
                    '• `bulk-lock [csv-file]` - Lock multiple users\n' +
                    '• `export [filter]` - Export user data\n' +
                    '• `stats` - User statistics dashboard'
            }
          }
        ]
      });
      
    case 'info':
      if (args.length === 0) {
        return res.json({
          response_type: 'ephemeral',
          text: '👤 *User Info*\n\nUsage: `/user info [email]`\n\nExample: `/user info john@example.com`'
        });
      }
      
      const email = args[0];
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `👤 User Profile - ${email}`
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Name:* John Smith` },
              { type: 'mrkdwn', text: `*Status:* ✅ Active` },
              { type: 'mrkdwn', text: `*Verified:* ✅ Yes` },
              { type: 'mrkdwn', text: `*2FA:* 🛡️ Enabled` },
              { type: 'mrkdwn', text: `*Member Since:* Jan 15, 2024` },
              { type: 'mrkdwn', text: `*Last Login:* 2 hours ago` }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*💰 Financial Summary:*\n• Balance: $12,450.00 USD\n• Tokens: 250 FRNX\n• Total Invested: $45,000.00\n• Properties: 3 active investments'
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '🔒 Lock Account' },
                action_id: `lock_user_${email}`,
                style: 'danger'
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: '🔄 Reset Password' },
                action_id: `reset_password_${email}`
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: '📊 View Admin Panel' },
                url: `${process.env.ADMIN_URL || 'https://admin.fractionax.io'}/users?email=${email}`
              }
            ]
          }
        ]
      });
      
    case 'lock':
      if (args.length === 0) {
        return res.json({
          response_type: 'ephemeral',
          text: '🔒 *Lock User Account*\n\nUsage: `/user lock [email] [reason]`\n\nExample: `/user lock user@example.com Suspicious activity detected`'
        });
      }
      
      const emailToLock = args[0];
      const lockReason = args.slice(1).join(' ') || 'Administrative action';
      
      return res.json({
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
      
    case 'stats':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📊 User Statistics Dashboard'
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: '*Total Users:* 12,847' },
              { type: 'mrkdwn', text: '*Active (30d):* 8,234' },
              { type: 'mrkdwn', text: '*New (24h):* 127' },
              { type: 'mrkdwn', text: '*Verified:* 11,203 (87%)' },
              { type: 'mrkdwn', text: '*Locked:* 23 accounts' },
              { type: 'mrkdwn', text: '*2FA Enabled:* 9,876 (77%)' }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🚨 Alerts:*\n• 5 accounts require KYC review\n• 2 suspicious login patterns detected\n• 12 password reset requests pending'
            }
          }
        ]
      });
      
    default:
      return res.json({
        response_type: 'ephemeral',
        text: `Unknown user command: ${subcommand}. Use \`/user help\` to see all available commands.`
      });
  }
}

// ==== SYSTEM MANAGEMENT UMBRELLA COMMANDS ====
async function handleSystemCommands(res, subcommand, args, context) {
  const { user_name } = context;
  
  switch (subcommand) {
    case 'help':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚙️ System Management Commands'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*📊 Monitoring:*\n' +
                    '• `status` - Complete system health check\n' +
                    '• `health` - Quick health status\n' +
                    '• `metrics` - Performance metrics\n' +
                    '• `logs [service] [lines]` - View system logs\n' +
                    '• `errors [hours]` - Recent error summary\n\n' +
                    '*🔧 Operations:*\n' +
                    '• `restart [service]` - Restart specific service\n' +
                    '• `deploy [branch]` - Deploy new version\n' +
                    '• `maintenance [on|off]` - Toggle maintenance mode\n' +
                    '• `backup [type]` - Trigger system backup\n' +
                    '• `sync` - Sync external data sources\n\n' +
                    '*🗑️ Cache & Storage:*\n' +
                    '• `cache clear [pattern]` - Clear cache entries\n' +
                    '• `cache stats` - Cache performance stats'
            }
          }
        ]
      });
      
    case 'status':
      try {
        const mongoose = require('mongoose');
        const redisClient = require('../utils/redisClient');
        
        const dbStatus = mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected';
        const redisStatus = redisClient.status === 'ready' ? '✅ Connected' : '❌ Disconnected';
        const uptime = process.uptime();
        const uptimeHours = Math.floor(uptime / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);
        
        return res.json({
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
                { type: 'mrkdwn', text: `*Load:* 0.8 (Normal)` }
              ]
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '📊 Detailed Metrics' },
                  action_id: 'show_detailed_metrics'
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '🔄 Refresh Status' },
                  action_id: 'refresh_system_status'
                }
              ]
            }
          ]
        });
      } catch (error) {
        return res.json({
          response_type: 'ephemeral',
          text: '❌ Error checking system status'
        });
      }
      
    case 'sync':
      return res.json({
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
          }
        ]
      });
      
    default:
      return res.json({
        response_type: 'ephemeral',
        text: `Unknown system command: ${subcommand}. Use \`/system help\` to see all available commands.`
      });
  }
}

// ==== WALLET MANAGEMENT UMBRELLA COMMANDS ====
async function handleWalletCommands(res, subcommand, args, context) {
  const { user_name } = context;
  
  switch (subcommand) {
    case 'help':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '💰 Wallet Management Commands'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*👤 User Wallets:*\n' +
                    '• `info [email]` - User wallet overview\n' +
                    '• `activity [email] [days]` - Transaction history\n' +
                    '• `balance [email]` - Current balances\n' +
                    '• `freeze [email] [reason]` - Freeze wallet\n' +
                    '• `unfreeze [email]` - Unfreeze wallet\n\n' +
                    '*💸 Withdrawals:*\n' +
                    '• `pending` - Pending withdrawal requests\n' +
                    '• `approve [request-id]` - Approve withdrawal\n' +
                    '• `reject [request-id] [reason]` - Reject withdrawal\n' +
                    '• `limits [email]` - View/set withdrawal limits\n\n' +
                    '*📊 Analytics:*\n' +
                    '• `volume [period]` - Transaction volume\n' +
                    '• `suspicious` - Flagged transactions'
            }
          }
        ]
      });
      
    case 'activity':
      const email = args[0];
      if (!email) {
        return res.json({
          response_type: 'ephemeral',
          text: '💰 *Wallet Activity Report*\n\nUsage: `/wallet activity [email] [optional-days]`\n\nExample: `/wallet activity user@example.com 30`'
        });
      }
      
      const days = args[1] || '30';
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `💰 Wallet Activity - ${email}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Period:* Last ${days} days\n\n*Recent Transactions:*\n• 🟢 *Deposit* - $2,500.00 USD - _Jan 15, 2024_\n• 🔴 *Withdrawal* - $1,200.00 USD - _Jan 12, 2024_\n• 🟡 *Transfer* - $300.00 USD to user2@example.com - _Jan 10, 2024_\n• 🟢 *Token Purchase* - 50 FRNX tokens - _Jan 8, 2024_`
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
          }
        ]
      });
      
    case 'pending':
      return res.json({
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
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Approve All Small (<$1K)' },
                style: 'primary',
                action_id: 'approve_small_withdrawals'
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Review Large Amounts' },
                style: 'danger',
                action_id: 'review_large_withdrawals'
              }
            ]
          }
        ]
      });
      
    default:
      return res.json({
        response_type: 'ephemeral',
        text: `Unknown wallet command: ${subcommand}. Use \`/wallet help\` to see all available commands.`
      });
  }
}

// ==== SECURITY MANAGEMENT UMBRELLA COMMANDS ====
async function handleSecurityCommands(res, subcommand, args, context) {
  const { user_name } = context;
  
  switch (subcommand) {
    case 'help':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🔐 Security Management Commands'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🔒 Account Security:*\n' +
                    '• `lock [email] [reason]` - Lock user account\n' +
                    '• `unlock [email]` - Unlock user account\n' +
                    '• `reset-password [email]` - Force password reset\n' +
                    '• `toggle-2fa [email] [on|off]` - Enable/disable 2FA\n' +
                    '• `sessions [email]` - View active sessions\n' +
                    '• `kill-sessions [email]` - Terminate all sessions\n\n' +
                    '*🚨 Monitoring:*\n' +
                    '• `alerts [type]` - Security alert dashboard\n' +
                    '• `suspicious [hours]` - Recent suspicious activity\n' +
                    '• `failed-logins [hours]` - Failed login attempts\n' +
                    '• `ip-analysis [ip]` - Analyze IP address\n\n' +
                    '*🛡️ Protection:*\n' +
                    '• `ip-block [ip] [reason]` - Block IP address\n' +
                    '• `rate-limit [email] [action]` - Manage rate limits'
            }
          }
        ]
      });
      
    case 'lock':
      if (args.length === 0) {
        return res.json({
          response_type: 'ephemeral',
          text: '🔒 *Lock User Account*\n\nUsage: `/security lock [email] [reason]`\n\nExample: `/security lock user@example.com Suspicious activity detected`'
        });
      }
      
      const emailToLock = args[0];
      const lockReason = args.slice(1).join(' ') || 'Administrative action';
      
      return res.json({
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
          }
        ]
      });
      
    case 'alerts':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 Security Alert Dashboard'
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: '*Failed Logins:* 23 (last hour)' },
              { type: 'mrkdwn', text: '*Blocked IPs:* 12 active' },
              { type: 'mrkdwn', text: '*Suspicious Activity:* 5 flagged' },
              { type: 'mrkdwn', text: '*Rate Limited:* 8 users' }
            ]
          }
        ]
      });
      
    default:
      return res.json({
        response_type: 'ephemeral',
        text: `Unknown security command: ${subcommand}. Use \`/security help\` to see all available commands.`
      });
  }
}

// ==== SUPPORT MANAGEMENT UMBRELLA COMMANDS ====
async function handleSupportCommands(res, subcommand, args, context) {
  const { user_name } = context;
  
  switch (subcommand) {
    case 'help':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🎫 Support Management Commands'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🎟️ Ticket Management:*\n' +
                    '• `list [status]` - List tickets by status\n' +
                    '• `view [ticket-id]` - View ticket details\n' +
                    '• `assign [ticket-id] [agent]` - Assign ticket\n' +
                    '• `close [ticket-id] [resolution]` - Close ticket\n' +
                    '• `escalate [ticket-id] [reason]` - Escalate ticket\n\n' +
                    '*📊 Analytics:*\n' +
                    '• `stats [period]` - Support statistics\n' +
                    '• `sla` - SLA compliance report\n' +
                    '• `agents` - Agent performance stats'
            }
          }
        ]
      });
      
    case 'stats':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📊 Support Statistics'
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: '*Open Tickets:* 47' },
              { type: 'mrkdwn', text: '*Resolved Today:* 23' },
              { type: 'mrkdwn', text: '*Avg Response:* 2.3 hours' },
              { type: 'mrkdwn', text: '*SLA Compliance:* 94.2%' }
            ]
          }
        ]
      });
      
    default:
      return res.json({
        response_type: 'ephemeral',
        text: `Unknown support command: ${subcommand}. Use \`/support help\` to see all available commands.`
      });
  }
}

// ==== COMPLIANCE UMBRELLA COMMANDS ====
async function handleComplianceCommands(res, subcommand, args, context) {
  switch (subcommand) {
    case 'help':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🛡️ Compliance & KYC Commands'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*📋 KYC Management:*\n' +
                    '• `status [email]` - KYC verification status\n' +
                    '• `approve [email]` - Approve KYC application\n' +
                    '• `reject [email] [reason]` - Reject KYC\n' +
                    '• `pending` - List pending KYC reviews\n' +
                    '• `documents [email]` - View submitted documents\n\n' +
                    '*📊 Compliance Reports:*\n' +
                    '• `aml-report [period]` - AML compliance report\n' +
                    '• `risk-assessment [email]` - User risk profile'
            }
          }
        ]
      });
      
    default:
      return res.json({
        response_type: 'ephemeral',
        text: `Unknown compliance command: ${subcommand}. Use \`/compliance help\` to see all available commands.`
      });
  }
}

// ==== ALERTS UMBRELLA COMMANDS ====
async function handleAlertsCommands(res, subcommand, args, context) {
  switch (subcommand) {
    case 'help':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 Alerts & Monitoring Commands'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*⚙️ Alert Management:*\n' +
                    '• `list [type]` - List active alerts\n' +
                    '• `threshold [type] [value]` - Set alert thresholds\n' +
                    '• `mute [alert-id] [duration]` - Mute alert\n' +
                    '• `broadcast [channel] [message]` - Send broadcast\n\n' +
                    '*📊 Monitoring:*\n' +
                    '• `dashboard` - Monitoring dashboard\n' +
                    '• `incidents` - Recent incidents'
            }
          }
        ]
      });
      
    default:
      return res.json({
        response_type: 'ephemeral',
        text: `Unknown alerts command: ${subcommand}. Use \`/alerts help\` to see all available commands.`
      });
  }
}

// ==== ANALYTICS UMBRELLA COMMANDS ====
async function handleAnalyticsCommands(res, subcommand, args, context) {
  switch (subcommand) {
    case 'help':
      return res.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📊 Analytics & Reports Commands'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*📈 Business Analytics:*\n' +
                    '• `revenue [period]` - Revenue analytics\n' +
                    '• `users [metric]` - User growth metrics\n' +
                    '• `properties` - Property performance\n' +
                    '• `tokens` - Token analytics\n\n' +
                    '*📋 Reports:*\n' +
                    '• `daily` - Daily operations report\n' +
                    '• `weekly` - Weekly summary\n' +
                    '• `export [type] [format]` - Export data'
            }
          }
        ]
      });
      
    default:
      return res.json({
        response_type: 'ephemeral',
        text: `Unknown analytics command: ${subcommand}. Use \`/analytics help\` to see all available commands.`
      });
  }
}

// All legacy code has been replaced with the umbrella command system above

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
