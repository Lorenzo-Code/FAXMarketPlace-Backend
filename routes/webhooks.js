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
                text: '🛠️ FractionaX Admin Commands (25 Total)'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*🔧 System:* `/system-status` `/api-health`\\n' +
                      '*👤 Users:* `/user-info` `/user-search` `/user-suspend` `/user-unlock` `/user-sessions` `/user-audit` `/user-metrics` `/debug-user`\\n' +
                      '*🔐 Security:* `/reset-password` `/toggle-2fa` `/security-alert` `/ip-block`\\n' +
                      '*💰 Wallets:* `/wallet-info` `/wallet-manage` `/wallet-freeze` `/token-metrics`\\n' +
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
router.post('/commands', express.urlencoded({ extended: true }), verifySlackSignature, handleSlashCommand);

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

router.post('/interactivity', slackBodyParser, conditionalSlackSignatureVerification, async (req, res) => {
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
      slackCommands: '/slack/commands',
      slackInteractivity: '/slack/interactivity'
    }
  });
});

module.exports = router;
