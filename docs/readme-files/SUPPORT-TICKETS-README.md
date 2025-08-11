# FractionaX Support Ticket System

A comprehensive support ticket management system with Help Scout and Slack integrations, built for the FractionaX platform.

## Features

### Core Functionality
- **Complete Ticket Lifecycle Management** - Create, update, assign, comment, and resolve tickets
- **Rich Filtering & Search** - Filter by status, priority, assignee, category, date range, and full-text search
- **Real-time Updates** - WebSocket integration for live dashboard updates
- **SLA Tracking** - Automatic SLA deadline calculation and overdue detection
- **Advanced Statistics** - Response times, resolution times, and performance metrics

### Integration Features
- **Help Scout Integration** - Automatic conversation creation and bi-directional synchronization
- **Slack Integration** - Real-time thread creation, status updates, and interactive buttons
- **Webhook Support** - Handle events from Help Scout and Slack for seamless automation
- **Slash Commands** - Quick ticket operations directly from Slack

### Admin Features
- **Bulk Operations** - Update multiple tickets at once
- **CSV Export** - Export tickets with custom filters
- **Role-based Access** - Admin-only access with proper authentication
- **Comprehensive Logging** - Audit trail for all ticket activities

## Installation & Setup

### Environment Variables

Add these environment variables to your `.env` file:

```bash
# Help Scout Integration
HELPSCOUT_API_KEY=your_helpscout_api_key
HELPSCOUT_MAILBOX_ID=your_mailbox_id
HELPSCOUT_WEBHOOK_SECRET=your_webhook_secret

# Slack Integration  
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_SUPPORT_CHANNEL_ID=C1234567890
SLACK_SIGNING_SECRET=your_slack_signing_secret

# Admin Dashboard URL (for links)
ADMIN_URL=https://admin.fractionax.io
```

### Help Scout Setup

1. **API Key**: Get your API key from Help Scout Account Settings > API Keys
2. **Mailbox ID**: Find your mailbox ID in Help Scout Settings > Mailboxes
3. **Webhook**: Set up a webhook pointing to `https://your-domain.com/api/webhooks/helpscout`
4. **Webhook Secret**: Generate a secure secret for webhook verification

### Slack Setup

1. **Create a Slack App** at https://api.slack.com/apps
2. **Bot Token**: Install the app to your workspace and get the Bot User OAuth Token
3. **Channel ID**: Create a #support channel and get its ID
4. **Interactive Components**: Enable and set endpoint to `https://your-domain.com/api/webhooks/slack`
5. **Slash Commands**: Create commands like `/support-stats` and `/create-ticket`
6. **Event Subscriptions**: Enable and set endpoint to `https://your-domain.com/api/webhooks/slack`

Required Slack Bot Permissions:
- `chat:write` - Post messages
- `chat:write.public` - Post to public channels  
- `channels:read` - Access channel information
- `users:read` - Access user information
- `commands` - Handle slash commands

## API Endpoints

### Support Tickets

#### Get All Tickets
```http
GET /api/admin/support-tickets
```

Query Parameters:
- `page` (number) - Page number (default: 1)
- `limit` (number) - Items per page (default: 50)
- `sortBy` (string) - Sort field (default: 'createdAt')
- `sortOrder` (string) - 'asc' or 'desc' (default: 'desc')
- `status` (string) - Filter by status
- `priority` (string) - Filter by priority
- `assignedTo` (string) - Filter by assignee
- `search` (string) - Search query
- `dateRange` (string) - '24h', '7d', '30d', '90d'

#### Create Ticket
```http
POST /api/admin/support-tickets
```

Request Body:
```json
{
  "subject": "Customer inquiry",
  "description": "Detailed description of the issue",
  "customerEmail": "customer@example.com",
  "priority": "medium",
  "category": "general",
  "assignedTo": "Support Team",
  "tags": ["inquiry", "billing"]
}
```

#### Get Ticket by ID
```http
GET /api/admin/support-tickets/{id}
```

#### Update Ticket Status
```http
PUT /api/admin/support-tickets/{id}/status
```

Request Body:
```json
{
  "status": "resolved"
}
```

#### Assign Ticket
```http
PUT /api/admin/support-tickets/{id}/assign
```

Request Body:
```json
{
  "assignedTo": "John Doe"
}
```

#### Add Comment
```http
POST /api/admin/support-tickets/{id}/comments
```

Request Body:
```json
{
  "comment": "This issue has been investigated...",
  "isInternal": false
}
```

### Statistics & Integration

#### Get Statistics
```http
GET /api/admin/support-tickets/statistics
```

#### Get Integration Status
```http
GET /api/admin/support-tickets/integration-status
```

#### Sync with Help Scout
```http
POST /api/admin/support-tickets/sync/helpscout
```

#### Export Tickets
```http
GET /api/admin/support-tickets/export
```

### Webhooks

#### Help Scout Webhook
```http
POST /api/webhooks/helpscout
```

#### Slack Webhook
```http
POST /api/webhooks/slack
```

#### Slack Slash Commands
```http
POST /api/webhooks/slack/slash-commands
```

## Database Schema

The system uses MongoDB with the following collections:

### SupportTicket Model

