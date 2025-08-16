require('dotenv').config();
const mongoose = require('mongoose');
const SuggestedDeal = require('../models/SuggestedDeal');

console.log('🚀 Starting to populate AI-suggested deals...');

// Sample suggested deals data
const sampleDeals = [
  {
    title: "Investment Property in Cypress",
    address1: "12345 Cypress Creek Dr",
    city: "Houston",
    state: "TX",
    postalcode: "77429",
    lat: 29.8564,
    lng: -95.6094,
    structure: {
      beds: 3,
      baths: 2,
      sqft: 1450,
      yearBuilt: 2018,
      propertyType: "house"
    },
    valuation: {
      avm: 285000,
      rangeLow: 270000,
      rangeHigh: 300000,
      confidence: 0.85
    },
    targetPrice: 280000,
    fractionable: true,
    dealStatus: "approved",
    imageUrl: "/api/placeholder/800/600",
    source: "ai-discovery",
    addedBy: "ai-system",
    tags: ["investment", "rental", "houston-suburbs"],
    createdAt: new Date()
  },
  {
    title: "Fixer-Upper with Potential in Spring",
    address1: "8901 Spring Valley Road",
    city: "Spring",
    state: "TX", 
    postalcode: "77379",
    lat: 30.0799,
    lng: -95.4171,
    structure: {
      beds: 4,
      baths: 2.5,
      sqft: 2100,
      yearBuilt: 2005,
      propertyType: "house"
    },
    valuation: {
      avm: 225000,
      rangeLow: 210000,
      rangeHigh: 240000,
      confidence: 0.78
    },
    targetPrice: 195000,
    fractionable: false,
    dealStatus: "review",
    imageUrl: "/api/placeholder/800/600",
    source: "market-analysis",
    addedBy: "ai-system",
    tags: ["fixer-upper", "potential", "spring-area"],
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
  },
  {
    title: "Modern Townhome in The Woodlands",
    address1: "5678 Woodlands Pkwy",
    city: "The Woodlands",
    state: "TX",
    postalcode: "77381",
    lat: 30.1588,
    lng: -95.4613,
    structure: {
      beds: 3,
      baths: 2.5,
      sqft: 1800,
      yearBuilt: 2020,
      propertyType: "townhouse"
    },
    valuation: {
      avm: 395000,
      rangeLow: 380000,
      rangeHigh: 410000,
      confidence: 0.92
    },
    targetPrice: 385000,
    fractionable: true,
    dealStatus: "approved",
    imageUrl: "/api/placeholder/800/600",
    source: "ai-discovery",
    addedBy: "ai-system",
    tags: ["modern", "townhome", "woodlands", "premium"],
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
  },
  {
    title: "Duplex Investment Opportunity in Katy",
    address1: "3456 Katy Mills Circle",
    city: "Katy",
    state: "TX",
    postalcode: "77494",
    lat: 29.7866,
    lng: -95.8244,
    structure: {
      beds: 6, // Total for both units
      baths: 4, // Total for both units  
      sqft: 2800,
      yearBuilt: 2015,
      propertyType: "duplex"
    },
    valuation: {
      avm: 485000,
      rangeLow: 465000,
      rangeHigh: 505000,
      confidence: 0.88
    },
    targetPrice: 470000,
    fractionable: true,
    dealStatus: "approved",
    imageUrl: "/api/placeholder/800/600",
    source: "rental-analysis",
    addedBy: "ai-system",
    tags: ["duplex", "investment", "katy", "multi-unit"],
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours ago
  },
  {
    title: "Vintage Cottage in Heights District",
    address1: "7890 Heights Blvd",
    city: "Houston",
    state: "TX",
    postalcode: "77008",
    lat: 29.8011,
    lng: -95.3952,
    structure: {
      beds: 2,
      baths: 1,
      sqft: 950,
      yearBuilt: 1955,
      propertyType: "house"
    },
    valuation: {
      avm: 325000,
      rangeLow: 310000,
      rangeHigh: 340000,
      confidence: 0.83
    },
    targetPrice: 315000,
    fractionable: false,
    dealStatus: "review",
    imageUrl: "/api/placeholder/800/600",
    source: "neighborhood-analysis",
    addedBy: "ai-system",
    tags: ["vintage", "heights", "cottage", "trendy"],
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
  }
];

async function populateDeals() {
  try {
    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true
    });
    console.log('✅ Connected to MongoDB successfully');

    // Clear existing suggested deals (optional - comment out to keep existing data)
    console.log('🧹 Clearing existing suggested deals...');
    await SuggestedDeal.deleteMany({});
    console.log('✅ Cleared existing deals');

    // Insert sample deals
    console.log('📝 Inserting sample AI-suggested deals...');
    const insertedDeals = await SuggestedDeal.insertMany(sampleDeals);
    console.log(`✅ Successfully inserted ${insertedDeals.length} suggested deals:`);
    
    insertedDeals.forEach((deal, index) => {
      console.log(`   ${index + 1}. ${deal.title} - ${deal.address1}, ${deal.city}, ${deal.state}`);
      console.log(`      Price: $${deal.targetPrice.toLocaleString()}, Status: ${deal.dealStatus}`);
      console.log(`      Fractionable: ${deal.fractionable ? 'Yes' : 'No'}, ID: ${deal._id}`);
      console.log('');
    });

    console.log('🎉 Sample AI-suggested deals populated successfully!');
    console.log('💡 You can now test the frontend marketplace integration');
    
  } catch (error) {
    console.error('❌ Error populating suggested deals:', error);
    throw error;
  } finally {
    // Close the connection
    console.log('🔌 Closing database connection...');
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  }
}

// Run the population script
populateDeals()
  .then(() => {
    console.log('🚀 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
