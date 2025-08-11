const axios = require('axios');
const { WebClient } = require('@slack/web-api');
const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');

class SlackService {
  constructor() {
    this.botToken = process.env.SLACK_BOT_TOKEN;
    this.channelId = process.env.SLACK_SUPPORT_CHANNEL_ID;
    this.baseUrl = 'https://slack.com/api';
    this.connected = false;
    this.lastSync = null;
    
    if (this.botToken) {
      this.init();
    }
  }

  async init() {
    try {
      // Test connection
      const status = await this.getStatus();
      this.connected = status.connected;
      console.log('✅ Slack service initialized');
    } catch (error) {
      console.error('❌ Slack service initialization failed:', error.message);
      this.connected = false;
    }
  }

  getAuthHeaders() {
    if (!this.botToken) {
      throw new Error('Slack bot token not configured');
    }
    
    return {
      'Authorization': `Bearer ${this.botToken}`,
      'Content-Type': 'application/json'
    };
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: this.getAuthHeaders()
      };

      if (data) {
        if (method === 'POST') {
          config.data = data;
        } else {
          config.params = data;
        }
      }

      const response = await axios(config);
      
      if (response.data.ok) {
        return { success: true, data: response.data };
      } else {
        return { 
          success: false, 
          error: response.data.error,
          warning: response.data.warning
        };
      }
    } catch (error) {
      console.error(`Slack API Error (${method} ${endpoint}):`, error.response?.data || error.message);
      return { 
        success: false, 
        error: error.response?.data || error.message,
        status: error.response?.status
      };
    }
  }

  async getStatus() {
    const result = await this.makeRequest('GET', '/auth.test');
    return {
      connected: result.success,
      lastSync: this.lastSync,
      botId: result.success ? result.data.user_id : null,
      team: result.success ? result.data.team : null
    };
  }

  async createTicketThread({ ticket, customerName, customerEmail, subject, description }) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    try {
      const priorityEmojis = {
        'urgent': '🚨',
        'high': '⚠️',
        'medium': '📝',
        'low': '💤'
      };

      const categoryEmojis = {
        'general': '💬',
        'technical': '🔧',
        'billing': '💰',
        'account': '👤',
        'property': '🏠',
        'investment': '📈',
        'tokens': '🪙',
        'kyc': '🛡️'
      };

      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${priorityEmojis[ticket.priority] || '📝'} New Support Ticket: ${ticket.ticketNumber}`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Subject:*\n${subject}`
            },
            {
              type: 'mrkdwn',
              text: `*Priority:* ${ticket.priority.toUpperCase()}`
            },
            {
              type: 'mrkdwn',
              text: `*Customer:*\n${customerName}\n${customerEmail}`
            },
            {
              type: 'mrkdwn',
              text: `*Category:* ${categoryEmojis[ticket.category] || '💬'} ${ticket.category}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Description:*\n${description.length > 500 ? description.substring(0, 500) + '...' : description}`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '🎫 View Ticket' },
              url: `${process.env.ADMIN_URL || 'https://admin.fractionax.io'}/admin/support-tickets?id=${ticket._id}`,
              style: 'primary'
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Mark Resolved' },
              action_id: `resolve_ticket_${ticket._id}`,
              style: 'primary'
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '📋 Assign to Me' },
              action_id: `assign_ticket_${ticket._id}`,
            }
          ]
        }
      ];

      if (ticket.integration?.helpScout?.conversationId) {
        blocks[blocks.length - 1].elements.push({
          type: 'button',
          text: { type: 'plain_text', text: '💬 Help Scout' },
          url: `https://secure.helpscout.net/conversation/${ticket.integration.helpScout.conversationId}`
        });
      }

      const messageData = {
        channel: this.channelId,
        blocks,
        text: `New Support Ticket: ${ticket.ticketNumber} from ${customerEmail}`
      };

      const result = await this.makeRequest('POST', '/chat.postMessage', messageData);
      
      if (result.success) {
        return {
          success: true,
          threadId: result.data.ts,
          messageTs: result.data.ts,
          channelId: result.data.channel,
          permalink: result.data.message?.permalink
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('Slack thread creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async postStatusUpdate(threadTs, { ticketNumber, oldStatus, newStatus, updatedBy }) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    const statusEmojis = {
      'open': '🟢',
      'in_progress': '🟡',
      'waiting_customer': '🔵',
      'resolved': '✅',
      'closed': '🔒'
    };

    const text = `${statusEmojis[newStatus] || '🔄'} *Ticket ${ticketNumber}* status changed: \`${oldStatus}\` → \`${newStatus}\` by ${updatedBy}`;

    return await this.makeRequest('POST', '/chat.postMessage', {
      channel: this.channelId,
      thread_ts: threadTs,
      text
    });
  }

  async postAssignmentUpdate(threadTs, { ticketNumber, assignedTo, assignedBy }) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    const text = `👤 *Ticket ${ticketNumber}* assigned to **${assignedTo}** by ${assignedBy}`;

    return await this.makeRequest('POST', '/chat.postMessage', {
      channel: this.channelId,
      thread_ts: threadTs,
      text
    });
  }

  async postComment(threadTs, { ticketNumber, comment, author }) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💬 **${author}** added a comment to *Ticket ${ticketNumber}*:`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> ${comment}`
        }
      }
    ];

    return await this.makeRequest('POST', '/chat.postMessage', {
      channel: this.channelId,
      thread_ts: threadTs,
      blocks,
      text: `New comment on Ticket ${ticketNumber} by ${author}`
    });
  }

  async archiveThread(threadTs) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    try {
      // Add archived status to the thread
      const result = await this.makeRequest('POST', '/chat.postMessage', {
        channel: this.channelId,
        thread_ts: threadTs,
        text: '🗄️ *Thread archived* - Ticket has been resolved'
      });

      // Note: Slack doesn't have a direct "archive thread" API
      // We just mark it as archived in our system
      return result;
    } catch (error) {
      console.error('Slack thread archiving failed:', error);
      return { success: false, error: error.message };
    }
  }

  async postCustomerMessage(threadTs, { ticketNumber, customerName, message }) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📧 **${customerName}** replied to *Ticket ${ticketNumber}*:`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> ${message}`
        }
      }
    ];

    return await this.makeRequest('POST', '/chat.postMessage', {
      channel: this.channelId,
      thread_ts: threadTs,
      blocks,
      text: `Customer reply on Ticket ${ticketNumber}`
    });
  }

  async getThreadReplies(threadTs) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    return await this.makeRequest('GET', '/conversations.replies', {
      channel: this.channelId,
      ts: threadTs
    });
  }

  async updateMessage(messageTs, blocks, text) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    return await this.makeRequest('POST', '/chat.update', {
      channel: this.channelId,
      ts: messageTs,
      blocks,
      text
    });
  }

  async deleteMessage(messageTs) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    return await this.makeRequest('POST', '/chat.delete', {
      channel: this.channelId,
      ts: messageTs
    });
  }

  async sendDirectMessage(userId, message) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    try {
      // Open DM channel
      const dmResult = await this.makeRequest('POST', '/conversations.open', {
        users: userId
      });

      if (!dmResult.success) {
        return dmResult;
      }

      const channelId = dmResult.data.channel.id;

      // Send message
      return await this.makeRequest('POST', '/chat.postMessage', {
        channel: channelId,
        text: message
      });
    } catch (error) {
      console.error('Slack DM failed:', error);
      return { success: false, error: error.message };
    }
  }

  async notifyUrgentTicket(ticket) {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    const urgentMessage = {
      channel: this.channelId,
      text: `🚨 URGENT TICKET ALERT 🚨`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 URGENT TICKET CREATED'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Ticket:* ${ticket.ticketNumber}\n*Customer:* ${ticket.customerName} (${ticket.customerEmail})\n*Subject:* ${ticket.subject}\n\n<!channel> Immediate attention required!`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '🎫 View Ticket' },
              url: `${process.env.ADMIN_URL || 'https://admin.fractionax.io'}/admin/support-tickets?id=${ticket._id}`,
              style: 'danger'
            }
          ]
        }
      ]
    };

    return await this.makeRequest('POST', '/chat.postMessage', urgentMessage);
  }

  async handleInteractivePayload(payload) {
    try {
      const { actions, user, response_url, message } = payload;
      
      if (!actions || actions.length === 0) {
        return { success: false, error: 'No actions in payload' };
      }

      const action = actions[0];
      const actionId = action.action_id;

      // Handle ticket resolution
      if (actionId.startsWith('resolve_ticket_')) {
        const ticketId = actionId.replace('resolve_ticket_', '');
        const ticket = await SupportTicket.findById(ticketId);
        
        if (ticket) {
          await ticket.updateStatus('resolved');
          
          // Update the message
          const updatedBlocks = [...message.blocks];
          updatedBlocks.push({
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `✅ Resolved by <@${user.id}> at ${new Date().toLocaleString()}`
              }
            ]
          });

          await this.updateMessage(message.ts, updatedBlocks, message.text);
          
          return { success: true, message: 'Ticket resolved successfully' };
        }
      }

      // Handle ticket assignment
      if (actionId.startsWith('assign_ticket_')) {
        const ticketId = actionId.replace('assign_ticket_', '');
        const ticket = await SupportTicket.findById(ticketId);
        
        if (ticket) {
          // Get user info
          const userInfo = await this.makeRequest('GET', '/users.info', { user: user.id });
          const userName = userInfo.success ? userInfo.data.user.real_name || userInfo.data.user.name : user.name;
          
          await ticket.assign(userName);
          
          await this.postAssignmentUpdate(message.ts, {
            ticketNumber: ticket.ticketNumber,
            assignedTo: userName,
            assignedBy: userName
          });
          
          return { success: true, message: 'Ticket assigned successfully' };
        }
      }

      return { success: false, error: 'Unknown action' };
    } catch (error) {
      console.error('Slack interactive payload handling failed:', error);
      return { success: false, error: error.message };
    }
  }

  async syncAllTickets() {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    try {
      const tickets = await SupportTicket.find({
        'integration.slack.threadId': { $exists: true, $ne: null }
      });

      let synced = 0;
      let failed = 0;

      for (const ticket of tickets) {
        try {
          // Check if thread still exists
          const threadResult = await this.getThreadReplies(ticket.integration.slack.threadId);
          
          if (threadResult.success) {
            ticket.integration.slack.lastSyncAt = new Date();
            await ticket.save();
            synced++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error(`Failed to sync ticket ${ticket.ticketNumber}:`, error);
          failed++;
        }
      }

      this.lastSync = new Date();
      
      return {
        success: true,
        synced,
        failed,
        total: tickets.length
      };
    } catch (error) {
      console.error('Slack sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendDailyDigest() {
    if (!this.connected) {
      return { success: false, error: 'Slack not connected' };
    }

    try {
      const stats = await SupportTicket.getStatistics();
      const overdueTickets = await SupportTicket.find({
        'sla.isOverdue': true,
        status: { $nin: ['resolved', 'closed'] }
      }).limit(5);

      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 Daily Support Tickets Digest'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Total Open:* ${stats.open + stats.inProgress + stats.waitingCustomer}`
            },
            {
              type: 'mrkdwn',
              text: `*Resolved Today:* ${stats.resolved}`
            },
            {
              type: 'mrkdwn',
              text: `*Average Response:* ${stats.avgResponseTimeFormatted}`
            },
            {
              type: 'mrkdwn',
              text: `*Overdue:* ${stats.overdue} tickets`
            }
          ]
        }
      ];

      if (overdueTickets.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🚨 Overdue Tickets:*\n' + overdueTickets.map(t => 
              `• ${t.ticketNumber}: ${t.subject} (${t.customerEmail})`
            ).join('\n')
          }
        });
      }

      return await this.makeRequest('POST', '/chat.postMessage', {
        channel: this.channelId,
        blocks,
        text: 'Daily Support Tickets Digest'
      });
    } catch (error) {
      console.error('Slack daily digest failed:', error);
      return { success: false, error: error.message };
    }
  }

  // =================== ADMIN USER MANAGEMENT METHODS ===================

  async getUserInfo(email) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() })
        .select('-password -twoFactor.secret')
        .lean();
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return { success: true, user };
    } catch (error) {
      console.error('Get user info failed:', error);
      return { success: false, error: error.message };
    }
  }

  async resetUserPassword(email, adminUser) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Update user with temp password and force password change
      user.password = hashedPassword;
      user.mustChangePassword = true;
      user.tempPasswordExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await user.save();

      // Log audit trail
      const logAudit = require('../utils/logAudit');
      await logAudit(adminUser, 'password_reset', 'User', user._id, {
        targetEmail: email,
        action: 'admin_password_reset'
      });

      // Notify admin channel
      await this.makeRequest('POST', '/chat.postMessage', {
        channel: this.channelId,
        text: `🔐 Password reset completed for user: ${email} by ${adminUser}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔐 *Password Reset Completed*\n*User:* ${email}\n*Admin:* ${adminUser}\n*Temp Password:* ||${tempPassword}||\n*Expires:* 24 hours`
            }
          }
        ]
      });

      return { 
        success: true, 
        tempPassword, 
        message: 'Password reset successfully. User must change password on next login.' 
      };
    } catch (error) {
      console.error('Password reset failed:', error);
      return { success: false, error: error.message };
    }
  }

  async toggle2FA(email, enable, adminUser) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (enable) {
        // Enable 2FA - generate new secret
        const speakeasy = require('speakeasy');
        const secret = speakeasy.generateSecret({
          name: 'FractionaX',
          account: user.email,
          length: 32
        });

        user.twoFactor = {
          enabled: true,
          secret: secret.base32,
          backupCodes: Array.from({ length: 8 }, () => 
            Math.random().toString(36).substring(2, 8).toUpperCase()
          )
        };
      } else {
        // Disable 2FA
        user.twoFactor = {
          enabled: false,
          secret: null,
          backupCodes: []
        };
      }

      await user.save();

      // Log audit trail
      const logAudit = require('../utils/logAudit');
      await logAudit(adminUser, `2fa_${enable ? 'enabled' : 'disabled'}`, 'User', user._id, {
        targetEmail: email,
        action: `admin_2fa_${enable ? 'enable' : 'disable'}`
      });

      // Notify admin channel
      await this.makeRequest('POST', '/chat.postMessage', {
        channel: this.channelId,
        text: `🔐 2FA ${enable ? 'enabled' : 'disabled'} for user: ${email} by ${adminUser}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔐 *2FA ${enable ? 'Enabled' : 'Disabled'}*\n*User:* ${email}\n*Admin:* ${adminUser}\n*Status:* ${enable ? '✅ Active' : '❌ Disabled'}`
            }
          }
        ]
      });

      return { success: true, message: `2FA ${enable ? 'enabled' : 'disabled'} successfully` };
    } catch (error) {
      console.error('2FA toggle failed:', error);
      return { success: false, error: error.message };
    }
  }

  async manageUserWallet(email, action, walletData, adminUser) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      let actionMessage = '';
      
      switch (action) {
        case 'add':
          if (!user.wallets) user.wallets = [];
          user.wallets.push({
            address: walletData.address,
            type: walletData.type || 'external',
            status: 'active',
            addedAt: new Date(),
            addedBy: adminUser
          });
          actionMessage = `Added wallet ${walletData.address}`;
          break;
          
        case 'suspend':
          const walletToSuspend = user.wallets?.find(w => w.address === walletData.address);
          if (walletToSuspend) {
            walletToSuspend.status = 'suspended';
            walletToSuspend.suspendedAt = new Date();
            walletToSuspend.suspendedBy = adminUser;
            walletToSuspend.suspensionReason = walletData.reason || 'Admin action';
            actionMessage = `Suspended wallet ${walletData.address}`;
          } else {
            return { success: false, error: 'Wallet not found' };
          }
          break;
          
        case 'remove':
          if (!user.wallets) user.wallets = [];
          const initialLength = user.wallets.length;
          user.wallets = user.wallets.filter(w => w.address !== walletData.address);
          if (user.wallets.length === initialLength) {
            return { success: false, error: 'Wallet not found' };
          }
          actionMessage = `Removed wallet ${walletData.address}`;
          break;
          
        case 'reactivate':
          const walletToReactivate = user.wallets?.find(w => w.address === walletData.address);
          if (walletToReactivate) {
            walletToReactivate.status = 'active';
            walletToReactivate.reactivatedAt = new Date();
            walletToReactivate.reactivatedBy = adminUser;
            actionMessage = `Reactivated wallet ${walletData.address}`;
          } else {
            return { success: false, error: 'Wallet not found' };
          }
          break;
          
        default:
          return { success: false, error: 'Invalid wallet action' };
      }

      await user.save();

      // Log audit trail
      const logAudit = require('../utils/logAudit');
      await logAudit(adminUser, `wallet_${action}`, 'User', user._id, {
        targetEmail: email,
        walletAddress: walletData.address,
        action: `admin_wallet_${action}`,
        reason: walletData.reason
      });

      // Notify admin channel
      await this.makeRequest('POST', '/chat.postMessage', {
        channel: this.channelId,
        text: `🪙 Wallet ${action} for user: ${email} by ${adminUser}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🪙 *Wallet Management*\n*User:* ${email}\n*Admin:* ${adminUser}\n*Action:* ${actionMessage}\n*Wallet:* ${walletData.address.substring(0, 10)}...${walletData.address.substring(-8)}`
            }
          }
        ]
      });

      return { success: true, message: actionMessage };
    } catch (error) {
      console.error('Wallet management failed:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserDocuments(email) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() })
        .select('kyc documents email firstName lastName')
        .lean();
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const documents = {
        kyc: user.kyc?.documents || [],
        uploaded: user.documents || [],
        contracts: user.signedContracts || [],
        verificationStatus: {
          identity: user.kyc?.status === 'approved',
          documents: (user.kyc?.documents?.length || 0) >= 2,
          contracts: user.signedContracts?.length > 0
        }
      };

      return { success: true, documents };
    } catch (error) {
      console.error('Get user documents failed:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserAuditLog(email, limit = 20) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const AuditLog = require('../models/AuditLog');
      const auditLogs = await AuditLog.find({
        $or: [
          { userId: user._id },
          { 'metadata.targetEmail': email.toLowerCase() }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

      return { success: true, auditLogs };
    } catch (error) {
      console.error('Get user audit log failed:', error);
      return { success: false, error: error.message };
    }
  }

  async notifySecurityAlert(alertType, userEmail, details, adminUser) {
    try {
      const alertEmojis = {
        'suspicious_login': '🚨',
        'multiple_failed_attempts': '⚠️',
        'unusual_activity': '👀',
        'account_locked': '🔒',
        'wallet_activity': '💰',
        'kyc_issue': '🛡️'
      };

      const emoji = alertEmojis[alertType] || '⚠️';
      
      await this.makeRequest('POST', '/chat.postMessage', {
        channel: this.channelId,
        text: `${emoji} Security Alert: ${alertType} for ${userEmail}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${emoji} Security Alert: ${alertType.replace('_', ' ').toUpperCase()}`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*User:* ${userEmail}`
              },
              {
                type: 'mrkdwn',
                text: `*Alert Type:* ${alertType}`
              },
              {
                type: 'mrkdwn',
                text: `*Reported by:* ${adminUser || 'System'}`
              },
              {
                type: 'mrkdwn',
                text: `*Time:* ${new Date().toLocaleString()}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Details:*\n${details}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '👤 View User' },
                url: `${process.env.ADMIN_URL || 'https://admin.fractionax.io'}/admin/users?email=${userEmail}`,
                style: 'primary'
              }
            ]
          }
        ]
      });

      return { success: true };
    } catch (error) {
      console.error('Security alert notification failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SlackService();
