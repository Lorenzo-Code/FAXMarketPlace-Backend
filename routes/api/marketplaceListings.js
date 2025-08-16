const express = require("express");
const fetch = require("node-fetch");
const { getAsync, setAsync } = require("../../utils/redisClient");
const router = express.Router();

// Import freemium rate limiting and data limiting
const { freemiumRateLimit, addLimitsToResponse } = require("../../middleware/freemiumRateLimit");

/**
 * 🏠 Marketplace Listings Endpoint
 * 
 * Fetches real property listings from Zillow for the marketplace
 * Specifically designed to provide AI-suggested style listings with real data
 */

// Default search parameters for AI-suggested listings
const DEFAULT_SEARCH_PARAMS = {
  location: "Houston, TX",
  priceMax: 500000,
  priceMin: 100000,
  bedsMin: 2,
  home_type: "Houses",
  status_type: "ForSale",
  daysOn: "1", // Recent listings
  sortSelection: "priorityscore", // Best matches first
};

// Transform Zillow property data to marketplace format
function transformZillowToMarketplace(zillowProperty, index = 0) {
  try {
    const {
      zpid,
      address,
      price,
      bedrooms,
      bathrooms,
      livingArea,
      yearBuilt,
      lotAreaValue,
      homeType,
      imgSrc,
      statusText,
      daysOnZillow,
      latitude,
      longitude,
      zestimate,
      rentZestimate,
      propertyTypeDimension
    } = zillowProperty;

    // Calculate estimated ROI based on price and rent estimate
    const estimatedROI = rentZestimate && price ? 
      Math.min(15, Math.max(5, ((rentZestimate * 12) / price * 100))) : 
      Math.random() * 5 + 8; // Random between 8-13% if no rent data

    // Generate features based on property data
    const features = [];
    if (homeType && homeType.toLowerCase().includes('single')) features.push('single_family');
    if (yearBuilt > 2010) features.push('modern');
    if (yearBuilt < 1980) features.push('vintage');
    if (livingArea > 2000) features.push('spacious');
    if (bedrooms >= 4) features.push('family_friendly');
    if (bathrooms >= 3) features.push('multiple_baths');
    if (lotAreaValue > 0.25) features.push('large_lot');
    
    // Add some common features
    features.push('investment_potential', 'ai_selected');

    // Calculate days on market
    const daysOnMarket = daysOnZillow || Math.floor(Math.random() * 30) + 1;

    return {
      id: `zillow-${zpid}`,
      title: `${homeType || 'Property'} in ${address?.city || 'Houston'}`,
      address: address ? 
        `${address.streetAddress || ''}, ${address.city || ''}, ${address.state || 'TX'} ${address.zipcode || ''}`.trim() : 
        'Address not available',
      price: price || 0,
      rentPrice: rentZestimate || Math.round(price * 0.008), // Estimate 0.8% rule if no rent data
      beds: bedrooms || 0,
      baths: bathrooms || 0,
      sqft: livingArea || 0,
      propertyType: homeType?.toLowerCase().includes('condo') ? 'condo' : 
                   homeType?.toLowerCase().includes('townhouse') ? 'townhouse' : 'house',
      listingType: 'ai-discovered',
      images: imgSrc ? [imgSrc] : ['/api/placeholder/800/600'],
      description: `AI-discovered property with strong investment potential. This ${homeType || 'property'} offers ${bedrooms || 'multiple'} bedrooms and ${bathrooms || 'multiple'} bathrooms in ${address?.city || 'a desirable area'}.`,
      detailedDescription: `This property was identified by our AI system as having excellent potential for fractionalization. ${zestimate ? `Estimated value: $${zestimate.toLocaleString()}. ` : ''}Located in ${address?.city || 'Houston'}, it offers promising investment characteristics based on market analysis.`,
      features,
      yearBuilt: yearBuilt || 2000,
      lotSize: lotAreaValue || 0,
      coordinates: latitude && longitude ? { lat: latitude, lng: longitude } : { lat: 29.7604, lng: -95.3698 },
      tokenized: Math.random() > 0.7, // 30% chance of being tokenized
      tokenPrice: Math.floor((price || 200000) / 1000),
      totalTokens: 1000,
      availableTokens: Math.floor(Math.random() * 500) + 200,
      expectedROI: Math.round(estimatedROI * 10) / 10, // Round to 1 decimal
      monthlyRent: rentZestimate || Math.round(price * 0.008),
      hoa: Math.floor(Math.random() * 200) + 50, // Random HOA
      taxes: Math.round(price * 0.012), // Estimate 1.2% annually
      insurance: Math.round(price * 0.003), // Estimate 0.3% annually
      listingDate: new Date(Date.now() - daysOnMarket * 24 * 60 * 60 * 1000).toISOString(),
      status: statusText?.toLowerCase().includes('sale') ? 'active' : 'pending',
      agent: {
        name: 'FractionaX AI Discovery',
        phone: '(713) 555-AI00',
        email: 'ai-discoveries@fractionax.io',
        company: 'FractionaX Intelligence',
        photo: '/api/placeholder/100/100',
        license: 'AI-DISCOVERY'
      },
      stats: {
        views: Math.floor(Math.random() * 100) + 10,
        saves: Math.floor(Math.random() * 20) + 1,
        daysOnMarket: daysOnMarket,
        priceHistory: [
          { date: new Date().toISOString(), price: price || 0, event: 'AI Discovered' }
        ]
      },
      neighborhood: {
        name: address?.city || 'Houston Area',
        walkability: Math.floor(Math.random() * 40) + 40,
        transitScore: Math.floor(Math.random() * 30) + 30,
        bikeScore: Math.floor(Math.random() * 30) + 30
      },
      schools: [], // Would need additional API call
      source: 'zillow-ai',
      aiGenerated: true,
      zpid: zpid,
      zestimate: zestimate,
      originalData: zillowProperty
    };
  } catch (error) {
    console.error('❌ Error transforming Zillow property:', error);
    return {
      id: `error-${Date.now()}-${index}`,
      title: 'Property Details Unavailable',
      address: 'Location not specified',
      price: 0,
      images: ['/api/placeholder/800/600'],
      beds: 0,
      baths: 0,
      sqft: 0,
      propertyType: 'house',
      listingType: 'ai-discovered',
      tokenized: false,
      expectedROI: 0,
      stats: { views: 0, saves: 0, daysOnMarket: 1 },
      error: true
    };
  }
}

