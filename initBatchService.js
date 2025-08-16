/**
 * 🌙⚡ Batch Service Initialization
 * 
 * Add this to your main server.js or app.js to initialize the 
 * automated marketplace batch service
 */

const mongoose = require('mongoose');
const { MarketplaceBatchService } = require('./services/marketplaceBatchService');

/**
 * Initialize and start the marketplace batch service
 * Call this after MongoDB connection is established
 */
function initializeBatchService(app) {
  console.log('🚀 Initializing Marketplace Batch Service...');
  
  try {
    // Create batch service instance
    const batchService = new MarketplaceBatchService();
    
    // Store reference in app for API routes to access
    app.locals.batchService = batchService;
    
    // Initialize the service (sets up cron job)
    batchService.initialize();
    
    console.log('✅ Marketplace Batch Service initialized successfully');
    console.log('⏰ Scheduled to run daily at midnight');
    console.log('🔄 Will auto-populate on startup if no recent data exists');
    
    return batchService;
    
  } catch (error) {
    console.error('❌ Failed to initialize Batch Service:', error);
    throw error;
  }
}

module.exports = {
  initializeBatchService
};
