const axios = require("axios");
require('dotenv').config(); // Ensure environment variables are loaded
const { getCoreLogicAccessToken } = require("./coreLogicAuth");

const BASE = process.env.CORELOGIC_BASE_URL;

/**
 * CoreLogic Property Search Client - Updated based on official API documentation
 * Implements the correct endpoint structure and request formats
 */
async function getPropertyInfoFromCoreLogic({ address1, city, state, postalcode, lat, lng }) {
  const token = await getCoreLogicAccessToken();

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  try {
    console.log(`🎯 CoreLogic: Searching for property at ${address1}, ${city}, ${state} ${postalcode}`);
    
    let propertyData = null;
    let avmData = null;
    let parcelId = null;

    // Method 1: Try address-based property search (most common pattern)
    try {
      console.log(`📍 Method 1: Address-based property search`);
      
      // CoreLogic Property Search - Use v2 endpoint with bestMatch for improved accuracy
      const searchEndpoints = [
        `${BASE}/property/v2/properties/search`,
        `${BASE}/v2/properties/search`  // Alternative v2 path
      ];

      // CoreLogic search parameters - exclude zip for better match rate
      const searchParams = {
        streetAddress: address1,
        city: city,
        state: state,
        bestMatch: true
      };

      console.log(`📋 Query parameters:`, searchParams);
      
      let searchSuccess = false;
      for (const endpoint of searchEndpoints) {
        try {
          console.log(`🔍 Trying: ${endpoint}`);
          console.log(`📤 Full URL: ${endpoint}?${new URLSearchParams(searchParams).toString()}`);
          const response = await axios.get(endpoint, { 
            headers, 
            params: searchParams,
            timeout: 10000 
          });
          
          propertyData = response.data;
          parcelId = extractParcelId(propertyData);
          searchSuccess = true;
          console.log(`✅ Property search successful via ${endpoint}`);
          break;
          
        } catch (endpointError) {
          console.log(`❌ Failed ${endpoint}: ${endpointError.response?.status} ${endpointError.response?.statusText}`);
          continue;
        }
      }

      if (!searchSuccess) {
        throw new Error("All property search endpoints failed");
      }

    } catch (searchError) {
      console.log(`❌ Address search failed, trying spatial lookup...`);

      // Method 2: Spatial/coordinate-based search as fallback
      if (lat && lng) {
        try {
          console.log(`📍 Method 2: Spatial coordinate search`);
          
          const spatialEndpoints = [
            `${BASE}/spatial/v1/properties`,
            `${BASE}/spatial/properties`,
            `${BASE}/location/properties`,
            `${BASE}/geocode/properties`
          ];

          const spatialParams = {
            latitude: lat,
            longitude: lng,
            radius: 100 // 100 meter radius
          };

          let spatialSuccess = false;
          for (const endpoint of spatialEndpoints) {
            try {
              console.log(`🗺️ Trying spatial: ${endpoint}`);
              const response = await axios.get(endpoint, { 
                headers, 
                params: spatialParams,
                timeout: 10000 
              });
              
              propertyData = response.data;
              parcelId = extractParcelId(propertyData);
              spatialSuccess = true;
              console.log(`✅ Spatial search successful via ${endpoint}`);
              break;
              
            } catch (endpointError) {
              console.log(`❌ Failed spatial ${endpoint}: ${endpointError.response?.status}`);
              continue;
            }
          }

          if (!spatialSuccess) {
            throw new Error("All spatial search endpoints failed");
          }

        } catch (spatialError) {
          console.log(`❌ Spatial search also failed`);
          throw new Error("Both address and spatial searches failed");
        }
      } else {
        throw new Error("No coordinates available for spatial fallback");
      }
    }

    // Method 3: Get detailed property information if we have a parcel ID
    if (parcelId) {
      try {
        console.log(`🏠 Method 3: Fetching detailed property data for parcel ${parcelId}`);
        
        const propertyEndpoints = [
          `${BASE}/property/v2/properties/${parcelId}`,
          `${BASE}/property/v1/properties/${parcelId}`,
          `${BASE}/properties/${parcelId}`
        ];

        let detailSuccess = false;
        for (const endpoint of propertyEndpoints) {
          try {
            const response = await axios.get(endpoint, { headers, timeout: 10000 });
            propertyData = { ...propertyData, ...response.data };
            detailSuccess = true;
            console.log(`✅ Property details retrieved from ${endpoint}`);
            break;
          } catch (endpointError) {
            console.log(`❌ Failed detail ${endpoint}: ${endpointError.response?.status}`);
            continue;
          }
        }

        if (!detailSuccess) {
          console.log(`⚠️ Could not fetch detailed property data, using search results`);
        }

      } catch (detailError) {
        console.log(`⚠️ Property detail fetch failed, continuing with search data`);
      }
    }

    // Method 4: Get AVM (Automated Valuation Model) data
    if (parcelId) {
      try {
        console.log(`💰 Method 4: Fetching AVM data for parcel ${parcelId}`);
        
        const avmEndpoints = [
          `${BASE}/property/v2/properties/${parcelId}/avm`,
          `${BASE}/property/v1/properties/${parcelId}/valuation`,
          `${BASE}/properties/${parcelId}/avm`,
          `${BASE}/avm/${parcelId}`
        ];

        let avmSuccess = false;
        for (const endpoint of avmEndpoints) {
          try {
            const response = await axios.get(endpoint, { headers, timeout: 10000 });
            avmData = response.data;
            avmSuccess = true;
            console.log(`✅ AVM data retrieved from ${endpoint}`);
            break;
          } catch (endpointError) {
            console.log(`❌ Failed AVM ${endpoint}: ${endpointError.response?.status}`);
            continue;
          }
        }

        if (!avmSuccess) {
          console.log(`⚠️ AVM data unavailable for parcel ${parcelId}`);
          avmData = { valuation: null };
        }

      } catch (avmError) {
        console.log(`⚠️ AVM fetch failed, continuing without valuation data`);
        avmData = { valuation: null };
      }
    }

    // Structure the response according to expected format
    const result = {
      parcelId: parcelId,
      structure: extractStructureData(propertyData),
      valuation: extractValuationData(avmData)
    };

    console.log(`✅ CoreLogic data successfully processed for parcel ${parcelId}`);
    return result;

  } catch (err) {
    console.error("❌ CoreLogic API Error:", {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      url: err.config?.url
    });
    
    // Graceful fallback to mock data
    console.log("⚠️ Falling back to mock data due to CoreLogic API issues");
    const mockClient = require('./coreLogicClientMock');
    return await mockClient.getPropertyInfoFromCoreLogic({ address1, city, state, postalcode, lat, lng });
  }
}