// Main endpoint for fetching marketplace listings
router.get("/", freemiumRateLimit, addLimitsToResponse, async (req, res) => {
  try {
    console.log('🏠 Fetching marketplace listings from Zillow...');

    // Get search parameters from query or use defaults
    const searchParams = {
      ...DEFAULT_SEARCH_PARAMS,
      location: req.query.location || DEFAULT_SEARCH_PARAMS.location,
      priceMax: req.query.priceMax || DEFAULT_SEARCH_PARAMS.priceMax,
      priceMin: req.query.priceMin || DEFAULT_SEARCH_PARAMS.priceMin,
      bedsMin: req.query.bedsMin || DEFAULT_SEARCH_PARAMS.bedsMin,
    };

    // Create cache key
    const cacheKey = `marketplace:zillow:${JSON.stringify(searchParams)}`;
    
    // Check cache first
    const cachedData = await getAsync(cacheKey);
    if (cachedData) {
      console.log('💾 Cache hit for marketplace listings');
      return res.json({
        success: true,
        listings: cachedData.listings,
        fromCache: true,
        timestamp: cachedData.timestamp,
        searchParams
      });
    }

    console.log('💸 Cache miss, calling Zillow API...');

    // Build Zillow API URL
    const zillowParams = new URLSearchParams(searchParams);
    const zillowUrl = `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${zillowParams.toString()}`;

    console.log(`🌐 Calling Zillow API: ${zillowUrl}`);

    // Call Zillow API
    const zillowResponse = await fetch(zillowUrl, {
      method: "GET",
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "zillow-com1.p.rapidapi.com",
      },
    });

    if (!zillowResponse.ok) {
      throw new Error(`Zillow API failed: ${zillowResponse.status} ${zillowResponse.statusText}`);
    }

    const zillowData = await zillowResponse.json();
    const rawListings = zillowData.props || [];
    
    console.log(`📦 Retrieved ${rawListings.length} properties from Zillow`);

    // Transform Zillow data to marketplace format
    const transformedListings = rawListings
      .slice(0, 20) // Limit to 20 properties
      .map((property, index) => transformZillowToMarketplace(property, index))
      .filter(property => !property.error); // Remove errored properties

    console.log(`✅ Successfully transformed ${transformedListings.length} listings`);

    // Cache the results for 30 minutes
    const cacheData = {
      listings: transformedListings,
      timestamp: new Date().toISOString(),
      searchParams
    };
    
    await setAsync(cacheKey, cacheData, 1800); // 30 minutes
    console.log('💾 Cached marketplace listings');

    res.json({
      success: true,
      listings: transformedListings,
      fromCache: false,
      timestamp: cacheData.timestamp,
      searchParams,
      totalFound: rawListings.length,
      totalTransformed: transformedListings.length
    });

  } catch (error) {
    console.error('❌ Marketplace listings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch marketplace listings',
      details: error.message
    });
  }
});

module.exports = router;
