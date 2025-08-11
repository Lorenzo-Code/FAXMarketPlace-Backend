const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const helpScoutService = require('../services/helpScoutService');
const slackService = require('../services/slackService');
const { body, validationResult } = require('express-validator');

// Helper function to get user IP address
const getClientIP = (req) => {
  return req.headers['x-forwarded-for'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
};

// Helper function to extract customer name from email or user data
const extractCustomerName = async (email, userId = null) => {
  if (userId) {
    try {
      const user = await User.findById(userId).select('firstName lastName');
      if (user) {
        return `${user.firstName || ''} ${user.lastName || ''}`.trim();
      }
    } catch (err) {
      console.log('User lookup failed:', err.message);
    }
  }
  
  // Fallback: extract name from email
  const emailName = email.split('@')[0];
  return emailName.replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Get all support tickets with filters, pagination, and sorting
 */
exports.getTickets = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      ...filters
    } = req.query;

    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const skip = (pageInt - 1) * limitInt;

    // Build query using the model's static method
    const query = SupportTicket.findWithFilters(filters);
    
    // Apply sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute query with pagination
    const [tickets, totalCount] = await Promise.all([
      query
        .sort(sortOptions)
        .skip(skip)
        .limit(limitInt)
        .populate('customerUserId', 'firstName lastName email')
        .populate('assignedById', 'firstName lastName')
        .lean(),
      SupportTicket.countDocuments(query.getQuery())
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitInt);
    const hasNextPage = pageInt < totalPages;
    const hasPrevPage = pageInt > 1;

    res.json({
      tickets,
      pagination: {
        currentPage: pageInt,
        totalPages,
        totalCount,
        hasNextPage,
        hasPrevPage,
        limit: limitInt
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ 
      error: 'Failed to fetch support tickets',
      details: error.message 
    });
  }
};

/**
 * Get a single support ticket by ID
 */
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id)
      .populate('customerUserId', 'firstName lastName email phone')
      .populate('assignedById', 'firstName lastName email')
      .populate('resolution.resolvedById', 'firstName lastName');

    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found' });
    }

    // Increment view count
    ticket.statistics.viewCount += 1;
    await ticket.save();

    res.json({ ticket });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ 
      error: 'Failed to fetch support ticket',
      details: error.message 
    });
  }
};

/**
 * Create a new support ticket
 */
exports.createTicket = [
  // Validation middleware
  body('subject').notEmpty().trim().withMessage('Subject is required'),
  body('description').notEmpty().trim().withMessage('Description is required'),
  body('customerEmail').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
  body('category').optional().isIn(['general', 'technical', 'billing', 'account', 'property', 'investment', 'tokens', 'kyc']).withMessage('Invalid category'),
  
  async (req, res) => {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const {
        subject,
        description,
        customerEmail,
        priority = 'medium',
        category = 'general',
        assignedTo,
        tags = [],
        source = 'web'
      } = req.body;

      // Try to find existing user
      const existingUser = await User.findOne({ email: customerEmail });
      const customerName = await extractCustomerName(customerEmail, existingUser?._id);

      // Create ticket data
      const ticketData = {
        subject,
        description,
        customerEmail,
        customerName,
        customerUserId: existingUser?._id,
        priority,
        category,
        source,
        assignedTo,
        tags,
        metadata: {
          userAgent: req.headers['user-agent'],
          ipAddress: getClientIP(req),
          referrer: req.headers.referer,
          sessionId: req.sessionID
        }
      };

      // Create the ticket
      const ticket = new SupportTicket(ticketData);
      await ticket.save();

      // Initialize integrations in background
      try {
        // Create Help Scout conversation
        const helpScoutResult = await helpScoutService.createConversation({
          customerEmail,
          customerName,
          subject,
          description,
          ticketId: ticket._id,
          priority
        });

        if (helpScoutResult.success) {
          ticket.integration.helpScout.conversationId = helpScoutResult.conversationId;
          ticket.integration.helpScout.syncStatus = 'synced';
          ticket.integration.helpScout.lastSyncAt = new Date();
        }

        // Create Slack thread
        const slackResult = await slackService.createTicketThread({
          ticket,
          customerName,
          customerEmail,
          subject,
          description
        });

        if (slackResult.success) {
          ticket.integration.slack.threadId = slackResult.threadId;
          ticket.integration.slack.messageTs = slackResult.messageTs;
          ticket.integration.slack.channelId = slackResult.channelId;
          ticket.integration.slack.lastSyncAt = new Date();
        }

        await ticket.save();
      } catch (integrationError) {
        console.error('Integration setup failed:', integrationError);
        // Don't fail the ticket creation, just log the error
      }

      // Broadcast to admin dashboard via WebSocket
      if (global.io) {
        global.io.to('admin-dashboard').emit('new-ticket', {
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          customerEmail: ticket.customerEmail,
          priority: ticket.priority,
          category: ticket.category,
          createdAt: ticket.createdAt
        });
      }

      // Return the created ticket
      const populatedTicket = await SupportTicket.findById(ticket._id)
        .populate('customerUserId', 'firstName lastName email');

      res.status(201).json({ 
        message: 'Support ticket created successfully',
        ticket: populatedTicket
      });

    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ 
        error: 'Failed to create support ticket',
        details: error.message 
      });
    }
  }
];

