const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
require("dotenv").config();

// Import caching utilities
const { getAsync, setAsync } = require("../../../utils/redisClient");

/**
 * 🌟 ON-DEMAND PROPERTY ENRICHMENT APIS
 * 
 * COST OPTIMIZATION STRATEGY:
 * - Schools API: Only called when user opens Schools tab
 * - Neighborhood data: Only when requested
 * - Walk Score: Only when requested
 * - Crime data: Only when requested
 * - Local amenities: Only when requested
 * 
 * All enrichment data is cached for appropriate periods to minimize costs
 */

/**
 * 🏫 GreatSchools API Integration - On Demand
 * Cost: ~$0.10-0.15 per call
 * Cache: 90 days (school data changes infrequently)
 */
router.get('/:addressKey/schools', async (req, res) => {
  const { addressKey } = req.params;
  const { latitude, longitude, address } = req.query;

  console.log('🏫 ON-DEMAND: Schools data request');
  console.log(`📍 Address Key: ${addressKey}`);
  console.log(`📍 Coordinates: ${latitude}, ${longitude}`);

  if (!latitude || !longitude) {
    return res.status(400).json({
      error: 'Latitude and longitude required for school lookup',
      provided: { latitude, longitude, address }
    });
  }

  try {
    const cacheKey = `enrichment:schools:${latitude}_${longitude}`;
    
    // Check cache first (90 days for school data)
    const cachedData = await getAsync(cacheKey);
    if (cachedData) {
      console.log('💾 Schools data served from cache - no API cost');
      const parsedData = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        feature: 'schools',
        cost: { charged: 0, reason: 'served_from_cache' },
        data: parsedData.data,
        dataSource: {
          provider: 'GreatSchools',
          cachedAt: parsedData.cachedAt,
          ttl: parsedData.ttl
        }
      });
    }

    console.log('💸 Making GreatSchools API call...');
    
    // Mock GreatSchools API call (replace with real API)
    // const schoolsUrl = `https://api.greatschools.org/schools/nearby?lat=${latitude}&lon=${longitude}&radius=2&key=${process.env.GREATSCHOOLS_API_KEY}`;
    
    // For now, return mock school data
    const mockSchoolsData = {
      elementary: [
        {
          name: "Oak Elementary School",
          rating: 8,
          distance: 0.3,
          grades: "K-5",
          type: "Public",
          address: "123 Oak St",
          phone: "(555) 123-4567",
          website: "https://oak-elementary.edu"
        },
        {
          name: "Pine Elementary School", 
          rating: 7,
          distance: 0.7,
          grades: "K-5",
          type: "Public",
          address: "456 Pine Ave",
          phone: "(555) 234-5678",
          website: "https://pine-elementary.edu"
        }
      ],
      middle: [
        {
          name: "Central Middle School",
          rating: 7,
          distance: 1.2,
          grades: "6-8",
          type: "Public", 
          address: "789 Central Blvd",
          phone: "(555) 345-6789",
          website: "https://central-middle.edu"
        }
      ],
      high: [
        {
          name: "Jefferson High School",
          rating: 8,
          distance: 1.8,
          grades: "9-12",
          type: "Public",
          address: "321 Jefferson Dr",
          phone: "(555) 456-7890", 
          website: "https://jefferson-high.edu"
        }
      ]
    };

    // Add some variety to ratings
    const enhanceSchoolData = (schools) => {
      return schools.map(school => ({
        ...school,
        enrollment: Math.floor(Math.random() * 800) + 200,
        studentTeacherRatio: Math.floor(Math.random() * 10) + 15,
        testScores: {
          math: Math.floor(Math.random() * 40) + 60,
          reading: Math.floor(Math.random() * 40) + 60
        },
        reviews: {
          count: Math.floor(Math.random() * 50) + 10,
          averageRating: (Math.random() * 2 + 3).toFixed(1)
        }
      }));
    };

    const enrichedSchoolsData = {
      elementary: enhanceSchoolData(mockSchoolsData.elementary),
      middle: enhanceSchoolData(mockSchoolsData.middle),
      high: enhanceSchoolData(mockSchoolsData.high),
      summary: {
        totalSchools: 4,
        averageRating: 7.5,
        nearestSchoolDistance: 0.3
      }
    };

    // Cache the data for 90 days
    const cacheData = {
      data: enrichedSchoolsData,
      feature: 'schools',
      cachedAt: new Date().toISOString(),
      ttl: '90_days'
    };
    
    const cacheSeconds = 90 * 24 * 60 * 60; // 90 days
    await setAsync(cacheKey, cacheData, cacheSeconds);
    console.log('💾 Schools data cached for 90 days');

    res.status(200).json({
      success: true,
      feature: 'schools',
      cost: {
        charged: '$0.10',
        provider: 'GreatSchools',
        note: 'Cached for 90 days'
      },
      data: enrichedSchoolsData,
      dataSource: {
        provider: 'GreatSchools',
        freshData: true,
        cachedAt: cacheData.cachedAt,
        ttl: cacheData.ttl
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Schools data retrieval failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Schools data retrieval failed',
      message: error.message
    });
  }
});

