# 🏠 Cost-Optimized Property API Routes

## 📋 **IMPORTANT: NEW ARCHITECTURE**

The property data flow has been completely refactored for cost optimization. **Please update your frontend to use these new routes instead of the old ones.**

---

## 1️⃣ **PROPERTY SEARCH (Zillow-Only)**

### **POST** `/api/ai/search` *(Refactored Route)*

**Description**: Cost-optimized search using Zillow-only property cards. NO CoreLogic calls.

**Request Body**:
```json
{
  "query": "3 bedroom houses under $300k in Houston"
}
```

**Response**:
```json
{
  "fromCache": false,
  "searchType": "listings",
  "query": "3 bedroom houses under $300k in Houston",
  "listings": [
    {
      "id": "zillow_12345",
      "zpid": 12345,
      "address": {
        "oneLine": "123 Main St, Houston, TX 77024",
        "street": "123 Main St",
        "city": "Houston", 
        "state": "TX",
        "zip": "77024"
      },
      "price": 285000,
      "beds": 3,
      "baths": 2,
      "sqft": 1850,
      "location": {
        "latitude": 29.7604,
        "longitude": -95.3698
      },
      "imgSrc": "https://photos.zillowstatic.com/...",
      "dataSource": "zillow",
      "dataQuality": "good",
      "addrKey": "abc123def456", // For detail lookups
      "hasDetailData": false,
      "detailsAvailable": true,
      "coreLogicLookupRequired": true
    }
  ],
  "costOptimization": {
    "strategy": "zillow_only_search",
    "coreLogicCallsAvoided": 24,
    "estimatedSavings": "$1,080-3,000",
    "detailsMessage": "Click any property for comprehensive CoreLogic intelligence"
  }
}
```

**Cost**: **$0** (uses cached Zillow data) vs **$45-125** previously

---

## 2️⃣ **PROPERTY DETAILS (On-Demand CoreLogic)**

### **GET** `/api/properties/:addressKey`

**Description**: Load basic property details with CoreLogic data. Only called when user opens detail view.

**URL Parameters**:
- `addressKey`: The `addrKey` from search results

**Query Parameters**:
```
?address=123 Main St&city=Houston&state=TX&zip=77024&zpid=12345
```

**Response**:
```json
{
  "success": true,
  "addressKey": "abc123def456",
  "pid": "CL_PROPERTY_ID_123",
  "clip": "CL_PROPERTY_ID_123",
  "property": {
    "address": {
      "street": "123 Main St",
      "city": "Houston",
      "state": "TX", 
      "zip": "77024",
      "full": "123 Main St, Houston, TX 77024"
    },
    "characteristics": {
      "bedrooms": 3,
      "bathrooms": 2.5,
      "squareFeet": 1850,
      "lotSize": 7200,
      "yearBuilt": 1995,
      "propertyType": "Single Family Residential"
    },
    "location": {
      "latitude": 29.7604,
      "longitude": -95.3698,
      "parcelNumber": "123-456-789"
    },
    "valuation": {
      "assessedValue": 275000,
      "marketValue": 285000,
      "taxAmount": 3450,
      "taxYear": 2024
    }
  },
  "premiumFeatures": {
    "ownership": {
      "available": true,
      "cost": "FXCT",
      "endpoint": "/api/properties/abc123def456/ownership",
      "description": "Current owner details and ownership history"
    },
    "mortgage": {
      "available": true,
      "cost": "FXCT", 
      "endpoint": "/api/properties/abc123def456/mortgage"
    }
  },
  "costOptimization": {
    "basicDataCost": "$15-25 (one time per property)",
    "cachingPeriod": "45 days"
  }
}
```

**Cost**: **$15-25** one-time per property (cached for 45 days)

---

## 3️⃣ **PREMIUM FEATURES (FXCT Required)**

### **GET** `/api/properties/:addressKey/ownership`
**Cost**: 50 FXCT (~$8.00) | **Cache**: 60 days

### **GET** `/api/properties/:addressKey/mortgage`  
**Cost**: 75 FXCT (~$12.00) | **Cache**: 60 days

### **GET** `/api/properties/:addressKey/liens`
**Cost**: 60 FXCT (~$10.00) | **Cache**: 120 days

### **GET** `/api/properties/:addressKey/transactions`
**Cost**: 65 FXCT (~$10.50) | **Cache**: 120 days

### **GET** `/api/properties/:addressKey/climate-risk`
**Cost**: 120 FXCT (~$20.00) | **Cache**: 300 days

**Query Parameters** (Required for all premium features):
```
?pid=CL_PROPERTY_ID_123&confirmed=true
```

**FXCT Confirmation Flow**:

1. **First call** (without `confirmed=true`):
```json
{
  "requiresConfirmation": true,
  "feature": "ownership",
  "cost": {
    "cost": 50,
    "usd": 8.00,
    "description": "Current owner details and ownership transfers"
  },
  "userBalance": {
    "current": 1000,
    "afterPurchase": 950
  },
  "confirmationUrl": "/api/properties/abc123def456/ownership?pid=CL_123&confirmed=true"
}
```

