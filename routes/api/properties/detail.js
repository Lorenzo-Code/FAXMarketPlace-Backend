const express = require("express");
const router = express.Router();
const crypto = require("crypto");
require("dotenv").config();

// Import caching and CoreLogic clients
const { getAsync, setAsync, getUserKey } = require("../../../utils/redisClient");
const { CoreLogicSuperClient } = require("../../../utils/coreLogicSuperClient");

/**
 * 🏠 ON-DEMAND PROPERTY DETAIL SYSTEM
 * 
 * COST OPTIMIZATION STRATEGY:
 * 1. CoreLogic lookupPropertyID: Only called on detail view open
 * 2. Property Detail v2: Cached for 30-60 days after first lookup
 * 3. PID (Property ID): Cached indefinitely once found
 * 4. High-cost features: Moved to separate endpoints with FXCT confirmation
 * 5. Progressive data loading: Basic → Standard → Premium tiers
 */

/**
 * 📍 Create Property Lookup Key from Address
 */
function createPropertyLookupKey(address, city, state, zip) {
  const keyString = `${address}_${city}_${state}_${zip}`.toLowerCase().replace(/[^\w]/g, '');
  return crypto.createHash('sha256').update(keyString).digest('hex').slice(0, 12);
}

/**
 * 🔍 Find CoreLogic Property ID (PID) - Cached Indefinitely
 */
async function getOrCreatePropertyID(addressData) {
  const { street, city, state, zip } = addressData;
  const lookupKey = createPropertyLookupKey(street, city, state, zip);
  const pidCacheKey = `pid:${lookupKey}`;
  
  console.log(`🔍 Looking up Property ID for: ${street}, ${city}, ${state} ${zip}`);
  
  // Check if we have cached PID (indefinite cache)
  const cachedPID = await getAsync(pidCacheKey);
  if (cachedPID) {
    console.log(`💾 PID Cache HIT: ${cachedPID} (saved expensive lookup)`);
    return JSON.parse(cachedPID);
  }

  console.log(`💸 PID Cache MISS - making CoreLogic lookupPropertyID call`);
  
  // Make expensive CoreLogic lookup call
  const superClient = new CoreLogicSuperClient();
  
  try {
    const searchResult = await superClient.searchPropertiesWithGeocode({
      streetAddress: street,
      city: city,
      state: state,
      zipCode: zip,
      bestMatch: true
    });

    if (!searchResult?.items || searchResult.items.length === 0) {
      throw new Error('Property not found in CoreLogic database');
    }

    const property = searchResult.items[0];
    const pid = property.clip;
    
    if (!pid) {
      throw new Error('No Property ID (CLIP) returned from CoreLogic');
    }

    // Cache Property ID indefinitely (it never changes)
    const pidData = {
      pid: pid,
      clip: pid,
      searchResult: property,
      addressKey: lookupKey,
      cachedAt: new Date().toISOString(),
      ttl: 'indefinite'
    };
    
    await setAsync(pidCacheKey, pidData, 0); // 0 = never expire
    console.log(`💾 PID Cached indefinitely: ${pid}`);
    
    return pidData;
    
  } catch (error) {
    console.error('❌ CoreLogic Property ID lookup failed:', error.message);
    throw error;
  }
}

/**
 * 🏠 Get Basic Property Details - Cached for 30-60 days
 */
async function getBasicPropertyDetails(pid) {
  const detailCacheKey = `property:basic:${pid}`;
  
  // Check cache first (30-60 day cache)
  const cachedDetails = await getAsync(detailCacheKey);
  if (cachedDetails) {
    console.log(`💾 Property details cache HIT for ${pid}`);
    return JSON.parse(cachedDetails);
  }

  console.log(`💸 Making CoreLogic Property Detail v2 call for ${pid}`);
  
  const superClient = new CoreLogicSuperClient();
  
  try {
    // Get essential property data in parallel
    const [propertyDetail, buildings, siteLocation, taxAssessments] = await Promise.allSettled([
      superClient.getPropertyDetail(pid),
      superClient.getBuildings(pid),
      superClient.getSiteLocation(pid),
      superClient.getTaxAssessments(pid)
    ]);

    const basicDetails = {
      pid: pid,
      propertyDetail: propertyDetail.status === 'fulfilled' ? propertyDetail.value : null,
      buildings: buildings.status === 'fulfilled' ? buildings.value : null,
      siteLocation: siteLocation.status === 'fulfilled' ? siteLocation.value : null,
      taxAssessments: taxAssessments.status === 'fulfilled' ? taxAssessments.value : null,
      errors: {
        propertyDetail: propertyDetail.status === 'rejected' ? propertyDetail.reason?.message : null,
        buildings: buildings.status === 'rejected' ? buildings.reason?.message : null,
        siteLocation: siteLocation.status === 'rejected' ? siteLocation.reason?.message : null,
        taxAssessments: taxAssessments.status === 'rejected' ? taxAssessments.reason?.message : null
      },
      dataLevel: 'basic',
      cachedAt: new Date().toISOString(),
      ttl: '45_days'
    };

    // Cache for 45 days (property details don't change often)
    const ttlSeconds = 45 * 24 * 60 * 60; // 45 days
    await setAsync(detailCacheKey, basicDetails, ttlSeconds);
    console.log(`💾 Property basic details cached for 45 days: ${pid}`);
    
    return basicDetails;
    
  } catch (error) {
    console.error('❌ CoreLogic Property Detail calls failed:', error.message);
    throw error;
  }
}

