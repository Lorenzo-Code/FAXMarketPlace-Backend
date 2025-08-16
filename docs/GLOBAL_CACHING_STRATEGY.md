# 💰 Global Caching Strategy - Cost Optimization Plan

## Overview
This document outlines the comprehensive strategy for implementing MongoDB-based caching across all expensive API endpoints in the FractionaX platform to minimize costs and improve performance.

## 🎯 Goals
- **Reduce API costs by 70-90%** through intelligent caching
- **Improve response times** by serving cached results instantly
- **Scale efficiently** with growing user base
- **Maintain data freshness** with smart TTL policies

## 📊 Current Expensive APIs Identified
1. **CoreLogic API** - $0.05-0.50 per request (Property Intelligence, Search, Enrichment)
2. **Zillow RapidAPI** - $0.01-0.10 per request (Property Photos, Search)
3. **Attom Data** - $0.03-0.25 per request (Property Details, Analytics)
4. **Google Maps API** - $0.002-0.007 per request (Geocoding, Places)
5. **School API** - $0.01-0.05 per request (School Information)
6. **OpenAI API** - $0.001-0.03 per request (AI Summary Generation)

## 🏗️ Caching Architecture

### Base Cache Model Structure
```javascript
const baseCacheSchema = {
  // Unique identifier for the cached data
  cacheKey: { type: String, required: true, unique: true, index: true },
  
  // Request parameters for debugging/analytics
  requestParams: { type: mongoose.Schema.Types.Mixed },
  
  // Cached response data
  cachedData: { type: mongoose.Schema.Types.Mixed, required: true },
  
  // Caching metadata
  createdAt: { type: Date, default: Date.now, index: true },
  lastAccessed: { type: Date, default: Date.now, index: true },
  accessCount: { type: Number, default: 1 },
  
  // Cost tracking
  estimatedApiCost: { type: Number, default: 0 },
  costSaved: { type: Number, default: 0 },
  
  // TTL configuration
  expiresAt: { type: Date, index: true },
  
  // Data source for analytics
  apiSource: { type: String, required: true }
};
```

## 📋 Implementation Checklist

### Phase 1: Core Property APIs (COMPLETED ✅)
- [x] **AI Search Endpoint** - SearchCache model implemented
- [x] **Cache Statistics API** - Admin monitoring tools
- [x] **Frontend Integration** - Search results page with cache indicators

### Phase 2: Property Intelligence APIs
- [ ] **CoreLogic SuperClient** - Implement CoreLogicCache model
- [ ] **Property Details API** - Cache property enrichment data
- [ ] **Property Search API** - Cache search results by location/filters
- [ ] **Property Analytics** - Cache market analysis data

### Phase 3: Image & Media APIs  
- [ ] **Zillow Photos API** - Cache property images by address/zpid
- [ ] **Property Media** - Cache virtual tours, floor plans
- [ ] **Image Optimization** - Cache compressed/resized images

### Phase 4: Location & Context APIs
- [ ] **Google Maps Geocoding** - Cache address ↔ coordinates
- [ ] **Google Places API** - Cache place details and autocomplete
- [ ] **School Information** - Cache school ratings and district data
- [ ] **Neighborhood Analytics** - Cache demographic and market data

### Phase 5: AI & ML APIs
- [ ] **OpenAI Completions** - Cache AI-generated summaries and analysis
- [ ] **Property Valuation** - Cache AVM (Automated Valuation Model) results
- [ ] **Investment Analysis** - Cache ROI calculations and market projections

## 🛠️ Implementation Templates

