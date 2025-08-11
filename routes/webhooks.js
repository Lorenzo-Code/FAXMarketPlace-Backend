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
                text: '🛠️ FractionaX Admin Commands'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Support Commands:*\n' +
                      '• `/support-stats` - View support ticket statistics\n' +
                      '• `/create-ticket [email] [subject] - [description]` - Create new ticket\n\n' +
                      '*User Management:*\n' +
                      '• `/user-info [email]` - Get user information\n' +
                      '• `/reset-password [email]` - Reset user password\n' +
                      '• `/toggle-2fa [email] [enable|disable]` - Manage 2FA\n' +
                      '• `/manage-wallet [email] [action] [address]` - Manage wallets\n' +
                      '• `/user-documents [email]` - View user documents\n' +
                      '• `/user-audit [email]` - View audit log\n' +
                      '• `/security-alert [email] [type] [details]` - Send security alert'
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '🛡️ All admin actions are logged and audited.'
                }
              ]
            }
          ]
        });
        break;
        
      default:
        res.json({
          response_type: 'ephemeral',
          text: `Unknown command: ${command}`
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
