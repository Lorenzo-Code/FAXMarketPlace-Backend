const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  author: {
    type: String,
    required: true
  },
  authorType: {
    type: String,
    enum: ['admin', 'customer', 'system'],
    default: 'admin'
  },
  content: {
    type: String,
    required: true
  },
  isInternal: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const integrationSchema = new mongoose.Schema({
  helpScout: {
    conversationId: String,
    lastSyncAt: Date,
    syncStatus: {
      type: String,
      enum: ['pending', 'synced', 'failed'],
      default: 'pending'
    }
  },
  slack: {
    threadId: String,
    channelId: String,
    messageTs: String,
    lastSyncAt: Date,
    isArchived: {
      type: Boolean,
      default: false
    }
  }
});

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true,
    required: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['general', 'technical', 'billing', 'account', 'property', 'investment', 'tokens', 'kyc'],
    default: 'general'
  },
  source: {
    type: String,
    enum: ['web', 'email', 'slack', 'helpscout', 'phone', 'internal'],
    default: 'web'
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  customerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  assignedTo: {
    type: String,
    required: false
  },
  assignedById: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  comments: [commentSchema],
  integration: integrationSchema,
  metadata: {
    userAgent: String,
    ipAddress: String,
    referrer: String,
    sessionId: String
  },
  resolution: {
    resolvedBy: String,
    resolvedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolutionNote: String,
    resolutionTime: Number, // Time in minutes to resolve
    satisfactionRating: {
      type: Number,
      min: 1,
      max: 5
    },
    resolvedAt: Date
  },
  sla: {
    responseTime: Number, // Time in minutes for first response
    responseDeadline: Date,
    resolutionDeadline: Date,
    isOverdue: {
      type: Boolean,
      default: false
    }
  },
  statistics: {
    firstResponseAt: Date,
    lastActivityAt: Date,
    totalComments: {
      type: Number,
      default: 0
    },
    viewCount: {
      type: Number,
      default: 0
    }
  },
  closedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
supportTicketSchema.index({ ticketNumber: 1 });
supportTicketSchema.index({ customerEmail: 1 });
supportTicketSchema.index({ status: 1 });
supportTicketSchema.index({ priority: 1 });
supportTicketSchema.index({ assignedTo: 1 });
supportTicketSchema.index({ createdAt: -1 });
supportTicketSchema.index({ 'integration.helpScout.conversationId': 1 });
supportTicketSchema.index({ 'integration.slack.threadId': 1 });

// Generate ticket number before saving
supportTicketSchema.pre('save', async function(next) {
  if (this.isNew && !this.ticketNumber) {
    const count = await this.constructor.countDocuments();
    this.ticketNumber = `FCT-${String(count + 1).padStart(6, '0')}`;
  }
  
  // Update statistics
  this.statistics.lastActivityAt = new Date();
  this.statistics.totalComments = this.comments.length;
  
  // Calculate SLA deadlines based on priority
  if (this.isNew) {
    const now = new Date();
    switch (this.priority) {
      case 'urgent':
        this.sla.responseDeadline = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
        this.sla.resolutionDeadline = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours
        break;
      case 'high':
        this.sla.responseDeadline = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours
        this.sla.resolutionDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        break;
      case 'medium':
        this.sla.responseDeadline = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours
        this.sla.resolutionDeadline = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours
        break;
      case 'low':
        this.sla.responseDeadline = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours
        this.sla.resolutionDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
        break;
    }
  }
  
  // Check if overdue
  if (this.status !== 'resolved' && this.status !== 'closed') {
    const now = new Date();
    this.sla.isOverdue = now > this.sla.resolutionDeadline;
  }
  
  // Set resolution time when ticket is resolved
  if (this.isModified('status') && this.status === 'resolved' && !this.resolution.resolvedAt) {
    this.resolution.resolvedAt = new Date();
    this.resolution.resolutionTime = Math.round((this.resolution.resolvedAt - this.createdAt) / (1000 * 60)); // Minutes
  }
  
  // Set closed date
  if (this.isModified('status') && this.status === 'closed' && !this.closedAt) {
    this.closedAt = new Date();
  }
  
  next();
});

// Virtual for formatted ticket number display
supportTicketSchema.virtual('displayTicketNumber').get(function() {
  return `#${this.ticketNumber}`;
});

// Virtual for time since creation
supportTicketSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
});