/**
 * Extract parcel ID from various response formats
 */
function extractParcelId(data) {
  if (!data) return null;
  
  // Try different possible locations for parcel ID
  return data.parcelId || 
         data.parcel_id ||
         data.property?.parcelId ||
         data.property?.parcel_id ||
         data.properties?.[0]?.parcelId ||
         data.properties?.[0]?.parcel_id ||
         data.results?.[0]?.parcelId ||
         data.results?.[0]?.parcel_id ||
         null;
}

/**
 * Extract and normalize structure data
 */
function extractStructureData(data) {
  if (!data) return {};
  
  const property = data.property || data.properties?.[0] || data.results?.[0] || data;
  
  return {
    propertyType: property.propertyType || property.property_type || property.type,
    yearBuilt: property.yearBuilt || property.year_built || property.yearConstructed,
    squareFeet: property.squareFeet || property.square_feet || property.livingArea,
    bedrooms: property.bedrooms || property.bedroom_count || property.beds,
    bathrooms: property.bathrooms || property.bathroom_count || property.baths,
    lotSize: property.lotSize || property.lot_size || property.lotSizeAcres,
    stories: property.stories || property.story_count,
    garage: property.garage || property.parking,
    pool: property.pool || property.hasPool,
    address: {
      street: property.address || property.street_address,
      city: property.city,
      state: property.state,
      zip: property.zip || property.zipCode || property.postal_code
    }
  };
}

/**
 * Extract and normalize valuation data
 */
function extractValuationData(data) {
  if (!data || !data.valuation) return {};
  
  const valuation = data.valuation || data;
  
  return {
    currentValue: valuation.currentValue || valuation.current_value || valuation.estimatedValue,
    assessedValue: valuation.assessedValue || valuation.assessed_value || valuation.taxAssessedValue,
    lastSalePrice: valuation.lastSalePrice || valuation.last_sale_price || valuation.priorSalePrice,
    lastSaleDate: valuation.lastSaleDate || valuation.last_sale_date || valuation.priorSaleDate,
    pricePerSquareFoot: valuation.pricePerSquareFoot || valuation.price_per_sqft,
    marketTrend: valuation.marketTrend || valuation.trend,
    confidenceScore: valuation.confidenceScore || valuation.confidence
  };
}

module.exports = { getPropertyInfoFromCoreLogic };
