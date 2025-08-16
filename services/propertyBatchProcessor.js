/**
 * 🚀 Property Batch Processor
 * 
 * Optimized service for processing multiple properties in parallel with intelligent batching,
 * caching, and performance monitoring. Replaces sequential processing for significant
 * performance improvements.
 * 
 * Key Features:
 * - Parallel processing with concurrency control
 * - Intelligent batching based on data source
 * - Comprehensive caching strategy
 * - Performance metrics and timing
 * - Error resilience and fallback strategies
 */

const pLimit = require('p-limit');
const { fetchZillowPhotos } = require('./fetchZillow');
const { performance } = require('perf_hooks');

// Concurrency limits for different operations
const ZILLOW_IMAGE_CONCURRENCY = 8; // Increased from 5 to 8 (3 requests/sec limit with buffer)
const ADDRESS_PARSING_CONCURRENCY = 10; // CPU-bound, can be higher
const DEFAULT_BATCH_SIZE = 20;

class PropertyBatchProcessor {
  constructor(options = {}) {
    this.zillowLimit = pLimit(options.zillowConcurrency || ZILLOW_IMAGE_CONCURRENCY);
    this.addressLimit = pLimit(options.addressConcurrency || ADDRESS_PARSING_CONCURRENCY);
    this.batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    this.metrics = {
      startTime: null,
      totalProperties: 0,
      processedProperties: 0,
      successfullyProcessed: 0,
      errors: 0,
      addressParsingTime: 0,
      imageEnrichmentTime: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * 🎯 Main batch processing method
   * Processes properties in parallel with intelligent batching
   */
  async processPropertiesBatch(rawListings, options = {}) {
    const startTime = performance.now();
    this.metrics.startTime = startTime;
    this.metrics.totalProperties = rawListings.length;

    console.log(`🚀 Starting batch processing of ${rawListings.length} properties`);
    console.log(`📊 Batch configuration: imageLimit=${ZILLOW_IMAGE_CONCURRENCY}, addressLimit=${ADDRESS_PARSING_CONCURRENCY}`);

    try {
      // Phase 1: Parallel address parsing and basic property processing
      console.log(`🔄 Phase 1: Parallel address parsing (${rawListings.length} properties)`);
      const addressParsingStart = performance.now();
      
      const basicProcessedProperties = await this.batchAddressParsing(rawListings);
      
      this.metrics.addressParsingTime = performance.now() - addressParsingStart;
      console.log(`✅ Phase 1 completed in ${(this.metrics.addressParsingTime / 1000).toFixed(2)}s`);

      // Phase 2: Parallel image enrichment for properties that need it
      console.log(`🖼️ Phase 2: Parallel image enrichment`);
      const imageEnrichmentStart = performance.now();
      
      const fullyEnrichedProperties = await this.batchImageEnrichment(basicProcessedProperties);
      
      this.metrics.imageEnrichmentTime = performance.now() - imageEnrichmentStart;
      console.log(`✅ Phase 2 completed in ${(this.metrics.imageEnrichmentTime / 1000).toFixed(2)}s`);

      // Phase 3: Final validation and quality assessment
      console.log(`🔍 Phase 3: Final validation and quality assessment`);
      const validatedProperties = this.validateAndAssessQuality(fullyEnrichedProperties);

      this.metrics.totalProcessingTime = performance.now() - startTime;
      this.metrics.processedProperties = validatedProperties.length;
      this.metrics.successfullyProcessed = validatedProperties.filter(p => p.dataQuality !== 'poor').length;

      this.logPerformanceMetrics();

      return {
        properties: validatedProperties,
        metrics: this.getMetrics(),
        dataQualityStats: this.calculateDataQualityStats(validatedProperties)
      };

    } catch (error) {
      console.error('❌ Batch processing failed:', error.message);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * 🏠 Phase 1: Batch address parsing with parallel processing
   */
  async batchAddressParsing(rawListings) {
    console.log(`📍 Processing ${rawListings.length} addresses in parallel...`);
    
    const addressProcessingPromises = rawListings.map((property, index) => 
      this.addressLimit(() => this.processPropertyAddress(property, index))
    );

    const results = await Promise.allSettled(addressProcessingPromises);
    
    const processedProperties = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.warn(`⚠️ Address processing failed for property ${index}:`, result.reason.message);
        this.metrics.errors++;
        return this.createFallbackProperty(rawListings[index], index);
      }
    });

    const successCount = processedProperties.filter(p => p.dataQuality !== 'poor').length;
    console.log(`📍 Address parsing results: ${successCount}/${rawListings.length} successful`);

    return processedProperties;
  }

  /**
   * 🖼️ Phase 2: Batch image enrichment with parallel processing
   */
  async batchImageEnrichment(properties) {
    console.log(`🖼️ Enriching ${properties.length} properties with images in parallel...`);
    
    // Always enrich properties with multiple images if they have valid addresses
    // Even if they already have imgSrc from Zillow discovery, we want to get the full carousel
    const propertiesNeedingImages = properties.filter(p => 
      p.dataQuality !== 'poor' &&
      p.address &&
      p.address.street &&
      p.address.city &&
      p.zpid  // Only enrich if we have a ZPID for the Zillow images API
    );

    console.log(`🎯 ${propertiesNeedingImages.length} properties need image enrichment`);

    if (propertiesNeedingImages.length === 0) {
      return properties;
    }

    const imageEnrichmentPromises = propertiesNeedingImages.map(property => 
      this.zillowLimit(() => this.enrichPropertyWithImage(property))
    );

    const imageResults = await Promise.allSettled(imageEnrichmentPromises);
    
    // Create a map of enriched properties
    const enrichedPropertiesMap = new Map();
    imageResults.forEach((result, index) => {
      const originalProperty = propertiesNeedingImages[index];
      if (result.status === 'fulfilled' && result.value) {
        enrichedPropertiesMap.set(originalProperty.id, result.value);
      } else if (result.status === 'rejected') {
        console.warn(`⚠️ Image enrichment failed for property ${originalProperty.id}:`, result.reason.message);
        this.metrics.errors++;
      }
    });

    // Merge enriched properties back into the full list
    const fullyEnrichedProperties = properties.map(property => {
      const enriched = enrichedPropertiesMap.get(property.id);
      return enriched || property;
    });

    const enrichedCount = enrichedPropertiesMap.size;
    console.log(`🖼️ Image enrichment results: ${enrichedCount}/${propertiesNeedingImages.length} successful`);

    return fullyEnrichedProperties;
  }

  /**
   * 📍 Process individual property address with enhanced parsing
   */
  async processPropertyAddress(property, index) {
    const processingStart = performance.now();
    
    try {
      console.log(`📍 Processing address for property ${index + 1}: ${property.address}`);

      const processedProperty = {
        ...property,
        id: property.zpid || `property_${index}`,
        price: parseFloat(property.price) || null,
        beds: parseInt(property.bedrooms) || null,
        baths: parseFloat(property.bathrooms) || null,
        sqft: parseInt(property.livingArea) || null,
        imgSrc: property.imgSrc || null,
        location: {
          latitude: parseFloat(property.latitude) || null,
          longitude: parseFloat(property.longitude) || null
        }
      };

      // Enhanced address parsing
      const addressResult = this.parsePropertyAddress(property.address, index);
      
      if (!addressResult.valid) {
        console.warn(`⚠️ Address parsing failed for property ${index}`);
        return {
          ...processedProperty,
          address: { oneLine: property.address || 'Address unavailable' },
          dataQuality: 'poor',
          processingTime: performance.now() - processingStart
        };
      }

      const enrichedProperty = {
        ...processedProperty,
        address: {
          oneLine: `${addressResult.street}, ${addressResult.city}, ${addressResult.state} ${addressResult.zip}`,
          street: addressResult.street,
          city: addressResult.city,
          state: addressResult.state,
          zip: addressResult.zip
        },
        dataQuality: this.assessBasicDataQuality(processedProperty, addressResult),
        processingTime: performance.now() - processingStart
      };

      return enrichedProperty;

    } catch (error) {
      console.error(`❌ Property processing error for index ${index}:`, error.message);
      this.metrics.errors++;
      return this.createFallbackProperty(property, index);
    }
  }

  /**
   * 🧠 Enhanced address parsing with multiple fallback strategies
   */
  parsePropertyAddress(address, propertyIndex) {
    try {
      if (!address || address === '' || address === 'undefined') {
        return { valid: false, error: 'No address provided' };
      }

      const parts = address.split(',').map(s => s.trim());
      
      if (parts.length >= 3) {
        const street = parts[0];
        const city = parts[1];
        const stateZipPart = parts[2];

        // Enhanced state/ZIP parsing with multiple patterns
        const patterns = [
          /^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/, // "TX 77088"
          /^([A-Z]{2})\s+(\d{5})/, // "TX 77088" (ignore extension)
          /([A-Z]{2}).*?(\d{5})/, // Extract state and zip from any format
        ];

        for (const pattern of patterns) {
          const match = stateZipPart.match(pattern);
          if (match) {
            return {
              valid: true,
              street,
              city,
              state: match[1],
              zip: match[2]
            };
          }
        }

        // Fallback: extract any 5-digit number as ZIP
        const zipMatch = stateZipPart.match(/\d{5}/);
        if (zipMatch) {
          return {
            valid: true,
            street,
            city,
            state: 'TX', // Default for Houston searches
            zip: zipMatch[0]
          };
        }
      }

      // Single-part address fallback
      if (parts.length === 1) {
        return {
          valid: true,
          street: parts[0],
          city: 'Houston',
          state: 'TX',
          zip: null
        };
      }

      return { valid: false, error: 'Could not parse address components' };

    } catch (error) {
      console.error(`Address parsing error for property ${propertyIndex}:`, error.message);
      return { valid: false, error: error.message };
    }
  }

  /**
   * 🖼️ Enrich individual property with Zillow image
   */
  async enrichPropertyWithImage(property) {
    const imageStart = performance.now();
    
    try {
      if (!property.address || !property.address.street || !property.address.city) {
        return property; // Can't fetch images without address
      }

      const fullAddress = `${property.address.street}, ${property.address.city}, ${property.address.state} ${property.address.zip}`;
      console.log(`🖼️ Fetching image for: ${fullAddress}`);

      // Use existing ZPID if available for more efficient image fetching
      const existingZpid = property.zpid || property.id;
      const zillowImages = await fetchZillowPhotos(fullAddress, property.address.zip, existingZpid);

      if (zillowImages && zillowImages.length > 0) {
        return {
          ...property,
          imgSrc: zillowImages[0].imgSrc, // Primary image for backward compatibility
          carouselPhotos: zillowImages.map(img => img.imgSrc), // All images for carousel
          zpid: zillowImages[0].zpid,
          photoCount: zillowImages.length,
          imageEnrichmentTime: performance.now() - imageStart,
          hasImage: true
        };
      } else {
        return {
          ...property,
          imageEnrichmentTime: performance.now() - imageStart,
          hasImage: false
        };
      }

    } catch (error) {
      console.warn(`⚠️ Image enrichment failed for ${property.id}:`, error.message);
      return {
        ...property,
        imageEnrichmentTime: performance.now() - imageStart,
        hasImage: false,
        imageError: error.message
      };
    }
  }

  /**
   * 🔍 Assess basic data quality for a property
   */
  assessBasicDataQuality(property, addressResult) {
    const hasRequiredFields = addressResult.zip && property.price && property.beds && property.baths;
    const hasLocation = property.location.latitude && property.location.longitude;
    const hasImage = property.imgSrc;

    if (hasRequiredFields && hasLocation && hasImage) return 'excellent';
    if (hasRequiredFields && hasLocation) return 'good';
    if (addressResult.valid) return 'partial';
    return 'poor';
  }

  /**
   * 🔄 Create fallback property for failed processing
   */
  createFallbackProperty(originalProperty, index) {
    return {
      ...originalProperty,
      id: originalProperty.zpid || `property_${index}`,
      address: { oneLine: originalProperty.address || 'Address unavailable' },
      location: {
        latitude: parseFloat(originalProperty.latitude) || null,
        longitude: parseFloat(originalProperty.longitude) || null
      },
      price: parseFloat(originalProperty.price) || null,
      beds: parseInt(originalProperty.bedrooms) || null,
      baths: parseFloat(originalProperty.bathrooms) || null,
      sqft: parseInt(originalProperty.livingArea) || null,
      imgSrc: originalProperty.imgSrc || null,
      dataQuality: 'poor',
      fallback: true
    };
  }

  /**
   * ✅ Phase 3: Validate and assess quality of all properties
   */
  validateAndAssessQuality(properties) {
    console.log(`🔍 Validating ${properties.length} properties and assessing quality...`);

    const validatedProperties = properties.map(property => {
      // Re-assess data quality after all enrichment
      const hasPrice = property.price && property.price > 0;
      const hasLocation = property.location.latitude && property.location.longitude;
      const hasImage = property.imgSrc;
      const hasBedsAndBaths = property.beds && property.baths;
      const hasValidAddress = property.address && property.address.zip;

      let dataQuality = 'poor';
      if (hasValidAddress && hasPrice && hasBedsAndBaths && hasLocation && hasImage) {
        dataQuality = 'excellent';
      } else if (hasValidAddress && hasPrice && hasBedsAndBaths && hasLocation) {
        dataQuality = 'good';
      } else if (hasValidAddress && (hasPrice || hasBedsAndBaths)) {
        dataQuality = 'partial';
      }

      return {
        ...property,
        dataQuality,
        validation: {
          hasPrice,
          hasLocation,
          hasImage,
          hasBedsAndBaths,
          hasValidAddress
        }
      };
    });

    const qualityStats = this.calculateDataQualityStats(validatedProperties);
    console.log(`🔍 Validation complete:`, qualityStats);

    return validatedProperties;
  }

  /**
   * 📊 Calculate comprehensive data quality statistics
   */
  calculateDataQualityStats(properties) {
    const stats = {
      totalProcessed: properties.length,
      addressParsed: properties.filter(p => p.address && p.address.zip).length,
      hasImages: properties.filter(p => p.imgSrc).length,
      hasPrice: properties.filter(p => p.price && p.price > 0).length,
      hasCoordinates: properties.filter(p => p.location.latitude && p.location.longitude).length,
      hasBedsAndBaths: properties.filter(p => p.beds && p.baths).length,
      excellent: properties.filter(p => p.dataQuality === 'excellent').length,
      good: properties.filter(p => p.dataQuality === 'good').length,
      partial: properties.filter(p => p.dataQuality === 'partial').length,
      poor: properties.filter(p => p.dataQuality === 'poor').length
    };

    return stats;
  }

  /**
   * 📊 Log comprehensive performance metrics
   */
  logPerformanceMetrics() {
    const metrics = this.metrics;
    const totalTime = metrics.totalProcessingTime / 1000;
    const propertiesPerSecond = metrics.totalProperties / totalTime;

    console.log(`\n🚀 BATCH PROCESSING PERFORMANCE REPORT`);
    console.log(`==========================================`);
    console.log(`Total Properties: ${metrics.totalProperties}`);
    console.log(`Successfully Processed: ${metrics.successfullyProcessed}`);
    console.log(`Errors: ${metrics.errors}`);
    console.log(`Total Processing Time: ${totalTime.toFixed(2)}s`);
    console.log(`Address Parsing Time: ${(metrics.addressParsingTime / 1000).toFixed(2)}s`);
    console.log(`Image Enrichment Time: ${(metrics.imageEnrichmentTime / 1000).toFixed(2)}s`);
    console.log(`Processing Rate: ${propertiesPerSecond.toFixed(2)} properties/second`);
    console.log(`Average Time per Property: ${(totalTime / metrics.totalProperties * 1000).toFixed(0)}ms`);
    console.log(`==========================================`);
  }

  /**
   * 📊 Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      propertiesPerSecond: this.metrics.totalProperties / (this.metrics.totalProcessingTime / 1000),
      averageTimePerProperty: this.metrics.totalProcessingTime / this.metrics.totalProperties
    };
  }
}

module.exports = { PropertyBatchProcessor };