### 1. Cache Model Template
```javascript
// models/[ApiName]Cache.js
const mongoose = require('mongoose');

const [apiName]CacheSchema = new mongoose.Schema({
  cacheKey: { type: String, required: true, unique: true, index: true },
  requestParams: { type: mongoose.Schema.Types.Mixed },
  cachedData: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
  lastAccessed: { type: Date, default: Date.now, index: true },
  accessCount: { type: Number, default: 1 },
  estimatedApiCost: { type: Number, default: 0 },
  apiSource: { type: String, default: '[API_NAME]' },
  expiresAt: { type: Date, default: () => new Date(Date.now() + [TTL_MS]) }
});

// Static methods for cache operations
[apiName]CacheSchema.statics.findCached = async function(key) { /* ... */ };
[apiName]CacheSchema.statics.cacheData = async function(key, data, cost) { /* ... */ };
[apiName]CacheSchema.statics.getStats = async function() { /* ... */ };

module.exports = mongoose.model('[ApiName]Cache', [apiName]CacheSchema);
```

### 2. Cache Wrapper Template
```javascript
// utils/[apiName]CacheWrapper.js
const [ApiName]Cache = require('../models/[ApiName]Cache');

class [ApiName]CacheWrapper {
  static async getCachedOrFetch(cacheKey, fetchFunction, ttlMs = 86400000, estimatedCost = 0) {
    // Try cache first
    const cached = await [ApiName]Cache.findCached(cacheKey);
    if (cached) {
      console.log(`💰 Cache HIT for ${cacheKey}`);
      return cached;
    }
    
    // Cache miss - call expensive API
    console.log(`💸 Cache MISS for ${cacheKey} - calling API`);
    const data = await fetchFunction();
    
    // Cache the result
    await [ApiName]Cache.cacheData(cacheKey, data, estimatedCost);
    return data;
  }
}
```

## 📈 TTL (Time To Live) Strategy

### Cache Duration by Data Type
| Data Type | TTL | Reasoning |
|-----------|-----|-----------|
| **Property Search Results** | 24 hours | Market changes daily |
| **Property Details** | 7 days | Property info changes weekly |
| **Property Images** | 30 days | Images rarely change |
| **School Information** | 90 days | School data changes quarterly |
| **Geocoding Results** | 365 days | Addresses don't change |
| **AI Summaries** | 24 hours | Tied to property data freshness |
| **Market Analytics** | 12 hours | Market data changes frequently |
| **Property Valuations** | 7 days | Valuations change weekly |

## 🎯 Cache Key Strategies

### 1. Search Results
```javascript
// Pattern: "search:{normalized_query}:{filters_hash}"
const searchKey = `search:${normalizeQuery(query)}:${hashFilters(filters)}`;
```

### 2. Property Details
```javascript
// Pattern: "property:{source}:{property_id}"
const propertyKey = `property:corelogic:${propertyId}`;
```

### 3. Location Data
```javascript
// Pattern: "geocode:{normalized_address}"
const geocodeKey = `geocode:${normalizeAddress(address)}`;
```

### 4. Images
```javascript
// Pattern: "image:{source}:{property_id}:{size}"
const imageKey = `image:zillow:${zpid}:medium`;
```

## 📊 Monitoring & Analytics

### Key Metrics to Track
- **Cache Hit Rate** - Target: >80%
- **Cost Savings** - Target: >70% API cost reduction
- **Response Time Improvement** - Target: >50% faster responses
- **Cache Storage Growth** - Monitor MongoDB usage
- **Most Cached Endpoints** - Identify high-value caches

### Dashboard Endpoints
```
GET /api/cache/stats/global - Overall cache statistics
GET /api/cache/stats/by-source - Statistics by API source
GET /api/cache/stats/cost-savings - Cost savings over time
GET /api/cache/cleanup - Clean up old/unused cache entries
```

## 🔧 Implementation Priority

### High Priority (Immediate Cost Impact)
1. **CoreLogic Property Search** - Highest API costs
2. **CoreLogic Property Details** - Second highest costs  
3. **Zillow Property Images** - High volume, medium cost
4. **AI Summary Generation** - Growing usage

### Medium Priority (Performance Impact)
5. **Google Maps Geocoding** - High volume, low cost
6. **School Information** - Medium volume, medium cost
7. **Property Analytics** - Low volume, high cost