```javascript
{
  ticketNumber: String,        // Auto-generated (FCT-000001)
  subject: String,            // Ticket subject
  description: String,        // Ticket description
  status: String,            // open, in_progress, waiting_customer, resolved, closed
  priority: String,          // low, medium, high, urgent
  category: String,          // general, technical, billing, etc.
  source: String,            // web, email, slack, helpscout, phone, internal
  customerName: String,      // Customer name
  customerEmail: String,     // Customer email
  customerUserId: ObjectId,  // Reference to User
  assignedTo: String,        // Assigned team member
  tags: [String],           // Ticket tags
  comments: [Comment],      // Ticket comments
  integration: {
    helpScout: {
      conversationId: String,
      lastSyncAt: Date,
      syncStatus: String
    },
    slack: {
      threadId: String,
      channelId: String,
      messageTs: String,
      lastSyncAt: Date,
      isArchived: Boolean
    }
  },
  sla: {
    responseTime: Number,
    responseDeadline: Date,
    resolutionDeadline: Date,
    isOverdue: Boolean
  },
  statistics: {
    firstResponseAt: Date,
    lastActivityAt: Date,
    totalComments: Number,
    viewCount: Number
  },
  resolution: {
    resolvedBy: String,
    resolutionNote: String,
    resolutionTime: Number,
    resolvedAt: Date
  }
}
```

## Workflow Integration

### Help Scout → Slack → Backend

1. **Customer emails** → Help Scout creates conversation
2. **Help Scout webhook** → Backend creates support ticket
3. **Backend** → Creates Slack thread with interactive buttons
4. **Slack interactions** → Update ticket status via buttons
5. **Status updates** → Sync back to Help Scout and customer email

### SLA Management

The system automatically calculates SLA deadlines based on priority:

- **Urgent**: 30min response, 4h resolution
- **High**: 2h response, 24h resolution  
- **Medium**: 4h response, 72h resolution
- **Low**: 8h response, 7d resolution

Overdue tickets are automatically flagged and included in statistics.

## Slack Commands

### Available Commands

#### `/support-stats`
Shows current support ticket statistics including:
- Total tickets
- Open/In Progress/Resolved counts
- Average response and resolution times
- Overdue ticket count

#### `/create-ticket [email] [subject] - [description]`
Quickly create a support ticket from Slack:
```
/create-ticket customer@example.com Login issue - Customer cannot access their account
```

### Interactive Buttons

Slack messages include interactive buttons for:
- **View Ticket** - Links to admin dashboard
- **Mark Resolved** - Updates ticket status to resolved
- **Assign to Me** - Assigns ticket to the clicking user
- **Help Scout** - Links to Help Scout conversation (if available)

## WebSocket Events

The system broadcasts real-time events via WebSocket:

### Events Broadcasted

- `new-ticket` - When a new ticket is created
- `ticket-status-updated` - When ticket status changes
- `ticket-assigned` - When ticket is assigned
- `ticket-comment-added` - When a comment is added

### Frontend Integration

```javascript
// Connect to admin dashboard room
socket.emit('join-admin');

// Listen for new tickets
socket.on('new-ticket', (ticketData) => {
  // Update UI with new ticket
});

// Listen for status updates
socket.on('ticket-status-updated', (updateData) => {
  // Update ticket status in UI
});
```

## Error Handling

The system includes comprehensive error handling:

- **Validation Errors** - Proper input validation with detailed error messages
- **Integration Failures** - Graceful degradation when Help Scout/Slack are unavailable
- **Authentication** - Proper JWT token validation and admin authorization
- **Rate Limiting** - Protection against API abuse

## Monitoring & Logging

### Logs Include

- Ticket creation and updates
- Integration sync status
- Webhook events
- User actions and authentication
- Performance metrics

### Monitoring Points

- Integration connection status
- Webhook delivery success rates
- Response times
- SLA compliance rates
- User activity patterns

## Security Features

- **JWT Authentication** - Secure admin access
- **Webhook Verification** - Cryptographic signature validation
- **Input Sanitization** - XSS and injection protection  
- **Rate Limiting** - API abuse protection
- **CORS Protection** - Restricted origins
- **Audit Logging** - Complete activity trail

## Performance Optimizations

- **Redis Caching** - User session caching
- **Database Indexing** - Optimized queries
- **Pagination** - Efficient data loading
- **Lean Queries** - Minimal data transfer
- **Connection Pooling** - Efficient database connections

## Troubleshooting

### Common Issues

#### Help Scout Integration Not Working
1. Check API key validity
2. Verify mailbox ID
3. Test webhook endpoint accessibility
4. Check webhook secret configuration

#### Slack Integration Not Working  
1. Verify bot token permissions
2. Check channel ID accuracy
3. Test webhook endpoint
4. Validate signing secret

#### Tickets Not Syncing
1. Check integration service logs
2. Verify webhook deliveries
3. Test manual sync endpoints
4. Review error logs for specific failures

### Debug Endpoints

#### Test Webhook Endpoints
```http
GET /api/webhooks/test
```

#### Integration Status
```http
GET /api/admin/support-tickets/integration-status
```

## Future Enhancements

- **Customer Portal** - Self-service ticket creation and tracking
- **Advanced Automation** - Auto-assignment based on categories/keywords
- **Custom Fields** - Configurable ticket fields
- **Templates** - Pre-defined responses and ticket templates  
- **Reporting Dashboard** - Advanced analytics and KPI tracking
- **Mobile App** - Native mobile support for agents
- **AI Integration** - Smart categorization and response suggestions