/**
 * 🚶 Walk Score API - On Demand
 * Cost: ~$0.05 per call
 * Cache: 180 days (walk scores change very slowly)
 */
router.get('/:addressKey/walkability', async (req, res) => {
  const { addressKey } = req.params;
  const { latitude, longitude, address } = req.query;

  if (!latitude || !longitude || !address) {
    return res.status(400).json({
      error: 'Latitude, longitude, and address required for walkability score'
    });
  }

  try {
    const cacheKey = `enrichment:walkability:${latitude}_${longitude}`;
    
    // Check cache (6 months for walkability - changes very slowly)
    const cachedData = await getAsync(cacheKey);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        cost: { charged: 0, reason: 'served_from_cache' },
        data: parsedData.data
      });
    }

    console.log('💸 Making Walk Score API call...');
    
    // Mock Walk Score data (replace with real API call)
    const walkabilityData = {
      walkScore: Math.floor(Math.random() * 50) + 50, // 50-100
      bikeScore: Math.floor(Math.random() * 40) + 30, // 30-70
      transitScore: Math.floor(Math.random() * 60) + 20, // 20-80
      description: {
        walk: "Most errands can be accomplished on foot",
        bike: "Bikeable with some bike infrastructure",
        transit: "Some transit options"
      },
      nearbyAmenities: {
        restaurants: Math.floor(Math.random() * 20) + 5,
        shoppingCenters: Math.floor(Math.random() * 5) + 1,
        parks: Math.floor(Math.random() * 8) + 2,
        publicTransit: Math.floor(Math.random() * 3) + 1
      }
    };

    // Cache for 180 days
    const cacheData = {
      data: walkabilityData,
      feature: 'walkability',
      cachedAt: new Date().toISOString(),
      ttl: '180_days'
    };
    
    await setAsync(cacheKey, cacheData, 180 * 24 * 60 * 60);
    
    res.status(200).json({
      success: true,
      feature: 'walkability',
      cost: {
        charged: '$0.05',
        provider: 'WalkScore',
        note: 'Cached for 180 days'
      },
      data: walkabilityData,
      dataSource: {
        provider: 'WalkScore',
        freshData: true,
        cachedAt: cacheData.cachedAt
      }
    });

  } catch (error) {
    console.error('❌ Walkability data retrieval failed:', error.message);
    res.status(500).json({
      error: 'Walkability data retrieval failed',
      message: error.message
    });
  }
});

/**
 * 🚔 Crime Data - On Demand
 * Cost: ~$0.08-0.12 per call
 * Cache: 30 days (crime data should be relatively fresh)
 */
