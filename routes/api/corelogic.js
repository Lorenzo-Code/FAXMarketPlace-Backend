const express = require("express");
const router = express.Router();
const { getAsync, setAsync, getUserKey } = require("../../utils/redisClient");

// ✅ Get enhanced property insights from CoreLogic
router.get("/property/:id", async (req, res) => {
  try {
    const propertyId = req.params.id;
    const userKey = getUserKey(req);
    const cacheKey = `corelogic:insights:${propertyId}:${userKey}`;

    // 📥 Check cache first (CoreLogic data is expensive, cache for longer)
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log(`📥 Cache hit for CoreLogic insights ${propertyId}: ${userKey}`);
      return res.json({ 
        success: true,
        fromCache: true, 
        data: cached 
      });
    }

    // For now, return mock CoreLogic data
    // In production, this would make real API calls to CoreLogic
    const mockCoreLogicData = {
      propertyId,
      isEnhanced: true,
      dataSource: 'corelogic',
      fetchedAt: new Date().toISOString(),
      
      // Market Analysis
      marketAnalysis: {
        medianPrice: '$485,000',
        priceChange: '+8.2%',
        daysOnMarket: '23 days',
        inventoryLevel: 'Low',
        demandScore: '8.5/10',
        marketTrend: 'Rising',
        competitiveIndex: 'High'
      },

      // Comparable Sales
      comparableSales: {
        recentSales: 12,
        avgSalePrice: '$467,500',
        priceRange: '$420K - $515K',
        avgDaysOnMarket: '18 days',
        salesTrend: 'Increasing',
        lastSale: {
          address: '456 Nearby St',
          price: '$475,000',
          date: '2024-01-10',
          sqft: 1150
        }
      },

      // Property History
      propertyHistory: {
        lastSold: '2019 - $395,000',
        previousOwners: '3 previous owners',
        renovations: 'Kitchen (2020), Roof (2021)',
        propertyTax: '$6,750/year',
        taxHistory: [
          { year: 2023, amount: 6750 },
          { year: 2022, amount: 6500 },
          { year: 2021, amount: 6200 }
        ],
        ownershipHistory: [
          { year: 2019, owner: 'Smith Family Trust', salePrice: 395000 },
          { year: 2015, owner: 'Johnson, Michael', salePrice: 325000 }
        ]
      },

      // Neighborhood Insights
      neighborhoodInsights: {
        avgIncome: '$78,500',
        crimeRate: 'Below Average',
        schoolRating: '8.5/10',
        walkScore: '72/100',
        demographics: 'Family-oriented',
        growthRate: '+12.3%',
        amenities: ['Parks', 'Shopping', 'Public Transit'],
        futureProjects: ['New Metro Line (2025)', 'Park Expansion (2024)']
      },

      // Investment Analysis
      investmentAnalysis: {
        estimatedRent: '$2,800/month',
        capRate: '6.8%',
        cashFlow: '+$450/month',
        appreciation: '5.2%/year',
        roiProjection: '12.5%',
        riskScore: 'Low',
        vacancyRate: '3.2%',
        rentalDemand: 'High'
      },

      // Additional Data
      buildingDetails: {
        construction: 'Steel Frame',
        foundation: 'Concrete Slab',
        roofMaterial: 'Composite Shingle',
        hvacSystem: 'Central Air/Heat',
        insulationRating: 'R-15',
        energyEfficiency: 'B+'
      },

      // Environmental Data
      environmentalFactors: {
        floodZone: 'X (Minimal Risk)',
        earthquakeRisk: 'Very Low',
        airQuality: 'Good',
        noiseLevel: 'Moderate',
        nearbyHazards: 'None Identified'
      }
    };

    // 💾 Cache for 1 hour (CoreLogic data is relatively stable)
    await setAsync(cacheKey, mockCoreLogicData, 3600);
    console.log(`📝 Cached CoreLogic insights ${propertyId} for user: ${userKey}`);
    
    res.json({ 
      success: true,
      fromCache: false, 
      data: mockCoreLogicData 
    });
  } catch (err) {
    console.error(`❌ Error fetching CoreLogic insights for ${req.params.id}:`, err);
    res.status(500).json({ 
      success: false,
      error: err.message,
      message: 'Failed to fetch CoreLogic insights'
    });
  }
});

// ✅ Check if enhanced data is available for a property
router.get("/availability/:id", async (req, res) => {
  try {
    const propertyId = req.params.id;
    
    // For now, assume all properties have CoreLogic data available
    // In production, this would check CoreLogic API availability
    res.json({ 
      available: true,
      propertyId,
      dataTypes: [
        'marketAnalysis',
        'comparableSales', 
        'propertyHistory',
        'neighborhoodInsights',
        'investmentAnalysis'
      ]
    });
  } catch (err) {
    console.error(`❌ Error checking CoreLogic availability for ${req.params.id}:`, err);
    res.status(500).json({ 
      available: false,
      error: err.message 
    });
  }
});

module.exports = router;