2. **Second call** (with `confirmed=true`):
```json
{
  "success": true,
  "feature": "ownership", 
  "cost": {
    "charged": 50,
    "usd": 8.00,
    "transactionId": "tx_abc123"
  },
  "data": {
    "current": { /* ownership data */ },
    "history": { /* ownership transfer history */ }
  },
  "userBalance": {
    "current": 950
  }
}
```

---

## 4️⃣ **ENRICHMENT APIS (On-Demand)**

### **GET** `/api/properties/:addressKey/schools`
**Cost**: $0.10-0.15 | **Cache**: 90 days

### **GET** `/api/properties/:addressKey/walkability`
**Cost**: $0.05 | **Cache**: 180 days

### **GET** `/api/properties/:addressKey/crime`
**Cost**: $0.10 | **Cache**: 30 days

### **GET** `/api/properties/:addressKey/amenities`
**Cost**: $0.032 | **Cache**: 60 days

**Query Parameters**:
```
?latitude=29.7604&longitude=-95.3698&address=123 Main St, Houston, TX
```

**Example Response** (`/schools`):
```json
{
  "success": true,
  "feature": "schools",
  "cost": {
    "charged": "$0.10",
    "provider": "GreatSchools",
    "note": "Cached for 90 days"
  },
  "data": {
    "elementary": [
      {
        "name": "Oak Elementary School",
        "rating": 8,
        "distance": 0.3,
        "grades": "K-5"
      }
    ],
    "summary": {
      "totalSchools": 4,
      "averageRating": 7.5
    }
  }
}
```

---

## 5️⃣ **ADMIN BUDGET MONITORING**

### **GET** `/api/admin/budget-monitor/status`
**Auth**: Admin only

### **GET** `/api/admin/budget-monitor/analytics`
**Auth**: Admin only

### **GET** `/api/admin/budget-monitor/dashboard`
**Auth**: Admin only

### **POST** `/api/admin/budget-monitor/safe-mode/activate`
**Auth**: Admin only

---

## 🔄 **MIGRATION GUIDE**

### **Old Route → New Route Mapping:**

| **Old Endpoint** | **New Endpoint** | **Change** |
|------------------|------------------|------------|
| `POST /api/ai/search` | `POST /api/ai/search` | **Updated logic** - Zillow only |
| No equivalent | `GET /api/properties/:addressKey` | **NEW** - On-demand details |
| Embedded in search | `GET /api/properties/:addressKey/ownership` | **NEW** - FXCT required |
| Embedded in search | `GET /api/properties/:addressKey/schools` | **NEW** - On-demand |

### **Frontend Integration Steps:**

1. **Update Search Flow**:
   ```javascript
   // OLD: Received full property data in search
   // NEW: Receive property cards only
   const searchResults = await fetch('/api/ai/search', {
     method: 'POST',
     body: JSON.stringify({ query: userQuery })
   });
   ```

2. **Add Detail View Loading**:
   ```javascript
   // NEW: Load details when user clicks property
   const loadPropertyDetails = async (property) => {
     const details = await fetch(`/api/properties/${property.addrKey}?` + 
       new URLSearchParams({
         address: property.address.street,
         city: property.address.city,
         state: property.address.state,
         zip: property.address.zip,
         zpid: property.zpid
       })
     );
   };
   ```

3. **Add Premium Feature Handling**:
   ```javascript
   // NEW: Handle FXCT confirmation flow
   const loadOwnership = async (addressKey, pid) => {
     // First call - check cost
     let response = await fetch(`/api/properties/${addressKey}/ownership?pid=${pid}`);
     
     if (response.requiresConfirmation) {
       // Show confirmation modal to user
       const confirmed = await showCostConfirmationModal(response.cost);
       if (confirmed) {
         // Second call - confirmed
         response = await fetch(`/api/properties/${addressKey}/ownership?pid=${pid}&confirmed=true`);
       }
     }
     
     return response.data;
   };
   ```

4. **Add Tab-Based Loading**:
   ```javascript
   // NEW: Load enrichment data when tabs open
   const loadSchools = async (addressKey, latitude, longitude) => {
     return fetch(`/api/properties/${addressKey}/schools?` +
       new URLSearchParams({ latitude, longitude })
     );
   };
   ```

---

## 📊 **Cost Summary**

| **Feature** | **Old Cost** | **New Cost** | **Trigger** |
|-------------|--------------|--------------|-------------|
| **Search Results** | $45-125 per search | **$0** | Automatic |
| **Basic Property Details** | $45-125 per view | **$15-25** one-time | Detail view open |
| **Premium Features** | Auto-loaded ($200+) | **50-120 FXCT** | User confirmation |
| **School Data** | Pre-loaded ($0.15) | **$0.10** | Schools tab open |
| **Crime Data** | Pre-loaded ($0.12) | **$0.10** | Crime tab open |

**Total Savings**: **70-95%** cost reduction with better user experience!

---

## 🚨 **Important Notes**

1. **Cache First**: Most data will be served from cache after first load
2. **Progressive Loading**: Only load data when user specifically requests it  
3. **FXCT Integration**: Premium features require user token confirmation
4. **Admin Controls**: Budget monitoring and safe mode available
5. **Backward Compatibility**: Old search endpoint still works but uses new logic

Update your frontend to use these routes for massive cost savings while providing a better user experience!
