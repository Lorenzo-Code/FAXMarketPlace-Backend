const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema(
  {
    title: String,
    address1: String,
    city: String,
    state: String,
    price: Number,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // New fields
    isFractional: { type: Boolean, default: false },
    isAISuggested: { type: Boolean, default: false },
    expectedMonthlyROI: { type: Number, default: 0 }, // e.g. 6.5% = 0.065
    rentalYield: Number,
    type: { type: String, enum: ["rent", "sale"], default: "sale" },
    
    // AI-enriched property data from batch processor
    data: {
      type: mongoose.Schema.Types.Mixed, // Raw property data from Zillow/APIs
      default: null
    },
    zpid: { type: String, index: true }, // Zillow Property ID for lookups
    externalId: { type: String, index: true }, // Any external property ID
    mls_id: { type: String, index: true }, // MLS ID if available
    
    // Enriched image data
    imgSrc: String, // Primary image URL
    carouselPhotos: [String], // Array of all image URLs for carousel
    photoCount: { type: Number, default: 0 },
    
    // Processed address data
    address: {
      oneLine: String,
      street: String,
      city: String,
      state: String,
      zip: String
    },
    
    // Property details
    beds: Number,
    baths: Number,
    sqft: Number,
    propertyType: String,
    yearBuilt: Number,
    lotSize: Number,
    
    // Location data
    location: {
      latitude: Number,
      longitude: Number
    },
    
    // Data quality and processing metadata
    dataQuality: {
      type: String,
      enum: ['excellent', 'good', 'partial', 'poor'],
      default: 'partial'
    },
    processingTime: Number, // Time taken to process this property (ms)
    imageEnrichmentTime: Number, // Time taken for image enrichment (ms)
    hasImage: { type: Boolean, default: false },
    
    // Source tracking
    dataSource: { type: String, default: 'unknown' }, // 'zillow', 'manual', etc.
    enrichedAt: { type: Date, default: null }, // When batch enrichment was performed
    enrichmentVersion: { type: String, default: '1.0' } // Track enrichment version
  },
  { 
    timestamps: true,
    // Add index for common queries
    indexes: [
      { zpid: 1 },
      { "data.zpid": 1 },
      { "data.property.zpid": 1 },
      { externalId: 1 },
      { mls_id: 1 },
      { dataSource: 1 },
      { dataQuality: 1 },
      { enrichedAt: -1 }
    ]
  }
);


/**
 * Static method to save batch-enriched properties to database
 */
PropertySchema.statics.saveBatchEnrichedProperties = async function(enrichedProperties) {
  if (!enrichedProperties || enrichedProperties.length === 0) {
    console.log('⚠️ No enriched properties to save');
    return [];
  }

  console.log(`💾 Saving ${enrichedProperties.length} enriched properties to database...`);
  const savedProperties = [];
  const errors = [];

  for (const enrichedProp of enrichedProperties) {
    try {
      // Check if property already exists
      let existingProperty = null;
      
      if (enrichedProp.zpid) {
        existingProperty = await this.findOne({ zpid: enrichedProp.zpid });
      }
      
      if (existingProperty) {
        // Update existing property with enriched data
        existingProperty.data = enrichedProp; // Store raw enriched data
        existingProperty.zpid = enrichedProp.zpid;
        existingProperty.imgSrc = enrichedProp.imgSrc;
        existingProperty.carouselPhotos = enrichedProp.carouselPhotos || [];
        existingProperty.photoCount = enrichedProp.carouselPhotos?.length || 0;
        existingProperty.address = enrichedProp.address;
        existingProperty.beds = enrichedProp.beds;
        existingProperty.baths = enrichedProp.baths;
        existingProperty.sqft = enrichedProp.sqft;
        existingProperty.price = enrichedProp.price;
        existingProperty.propertyType = enrichedProp.propertyType;
        existingProperty.location = enrichedProp.location;
        existingProperty.dataQuality = enrichedProp.dataQuality;
        existingProperty.processingTime = enrichedProp.processingTime;
        existingProperty.imageEnrichmentTime = enrichedProp.imageEnrichmentTime;
        existingProperty.hasImage = enrichedProp.hasImage;
        existingProperty.dataSource = enrichedProp.dataSource || 'zillow';
        existingProperty.enrichedAt = new Date();
        existingProperty.enrichmentVersion = '1.1';
        existingProperty.isAISuggested = true;
        
        await existingProperty.save();
        savedProperties.push(existingProperty);
        console.log(`✅ Updated property ${enrichedProp.zpid} with ${enrichedProp.carouselPhotos?.length || 0} photos`);
      } else {
        // Create new property from enriched data
        const newProperty = new this({
          data: enrichedProp, // Store raw enriched data
          zpid: enrichedProp.zpid,
          imgSrc: enrichedProp.imgSrc,
          carouselPhotos: enrichedProp.carouselPhotos || [],
          photoCount: enrichedProp.carouselPhotos?.length || 0,
          address: enrichedProp.address,
          beds: enrichedProp.beds,
          baths: enrichedProp.baths,
          sqft: enrichedProp.sqft,
          price: enrichedProp.price,
          propertyType: enrichedProp.propertyType,
          location: enrichedProp.location,
          dataQuality: enrichedProp.dataQuality,
          processingTime: enrichedProp.processingTime,
          imageEnrichmentTime: enrichedProp.imageEnrichmentTime,
          hasImage: enrichedProp.hasImage,
          dataSource: enrichedProp.dataSource || 'zillow',
          enrichedAt: new Date(),
          enrichmentVersion: '1.1',
          isAISuggested: true,
          status: 'pending'
        });
        
        await newProperty.save();
        savedProperties.push(newProperty);
        console.log(`✅ Created new property ${enrichedProp.zpid} with ${enrichedProp.carouselPhotos?.length || 0} photos`);
      }
    } catch (error) {
      console.error(`❌ Failed to save property ${enrichedProp.zpid || enrichedProp.id}:`, error.message);
      errors.push({
        property: enrichedProp.zpid || enrichedProp.id,
        error: error.message
      });
    }
  }

  console.log(`💾 Batch save complete: ${savedProperties.length} saved, ${errors.length} errors`);
  
  if (errors.length > 0) {
    console.warn('⚠️ Errors during batch save:', errors);
  }

  return {
    saved: savedProperties,
    errors,
    totalSaved: savedProperties.length,
    totalErrors: errors.length
  };
};

module.exports = mongoose.model("Property", PropertySchema);
