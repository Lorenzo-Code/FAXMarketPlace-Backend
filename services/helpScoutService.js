const axios = require('axios');
const SupportTicket = require('../models/SupportTicket');

class HelpScoutService {
  constructor() {
    this.apiKey = process.env.HELPSCOUT_API_KEY;
    this.mailboxId = process.env.HELPSCOUT_MAILBOX_ID;
    this.baseUrl = 'https://api.helpscout.net/v2';
    this.connected = false;
    this.lastSync = null;
    
    if (this.apiKey) {
      this.init();
    }
  }

  async init() {
    try {
      // Test connection
      await this.getStatus();
      this.connected = true;
      console.log('✅ Help Scout service initialized');
    } catch (error) {
      console.error('❌ Help Scout service initialization failed:', error.message);
      this.connected = false;
    }
  }

  getAuthHeaders() {
    if (!this.apiKey) {
      throw new Error('Help Scout API key not configured');
    }
    
    return {
      'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
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
        config.data = data;
      }

      const response = await axios(config);
      return { success: true, data: response.data };
    } catch (error) {
      console.error(`Help Scout API Error (${method} ${endpoint}):`, error.response?.data || error.message);
      return { 
        success: false, 
        error: error.response?.data || error.message,
        status: error.response?.status
      };
    }
  }

  async getStatus() {
    const result = await this.makeRequest('GET', '/mailboxes');
    return {
      connected: result.success,
      lastSync: this.lastSync,
      mailboxes: result.success ? result.data?._embedded?.mailboxes?.length || 0 : 0
    };
  }

  async createConversation({ customerEmail, customerName, subject, description, ticketId, priority }) {
    if (!this.connected) {
      return { success: false, error: 'Help Scout not connected' };
    }

    try {
      // First, create or get customer
      const customerResult = await this.createOrGetCustomer(customerEmail, customerName);
      if (!customerResult.success) {
        return customerResult;
      }

      const customerId = customerResult.customerId;
      
      // Map priority to Help Scout status
      const statusMapping = {
        'urgent': 'active',
        'high': 'active', 
        'medium': 'active',
        'low': 'pending'
      };

      const conversationData = {
        subject,
        mailboxId: this.mailboxId,
        type: 'email',
        status: statusMapping[priority] || 'active',
        customer: {
          id: customerId
        },
        threads: [{
          type: 'customer',
          customer: {
            id: customerId
          },
          text: description
        }],
        tags: [`fractionax-ticket`, `priority-${priority}`, `ticket-${ticketId}`]
      };

      const result = await this.makeRequest('POST', '/conversations', conversationData);
      
      if (result.success) {
        const conversationId = result.data?.id;
        return { 
          success: true, 
          conversationId,
          customerId,
          url: `https://secure.helpscout.net/conversation/${conversationId}`
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('Help Scout conversation creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async createOrGetCustomer(email, name) {
    try {
      // Check if customer exists
      const searchResult = await this.makeRequest('GET', `/customers?email=${encodeURIComponent(email)}`);
      
      if (searchResult.success && searchResult.data?._embedded?.customers?.length > 0) {
        const existingCustomer = searchResult.data._embedded.customers[0];
        return { 
          success: true, 
          customerId: existingCustomer.id,
          existing: true
        };
      }

      // Create new customer
      const customerData = {
        firstName: name.split(' ')[0] || '',
        lastName: name.split(' ').slice(1).join(' ') || '',
        email: email
      };

      const createResult = await this.makeRequest('POST', '/customers', customerData);
      
      if (createResult.success) {
        return { 
          success: true, 
          customerId: createResult.data.id,
          existing: false
        };
      } else {
        return createResult;
      }
    } catch (error) {
      console.error('Help Scout customer creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async updateConversationStatus(conversationId, status) {
    if (!this.connected) {
      return { success: false, error: 'Help Scout not connected' };
    }

    const statusMapping = {
      'open': 'active',
      'in_progress': 'active',
      'waiting_customer': 'pending',
      'resolved': 'closed',
      'closed': 'closed'
    };

    const helpScoutStatus = statusMapping[status] || 'active';
    
    return await this.makeRequest('PUT', `/conversations/${conversationId}`, {
      status: helpScoutStatus
    });
  }

  async addNote(conversationId, text, author) {
    if (!this.connected) {
      return { success: false, error: 'Help Scout not connected' };
    }

    const noteData = {
      text: `${text}\n\n---\nFrom: ${author} (FractionaX Admin)`,
      type: 'note'
    };

    return await this.makeRequest('POST', `/conversations/${conversationId}/threads`, noteData);
  }

  async addReply(conversationId, text, customerEmail) {
    if (!this.connected) {
      return { success: false, error: 'Help Scout not connected' };
    }

    const replyData = {
      text,
      type: 'reply'
    };

    return await this.makeRequest('POST', `/conversations/${conversationId}/threads`, replyData);
  }

  async getConversation(conversationId) {
    if (!this.connected) {
      return { success: false, error: 'Help Scout not connected' };
    }

    return await this.makeRequest('GET', `/conversations/${conversationId}`);
  }

  async getConversationThreads(conversationId) {
    if (!this.connected) {
      return { success: false, error: 'Help Scout not connected' };
    }

    return await this.makeRequest('GET', `/conversations/${conversationId}/threads`);
  }

  async syncAllTickets() {
    if (!this.connected) {
      return { success: false, error: 'Help Scout not connected' };
    }

    try {
      const tickets = await SupportTicket.find({
        'integration.helpScout.conversationId': { $exists: true },
        'integration.helpScout.syncStatus': { $ne: 'synced' }
      });

      let synced = 0;
      let failed = 0;

      for (const ticket of tickets) {
        try {
          const conversationResult = await this.getConversation(
            ticket.integration.helpScout.conversationId
          );

          if (conversationResult.success) {
            const conversation = conversationResult.data;
            
            // Update ticket status based on Help Scout conversation
            if (conversation.status === 'closed' && ticket.status !== 'resolved') {
              await ticket.updateStatus('resolved');
            }

            ticket.integration.helpScout.syncStatus = 'synced';
            ticket.integration.helpScout.lastSyncAt = new Date();
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
      console.error('Help Scout sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  async importConversations(limit = 50) {
    if (!this.connected) {
      return { success: false, error: 'Help Scout not connected' };
    }

    try {
      const result = await this.makeRequest('GET', `/conversations?mailbox=${this.mailboxId}&status=all&sortField=modifiedAt&sortOrder=desc&page=1&embed=threads`);
      
      if (!result.success) {
        return result;
      }

      const conversations = result.data?._embedded?.conversations || [];
      let imported = 0;
      let skipped = 0;

      for (const conversation of conversations.slice(0, limit)) {
        try {
          // Check if ticket already exists
          const existingTicket = await SupportTicket.findOne({
            'integration.helpScout.conversationId': conversation.id
          });

          if (existingTicket) {
            skipped++;
            continue;
          }

          // Create ticket from Help Scout conversation
          const threads = conversation._embedded?.threads || [];
          const firstThread = threads.find(t => t.type === 'customer') || threads[0];
          
          if (!firstThread) {
            skipped++;
            continue;
          }

          const ticketData = {
            subject: conversation.subject,
            description: firstThread.text || 'Imported from Help Scout',
            customerEmail: conversation.customer?.email || 'unknown@email.com',
            customerName: `${conversation.customer?.firstName || ''} ${conversation.customer?.lastName || ''}`.trim() || 'Unknown Customer',
            source: 'helpscout',
            status: this.mapHelpScoutStatus(conversation.status),
            priority: 'medium',
            category: 'general',
            integration: {
              helpScout: {
                conversationId: conversation.id,
                syncStatus: 'synced',
                lastSyncAt: new Date()
              }
            }
          };

          const ticket = new SupportTicket(ticketData);
          await ticket.save();
          imported++;
        } catch (error) {
          console.error(`Failed to import conversation ${conversation.id}:`, error);
          skipped++;
        }
      }

      return {
        success: true,
        imported,
        skipped,
        total: conversations.length
      };
    } catch (error) {
      console.error('Help Scout import failed:', error);
      return { success: false, error: error.message };
    }
  }

  mapHelpScoutStatus(helpScoutStatus) {
    const statusMap = {
      'active': 'in_progress',
      'pending': 'waiting_customer',
      'closed': 'resolved',
      'spam': 'closed'
    };
    return statusMap[helpScoutStatus] || 'open';
  }

  async webhookHandler(webhookData) {
    try {
      const { type, resource } = webhookData;
      
      if (type === 'conversation.status' && resource?.id) {
        // Find the corresponding ticket
        const ticket = await SupportTicket.findOne({
          'integration.helpScout.conversationId': resource.id
        });

        if (ticket) {
          const newStatus = this.mapHelpScoutStatus(resource.status);
          if (ticket.status !== newStatus) {
            await ticket.updateStatus(newStatus);
            console.log(`Ticket ${ticket.ticketNumber} status updated via Help Scout webhook: ${newStatus}`);
          }
        }
      }

      if (type === 'conversation.customer' && resource?.id) {
        // Handle new customer messages
        const ticket = await SupportTicket.findOne({
          'integration.helpScout.conversationId': resource.id
        });

        if (ticket && resource.threads) {
          const latestThread = resource.threads[0];
          if (latestThread.type === 'customer') {
            await ticket.addComment({
              author: ticket.customerName,
              authorType: 'customer',
              content: latestThread.text || 'Message from Help Scout',
              isInternal: false
            });
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Help Scout webhook handler error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new HelpScoutService();