/**
 * Update support ticket status
 */
exports.updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?.id;

    if (!['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found' });
    }

    const oldStatus = ticket.status;
    await ticket.updateStatus(status, userId);

    // Handle integrations
    try {
      // Update Help Scout
      if (ticket.integration.helpScout.conversationId) {
        await helpScoutService.updateConversationStatus(
          ticket.integration.helpScout.conversationId,
          status
        );
      }

      // Update Slack
      if (ticket.integration.slack.threadId) {
        await slackService.postStatusUpdate(ticket.integration.slack.threadId, {
          ticketNumber: ticket.ticketNumber,
          oldStatus,
          newStatus: status,
          updatedBy: req.user?.email || 'Admin'
        });

        // Auto-archive Slack thread if resolved
        if (status === 'resolved' && !ticket.integration.slack.isArchived) {
          await slackService.archiveThread(ticket.integration.slack.threadId);
          ticket.integration.slack.isArchived = true;
          await ticket.save();
        }
      }
    } catch (integrationError) {
      console.error('Integration update failed:', integrationError);
    }

    // Broadcast to admin dashboard
    if (global.io) {
      global.io.to('admin-dashboard').emit('ticket-status-updated', {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        oldStatus,
        newStatus: status,
        updatedAt: new Date()
      });
    }

    res.json({ 
      message: 'Ticket status updated successfully',
      ticket: await SupportTicket.findById(id).populate('customerUserId', 'firstName lastName email')
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ 
      error: 'Failed to update ticket status',
      details: error.message 
    });
  }
};

/**
 * Assign ticket to a team member
 */
exports.assignTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;
    const assignedById = req.user?.id;

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found' });
    }

    await ticket.assign(assignedTo, assignedById);

    // Update integrations
    try {
      if (ticket.integration.slack.threadId) {
        await slackService.postAssignmentUpdate(ticket.integration.slack.threadId, {
          ticketNumber: ticket.ticketNumber,
          assignedTo,
          assignedBy: req.user?.email || 'Admin'
        });
      }
    } catch (integrationError) {
      console.error('Integration assignment update failed:', integrationError);
    }

    res.json({ 
      message: 'Ticket assigned successfully',
      ticket: await SupportTicket.findById(id).populate('customerUserId', 'firstName lastName email')
    });
  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({ 
      error: 'Failed to assign ticket',
      details: error.message 
    });
  }
};

/**
 * Add comment to support ticket
 */
exports.addComment = [
  body('comment').notEmpty().trim().withMessage('Comment is required'),
  
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { id } = req.params;
      const { comment, isInternal = false } = req.body;
      const userId = req.user?.id;
      const userName = req.user ? `${req.user.firstName} ${req.user.lastName}` : 'Admin';

      const ticket = await SupportTicket.findById(id);
      if (!ticket) {
        return res.status(404).json({ error: 'Support ticket not found' });
      }

      const commentData = {
        author: userName,
        authorType: 'admin',
        content: comment,
        isInternal
      };

      await ticket.addComment(commentData);

      // Sync with integrations
      try {
        if (!isInternal) {
          // Add to Help Scout
          if (ticket.integration.helpScout.conversationId) {
            await helpScoutService.addNote(
              ticket.integration.helpScout.conversationId,
              comment,
              userName
            );
          }

          // Add to Slack thread
          if (ticket.integration.slack.threadId) {
            await slackService.postComment(ticket.integration.slack.threadId, {
              ticketNumber: ticket.ticketNumber,
              comment,
              author: userName
            });
          }
        }
      } catch (integrationError) {
        console.error('Integration comment sync failed:', integrationError);
      }

      res.json({ 
        message: 'Comment added successfully',
        ticket: await SupportTicket.findById(id).populate('customerUserId', 'firstName lastName email')
      });
    } catch (error) {
      console.error('Error adding comment:', error);
      res.status(500).json({ 
        error: 'Failed to add comment',
        details: error.message 
      });
    }
  }
];

