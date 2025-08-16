/**
 * 🚀⚡ Marketplace Batch API Routes
 * 
 * Fast API endpoints for:
 * 1. Retrieving cached marketplace listings (lightning-fast responses)
 * 2. Managing batch service status
 * 3. Manual batch triggers for testing
 */

const express = require('express');
const router = express.Router();
const { MarketplaceListing } = require('../services/marketplaceBatchService');

/**
 * 🏡⚡ GET /api/marketplace/listings
 * Super-fast marketplace listings from MongoDB cache
 * 
 * Query params:
 * - city: Filter by city
 * - state: Filter by state  
 * - minPrice/maxPrice: Price range filters
 * - propertyType: Property type filter
 * - limit: Number of results (default 50)
 * - page: Page number for pagination
 * - sort: Sort by (price, fractionalScore, listingDate)
 * - tokenized: Filter only tokenized properties
 */
router.get('/listings', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Extract query parameters
    const {
      city,
      state,
      minPrice,
      maxPrice,
      propertyType,
      limit = 50,
      page = 1,
      sort = 'fractionalScore',
      order = 'desc',
      tokenized = 'true'
    } = req.query;

    // Build MongoDB filter
    const filter = {};
    
    if (city) filter.city = new RegExp(city, 'i');
    if (state) filter.state = new RegExp(state, 'i');
    if (minPrice) filter.price = { ...filter.price, $gte: parseFloat(minPrice) };
    if (maxPrice) filter.price = { ...filter.price, $lte: parseFloat(maxPrice) };
    if (propertyType) filter.propertyType = propertyType;
    if (tokenized === 'true') filter.tokenized = true;
    
    // Add recency filter (only show listings from last 7 days)
    filter.batchDate = { 
      $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
    };

    // Build sort object
    const sortObj = {};
    const sortOrder = order === 'asc' ? 1 : -1;
    
    switch (sort) {
      case 'price':
        sortObj.price = sortOrder;
        break;
      case 'fractionalScore':
        sortObj.fractionalScore = sortOrder;
        break;
      case 'listingDate':
        sortObj.listingDate = sortOrder;
        break;
      case 'tokenPrice':
        sortObj.tokenPrice = sortOrder;
        break;
      default:
        sortObj.fractionalScore = -1; // Default: highest score first
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const [listings, totalCount] = await Promise.all([
      MarketplaceListing
        .find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(), // Use lean() for better performance
      MarketplaceListing.countDocuments(filter)
    ]);

    const queryTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        listings: listings,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_items: totalCount,
          total_pages: Math.ceil(totalCount / parseInt(limit)),
          has_next: skip + parseInt(limit) < totalCount,
          has_prev: parseInt(page) > 1
        },
        filters_applied: {
          city,
          state,
          minPrice,
          maxPrice,
          propertyType,
          tokenized
        },
        performance: {
          query_time_ms: queryTime,
          cached: true,
          source: 'mongodb_batch_cache'
        }
      },
      message: `Found ${listings.length} fractional properties in ${queryTime}ms`
    });

  } catch (error) {
    console.error('❌ Error fetching cached listings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch marketplace listings',
      message: error.message
    });
  }
});

/**
 * 🏡🔍 GET /api/marketplace/listings/:id
 * Get detailed property information by ID
 */
router.get('/listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const startTime = Date.now();

    const listing = await MarketplaceListing.findOne({ id }).lean();

    if (!listing) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
        message: `No property found with ID: ${id}`
      });
    }

    const queryTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        listing,
        performance: {
          query_time_ms: queryTime,
          cached: true,
          source: 'mongodb_batch_cache'
        }
      },
      message: `Property details retrieved in ${queryTime}ms`
    });

  } catch (error) {
    console.error('❌ Error fetching property details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch property details',
      message: error.message
    });
  }
});

/**
 * 🎯 GET /api/marketplace/featured
 * Get featured/top-scored properties
 */
router.get('/featured', async (req, res) => {
  try {
    const startTime = Date.now();
    const { limit = 12 } = req.query;

    // Get top properties by fractional score
    const featuredListings = await MarketplaceListing
      .find({
        batchDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        fractionalScore: { $gte: 8.0 }, // High-quality properties only
        tokenized: true
      })
      .sort({ 
        fractionalScore: -1, 
        expectedROI: -1 
      })
      .limit(parseInt(limit))
      .lean();

    const queryTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        listings: featuredListings,
        performance: {
          query_time_ms: queryTime,
          cached: true,
          source: 'mongodb_batch_cache'
        }
      },
      message: `${featuredListings.length} featured properties retrieved in ${queryTime}ms`
    });

  } catch (error) {
    console.error('❌ Error fetching featured listings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch featured listings',
      message: error.message
    });
  }
});

