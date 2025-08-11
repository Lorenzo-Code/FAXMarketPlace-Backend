/**
 * Populate Network Analytics with Sample Data
 * Run this to generate realistic network analytics data for testing
 */

require('dotenv').config();
const mongoose = require('mongoose');
const NetworkAnalytics = require('./models/NetworkAnalytics');

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/fractionax');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Generate realistic sample data
function generateSampleData() {
  const providers = ['openai', 'googlemaps', 'corelogic', 'attom', 'greatschools'];
  const endpoints = {
    openai: ['chat/completions', 'embeddings', 'completions'],
    googlemaps: ['geocode', 'places', 'directions'],
    corelogic: ['search', 'property-detail', 'comparables'],
    attom: ['property/address', 'property/detail', 'avm/detail'],
    greatschools: ['schools/nearby']
  };
  
  const sampleData = [];
  const now = new Date();
  
  // Generate data for the last 7 days
  for (let day = 0; day < 7; day++) {
    const dayStart = new Date(now - (day * 24 * 60 * 60 * 1000));
    
    // Generate data for each hour of the day
    for (let hour = 0; hour < 24; hour++) {
      const hourStart = new Date(dayStart);
      hourStart.setHours(hour);
      
      providers.forEach(provider => {
        const providerEndpoints = endpoints[provider];
        
        providerEndpoints.forEach(endpoint => {
          // Generate 5-20 requests per hour per endpoint
          const requestCount = Math.floor(Math.random() * 16) + 5;
          
          for (let i = 0; i < requestCount; i++) {
            const requestTime = new Date(hourStart.getTime() + (Math.random() * 60 * 60 * 1000));
            
            // 95% success rate, 5% errors
            const isSuccess = Math.random() > 0.05;
            
            // Response times: mostly fast, some slow
            let responseTime;
            if (Math.random() > 0.9) {
              // 10% of requests are slow (2-8 seconds)
              responseTime = Math.floor(Math.random() * 6000) + 2000;
            } else {
              // 90% are fast (50-1500ms)
              responseTime = Math.floor(Math.random() * 1450) + 50;
            }
            
            // Calculate costs based on provider and endpoint
            const costs = {
              openai: { 'chat/completions': 0.2, 'embeddings': 0.01, 'completions': 0.15 },
              googlemaps: { 'geocode': 0.05, 'places': 0.10, 'directions': 0.10 },
              corelogic: { 'search': 0.50, 'property-detail': 1.00, 'comparables': 1.50 },
              attom: { 'property/address': 0.30, 'property/detail': 0.40, 'avm/detail': 0.50 },
              greatschools: { 'schools/nearby': 0.10 }
            };
            
            const cost = costs[provider]?.[endpoint] || 0;
            
            sampleData.push({
              provider,
              endpoint,
              method: 'GET',
              status: isSuccess ? 'success' : (Math.random() > 0.5 ? 'error' : 'timeout'),
              responseTime,
              statusCode: isSuccess ? 200 : (Math.random() > 0.5 ? 500 : 429),
              requestSize: Math.floor(Math.random() * 1000) + 100,
              responseSize: Math.floor(Math.random() * 5000) + 500,
              cost,
              errorMessage: isSuccess ? null : 'Sample error message',
              cacheHit: Math.random() > 0.7, // 30% cache hit rate
              rateLimitRemaining: Math.floor(Math.random() * 100),
              createdAt: requestTime
            });
          }
        });
      });
    }
  }
  
  return sampleData;
}

async function populateData() {
  try {
    console.log('🗑️  Clearing existing network analytics data...');
    await NetworkAnalytics.deleteMany({});
    
    console.log('📊 Generating sample network analytics data...');
    const sampleData = generateSampleData();
    
    console.log(`💾 Inserting ${sampleData.length} network analytics records...`);
    await NetworkAnalytics.insertMany(sampleData);
    
    console.log('✅ Network analytics data populated successfully!');
    
    // Display summary
    const stats = await NetworkAnalytics.aggregate([
      {
        $group: {
          _id: '$provider',
          totalRequests: { $sum: 1 },
          successfulRequests: { 
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          },
          avgResponseTime: { $avg: '$responseTime' },
          totalCost: { $sum: '$cost' }
        }
      },
      {
        $addFields: {
          successRate: {
            $multiply: [
              { $divide: ['$successfulRequests', '$totalRequests'] },
              100
            ]
          }
        }
      },
      { $sort: { totalRequests: -1 } }
    ]);
    
    console.log('\n📈 Summary by Provider:');
    console.table(stats.map(s => ({
      Provider: s._id,
      'Total Requests': s.totalRequests,
      'Success Rate': `${s.successRate.toFixed(1)}%`,
      'Avg Response Time': `${Math.round(s.avgResponseTime)}ms`,
      'Total Cost': `$${s.totalCost.toFixed(2)}`
    })));
    
  } catch (error) {
    console.error('❌ Error populating network analytics:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

// Run the script
async function main() {
  await connectDB();
  await populateData();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { connectDB, populateData, generateSampleData };
