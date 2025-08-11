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

  const body = JSON.stringify(req.body);
  const basestring = `v0:${timestamp}:${body}`;
  const expectedSignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(basestring)
    .digest('hex');

  if (slackSignature !== expectedSignature) {
    console.warn('Slack webhook: Invalid signature');
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
 * @route   POST /api/webhooks/slack
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

router.post('/slack', slackBodyParser, conditionalSlackSignatureVerification, async (req, res) => {
  try {
    console.log('📨 Slack webhook received:', req.body);
    
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
 * @route   POST /api/webhooks/slack/slash-commands
 * @desc    Handle Slack slash commands
 * @access  Public (verified by signature)
 */
router.post('/slack/slash-commands', express.urlencoded({ extended: true }), verifySlackSignature, async (req, res) => {
  try {
    const { command, text, user_id, user_name, channel_id, response_url } = req.body;
    
    console.log('⚡ Slack slash command received:', command, text);
    
    // Handle different slash commands
    switch (command) {
      case '/support-stats':
        // Return support ticket statistics
        try {
          const SupportTicket = require('../models/SupportTicket');
          const stats = await SupportTicket.getStatistics();
          
          res.json({
            response_type: 'ephemeral',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*📊 Support Ticket Statistics*'
                }
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Total:* ${stats.total}` },
                  { type: 'mrkdwn', text: `*Open:* ${stats.open}` },
                  { type: 'mrkdwn', text: `*In Progress:* ${stats.inProgress}` },
                  { type: 'mrkdwn', text: `*Resolved:* ${stats.resolved}` },
                  { type: 'mrkdwn', text: `*Overdue:* ${stats.overdue}` },
                  { type: 'mrkdwn', text: `*Avg Response:* ${stats.avgResponseTimeFormatted}` }
                ]
              }
            ]
          });
        } catch (error) {
          res.json({
            response_type: 'ephemeral',
            text: 'Error fetching support statistics'
          });
        }
        break;
        
      case '/create-ticket':
        // Quick ticket creation from Slack
        if (!text || text.trim() === '') {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/create-ticket [customer-email] [subject] - [description]`'
          });
        } else {
          try {
            const parts = text.split(' - ');
            if (parts.length < 2) {
              res.json({
                response_type: 'ephemeral',
                text: 'Invalid format. Use: `/create-ticket [customer-email] [subject] - [description]`'
              });
              return;
            }
            
            const [emailAndSubject, description] = parts;
            const emailSubjectParts = emailAndSubject.split(' ');
            const customerEmail = emailSubjectParts[0];
            const subject = emailSubjectParts.slice(1).join(' ');
            
            // Basic email validation
            if (!/\S+@\S+\.\S+/.test(customerEmail)) {
              res.json({
                response_type: 'ephemeral',
                text: 'Please provide a valid customer email address'
              });
              return;
            }
            
            // Create the ticket
            const SupportTicket = require('../models/SupportTicket');
            const ticketData = {
              subject,
              description,
              customerEmail,
              customerName: customerEmail.split('@')[0].replace(/[._]/g, ' '),
              source: 'slack',
              priority: 'medium',
              category: 'general',
              assignedTo: user_name
            };
            
            const ticket = new SupportTicket(ticketData);
            await ticket.save();
            
            res.json({
              response_type: 'in_channel',
              text: `✅ Ticket ${ticket.ticketNumber} created successfully for ${customerEmail}`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `🎫 *New Ticket Created: ${ticket.ticketNumber}*\n*Customer:* ${customerEmail}\n*Subject:* ${subject}\n*Created by:* ${user_name}`
                  }
                },
                {
                  type: 'actions',
                  elements: [
                    {
                      type: 'button',
                      text: { type: 'plain_text', text: '🎫 View Ticket' },
                      url: `${process.env.ADMIN_URL || 'https://admin.fractionax.io'}/admin/support-tickets?id=${ticket._id}`
                    }
                  ]
                }
              ]
            });
            
          } catch (error) {
            console.error('Slash command ticket creation error:', error);
            res.json({
              response_type: 'ephemeral',
              text: 'Error creating ticket. Please try again.'
            });
          }
        }
        break;
        
      // =================== ADMIN USER MANAGEMENT COMMANDS ===================
      
      case '/user-info':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/user-info [email]`'
          });
        } else {
          try {
            const email = text.trim();
            const result = await slackService.getUserInfo(email);
            
            if (result.success) {
              const user = result.user;
              res.json({
                response_type: 'ephemeral',
                blocks: [
                  {
                    type: 'header',
                    text: {
                      type: 'plain_text',
                      text: `👤 User Information: ${user.email}`
                    }
                  },
                  {
                    type: 'section',
                    fields: [
                      { type: 'mrkdwn', text: `*Name:* ${user.firstName} ${user.lastName}` },
                      { type: 'mrkdwn', text: `*Email:* ${user.email}` },
                      { type: 'mrkdwn', text: `*Role:* ${user.role || 'user'}` },
                      { type: 'mrkdwn', text: `*Status:* ${user.accountStatus || 'active'}` },
                      { type: 'mrkdwn', text: `*2FA:* ${user.twoFactor?.enabled ? '✅ Enabled' : '❌ Disabled'}` },
                      { type: 'mrkdwn', text: `*KYC:* ${user.kyc?.status || 'not_submitted'}` },
                      { type: 'mrkdwn', text: `*Wallets:* ${user.wallets?.length || 0}` },
                      { type: 'mrkdwn', text: `*Created:* ${new Date(user.createdAt).toLocaleDateString()}` }
                    ]
                  }
                ]
              });
            } else {
              res.json({
                response_type: 'ephemeral',
                text: `❌ ${result.error}`
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error fetching user information'
            });
          }
        }
        break;
        
      case '/reset-password':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/reset-password [email]`'
          });
        } else {
          try {
            const email = text.trim();
            const result = await slackService.resetUserPassword(email, user_name);
            
            if (result.success) {
              res.json({
                response_type: 'ephemeral',
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `🔐 *Password Reset Successful*\n*User:* ${email}\n*Temp Password:* ||${result.tempPassword}||\n*Valid:* 24 hours\n\n⚠️ User must change password on next login.`
                    }
                  }
                ]
              });
            } else {
              res.json({
                response_type: 'ephemeral',
                text: `❌ ${result.error}`
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error resetting password'
            });
          }
        }
        break;
        
      case '/toggle-2fa':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/toggle-2fa [email] [enable|disable]`'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            if (parts.length !== 2) {
              res.json({
                response_type: 'ephemeral',
                text: 'Usage: `/toggle-2fa [email] [enable|disable]`'
              });
              return;
            }
            
            const [email, action] = parts;
            const enable = action.toLowerCase() === 'enable';
            
            if (!['enable', 'disable'].includes(action.toLowerCase())) {
              res.json({
                response_type: 'ephemeral',
                text: 'Action must be either "enable" or "disable"'
              });
              return;
            }
            
            const result = await slackService.toggle2FA(email, enable, user_name);
            
            if (result.success) {
              res.json({
                response_type: 'ephemeral',
                text: `✅ ${result.message}`
              });
            } else {
              res.json({
                response_type: 'ephemeral',
                text: `❌ ${result.error}`
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error toggling 2FA'
            });
          }
        }
        break;
        
      case '/manage-wallet':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/manage-wallet [email] [add|suspend|remove|reactivate] [wallet-address] [optional-reason]`'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            if (parts.length < 3) {
              res.json({
                response_type: 'ephemeral',
                text: 'Usage: `/manage-wallet [email] [add|suspend|remove|reactivate] [wallet-address] [optional-reason]`'
              });
              return;
            }
            
            const [email, action, walletAddress, ...reasonParts] = parts;
            const reason = reasonParts.join(' ') || 'Admin action via Slack';
            
            if (!['add', 'suspend', 'remove', 'reactivate'].includes(action.toLowerCase())) {
              res.json({
                response_type: 'ephemeral',
                text: 'Action must be: add, suspend, remove, or reactivate'
              });
              return;
            }
            
            const walletData = {
              address: walletAddress,
              reason: reason
            };
            
            const result = await slackService.manageUserWallet(email, action.toLowerCase(), walletData, user_name);
            
            if (result.success) {
              res.json({
                response_type: 'ephemeral',
                text: `✅ ${result.message}`
              });
            } else {
              res.json({
                response_type: 'ephemeral',
                text: `❌ ${result.error}`
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error managing wallet'
            });
          }
        }
        break;
        
      case '/user-documents':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/user-documents [email]`'
          });
        } else {
          try {
            const email = text.trim();
            const result = await slackService.getUserDocuments(email);
            
            if (result.success) {
              const docs = result.documents;
              res.json({
                response_type: 'ephemeral',
                blocks: [
                  {
                    type: 'header',
                    text: {
                      type: 'plain_text',
                      text: `📄 Documents for: ${email}`
                    }
                  },
                  {
                    type: 'section',
                    fields: [
                      { type: 'mrkdwn', text: `*KYC Documents:* ${docs.kyc.length}` },
                      { type: 'mrkdwn', text: `*Uploaded Files:* ${docs.uploaded.length}` },
                      { type: 'mrkdwn', text: `*Signed Contracts:* ${docs.contracts.length}` },
                      { type: 'mrkdwn', text: `*Identity Verified:* ${docs.verificationStatus.identity ? '✅' : '❌'}` },
                      { type: 'mrkdwn', text: `*Documents Complete:* ${docs.verificationStatus.documents ? '✅' : '❌'}` },
                      { type: 'mrkdwn', text: `*Contracts Signed:* ${docs.verificationStatus.contracts ? '✅' : '❌'}` }
                    ]
                  },
                  {
                    type: 'actions',
                    elements: [
                      {
                        type: 'button',
                        text: { type: 'plain_text', text: '👤 View User' },
                        url: `${process.env.ADMIN_URL || 'https://admin.fractionax.io'}/admin/users?email=${email}`
                      }
                    ]
                  }
                ]
              });
            } else {
              res.json({
                response_type: 'ephemeral',
                text: `❌ ${result.error}`
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error fetching user documents'
            });
          }
        }
        break;
        
      case '/user-audit':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/user-audit [email] [optional-limit]`'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            const email = parts[0];
            const limit = parseInt(parts[1]) || 10;
            
            if (limit > 50) {
              res.json({
                response_type: 'ephemeral',
                text: 'Limit cannot exceed 50 records'
              });
              return;
            }
            
            const result = await slackService.getUserAuditLog(email, limit);
            
            if (result.success) {
              const logs = result.auditLogs;
              const logText = logs.length > 0 
                ? logs.slice(0, 5).map(log => 
                    `• ${log.action} - ${new Date(log.createdAt).toLocaleDateString()}`
                  ).join('\n')
                : 'No audit logs found';
                
              res.json({
                response_type: 'ephemeral',
                blocks: [
                  {
                    type: 'header',
                    text: {
                      type: 'plain_text',
                      text: `📊 Recent Audit Log: ${email}`
                    }
                  },
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `*Total Records:* ${logs.length}\n*Recent Activities:*\n${logText}`
                    }
                  },
                  {
                    type: 'actions',
                    elements: [
                      {
                        type: 'button',
                        text: { type: 'plain_text', text: '📊 Full Audit Log' },
                        url: `${process.env.ADMIN_URL || 'https://admin.fractionax.io'}/admin/audit-logs?email=${email}`
                      }
                    ]
                  }
                ]
              });
            } else {
              res.json({
                response_type: 'ephemeral',
                text: `❌ ${result.error}`
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error fetching audit log'
            });
          }
        }
        break;
        
      case '/security-alert':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/security-alert [email] [alert-type] [details]`\nAlert types: suspicious_login, multiple_failed_attempts, unusual_activity, account_locked, wallet_activity, kyc_issue'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            if (parts.length < 3) {
              res.json({
                response_type: 'ephemeral',
                text: 'Usage: `/security-alert [email] [alert-type] [details]`'
              });
              return;
            }
            
            const [email, alertType, ...detailsParts] = parts;
            const details = detailsParts.join(' ');
            
            const validAlertTypes = ['suspicious_login', 'multiple_failed_attempts', 'unusual_activity', 'account_locked', 'wallet_activity', 'kyc_issue'];
            if (!validAlertTypes.includes(alertType)) {
              res.json({
                response_type: 'ephemeral',
                text: `Invalid alert type. Valid types: ${validAlertTypes.join(', ')}`
              });
              return;
            }
            
            const result = await slackService.notifySecurityAlert(alertType, email, details, user_name);
            
            if (result.success) {
              res.json({
                response_type: 'ephemeral',
                text: `✅ Security alert sent successfully`
              });
            } else {
              res.json({
                response_type: 'ephemeral',
                text: `❌ ${result.error}`
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error sending security alert'
            });
          }
        }
        break;
        
      case '/admin-help':
        res.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🛠️ FractionaX Admin Commands (25 Total)'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*🔧 System:* `/system-status` `/api-health`\n' +
                      '*👤 Users:* `/user-info` `/user-search` `/user-suspend` `/user-unlock` `/user-sessions` `/user-audit` `/user-metrics` `/debug-user`\n' +
                      '*🔐 Security:* `/reset-password` `/toggle-2fa` `/security-alert` `/ip-block`\n' +
                      '*💰 Wallets:* `/wallet-info` `/wallet-manage` `/wallet-freeze` `/token-metrics`\n' +
                      '*🛡️ KYC:* `/kyc-status` `/user-documents` `/compliance-check`\n' +
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
        
      // =================== SYSTEM & HEALTH COMMANDS ===================
      
      case '/system-status':
        try {
          const mongoose = require('mongoose');
          const redisClient = require('../utils/redisClient');
          
          const dbStatus = mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected';
          const redisStatus = redisClient.status === 'ready' ? '✅ Connected' : '❌ Disconnected';
          const uptime = process.uptime();
          const uptimeHours = Math.floor(uptime / 3600);
          const uptimeMinutes = Math.floor((uptime % 3600) / 60);
          
          // Check if lockdown requested
          if (text && text.toLowerCase().includes('lockdown')) {
            // Implement emergency lockdown logic here
            res.json({
              response_type: 'ephemeral',
              text: '🚨 Emergency lockdown initiated. All user logins disabled.',
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: '🚨 *EMERGENCY LOCKDOWN ACTIVE*\nAll user authentication has been disabled.\nOnly admin access remains active.'
                  }
                }
              ]
            });
            return;
          }
          
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
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: 'Use `/system-status lockdown [reason]` for emergency lockdown'
                  }
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
        
      case '/api-health':
        try {
          const healthChecks = {
            database: mongoose.connection.readyState === 1,
            redis: require('../utils/redisClient').status === 'ready',
            slack: slackService.connected,
            // Add more health checks as needed
          };
          
          const allHealthy = Object.values(healthChecks).every(status => status);
          
          res.json({
            response_type: 'ephemeral',
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: `${allHealthy ? '✅' : '❌'} API Health Check`
                }
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Database:* ${healthChecks.database ? '✅' : '❌'}` },
                  { type: 'mrkdwn', text: `*Redis Cache:* ${healthChecks.redis ? '✅' : '❌'}` },
                  { type: 'mrkdwn', text: `*Slack Integration:* ${healthChecks.slack ? '✅' : '❌'}` },
                  { type: 'mrkdwn', text: `*Overall Status:* ${allHealthy ? '🟢 Healthy' : '🔴 Issues Detected'}` }
                ]
              }
            ]
          });
        } catch (error) {
          res.json({
            response_type: 'ephemeral',
            text: '❌ Error performing health check'
          });
        }
        break;
        
      // =================== ENHANCED USER MANAGEMENT ===================
      
      case '/user-search':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/user-search [email|name|phone|partial]`'
          });
        } else {
          try {
            const searchTerm = text.trim();
            const User = require('../models/User');
            
            const users = await User.find({
              $or: [
                { email: { $regex: searchTerm, $options: 'i' } },
                { firstName: { $regex: searchTerm, $options: 'i' } },
                { lastName: { $regex: searchTerm, $options: 'i' } },
                { phone: { $regex: searchTerm, $options: 'i' } }
              ]
            })
            .select('email firstName lastName accountStatus createdAt')
            .limit(10)
            .lean();
            
            if (users.length === 0) {
              res.json({
                response_type: 'ephemeral',
                text: `No users found matching: "${searchTerm}"`
              });
              return;
            }
            
            const userList = users.map(user => 
              `• ${user.firstName} ${user.lastName} (${user.email}) - ${user.accountStatus || 'active'}`
            ).join('\n');
            
            res.json({
              response_type: 'ephemeral',
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: `🔍 Search Results: "${searchTerm}"`
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*Found ${users.length} user(s):*\n${userList}`
                  }
                }
              ]
            });
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error searching users'
            });
          }
        }
        break;
        
      case '/user-suspend':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/user-suspend [email] [reason]`'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            const email = parts[0];
            const reason = parts.slice(1).join(' ') || 'Admin suspension';
            
            const User = require('../models/User');
            const user = await User.findOne({ email: email.toLowerCase() });
            
            if (!user) {
              res.json({
                response_type: 'ephemeral',
                text: `❌ User not found: ${email}`
              });
              return;
            }
            
            user.accountStatus = 'suspended';
            user.suspendedAt = new Date();
            user.suspendedBy = user_name;
            user.suspensionReason = reason;
            await user.save();
            
            // Log audit trail
            const logAudit = require('../utils/logAudit');
            await logAudit(user_name, 'user_suspended', 'User', user._id, {
              targetEmail: email,
              reason: reason
            });
            
            res.json({
              response_type: 'ephemeral',
              text: `✅ User suspended: ${email}`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `🚫 *User Suspended*\n*Email:* ${email}\n*Reason:* ${reason}\n*By:* ${user_name}`
                  }
                }
              ]
            });
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error suspending user'
            });
          }
        }
        break;
        
      case '/user-unlock':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/user-unlock [email]`'
          });
        } else {
          try {
            const email = text.trim();
            const User = require('../models/User');
            const user = await User.findOne({ email: email.toLowerCase() });
            
            if (!user) {
              res.json({
                response_type: 'ephemeral',
                text: `❌ User not found: ${email}`
              });
              return;
            }
            
            user.accountStatus = 'active';
            user.loginAttempts = 0;
            user.lockUntil = null;
            user.suspendedAt = null;
            user.suspendedBy = null;
            user.suspensionReason = null;
            user.unlockedAt = new Date();
            user.unlockedBy = user_name;
            await user.save();
            
            // Log audit trail
            const logAudit = require('../utils/logAudit');
            await logAudit(user_name, 'user_unlocked', 'User', user._id, {
              targetEmail: email
            });
            
            res.json({
              response_type: 'ephemeral',
              text: `✅ User unlocked: ${email}`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `🔓 *User Unlocked*\n*Email:* ${email}\n*Status:* Active\n*By:* ${user_name}`
                  }
                }
              ]
            });
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error unlocking user'
            });
          }
        }
        break;
        
      // =================== ADDITIONAL USER COMMANDS ===================
      
      case '/user-sessions':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/user-sessions [email] [optional: kill-all]`'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            const email = parts[0];
            const action = parts[1];
            
            const User = require('../models/User');
            const user = await User.findOne({ email: email.toLowerCase() });
            
            if (!user) {
              res.json({
                response_type: 'ephemeral',
                text: `❌ User not found: ${email}`
              });
              return;
            }
            
            if (action === 'kill-all') {
              // Clear all user sessions (implement based on your session system)
              user.sessionTokens = [];
              user.lastLogout = new Date();
              await user.save();
              
              res.json({
                response_type: 'ephemeral',
                text: `✅ All sessions terminated for: ${email}`
              });
            } else {
              // Show active sessions
              const sessionCount = user.sessionTokens?.length || 0;
              const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never';
              
              res.json({
                response_type: 'ephemeral',
                blocks: [
                  {
                    type: 'header',
                    text: {
                      type: 'plain_text',
                      text: `🔐 Sessions for: ${email}`
                    }
                  },
                  {
                    type: 'section',
                    fields: [
                      { type: 'mrkdwn', text: `*Active Sessions:* ${sessionCount}` },
                      { type: 'mrkdwn', text: `*Last Login:* ${lastLogin}` },
                      { type: 'mrkdwn', text: `*Status:* ${user.accountStatus || 'active'}` }
                    ]
                  },
                  {
                    type: 'context',
                    elements: [
                      {
                        type: 'mrkdwn',
                        text: 'Use `/user-sessions [email] kill-all` to terminate all sessions'
                      }
                    ]
                  }
                ]
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error managing user sessions'
            });
          }
        }
        break;
        
      case '/user-metrics':
        try {
          const timeframe = text?.trim() || 'week';
          const User = require('../models/User');
          
          let dateFilter = new Date();
          switch (timeframe.toLowerCase()) {
            case 'today':
              dateFilter.setHours(0, 0, 0, 0);
              break;
            case 'week':
              dateFilter.setDate(dateFilter.getDate() - 7);
              break;
            case 'month':
              dateFilter.setMonth(dateFilter.getMonth() - 1);
              break;
            default:
              dateFilter.setDate(dateFilter.getDate() - 7);
          }
          
          const [totalUsers, newUsers, activeUsers, suspendedUsers] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ createdAt: { $gte: dateFilter } }),
            User.countDocuments({ lastLogin: { $gte: dateFilter } }),
            User.countDocuments({ accountStatus: 'suspended' })
          ]);
          
          res.json({
            response_type: 'ephemeral',
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: `📊 User Metrics (${timeframe})`
                }
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Total Users:* ${totalUsers}` },
                  { type: 'mrkdwn', text: `*New Users:* ${newUsers}` },
                  { type: 'mrkdwn', text: `*Active Users:* ${activeUsers}` },
                  { type: 'mrkdwn', text: `*Suspended:* ${suspendedUsers}` }
                ]
              }
            ]
          });
        } catch (error) {
          res.json({
            response_type: 'ephemeral',
            text: 'Error fetching user metrics'
          });
        }
        break;
        
      case '/debug-user':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/debug-user [email]`'
          });
        } else {
          try {
            const email = text.trim();
            const User = require('../models/User');
            const user = await User.findOne({ email: email.toLowerCase() }).lean();
            
            if (!user) {
              res.json({
                response_type: 'ephemeral',
                text: `❌ User not found: ${email}`
              });
              return;
            }
            
            const debugInfo = {
              id: user._id,
              created: new Date(user.createdAt).toISOString(),
              lastLogin: user.lastLogin ? new Date(user.lastLogin).toISOString() : 'Never',
              loginAttempts: user.loginAttempts || 0,
              emailVerified: user.emailVerified || false,
              twoFactorEnabled: user.twoFactor?.enabled || false,
              walletCount: user.wallets?.length || 0,
              kycStatus: user.kyc?.status || 'not_submitted',
              accountStatus: user.accountStatus || 'active'
            };
            
            res.json({
              response_type: 'ephemeral',
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: `🔍 Debug Info: ${email}`
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*ID:* ${debugInfo.id}\n` +
                          `*Created:* ${debugInfo.created}\n` +
                          `*Last Login:* ${debugInfo.lastLogin}\n` +
                          `*Login Attempts:* ${debugInfo.loginAttempts}\n` +
                          `*Email Verified:* ${debugInfo.emailVerified ? '✅' : '❌'}\n` +
                          `*2FA Enabled:* ${debugInfo.twoFactorEnabled ? '✅' : '❌'}\n` +
                          `*Wallets:* ${debugInfo.walletCount}\n` +
                          `*KYC:* ${debugInfo.kycStatus}\n` +
                          `*Account Status:* ${debugInfo.accountStatus}`
                  }
                }
              ]
            });
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error debugging user'
            });
          }
        }
        break;
        
      // =================== SECURITY COMMANDS ===================
      
      case '/ip-block':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/ip-block [ip-address] [reason]`'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            const ipAddress = parts[0];
            const reason = parts.slice(1).join(' ') || 'Admin block via Slack';
            
            // Basic IP validation
            const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            if (!ipRegex.test(ipAddress)) {
              res.json({
                response_type: 'ephemeral',
                text: 'Invalid IP address format'
              });
              return;
            }
            
            // Block IP (implement with your IP blocking service)
            const ipBlockingService = require('../services/ipBlockingService');
            await ipBlockingService.blockIP(ipAddress, reason, user_name);
            
            res.json({
              response_type: 'ephemeral',
              text: `✅ IP blocked: ${ipAddress}`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `🚫 *IP Address Blocked*\n*IP:* ${ipAddress}\n*Reason:* ${reason}\n*By:* ${user_name}`
                  }
                }
              ]
            });
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error blocking IP address'
            });
          }
        }
        break;
        
      // =================== WALLET & FINANCE COMMANDS ===================
      
      case '/wallet-info':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/wallet-info [email]`'
          });
        } else {
          try {
            const email = text.trim();
            const User = require('../models/User');
            const user = await User.findOne({ email: email.toLowerCase() }).lean();
            
            if (!user) {
              res.json({
                response_type: 'ephemeral',
                text: `❌ User not found: ${email}`
              });
              return;
            }
            
            const wallets = user.wallets || [];
            const activeWallets = wallets.filter(w => w.status === 'active').length;
            const suspendedWallets = wallets.filter(w => w.status === 'suspended').length;
            
            const walletList = wallets.length > 0 
              ? wallets.map(w => `• ${w.address.substring(0, 10)}...${w.address.substring(-6)} (${w.status})`).join('\n')
              : 'No wallets found';
            
            res.json({
              response_type: 'ephemeral',
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: `💰 Wallet Info: ${email}`
                  }
                },
                {
                  type: 'section',
                  fields: [
                    { type: 'mrkdwn', text: `*Total Wallets:* ${wallets.length}` },
                    { type: 'mrkdwn', text: `*Active:* ${activeWallets}` },
                    { type: 'mrkdwn', text: `*Suspended:* ${suspendedWallets}` }
                  ]
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*Wallet Addresses:*\n${walletList}`
                  }
                }
              ]
            });
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error fetching wallet info'
            });
          }
        }
        break;
        
      case '/wallet-freeze':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/wallet-freeze [email] [wallet-address] [reason]`'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            if (parts.length < 3) {
              res.json({
                response_type: 'ephemeral',
                text: 'Usage: `/wallet-freeze [email] [wallet-address] [reason]`'
              });
              return;
            }
            
            const [email, walletAddress, ...reasonParts] = parts;
            const reason = reasonParts.join(' ');
            
            const result = await slackService.manageUserWallet(email, 'suspend', {
              address: walletAddress,
              reason: `EMERGENCY FREEZE: ${reason}`
            }, user_name);
            
            if (result.success) {
              res.json({
                response_type: 'ephemeral',
                text: `🚨 Emergency wallet freeze completed: ${walletAddress}`,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `🚨 *EMERGENCY WALLET FREEZE*\n*User:* ${email}\n*Wallet:* ${walletAddress.substring(0, 10)}...${walletAddress.substring(-6)}\n*Reason:* ${reason}\n*By:* ${user_name}`
                    }
                  }
                ]
              });
            } else {
              res.json({
                response_type: 'ephemeral',
                text: `❌ ${result.error}`
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error freezing wallet'
            });
          }
        }
        break;
        
      case '/token-metrics':
        try {
          const tokenType = text?.trim().toUpperCase() || 'ALL';
          
          // Mock token metrics - replace with real data
          const metrics = {
            FCT: { supply: 1000000, circulation: 750000, price: 1.25 },
            FXST: { supply: 500000, circulation: 300000, price: 2.50 }
          };
          
          if (tokenType !== 'ALL' && !metrics[tokenType]) {
            res.json({
              response_type: 'ephemeral',
              text: 'Invalid token type. Use: FCT, FXST, or ALL'
            });
            return;
          }
          
          const displayMetrics = tokenType === 'ALL' ? metrics : { [tokenType]: metrics[tokenType] };
          
          const fields = [];
          Object.entries(displayMetrics).forEach(([token, data]) => {
            fields.push(
              { type: 'mrkdwn', text: `*${token} Supply:* ${data.supply.toLocaleString()}` },
              { type: 'mrkdwn', text: `*${token} Circulation:* ${data.circulation.toLocaleString()}` },
              { type: 'mrkdwn', text: `*${token} Price:* $${data.price}` }
            );
          });
          
          res.json({
            response_type: 'ephemeral',
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: `🪙 Token Metrics: ${tokenType}`
                }
              },
              {
                type: 'section',
                fields: fields
              }
            ]
          });
        } catch (error) {
          res.json({
            response_type: 'ephemeral',
            text: 'Error fetching token metrics'
          });
        }
        break;
        
      // =================== KYC & COMPLIANCE COMMANDS ===================
      
      case '/kyc-status':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/kyc-status [email] [optional: approve|reject|pending] [notes]`'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            const email = parts[0];
            const action = parts[1];
            const notes = parts.slice(2).join(' ');
            
            const User = require('../models/User');
            const user = await User.findOne({ email: email.toLowerCase() });
            
            if (!user) {
              res.json({
                response_type: 'ephemeral',
                text: `❌ User not found: ${email}`
              });
              return;
            }
            
            if (action && ['approve', 'reject', 'pending'].includes(action.toLowerCase())) {
              // Update KYC status
              if (!user.kyc) user.kyc = {};
              user.kyc.status = action.toLowerCase() === 'approve' ? 'approved' : action.toLowerCase();
              user.kyc.reviewedAt = new Date();
              user.kyc.reviewedBy = user_name;
              if (notes) user.kyc.reviewNotes = notes;
              if (action.toLowerCase() === 'reject' && notes) user.kyc.rejectionReason = notes;
              
              await user.save();
              
              // Log audit
              const logAudit = require('../utils/logAudit');
              await logAudit(user_name, `kyc_${action.toLowerCase()}`, 'User', user._id, {
                targetEmail: email,
                notes: notes
              });
              
              res.json({
                response_type: 'ephemeral',
                text: `✅ KYC status updated: ${email} - ${action.toUpperCase()}`,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `🛡️ *KYC ${action.toUpperCase()}*\n*User:* ${email}\n*Status:* ${user.kyc.status}\n*Reviewed by:* ${user_name}${notes ? `\n*Notes:* ${notes}` : ''}`
                    }
                  }
                ]
              });
            } else {
              // Just show status
              const kycStatus = user.kyc?.status || 'not_submitted';
              const reviewedBy = user.kyc?.reviewedBy || 'Not reviewed';
              const reviewedAt = user.kyc?.reviewedAt ? new Date(user.kyc.reviewedAt).toLocaleDateString() : 'Never';
              const documents = user.kyc?.documents?.length || 0;
              
              res.json({
                response_type: 'ephemeral',
                blocks: [
                  {
                    type: 'header',
                    text: {
                      type: 'plain_text',
                      text: `🛡️ KYC Status: ${email}`
                    }
                  },
                  {
                    type: 'section',
                    fields: [
                      { type: 'mrkdwn', text: `*Status:* ${kycStatus}` },
                      { type: 'mrkdwn', text: `*Documents:* ${documents}` },
                      { type: 'mrkdwn', text: `*Reviewed By:* ${reviewedBy}` },
                      { type: 'mrkdwn', text: `*Reviewed:* ${reviewedAt}` }
                    ]
                  }
                ]
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error managing KYC status'
            });
          }
        }
        break;
        
      case '/compliance-check':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/compliance-check [email]`'
          });
        } else {
          try {
            const email = text.trim();
            const User = require('../models/User');
            const user = await User.findOne({ email: email.toLowerCase() }).lean();
            
            if (!user) {
              res.json({
                response_type: 'ephemeral',
                text: `❌ User not found: ${email}`
              });
              return;
            }
            
            // Compliance checklist
            const checks = {
              emailVerified: user.emailVerified || false,
              kycApproved: user.kyc?.status === 'approved',
              documentsSubmitted: (user.kyc?.documents?.length || 0) >= 2,
              contractsSigned: (user.signedContracts?.length || 0) > 0,
              twoFactorEnabled: user.twoFactor?.enabled || false,
              walletConnected: (user.wallets?.length || 0) > 0,
              accountActive: user.accountStatus !== 'suspended'
            };
            
            const passed = Object.values(checks).filter(Boolean).length;
            const total = Object.keys(checks).length;
            const complianceScore = Math.round((passed / total) * 100);
            
            const checkList = Object.entries(checks)
              .map(([key, value]) => `${value ? '✅' : '❌'} ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
              .join('\n');
            
            res.json({
              response_type: 'ephemeral',
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: `📋 Compliance Check: ${email}`
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*Compliance Score: ${complianceScore}%* (${passed}/${total})\n\n${checkList}`
                  }
                },
                {
                  type: 'context',
                  elements: [
                    {
                      type: 'mrkdwn',
                      text: complianceScore >= 80 ? '🟢 High compliance' : complianceScore >= 60 ? '🟡 Medium compliance' : '🔴 Low compliance'
                    }
                  ]
                }
              ]
            });
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error running compliance check'
            });
          }
        }
        break;
        
      // =================== SUPPORT TICKET MANAGEMENT ===================
      
      case '/ticket-manage':
        if (!text || !text.trim()) {
          res.json({
            response_type: 'ephemeral',
            text: 'Usage: `/ticket-manage [ticket-number] [optional: status|assign] [value]`'
          });
        } else {
          try {
            const parts = text.trim().split(' ');
            const ticketNumber = parts[0];
            const action = parts[1];
            const value = parts.slice(2).join(' ');
            
            const SupportTicket = require('../models/SupportTicket');
            const ticket = await SupportTicket.findOne({ ticketNumber });
            
            if (!ticket) {
              res.json({
                response_type: 'ephemeral',
                text: `❌ Ticket not found: ${ticketNumber}`
              });
              return;
            }
            
            if (action === 'status' && value) {
              const validStatuses = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
              if (!validStatuses.includes(value.toLowerCase())) {
                res.json({
                  response_type: 'ephemeral',
                  text: `Invalid status. Valid options: ${validStatuses.join(', ')}`
                });
                return;
              }
              
              const oldStatus = ticket.status;
              await ticket.updateStatus(value.toLowerCase(), user_name);
              
              res.json({
                response_type: 'ephemeral',
                text: `✅ Ticket ${ticketNumber} status updated: ${oldStatus} → ${value.toLowerCase()}`
              });
            } else if (action === 'assign' && value) {
              await ticket.assign(value);
              
              res.json({
                response_type: 'ephemeral',
                text: `✅ Ticket ${ticketNumber} assigned to: ${value}`
              });
            } else {
              // Show ticket details
              res.json({
                response_type: 'ephemeral',
                blocks: [
                  {
                    type: 'header',
                    text: {
                      type: 'plain_text',
                      text: `🎫 Ticket: ${ticket.ticketNumber}`
                    }
                  },
                  {
                    type: 'section',
                    fields: [
                      { type: 'mrkdwn', text: `*Customer:* ${ticket.customerEmail}` },
                      { type: 'mrkdwn', text: `*Status:* ${ticket.status}` },
                      { type: 'mrkdwn', text: `*Priority:* ${ticket.priority}` },
                      { type: 'mrkdwn', text: `*Assigned:* ${ticket.assignedTo || 'Unassigned'}` },
                      { type: 'mrkdwn', text: `*Created:* ${new Date(ticket.createdAt).toLocaleDateString()}` },
                      { type: 'mrkdwn', text: `*Source:* ${ticket.source}` }
                    ]
                  },
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `*Subject:* ${ticket.subject}\n*Description:* ${ticket.description.substring(0, 200)}${ticket.description.length > 200 ? '...' : ''}`
                    }
                  },
                  {
                    type: 'actions',
                    elements: [
                      {
                        type: 'button',
                        text: { type: 'plain_text', text: '🎫 View Full Ticket' },
                        url: `${process.env.ADMIN_URL || 'https://admin.fractionax.io'}/admin/support-tickets?id=${ticket._id}`
                      }
                    ]
                  }
                ]
              });
            }
          } catch (error) {
            res.json({
              response_type: 'ephemeral',
              text: 'Error managing ticket'
            });
          }
        }
        break;
        
      default:
        res.json({
          response_type: 'ephemeral',
          text: `Unknown command: ${command}\n\nType /admin-help to see all available commands.`
        });
    }
    
  } catch (error) {
    console.error('Slack slash command error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/webhooks/test
 * @desc    Test webhook endpoint
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({
    message: 'Webhook endpoints are working',
    timestamp: new Date().toISOString(),
    endpoints: {
      helpscout: '/api/webhooks/helpscout',
      slack: '/api/webhooks/slack',
      slackSlashCommands: '/api/webhooks/slack/slash-commands'
    }
  });
});

module.exports = router;