/**
 * 📊 GET /api/marketplace/stats
 * Get marketplace statistics and metrics
 */
router.get('/stats', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Get various marketplace statistics
    const recentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const [
      totalListings,
      avgPrice,
      avgFractionalScore,
      avgTokenPrice,
      cityStats,
      propertyTypeStats
    ] = await Promise.all([
      MarketplaceListing.countDocuments({ batchDate: { $gte: recentDate } }),
      
      MarketplaceListing.aggregate([
        { $match: { batchDate: { $gte: recentDate } } },
        { $group: { _id: null, avgPrice: { $avg: '$price' } } }
      ]),
      
      MarketplaceListing.aggregate([
        { $match: { batchDate: { $gte: recentDate } } },
        { $group: { _id: null, avgScore: { $avg: '$fractionalScore' } } }
      ]),
      
      MarketplaceListing.aggregate([
        { $match: { batchDate: { $gte: recentDate } } },
        { $group: { _id: null, avgTokenPrice: { $avg: '$tokenPrice' } } }
      ]),
      
      MarketplaceListing.aggregate([
        { $match: { batchDate: { $gte: recentDate } } },
        { $group: { _id: '$city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      
      MarketplaceListing.aggregate([
        { $match: { batchDate: { $gte: recentDate } } },
        { $group: { _id: '$propertyType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    const queryTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        overview: {
          total_listings: totalListings,
          average_price: Math.round(avgPrice[0]?.avgPrice || 0),
          average_fractional_score: Math.round((avgFractionalScore[0]?.avgScore || 0) * 10) / 10,
          average_token_price: Math.round(avgTokenPrice[0]?.avgTokenPrice || 0)
        },
        by_city: cityStats,
        by_property_type: propertyTypeStats,
        performance: {
          query_time_ms: queryTime,
          cached: true,
          source: 'mongodb_batch_cache'
        }
      },
      message: `Marketplace statistics retrieved in ${queryTime}ms`
    });

  } catch (error) {
    console.error('❌ Error fetching marketplace stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch marketplace statistics',
      message: error.message
    });
  }
});

/**
 * 🔍 POST /api/marketplace/search
 * Advanced search with multiple criteria
 */
router.post('/search', async (req, res) => {
  try {
    const startTime = Date.now();
    
    const {
      query,
      filters = {},
      sort = 'fractionalScore',
      order = 'desc',
      limit = 50,
      page = 1
    } = req.body;

    // Build search filter
    const searchFilter = {
      batchDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    };

    // Text search if query provided
    if (query && query.trim()) {
      searchFilter.$or = [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { city: { $regex: query, $options: 'i' } },
        { address: { $regex: query, $options: 'i' } }
      ];
    }

    // Apply filters
    if (filters.city) searchFilter.city = new RegExp(filters.city, 'i');
    if (filters.state) searchFilter.state = new RegExp(filters.state, 'i');
    if (filters.minPrice) searchFilter.price = { ...searchFilter.price, $gte: filters.minPrice };
    if (filters.maxPrice) searchFilter.price = { ...searchFilter.price, $lte: filters.maxPrice };
    if (filters.propertyType) searchFilter.propertyType = filters.propertyType;
    if (filters.minFractionalScore) searchFilter.fractionalScore = { ...searchFilter.fractionalScore, $gte: filters.minFractionalScore };
    if (filters.minBeds) searchFilter.beds = { ...searchFilter.beds, $gte: filters.minBeds };
    if (filters.minBaths) searchFilter.baths = { ...searchFilter.baths, $gte: filters.minBaths };

    // Build sort
    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    // Pagination
    const skip = (page - 1) * limit;

    // Execute search
    const [listings, totalCount] = await Promise.all([
      MarketplaceListing
        .find(searchFilter)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      MarketplaceListing.countDocuments(searchFilter)
    ]);

    const queryTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        listings,
        pagination: {
          current_page: page,
          per_page: limit,
          total_items: totalCount,
          total_pages: Math.ceil(totalCount / limit),
          has_next: skip + limit < totalCount,
          has_prev: page > 1
        },
        search: {
          query: query || '',
          filters_applied: filters,
          results_count: listings.length
        },
        performance: {
          query_time_ms: queryTime,
          cached: true,
          source: 'mongodb_batch_cache'
        }
      },
      message: `Search completed in ${queryTime}ms - found ${totalCount} matching properties`
    });

  } catch (error) {
    console.error('❌ Error executing search:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute search',
      message: error.message
    });
  }
});

module.exports = router;