/**
 * Get support ticket statistics
 */
exports.getStatistics = async (req, res) => {
  try {
    const statistics = await SupportTicket.getStatistics();
    res.json(statistics);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      details: error.message 
    });
  }
};

/**
 * Get integration status (Help Scout, Slack)
 */
exports.getIntegrationStatus = async (req, res) => {
  try {
    const helpScoutStatus = await helpScoutService.getStatus();
    const slackStatus = await slackService.getStatus();

    res.json({
      helpScout: helpScoutStatus.connected,
      slack: slackStatus.connected,
      lastSync: {
        helpScout: helpScoutStatus.lastSync,
        slack: slackStatus.lastSync
      }
    });
  } catch (error) {
    console.error('Error getting integration status:', error);
    res.status(500).json({ 
      error: 'Failed to get integration status',
      details: error.message 
    });
  }
};

/**
 * Sync tickets with Help Scout
 */
exports.syncWithHelpScout = async (req, res) => {
  try {
    const result = await helpScoutService.syncAllTickets();
    res.json({
      message: 'Help Scout sync completed',
      ...result
    });
  } catch (error) {
    console.error('Error syncing with Help Scout:', error);
    res.status(500).json({ 
      error: 'Failed to sync with Help Scout',
      details: error.message 
    });
  }
};

/**
 * Bulk update tickets
 */
exports.bulkUpdateTickets = async (req, res) => {
  try {
    const { ticketIds, updates } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ error: 'Ticket IDs array is required' });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Updates object is required' });
    }

    const allowedUpdates = ['status', 'priority', 'assignedTo', 'tags'];
    const updateKeys = Object.keys(updates);
    const isValidUpdate = updateKeys.every(key => allowedUpdates.includes(key));

    if (!isValidUpdate) {
      return res.status(400).json({ 
        error: 'Invalid update fields',
        allowed: allowedUpdates
      });
    }

    const updateResult = await SupportTicket.updateMany(
      { _id: { $in: ticketIds } },
      { $set: updates }
    );

    res.json({
      message: 'Bulk update completed',
      modifiedCount: updateResult.modifiedCount,
      matchedCount: updateResult.matchedCount
    });
  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({ 
      error: 'Failed to perform bulk update',
      details: error.message 
    });
  }
};

/**
 * Export tickets (CSV format)
 */
exports.exportTickets = async (req, res) => {
  try {
    const { ...filters } = req.query;
    
    const tickets = await SupportTicket.findWithFilters(filters)
      .populate('customerUserId', 'firstName lastName email')
      .lean();

    // Convert to CSV format
    const csvHeaders = [
      'Ticket Number',
      'Subject',
      'Status',
      'Priority',
      'Category',
      'Customer Name',
      'Customer Email',
      'Assigned To',
      'Created At',
      'Resolved At',
      'Resolution Time (mins)'
    ];

    const csvRows = tickets.map(ticket => [
      ticket.ticketNumber,
      `"${ticket.subject.replace(/"/g, '""')}"`,
      ticket.status,
      ticket.priority,
      ticket.category,
      ticket.customerName,
      ticket.customerEmail,
      ticket.assignedTo || 'Unassigned',
      ticket.createdAt.toISOString(),
      ticket.resolution?.resolvedAt?.toISOString() || '',
      ticket.resolution?.resolutionTime || ''
    ]);

    const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="support-tickets.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting tickets:', error);
    res.status(500).json({ 
      error: 'Failed to export tickets',
      details: error.message 
    });
  }
};

/**
 * Delete support ticket
 */
exports.deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found' });
    }

    // Archive in integrations before deletion
    try {
      if (ticket.integration.slack.threadId && !ticket.integration.slack.isArchived) {
        await slackService.archiveThread(ticket.integration.slack.threadId);
      }
    } catch (integrationError) {
      console.error('Integration cleanup failed:', integrationError);
    }

    await SupportTicket.findByIdAndDelete(id);

    res.json({ message: 'Support ticket deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ 
      error: 'Failed to delete ticket',
      details: error.message 
    });
  }
};
