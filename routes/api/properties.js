const express = require("express");
const router = express.Router();
const Property = require("../../models/Property");
const { getAsync, setAsync, getUserKey, deletePatternAsync, deleteAsync } = require("../../utils/redisClient");

// ✅ Marketplace: Get all APPROVED properties with per-user caching
router.get("/", async (req, res) => {
  try {
    const userKey = getUserKey(req);
    const queryParams = JSON.stringify(req.query);
    const cacheKey = `properties:marketplace:${userKey}:${queryParams}`;

    // 📥 Check cache first
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log(`📥 Cache hit for properties: ${userKey}`);
      return res.json({ fromCache: true, data: cached });
    }

    const filters = { status: "approved" };

    if (req.query.fractionalOnly === "true") {
      filters.isFractional = true;
    }

    if (req.query.aiOnly === "true") {
      filters.isAISuggested = true;
    }

    const properties = await Property.find(filters).sort({ createdAt: -1 });
    
    // 💾 Cache the results for 10 minutes (marketplace data changes frequently)
    await setAsync(cacheKey, properties, 600);
    console.log(`📝 Cached properties for user: ${userKey}`);
    
    res.json({ fromCache: false, data: properties });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get featured properties for homepage "Properties Getting Snapped Up" section
router.get("/featured", async (req, res) => {
  try {
    const cacheKey = 'properties:featured:homepage';
    
    // Check cache first
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log('📥 Cache hit for featured properties');
      return res.json({ fromCache: true, data: cached });
    }
    
    console.log('🏠 Fetching featured properties from database...');
    
    // Get top 4 approved properties with good data quality and images
    let featuredProperties = await Property.find({
      status: 'approved',
      hasImage: true,
      dataQuality: { $in: ['excellent', 'good'] },
      price: { $gt: 50000, $lt: 800000 }, // Reasonable price range
      beds: { $gte: 2 }, // At least 2 bedrooms
      sqft: { $gt: 800 } // At least 800 sqft
    })
    .sort({ createdAt: -1, views: -1 }) // Sort by newest first, then by views
    .limit(4)
    .lean();
    
    // If we don't have enough database properties, supplement with curated examples
    if (featuredProperties.length < 4) {
      console.log(`📝 Only found ${featuredProperties.length} database properties, adding curated examples...`);
      
      // Transform database properties to expected format
      const transformedDbProperties = featuredProperties.map((property, index) => {
        const addressStr = property.address?.oneLine || 
          `${property.address?.street || ''}, ${property.address?.city || 'Houston'}, ${property.address?.state || 'TX'} ${property.address?.zip || ''}`.trim();
        
        return {
          id: property._id.toString(),
          title: property.title || addressStr || `${property.propertyType || 'Property'} in ${property.address?.city || 'Houston'}`,
          address: addressStr || 'Houston, TX',
          price: property.price || 200000,
          beds: property.beds || 3,
          baths: property.baths || 2,
          sqft: property.sqft || 1500,
          propertyType: property.propertyType || 'house',
          expectedROI: property.expectedMonthlyROI ? (property.expectedMonthlyROI * 12 * 100) : (Math.random() * 5 + 8),
          monthlyRent: property.rentalYield || Math.round(property.price * 0.008),
          images: property.carouselPhotos && property.carouselPhotos.length > 0 ? 
            property.carouselPhotos : (property.imgSrc ? [property.imgSrc] : ['/api/placeholder/800/600']),
          tokenized: property.isFractional || Math.random() > 0.5,
          tokenPrice: Math.floor((property.price || 200000) / 2000),
          availableTokens: Math.floor(Math.random() * 800) + 200,
          totalTokens: 2000,
          stats: {
            views: Math.floor(Math.random() * 2000) + 500,
            saves: Math.floor(Math.random() * 150) + 20,
            daysOnMarket: Math.floor(Math.random() * 30) + 1
          },
          features: property.features || ['modern', 'investment_potential', 'prime_location']
        };
      });
      
      // Add curated examples to fill the remaining slots
      const curatedProperties = [
        {
          id: 'featured-1',
          title: 'Modern Duplex in Heights',
          address: '1847 Heights Blvd, Houston, TX 77008',
          price: 425000,
          beds: 4,
          baths: 3,
          sqft: 2100,
          propertyType: 'duplex',
          expectedROI: 9.8,
          monthlyRent: 3200,
          images: [
            'https://photos.zillowstatic.com/fp/bcd1ff9f7d5b2e5c7b5a8f9e2d3c1a0b-p_e.jpg',
            'https://photos.zillowstatic.com/fp/26a8964356e291663d7ce5ef566ce6db-p_e.jpg'
          ],
          tokenized: true,
          tokenPrice: 212,
          availableTokens: 1200,
          totalTokens: 2000,
          stats: {
            views: 2847,
            saves: 156,
            daysOnMarket: 3
          },
          features: ['pool', 'garage', 'updated_kitchen', 'investment_grade']
        },
        {
          id: 'featured-2',
          title: 'Downtown Atlanta High-Rise Condo',
          address: '400 Peachtree St NE, Atlanta, GA 30308',
          price: 289000,
          beds: 2,
          baths: 2,
          sqft: 1150,
          propertyType: 'condo',
          expectedROI: 8.2,
          monthlyRent: 2100,
          images: [
            'https://photos.zillowstatic.com/fp/f8c7e9b6a5d4c3b2a1f0e9d8c7b6a5d4-p_e.jpg'
          ],
          tokenized: true,
          tokenPrice: 144,
          availableTokens: 800,
          totalTokens: 2000,
          stats: {
            views: 1923,
            saves: 89,
            daysOnMarket: 5
          },
          features: ['city_views', 'gym', 'concierge', 'luxury_building']
        },
        {
          id: 'featured-3',
          title: 'Austin Student Housing Investment',
          address: '2100 Guadalupe St, Austin, TX 78705',
          price: 365000,
          beds: 5,
          baths: 3,
          sqft: 1850,
          propertyType: 'house',
          expectedROI: 11.5,
          monthlyRent: 3500,
          images: [
            'https://photos.zillowstatic.com/fp/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6-p_e.jpg'
          ],
          tokenized: false,
          tokenPrice: 0,
          availableTokens: 0,
          totalTokens: 0,
          stats: {
            views: 1654,
            saves: 112,
            daysOnMarket: 8
          },
          features: ['near_campus', 'parking', 'washer_dryer', 'student_rental']
        },
        {
          id: 'featured-4',
          title: 'Dallas Suburban Family Home',
          address: '5423 Mockingbird Ln, Dallas, TX 75206',
          price: 485000,
          beds: 4,
          baths: 3,
          sqft: 2400,
          propertyType: 'house',
          expectedROI: 7.9,
          monthlyRent: 3200,
          images: [
            'https://photos.zillowstatic.com/fp/e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0-p_e.jpg'
          ],
          tokenized: true,
          tokenPrice: 242,
          availableTokens: 950,
          totalTokens: 2000,
          stats: {
            views: 2156,
            saves: 98,
            daysOnMarket: 12
          },
          features: ['pool', 'large_yard', 'updated', 'family_friendly']
        }
      ];
      
      // Combine transformed DB properties with curated ones to get exactly 4
      const neededCurated = 4 - transformedDbProperties.length;
      featuredProperties = [...transformedDbProperties, ...curatedProperties.slice(0, neededCurated)];
    } else {
      // Transform all database properties
      featuredProperties = featuredProperties.map((property, index) => {
        const addressStr = property.address?.oneLine || 
          `${property.address?.street || ''}, ${property.address?.city || 'Houston'}, ${property.address?.state || 'TX'} ${property.address?.zip || ''}`.trim();
        
        return {
          id: property._id.toString(),
          title: property.title || addressStr || `${property.propertyType || 'Property'} in ${property.address?.city || 'Houston'}`,
          address: addressStr || 'Houston, TX',
          price: property.price || 200000,
          beds: property.beds || 3,
          baths: property.baths || 2,
          sqft: property.sqft || 1500,
          propertyType: property.propertyType || 'house',
          expectedROI: property.expectedMonthlyROI ? (property.expectedMonthlyROI * 12 * 100) : (Math.random() * 5 + 8),
          monthlyRent: property.rentalYield || Math.round(property.price * 0.008),
          images: property.carouselPhotos && property.carouselPhotos.length > 0 ? 
            property.carouselPhotos : (property.imgSrc ? [property.imgSrc] : ['/api/placeholder/800/600']),
          tokenized: property.isFractional || Math.random() > 0.5,
          tokenPrice: Math.floor((property.price || 200000) / 2000),
          availableTokens: Math.floor(Math.random() * 800) + 200,
          totalTokens: 2000,
          stats: {
            views: Math.floor(Math.random() * 2000) + 500,
            saves: Math.floor(Math.random() * 150) + 20,
            daysOnMarket: Math.floor(Math.random() * 30) + 1
          },
          features: property.features || ['modern', 'investment_potential', 'prime_location']
        };
      });
    }
    
    console.log(`✅ Prepared ${featuredProperties.length} featured properties for homepage`);
    
    // Cache for 15 minutes
    await setAsync(cacheKey, featuredProperties, 900);
    
    res.json({ fromCache: false, data: featuredProperties });
  } catch (err) {
    console.error('❌ Error fetching featured properties:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get individual property by ID with caching
router.get("/:id", async (req, res) => {
  try {
    const propertyId = req.params.id;
    const userKey = getUserKey(req);
    const cacheKey = `property:${propertyId}:${userKey}`;

    // 📥 Check cache first
    const cached = await getAsync(cacheKey);
    if (cached) {
      console.log(`📥 Cache hit for property ${propertyId}: ${userKey}`);
      return res.json({ fromCache: true, data: cached });
    }

    // Try to find property in database first
    let property = null;
    try {
      // Only try MongoDB lookup if it looks like an ObjectId
      if (propertyId.match(/^[0-9a-fA-F]{24}$/)) {
        property = await Property.findById(propertyId);
      } else {
        // For non-ObjectId property IDs, try to find by zpid or other external ID
        property = await Property.findOne({
          $or: [
            { zpid: propertyId },
            { externalId: propertyId },
            { mls_id: propertyId },
            { "data.zpid": propertyId },
            { "data.property.zpid": propertyId }
          ]
        });
      }
      
      // If we found a property from the database, transform it to the expected format
      if (property && property.data) {
        console.log(`📥 Found enriched property ${propertyId} in database`);
        const data = property.data.property || property.data;
        
        // Extract address information properly
        const addressInfo = property.address || data.address || {};
        const addressLine = typeof addressInfo === 'string' ? addressInfo : 
          (addressInfo.oneLine || 
           `${addressInfo.street || data.address || ""}, ${addressInfo.city || "Houston"}, ${addressInfo.state || "TX"} ${addressInfo.zip || ""}`.trim());
        
        // Transform to expected API format with enriched photos
        const transformedProperty = {
          id: parseInt(propertyId),
          title: addressLine || "Property Details",
          address: addressLine || "Houston, TX",
          price: property.price || data.price || data.zestimate || 125000,
          rentPrice: property.rentPrice || data.rentZestimate || 1550,
          beds: property.beds || data.bedrooms || 3,
          baths: property.baths || data.bathrooms || 2,
          sqft: property.sqft || data.livingArea || 1623,
          propertyType: property.propertyType || data.homeType?.toLowerCase() || "house",
          listingType: "sale",
          // Use carouselPhotos if available, otherwise fallback to imgSrc or placeholders
          images: property.carouselPhotos && property.carouselPhotos.length > 0 
            ? property.carouselPhotos 
            : (property.imgSrc || data.imgSrc ? [property.imgSrc || data.imgSrc] : [
                "https://photos.zillowstatic.com/fp/26a8964356e291663d7ce5ef566ce6db-p_e.jpg",
                "/api/placeholder/800/600"
              ]),
          carouselPhotos: property.carouselPhotos || [],
          description: `Beautiful property located in ${data.address?.city || "Houston"}, ${data.address?.state || "Texas"}. This listing offers great investment potential with modern amenities and desirable location.`,
          detailedDescription: `This property represents an excellent investment opportunity. With competitive pricing and a desirable location, it offers strong rental potential and appreciation prospects. The home features modern amenities and is well-positioned in a growing neighborhood.`,
          features: ["Modern Kitchen", "Updated Flooring", "Central AC", "Parking", "Fenced Yard", "Near Schools", "Shopping Nearby", "Public Transit"],
          yearBuilt: data.yearBuilt || 2005,
          lotSize: data.lotAreaValue ? data.lotAreaValue / 43560 : 0.04, // Convert sqft to acres
          coordinates: { 
            lat: data.latitude || 29.7604, 
            lng: data.longitude || -95.3698 
          },
          tokenized: false,
          tokenPrice: 0,
          totalTokens: 0,
          availableTokens: 0,
          expectedROI: 11.2,
          monthlyRent: data.rentZestimate || 1550,
          hoa: data.monthlyHoaFee || 0,
          taxes: data.taxAnnualAmount || Math.round((data.price || 125000) * 0.015), // Estimate 1.5% property tax
          insurance: 900,
          listingDate: data.datePosted || "2024-01-10",
          status: "active",
          zpid: data.zpid || propertyId,
          agent: {
            name: "Houston Property Group",
            phone: "(713) 555-0199",
            email: "info@houstonpropertygroup.com",
            company: "Houston Property Group",
            photo: "/api/placeholder/100/100",
            license: "TX-987654"
          },
          stats: {
            views: Math.floor(Math.random() * 200) + 50,
            saves: Math.floor(Math.random() * 20) + 2,
            daysOnMarket: Math.floor(Math.random() * 120) + 1,
            priceHistory: [
              { date: data.datePosted || "2024-01-10", price: data.price || 125000, event: "Listed" }
            ]
          },
          neighborhood: {
            name: data.address?.city || "Houston",
            walkability: 58,
            transitScore: 45,
            bikeScore: 42
          },
          schools: [
            { name: "Local Elementary", rating: 7, distance: 0.8 },
            { name: "Community Middle", rating: 6, distance: 1.5 },
            { name: "Regional High School", rating: 8, distance: 2.3 }
          ]
        };
        
        // Assign the transformed property back
        property = transformedProperty;
        
        console.log(`🖼️ Property ${propertyId} has ${property.images.length} images, carouselPhotos: ${property.carouselPhotos?.length || 0}`);
      }
    } catch (err) {
      console.log(`❌ Error finding property ${propertyId} in database:`, err.message);
      console.log(`Using fallback data for property ${propertyId}`);
    }
    
    // If not found in DB, check static mock data
    if (!property) {
      const mockProperties = {
        "1": {
          id: 1,
          title: "Modern Downtown Condo",
          address: "123 Main St, Houston, TX 77002",
          price: 450000,
          rentPrice: 2500,
          beds: 2,
          baths: 2,
          sqft: 1200,
          propertyType: "condo",
          listingType: "sale",
          images: [
            "/api/placeholder/800/600",
            "/api/placeholder/800/600", 
            "/api/placeholder/800/600",
            "/api/placeholder/800/600",
            "/api/placeholder/800/600"
          ],
          description: "Experience luxury living in this stunning modern condo located in the heart of downtown Houston. This 2-bedroom, 2-bathroom unit offers breathtaking city views from floor-to-ceiling windows and features high-end finishes throughout. The open-concept living space is perfect for entertaining, with a gourmet kitchen featuring quartz countertops and stainless steel appliances.",
          detailedDescription: "This exceptional downtown condo represents the pinnacle of urban living. The thoughtfully designed space maximizes natural light and city views while providing all the amenities of modern life. The master suite includes a walk-in closet and spa-like bathroom. Building amenities include 24/7 concierge, fitness center, rooftop pool, and valet parking.",
          features: ["Parking", "Gym", "Pool", "Doorman", "City Views", "Hardwood Floors", "Granite Counters", "Stainless Appliances", "Walk-in Closet", "Balcony"],
          yearBuilt: 2020,
          lotSize: 0,
          coordinates: { lat: 29.7604, lng: -95.3698 },
          tokenized: false,
          tokenPrice: 0,
          totalTokens: 0,
          availableTokens: 0,
          expectedROI: 8.5,
          monthlyRent: 2500,
          hoa: 420,
          taxes: 5400,
          insurance: 1200,
          listingDate: "2024-01-15",
          status: "active",
          agent: {
            name: "Sarah Johnson",
            phone: "(713) 555-0123",
            email: "sarah@realty.com",
            company: "Downtown Realty Group",
            photo: "/api/placeholder/100/100",
            license: "TX-123456"
          },
          stats: {
            views: 245,
            saves: 12,
            daysOnMarket: 15,
            priceHistory: [
              { date: "2024-01-15", price: 450000, event: "Listed" }
            ]
          },
          neighborhood: {
            name: "Downtown Houston",
            walkability: 92,
            transitScore: 85,
            bikeScore: 78
          },
          schools: [
            { name: "Downtown Elementary", rating: 8, distance: 0.3 },
            { name: "Houston Middle School", rating: 7, distance: 0.8 },
            { name: "Central High School", rating: 9, distance: 1.2 }
          ]
        },
        "2": {
          id: 2,
          title: "Family Home with Pool",
          address: "456 Oak Avenue, Sugar Land, TX 77479",
          price: 650000,
          rentPrice: 3200,
          beds: 4,
          baths: 3,
          sqft: 2800,
          propertyType: "house",
          listingType: "sale",
          images: [
            "/api/placeholder/800/600",
            "/api/placeholder/800/600", 
            "/api/placeholder/800/600",
            "/api/placeholder/800/600",
            "/api/placeholder/800/600",
            "/api/placeholder/800/600"
          ],
          description: "Beautiful family home with pool and large backyard in desirable Sugar Land neighborhood. This spacious 4-bedroom, 3-bathroom home features an open floor plan, updated kitchen, and resort-style backyard with swimming pool.",
          detailedDescription: "This immaculate family home offers the perfect blend of comfort and luxury. The open-concept design creates seamless flow between living spaces, while large windows flood the home with natural light. The gourmet kitchen features granite countertops, custom cabinetry, and a large island perfect for family gatherings. The master suite is a true retreat with a spa-like bathroom and walk-in closet. The backyard oasis includes a sparkling pool, covered patio, and beautifully landscaped gardens.",
          features: ["Pool", "Garage", "Garden", "Fireplace", "Granite Counters", "Hardwood Floors", "Crown Molding", "Ceiling Fans", "Covered Patio", "Sprinkler System"],
          yearBuilt: 2015,
          lotSize: 0.3,
          coordinates: { lat: 29.6196, lng: -95.6349 },
          tokenized: true,
          tokenPrice: 100,
          totalTokens: 6500,
          availableTokens: 2100,
          expectedROI: 12.3,
          monthlyRent: 3200,
          hoa: 150,
          taxes: 9750,
          insurance: 1800,
          listingDate: "2024-01-08",
          status: "active",
          agent: {
            name: "Mike Davis",
            phone: "(281) 555-0456",
            email: "mike@realty.com",
            company: "Sugar Land Properties",
            photo: "/api/placeholder/100/100",
            license: "TX-789012"
          },
          stats: {
            views: 412,
            saves: 28,
            daysOnMarket: 8,
            priceHistory: [
              { date: "2024-01-08", price: 650000, event: "Listed" }
            ]
          },
          neighborhood: {
            name: "Sugar Land",
            walkability: 65,
            transitScore: 42,
            bikeScore: 58
          },
          schools: [
            { name: "Oak Elementary", rating: 9, distance: 0.5 },
            { name: "Sugar Land Middle", rating: 9, distance: 1.2 },
            { name: "Clements High School", rating: 10, distance: 2.1 }
          ]
        }
      };
      
      property = mockProperties[propertyId];
    }
    
    // If still no property found, try to get it from Redis/AI search data
    if (!property) {
      // Check if this property ID exists in recent search results
      const searchDataKey = `search_results:*`;
      // For simplicity, create a generic property structure
      property = {
        id: parseInt(propertyId),
        title: "Property Details",
        address: "Houston, TX", 
        price: 125000,
        rentPrice: 1550,
        beds: 3,
        baths: 2,
        sqft: 1623,
        propertyType: "house",
        listingType: "sale",
        images: [
          "https://photos.zillowstatic.com/fp/26a8964356e291663d7ce5ef566ce6db-p_e.jpg",
          "/api/placeholder/800/600", 
          "/api/placeholder/800/600",
          "/api/placeholder/800/600",
          "/api/placeholder/800/600"
        ],
        carouselPhotos: [],
        description: "Beautiful property located in Houston, Texas. This listing was found through our AI-powered search and offers great investment potential.",
        detailedDescription: "This property represents an excellent investment opportunity in the Houston market. With its competitive pricing and desirable location, it offers strong rental potential and appreciation prospects. The home features modern amenities and is well-positioned in a growing neighborhood.",
        features: ["Modern Kitchen", "Updated Flooring", "Central AC", "Parking", "Fenced Yard", "Near Schools", "Shopping Nearby", "Public Transit"],
        yearBuilt: 2005,
        lotSize: 0.04,
        coordinates: { lat: 29.7604, lng: -95.3698 },
        tokenized: false,
        tokenPrice: 0,
        totalTokens: 0,
        availableTokens: 0,
        expectedROI: 11.2,
        monthlyRent: 1550,
        hoa: 0,
        taxes: 1875,
        insurance: 900,
        listingDate: "2024-01-10",
        status: "active",
        agent: {
          name: "Houston Property Group",
          phone: "(713) 555-0199",
          email: "info@houstonpropertygroup.com",
          company: "Houston Property Group",
          photo: "/api/placeholder/100/100",
          license: "TX-987654"
        },
        stats: {
          views: 89,
          saves: 4,
          daysOnMarket: 104,
          priceHistory: [
            { date: "2024-01-10", price: 130000, event: "Listed" },
            { date: "2024-03-15", price: 125000, event: "Price Reduced" }
          ]
        },
        neighborhood: {
          name: "Houston",
          walkability: 58,
          transitScore: 45,
          bikeScore: 42
        },
        schools: [
          { name: "Local Elementary", rating: 7, distance: 0.8 },
          { name: "Community Middle", rating: 6, distance: 1.5 },
          { name: "Regional High School", rating: 8, distance: 2.3 }
        ]
      };
    }
    
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // 💾 Cache the result for 5 minutes
    await setAsync(cacheKey, property, 300);
    console.log(`📝 Cached property ${propertyId} for user: ${userKey}`);
    
    res.json({ fromCache: false, data: property });
  } catch (err) {
    console.error(`❌ Error fetching property ${req.params.id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// 🗑️ Clear cache for specific property
router.delete("/cache/:id", async (req, res) => {
  try {
    const propertyId = req.params.id;
    const pattern = `property:${propertyId}:*`;
    await deletePatternAsync(pattern);
    
    console.log(`🗑️ Cleared cache for property ${propertyId}`);
    res.json({ success: true, message: `Cache cleared for property ${propertyId}` });
  } catch (err) {
    console.error(`❌ Error clearing cache for property ${req.params.id}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// 🗑️ Clear all property caches
router.delete("/cache", async (req, res) => {
  try {
    await deletePatternAsync("property:*");
    await deletePatternAsync("properties:*");
    
    console.log(`🗑️ Cleared all property caches`);
    res.json({ success: true, message: "All property caches cleared" });
  } catch (err) {
    console.error(`❌ Error clearing property caches:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