router.get('/:addressKey/crime', async (req, res) => {
  const { addressKey } = req.params;
  const { latitude, longitude } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({
      error: 'Latitude and longitude required for crime data'
    });
  }

  try {
    const cacheKey = `enrichment:crime:${latitude}_${longitude}`;
    
    // Check cache (30 days - crime data should be fresher)
    const cachedData = await getAsync(cacheKey);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        cost: { charged: 0, reason: 'served_from_cache' },
        data: parsedData.data
      });
    }

    console.log('💸 Making Crime Data API call...');
    
    // Mock crime data (replace with real crime API)
    const crimeData = {
      overallSafetyRating: Math.floor(Math.random() * 4) + 6, // 6-10
      crimeIndex: Math.floor(Math.random() * 30) + 20, // 20-50 (lower is better)
      recentIncidents: {
        last30Days: Math.floor(Math.random() * 10) + 1,
        last90Days: Math.floor(Math.random() * 25) + 5,
        lastYear: Math.floor(Math.random() * 100) + 20
      },
      crimeTypes: {
        violent: Math.floor(Math.random() * 3) + 1,
        property: Math.floor(Math.random() * 8) + 2,
        traffic: Math.floor(Math.random() * 5) + 1,
        other: Math.floor(Math.random() * 4) + 1
      },
      neighborhoodComparison: {
        betterThan: Math.floor(Math.random() * 40) + 40, // 40-80% better
        saferThanCity: Math.floor(Math.random() * 30) + 50 // 50-80% safer
      },
      policeResponse: {
        averageResponseTime: Math.floor(Math.random() * 10) + 5, // 5-15 minutes
        nearestStation: {
          distance: (Math.random() * 2 + 0.5).toFixed(1), // 0.5-2.5 miles
          name: "Central Police Station"
        }
      }
    };

    // Cache for 30 days
    const cacheData = {
      data: crimeData,
      feature: 'crime',
      cachedAt: new Date().toISOString(),
      ttl: '30_days'
    };
    
    await setAsync(cacheKey, cacheData, 30 * 24 * 60 * 60);
    
    res.status(200).json({
      success: true,
      feature: 'crime',
      cost: {
        charged: '$0.10',
        provider: 'CrimeDataAPI',
        note: 'Cached for 30 days - refreshed monthly'
      },
      data: crimeData,
      dataSource: {
        provider: 'CrimeDataAPI',
        freshData: true,
        cachedAt: cacheData.cachedAt
      }
    });

  } catch (error) {
    console.error('❌ Crime data retrieval failed:', error.message);
    res.status(500).json({
      error: 'Crime data retrieval failed',
      message: error.message
    });
  }
});

/**
 * 🏪 Local Amenities - On Demand
 * Cost: ~$0.032 per call (Google Places API)
 * Cache: 60 days
 */