/**
 * 🏠 GET Property Detail - Main Endpoint
 * Only makes CoreLogic calls when user opens detail view
 */
router.get('/:addressKey', async (req, res) => {
  const { addressKey } = req.params;
  const { address, city, state, zip, zpid } = req.query;
  
  console.log('🏠 ON-DEMAND PROPERTY DETAIL REQUEST');
  console.log('📍 Address Key:', addressKey);
  console.log('📋 Query params:', { address, city, state, zip, zpid });
  
  if (!address || !city || !state) {
    return res.status(400).json({
      error: 'Missing required address components',
      required: ['address', 'city', 'state'],
      provided: { address, city, state, zip }
    });
  }

  try {
    // Step 1: Get or create Property ID (cached indefinitely)
    console.log('🔍 Step 1: Getting Property ID...');
    const pidData = await getOrCreatePropertyID({
      street: address,
      city: city,
      state: state,
      zip: zip
    });

    // Step 2: Get basic property details (cached 30-60 days)
    console.log('🏠 Step 2: Getting basic property details...');
    const basicDetails = await getBasicPropertyDetails(pidData.pid);

    // Step 3: Format response for frontend
    const response = {
      success: true,
      addressKey: addressKey,
      pid: pidData.pid,
      clip: pidData.clip,
      
      // Basic property information
      property: {
        address: {
          street: address,
          city: city,
          state: state,
          zip: zip,
          full: `${address}, ${city}, ${state} ${zip}`
        },
        
        // Property characteristics from buildings data
        characteristics: basicDetails.buildings ? {
          bedrooms: basicDetails.buildings.bedrooms,
          bathrooms: basicDetails.buildings.bathrooms,
          squareFeet: basicDetails.buildings.squareFeet,
          lotSize: basicDetails.buildings.lotSize,
          yearBuilt: basicDetails.buildings.yearBuilt,
          propertyType: basicDetails.buildings.propertyType,
          stories: basicDetails.buildings.stories
        } : null,
        
        // Location and coordinates
        location: basicDetails.siteLocation ? {
          latitude: basicDetails.siteLocation.latitude,
          longitude: basicDetails.siteLocation.longitude,
          coordinates: basicDetails.siteLocation.coordinates,
          parcelNumber: basicDetails.siteLocation.parcelNumber,
          legalDescription: basicDetails.siteLocation.legalDescription
        } : null,
        
        // Tax and valuation info
        valuation: basicDetails.taxAssessments ? {
          assessedValue: basicDetails.taxAssessments.assessedValue,
          marketValue: basicDetails.taxAssessments.marketValue,
          taxAmount: basicDetails.taxAssessments.taxAmount,
          taxYear: basicDetails.taxAssessments.taxYear,
          millageRate: basicDetails.taxAssessments.millageRate
        } : null,
        
        // Property detail summary
        summary: basicDetails.propertyDetail ? {
          description: basicDetails.propertyDetail.description,
          zoning: basicDetails.propertyDetail.zoning,
          landUse: basicDetails.propertyDetail.landUse,
          subdivision: basicDetails.propertyDetail.subdivision,
          schoolDistrict: basicDetails.propertyDetail.schoolDistrict
        } : null
      },
      
      // Data source and quality info
      dataSource: {
        provider: 'CoreLogic',
        level: 'basic',
        lastUpdated: basicDetails.cachedAt,
        ttl: basicDetails.ttl,
        pidCached: pidData.ttl === 'indefinite' ? 'permanent' : 'temporary'
      },
      
      // Available premium features (with cost info)
      premiumFeatures: {
        ownership: {
          available: true,
          cost: 'FXCT',
          endpoint: `/api/properties/${addressKey}/ownership`,
          description: 'Current owner details and ownership history'
        },
        mortgage: {
          available: true,
          cost: 'FXCT',
          endpoint: `/api/properties/${addressKey}/mortgage`,
          description: 'Current mortgage and loan details'
        },
        transactions: {
          available: true,
          cost: 'FXCT',
          endpoint: `/api/properties/${addressKey}/transactions`,
          description: 'Complete sales and transaction history'
        },
        liens: {
          available: true,
          cost: 'FXCT',
          endpoint: `/api/properties/${addressKey}/liens`,
          description: 'Liens, judgments, and encumbrances'
        },
        comparables: {
          available: true,
          cost: 'FXCT',
          endpoint: `/api/properties/${addressKey}/comparables`,
          description: 'Recently sold comparable properties'
        },
        permits: {
          available: true,
          cost: 'FXCT',
          endpoint: `/api/properties/${addressKey}/permits`,
          description: 'Building permits and construction history'
        },
        climateRisk: {
          available: true,
          cost: 'FXCT',
          endpoint: `/api/properties/${addressKey}/climate-risk`,
          description: 'Climate risk analytics (CRA-AR6)'
        },
        schools: {
          available: true,
          cost: 'Free',
          endpoint: `/api/properties/${addressKey}/schools`,
          description: 'Nearby schools and ratings'
        }
      },
      
      // Cost optimization info
      costOptimization: {
        strategy: 'on_demand_detail_loading',
        basicDataCost: '$15-25 (one time per property)',
        cachingPeriod: '45 days',
        premiumFeaturesRequireConfirmation: true,
        pidCachedIndefinitely: true
      },
      
      // Any errors encountered
      errors: basicDetails.errors,
      
      timestamp: new Date().toISOString()
    };

    console.log('✅ Property detail loaded successfully');
    console.log(`💰 Data served from cache: ${basicDetails.cachedAt ? 'YES' : 'NO'}`);
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ Property detail loading failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Property detail loading failed',
      message: error.message,
      addressKey: addressKey,
      fallback: {
        suggestion: 'This property may not be available in CoreLogic database',
        alternatives: [
          'Try searching for nearby properties',
          'Verify the address spelling and format',
          'Use the basic Zillow data from search results'
        ]
      },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 🔄 Refresh Property Detail Cache
 * Force refresh of cached property data
 */
router.post('/:addressKey/refresh', async (req, res) => {
  const { addressKey } = req.params;
  const { pid, forceRefresh = false } = req.body;
  
  console.log(`🔄 Cache refresh request for ${addressKey}, PID: ${pid}`);
  
  if (!pid) {
    return res.status(400).json({
      error: 'Property ID (PID) required for cache refresh'
    });
  }

  try {
    if (forceRefresh) {
      // Clear existing cache
      const detailCacheKey = `property:basic:${pid}`;
      await setAsync(detailCacheKey, null, 1); // Expire immediately
      console.log(`💾 Cleared cache for ${pid}`);
    }
    
    // Get fresh data
    const freshDetails = await getBasicPropertyDetails(pid);
    
    res.status(200).json({
      success: true,
      message: 'Property detail cache refreshed',
      pid: pid,
      addressKey: addressKey,
      refreshedAt: new Date().toISOString(),
      ttl: freshDetails.ttl
    });
    
  } catch (error) {
    console.error('❌ Cache refresh failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Cache refresh failed',
      message: error.message
    });
  }
});

/**
 * 📊 Property Detail Cache Status
 * Check cache status for a property
 */
router.get('/:addressKey/cache-status', async (req, res) => {
  const { addressKey } = req.params;
  const { address, city, state, zip } = req.query;
  
  try {
    const lookupKey = createPropertyLookupKey(address, city, state, zip);
    const pidCacheKey = `pid:${lookupKey}`;
    
    // Check PID cache
    const pidData = await getAsync(pidCacheKey);
    const hasPID = !!pidData;
    
    let hasBasicDetails = false;
    let basicDetailsTTL = null;
    
    if (hasPID) {
      const parsedPID = JSON.parse(pidData);
      const detailCacheKey = `property:basic:${parsedPID.pid}`;
      const detailData = await getAsync(detailCacheKey);
      hasBasicDetails = !!detailData;
      
      if (hasBasicDetails) {
        const parsedDetails = JSON.parse(detailData);
        basicDetailsTTL = parsedDetails.cachedAt;
      }
    }
    
    res.status(200).json({
      addressKey: addressKey,
      cacheStatus: {
        pidCached: hasPID,
        basicDetailsCached: hasBasicDetails,
        basicDetailsAge: basicDetailsTTL
      },
      costSavings: {
        pidLookupSaved: hasPID ? '$2.50' : '$0',
        detailCallsSaved: hasBasicDetails ? '$15-25' : '$0',
        totalSaved: hasPID && hasBasicDetails ? '$17.50-27.50' : '$0'
      }
    });
    
  } catch (error) {
    console.error('❌ Cache status check failed:', error.message);
    res.status(500).json({
      error: 'Cache status check failed',
      message: error.message
    });
  }
});

module.exports = router;
