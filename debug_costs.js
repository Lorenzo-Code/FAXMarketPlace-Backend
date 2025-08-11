const NetworkAnalytics = require('./models/NetworkAnalytics');
const mongoose = require('mongoose');

async function checkCosts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fractionax');
    
    const sample = await NetworkAnalytics.findOne({}).sort({ createdAt: -1 });
    console.log('Latest record cost:', sample?.cost);
    console.log('Latest record details:', JSON.stringify({
      provider: sample?.provider,
      endpoint: sample?.endpoint,
      cost: sample?.cost,
      createdAt: sample?.createdAt
    }, null, 2));
    
    const stats = await NetworkAnalytics.aggregate([
      {
        $group: {
          _id: '$provider',
          totalCost: { $sum: '$cost' },
          totalRequests: { $sum: 1 },
          avgCost: { $avg: '$cost' }
        }
      }
    ]);
    
    console.log('\nCost stats by provider:');
    stats.forEach(stat => {
      console.log(`${stat._id}: totalCost=${stat.totalCost}, avgCost=${stat.avgCost}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkCosts();