router.get('/:addressKey/amenities', async (req, res) => {
  const { addressKey } = req.params;
  const { latitude, longitude } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({
      error: 'Latitude and longitude required for amenities lookup'
    });
  }

  try {
    const cacheKey = `enrichment:amenities:${latitude}_${longitude}`;
    
    // Check cache (60 days)
    const cachedData = await getAsync(cacheKey);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        cost: { charged: 0, reason: 'served_from_cache' },
        data: parsedData.data
      });
    }

    console.log('💸 Making Google Places API call for amenities...');
    
    // Mock amenities data (replace with real Google Places API)
    const amenitiesData = {
      restaurants: {
        count: Math.floor(Math.random() * 20) + 10,
        nearest: [
          { name: "Mario's Italian Restaurant", distance: 0.2, rating: 4.5, type: "Italian" },
          { name: "Burger Palace", distance: 0.3, rating: 4.2, type: "American" },
          { name: "Sushi Express", distance: 0.4, rating: 4.7, type: "Japanese" }
        ]
      },
      shopping: {
        count: Math.floor(Math.random() * 15) + 5,
        nearest: [
          { name: "Central Shopping Mall", distance: 1.2, rating: 4.3, type: "Mall" },
          { name: "Local Grocery Store", distance: 0.5, rating: 4.1, type: "Grocery" },
          { name: "Hardware Store", distance: 0.8, rating: 4.4, type: "Hardware" }
        ]
      },
      healthcare: {
        count: Math.floor(Math.random() * 8) + 3,
        nearest: [
          { name: "City Medical Center", distance: 2.1, rating: 4.6, type: "Hospital" },
          { name: "Family Clinic", distance: 0.9, rating: 4.3, type: "Clinic" },
          { name: "Dental Care", distance: 1.1, rating: 4.5, type: "Dental" }
        ]
      },
      recreation: {
        count: Math.floor(Math.random() * 10) + 4,
        nearest: [
          { name: "Central Park", distance: 0.7, rating: 4.8, type: "Park" },
          { name: "Community Gym", distance: 1.3, rating: 4.2, type: "Fitness" },
          { name: "Public Library", distance: 0.6, rating: 4.6, type: "Library" }
        ]
      },
      transportation: {
        publicTransit: {
          busStops: Math.floor(Math.random() * 5) + 2,
          nearestBusStop: 0.2,
          trainStations: Math.floor(Math.random() * 2) + 1,
          nearestTrainStation: 1.8
        },
        highways: {
          nearestHighway: 2.3,
          highwayName: "Interstate 45"
        }
      }
    };

    // Cache for 60 days
    const cacheData = {
      data: amenitiesData,
      feature: 'amenities',
      cachedAt: new Date().toISOString(),
      ttl: '60_days'
    };
    
    await setAsync(cacheKey, cacheData, 60 * 24 * 60 * 60);
    
    res.status(200).json({
      success: true,
      feature: 'amenities',
      cost: {
        charged: '$0.032',
        provider: 'Google Places',
        note: 'Cached for 60 days'
      },
      data: amenitiesData,
      dataSource: {
        provider: 'Google Places',
        freshData: true,
        cachedAt: cacheData.cachedAt
      }
    });

  } catch (error) {
    console.error('❌ Amenities data retrieval failed:', error.message);
    res.status(500).json({
      error: 'Amenities data retrieval failed',
      message: error.message
    });
  }
});

/**
 * 📊 Get All Available Enrichment Features
 * Returns list of enrichment options and their costs
 */
router.get('/:addressKey/available', async (req, res) => {
  const { addressKey } = req.params;
  const { latitude, longitude } = req.query;

  const availableFeatures = {
    schools: {
      cost: '$0.10-0.15',
      cacheTime: '90 days',
      provider: 'GreatSchools',
      description: 'Elementary, middle, and high school ratings and information',
      available: true,
      endpoint: `/api/properties/${addressKey}/schools`
    },
    walkability: {
      cost: '$0.05',
      cacheTime: '180 days',
      provider: 'WalkScore',
      description: 'Walk, bike, and transit scores for the location',
      available: !!(latitude && longitude),
      endpoint: `/api/properties/${addressKey}/walkability`
    },
    crime: {
      cost: '$0.08-0.12',
      cacheTime: '30 days',
      provider: 'CrimeDataAPI',
      description: 'Local crime statistics and safety information',
      available: !!(latitude && longitude),
      endpoint: `/api/properties/${addressKey}/crime`
    },
    amenities: {
      cost: '$0.032',
      cacheTime: '60 days',
      provider: 'Google Places',
      description: 'Nearby restaurants, shopping, healthcare, and recreation',
      available: !!(latitude && longitude),
      endpoint: `/api/properties/${addressKey}/amenities`
    }
  };

  // Check cache status for each feature
  if (latitude && longitude) {
    try {
      for (const [feature, info] of Object.entries(availableFeatures)) {
        if (info.available) {
          const cacheKey = `enrichment:${feature}:${latitude}_${longitude}`;
          const cachedData = await getAsync(cacheKey);
          info.cached = !!cachedData;
          info.costToUser = cachedData ? '$0 (cached)' : info.cost;
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to check cache status for enrichment features');
    }
  }

  res.status(200).json({
    addressKey: addressKey,
    coordinates: { latitude, longitude },
    availableFeatures: availableFeatures,
    totalCostIfAllFresh: '$0.232-0.342',
    totalCostIfCached: '$0 (all cached)',
    costOptimization: {
      strategy: 'on_demand_loading_with_caching',
      benefits: [
        'No upfront costs - only pay when needed',
        'Long cache periods minimize repeat costs',
        'Mix of free and paid data sources',
        'Progressive loading improves user experience'
      ]
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