### Low Priority (Future Optimization)
8. **Image Optimization** - Storage costs vs API costs
9. **Advanced ML Models** - Future features
10. **Third-party Integrations** - Future partnerships

## 🚀 Rollout Plan

### Week 1: Core Property APIs
- Implement CoreLogicCache model
- Update CoreLogic SuperClient with caching
- Deploy and monitor cache hit rates

### Week 2: Media & Images
- Implement ZillowImageCache model
- Cache property photos and media
- Optimize image storage and delivery

### Week 3: Location & Context
- Implement GeocodingCache model
- Cache school and neighborhood data
- Integrate with existing location services

### Week 4: AI & Analytics
- Implement AICache model for OpenAI responses
- Cache property valuations and analytics
- Optimize AI summary generation

## 💾 Storage Considerations

### MongoDB Collection Structure
```
fractionax_db/
├── searchcaches/          # Search results (24h TTL)
├── propertydetailcaches/  # Property details (7d TTL)
├── imagecaches/           # Property images (30d TTL)
├── geocodingcaches/       # Address geocoding (365d TTL)
├── schoolcaches/          # School information (90d TTL)
├── aicaches/             # AI-generated content (24h TTL)
└── analyticscaches/       # Market analytics (12h TTL)
```

### Storage Projections
- **Search Cache**: ~10MB/day → 300MB/month
- **Property Details**: ~50MB/day → 1GB/month  
- **Images**: ~100MB/day → 2GB/month
- **Total Estimated**: ~5GB/month (easily manageable)

## 🔒 Security & Privacy

### Data Handling
- **No PII in cache keys** - Use hashed identifiers
- **Encrypted sensitive data** - Encrypt before caching
- **Access controls** - Cache cleanup requires admin access
- **Audit logging** - Track cache access for compliance

### Compliance
- **GDPR compliance** - Automatic cache expiry helps with data retention
- **CCPA compliance** - Cache cleanup on user data deletion requests
- **SOC2 compliance** - Audit trails and access controls

## 📈 Expected Results

### Cost Savings Projections
| API | Current Monthly Cost | Projected Savings | New Monthly Cost |
|-----|---------------------|-------------------|------------------|
| CoreLogic | $1,500 | 80% | $300 |
| Zillow RapidAPI | $800 | 70% | $240 |
| Attom Data | $600 | 75% | $150 |
| Google Maps | $200 | 90% | $20 |
| School API | $300 | 85% | $45 |
| OpenAI | $400 | 60% | $160 |
| **TOTAL** | **$3,800** | **78%** | **$915** |

### Performance Improvements
- **Average Response Time**: 2.5s → 0.3s (88% improvement)
- **99th Percentile Response**: 8s → 1s (87.5% improvement)
- **Server Load**: 30% reduction in CPU usage
- **Database Queries**: 50% reduction in external API calls

## 🎉 Success Metrics

### Immediate (Week 1)
- [ ] Cache hit rate >50% for implemented endpoints
- [ ] Response time improvement >40%
- [ ] API cost reduction >60%

### Short-term (Month 1)  
- [ ] Cache hit rate >75% across all endpoints
- [ ] Response time improvement >60%
- [ ] API cost reduction >70%

### Long-term (Quarter 1)
- [ ] Cache hit rate >85% across all endpoints  
- [ ] Response time improvement >70%
- [ ] API cost reduction >80%
- [ ] User satisfaction score improvement >20%

---

## 📞 Next Steps

1. **Review and approve** this global caching strategy
2. **Prioritize endpoints** based on cost impact and complexity
3. **Implement Phase 1** (Core Property APIs) - Week 1
4. **Monitor and optimize** cache performance continuously
5. **Scale implementation** across remaining endpoints

This strategy will transform FractionaX into a highly efficient, cost-optimized platform while maintaining excellent user experience and data freshness. 🚀
