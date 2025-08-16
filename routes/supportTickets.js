const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { verifyToken, authorizeAdmin } = require('../middleware/auth');

// Apply authentication and admin authorization to all routes
router.use(verifyToken, authorizeAdmin);

/**
 * @route   GET /api/admin/support-tickets
 * @desc    Get all support tickets with filtering, pagination, and sorting
 * @access  Admin only
 * @query   {string} page - Page number (default: 1)
 * @query   {string} limit - Items per page (default: 50)
 * @query   {string} sortBy - Sort field (default: 'createdAt')
 * @query   {string} sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
 * @query   {string} status - Filter by status: 'all', 'open', 'in_progress', 'waiting_customer', 'resolved', 'closed'
 * @query   {string} priority - Filter by priority: 'all', 'low', 'medium', 'high', 'urgent'
 * @query   {string} assignedTo - Filter by assigned team member
 * @query   {string} source - Filter by source: 'all', 'web', 'email', 'slack', 'helpscout', 'phone', 'internal'
 * @query   {string} category - Filter by category
 * @query   {string} search - Search in ticket number, subject, customer email, customer name
 * @query   {string} dateRange - Filter by date range: '24h', '7d', '30d', '90d'
 */
router.get('/', ticketController.getTickets);

/**
 * @route   GET /api/admin/support-tickets/statistics
 * @desc    Get support ticket statistics
 * @access  Admin only
 */
router.get('/statistics', ticketController.getStatistics);

/**
 * @route   GET /api/admin/support-tickets/integration-status
 * @desc    Get integration status for Help Scout and Slack
 * @access  Admin only
 */
router.get('/integration-status', ticketController.getIntegrationStatus);

/**
 * @route   POST /api/admin/support-tickets/sync/helpscout
 * @desc    Sync tickets with Help Scout
 * @access  Admin only
 */
router.post('/sync/helpscout', ticketController.syncWithHelpScout);

/**
 * @route   GET /api/admin/support-tickets/export
 * @desc    Export tickets as CSV
 * @access  Admin only
 * @query   {string} status - Filter by status
 * @query   {string} priority - Filter by priority
 * @query   {string} assignedTo - Filter by assigned team member
 * @query   {string} dateRange - Filter by date range
 */
router.get('/export', ticketController.exportTickets);

/**
 * @route   PUT /api/admin/support-tickets/bulk-update
 * @desc    Bulk update multiple tickets
 * @access  Admin only
 * @body    {Array} ticketIds - Array of ticket IDs
 * @body    {Object} updates - Object with update fields
 */
router.put('/bulk-update', ticketController.bulkUpdateTickets);

/**
 * @route   GET /api/admin/support-tickets/:id
 * @desc    Get a specific support ticket by ID
 * @access  Admin only
 * @param   {string} id - Ticket ID
 */
router.get('/:id', ticketController.getTicketById);

/**
 * @route   POST /api/admin/support-tickets
 * @desc    Create a new support ticket
 * @access  Admin only
 * @body    {string} subject - Ticket subject (required)
 * @body    {string} description - Ticket description (required)
 * @body    {string} customerEmail - Customer email (required)
 * @body    {string} priority - Ticket priority: 'low', 'medium', 'high', 'urgent' (default: 'medium')
 * @body    {string} category - Ticket category (default: 'general')
 * @body    {string} assignedTo - Assigned team member (optional)
 * @body    {Array} tags - Ticket tags (optional)
 * @body    {string} source - Ticket source (default: 'web')
 */
router.post('/', ticketController.createTicket);

/**
 * @route   PUT /api/admin/support-tickets/:id/status
 * @desc    Update ticket status
 * @access  Admin only
 * @param   {string} id - Ticket ID
 * @body    {string} status - New status: 'open', 'in_progress', 'waiting_customer', 'resolved', 'closed'
 */
router.put('/:id/status', ticketController.updateTicketStatus);

/**
 * @route   PUT /api/admin/support-tickets/:id/assign
 * @desc    Assign ticket to a team member
 * @access  Admin only
 * @param   {string} id - Ticket ID
 * @body    {string} assignedTo - Team member to assign to
 */
router.put('/:id/assign', ticketController.assignTicket);

/**
 * @route   POST /api/admin/support-tickets/:id/comments
 * @desc    Add a comment to a support ticket
 * @access  Admin only
 * @param   {string} id - Ticket ID
 * @body    {string} comment - Comment text (required)
 * @body    {boolean} isInternal - Whether the comment is internal only (default: false)
 */
router.post('/:id/comments', ticketController.addComment);

/**
 * @route   POST /api/admin/support-tickets/:id/notes
 * @desc    Add an internal support note to a support ticket
 * @access  Admin only
 * @param   {string} id - Ticket ID
 * @body    {string} note - Note text (required)
 * @body    {boolean} isPrivate - Whether the note is private (default: false)
 */
router.post('/:id/notes', ticketController.addSupportNote);

/**
 * @route   DELETE /api/admin/support-tickets/:id
 * @desc    Delete a support ticket
 * @access  Admin only
 * @param   {string} id - Ticket ID
 */
router.delete('/:id', ticketController.deleteTicket);

module.exports = router;