// Instance methods
supportTicketSchema.methods.addComment = function(comment) {
  this.comments.push(comment);
  this.statistics.totalComments = this.comments.length;
  this.statistics.lastActivityAt = new Date();
  
  // Set first response time for admin comments
  if (comment.authorType === 'admin' && !this.statistics.firstResponseAt) {
    this.statistics.firstResponseAt = new Date();
    this.sla.responseTime = Math.round((this.statistics.firstResponseAt - this.createdAt) / (1000 * 60));
  }
  
  return this.save();
};

supportTicketSchema.methods.updateStatus = function(status, userId = null) {
  const oldStatus = this.status;
  this.status = status;
  this.statistics.lastActivityAt = new Date();
  
  // Add system comment about status change
  this.comments.push({
    author: userId ? 'System' : 'Admin',
    authorType: 'system',
    content: `Status changed from ${oldStatus} to ${status}`,
    isInternal: true
  });
  
  return this.save();
};

supportTicketSchema.methods.assign = function(assignedTo, assignedById = null) {
  const oldAssignee = this.assignedTo || 'Unassigned';
  this.assignedTo = assignedTo;
  if (assignedById) {
    this.assignedById = assignedById;
  }
  this.statistics.lastActivityAt = new Date();
  
  // Add system comment about assignment
  this.comments.push({
    author: 'System',
    authorType: 'system',
    content: `Assigned from ${oldAssignee} to ${assignedTo}`,
    isInternal: true
  });
  
  return this.save();
};

// Static methods
supportTicketSchema.statics.getStatistics = async function() {
  const [
    total,
    open,
    inProgress,
    waitingCustomer,
    resolved,
    closed,
    avgResponseTime,
    avgResolutionTime,
    overdue
  ] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ status: 'open' }),
    this.countDocuments({ status: 'in_progress' }),
    this.countDocuments({ status: 'waiting_customer' }),
    this.countDocuments({ status: 'resolved' }),
    this.countDocuments({ status: 'closed' }),
    this.aggregate([
      { $match: { 'sla.responseTime': { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$sla.responseTime' } } }
    ]).then(result => result[0]?.avg || 0),
    this.aggregate([
      { $match: { 'resolution.resolutionTime': { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$resolution.resolutionTime' } } }
    ]).then(result => result[0]?.avg || 0),
    this.countDocuments({ 'sla.isOverdue': true, status: { $nin: ['resolved', 'closed'] } })
  ]);
  
  return {
    total,
    open,
    inProgress,
    waitingCustomer,
    resolved,
    closed,
    overdue,
    avgResponseTime: Math.round(avgResponseTime),
    avgResolutionTime: Math.round(avgResolutionTime),
    avgResponseTimeFormatted: `${Math.floor(avgResponseTime / 60)}h ${Math.round(avgResponseTime % 60)}m`,
    avgResolutionTimeFormatted: `${Math.floor(avgResolutionTime / 60)}h ${Math.round(avgResolutionTime % 60)}m`
  };
};

supportTicketSchema.statics.findWithFilters = function(filters = {}) {
  const query = {};
  
  if (filters.status && filters.status !== 'all') {
    query.status = filters.status;
  }
  
  if (filters.priority && filters.priority !== 'all') {
    query.priority = filters.priority;
  }
  
  if (filters.assignedTo && filters.assignedTo !== 'all') {
    query.assignedTo = filters.assignedTo;
  }
  
  if (filters.source && filters.source !== 'all') {
    query.source = filters.source;
  }
  
  if (filters.category && filters.category !== 'all') {
    query.category = filters.category;
  }
  
  if (filters.search) {
    query.$or = [
      { ticketNumber: { $regex: filters.search, $options: 'i' } },
      { subject: { $regex: filters.search, $options: 'i' } },
      { customerEmail: { $regex: filters.search, $options: 'i' } },
      { customerName: { $regex: filters.search, $options: 'i' } }
    ];
  }
  
  if (filters.dateRange) {
    const now = new Date();
    let startDate;
    
    switch (filters.dateRange) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
    }
    
    if (startDate) {
      query.createdAt = { $gte: startDate };
    }
  }
  
  return this.find(query);
};

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
