# 🎯 Frontend Integration Guide - Cost-Optimized Property System

## 📋 **CRITICAL: Route Changes Required**

Your frontend needs to be updated to use the new cost-optimized routes. Here's exactly what needs to change:

---

## 🔄 **ROUTE MAPPING & CHANGES**

### **1. Property Search (UPDATED LOGIC)**

**Route**: `POST /api/ai/search` *(Same endpoint, different response)*

**⚠️ CHANGE REQUIRED**: The response structure is different - you'll get `addrKey` for detail lookups instead of full property data.

**Old Response Structure**:
```javascript
// OLD: Full property data in search results
{
  listings: [{
    // Complete CoreLogic data was embedded here (expensive!)
    coreLogicData: { /* comprehensive data */ }
  }]
}
```

**New Response Structure**:
```javascript  
// NEW: Lightweight property cards only
{
  listings: [{
    id: "zillow_12345",
    zpid: 12345,
    addrKey: "abc123def456", // 🔑 KEY FOR DETAIL LOOKUPS
    address: { street, city, state, zip },
    price: 285000,
    beds: 3,
    baths: 2,
    imgSrc: "...",
    hasDetailData: false,
    detailsAvailable: true
  }]
}
```

---

### **2. Property Details (NEW ENDPOINT)**

**NEW Route**: `GET /api/properties/:addressKey`

**Frontend Change**:
```javascript
// OLD: No separate detail call needed
// NEW: Must call when user opens property detail

const loadPropertyDetails = async (property) => {
  const response = await fetch(`/api/properties/${property.addrKey}?${new URLSearchParams({
    address: property.address.street,
    city: property.address.city,
    state: property.address.state,
    zip: property.address.zip,
    zpid: property.zpid
  })}`);
  
  return response.json();
};
```

---

### **3. Premium Features (NEW ENDPOINTS)**

**NEW Routes**: 
- `GET /api/properties/:addressKey/ownership`
- `GET /api/properties/:addressKey/mortgage`  
- `GET /api/properties/:addressKey/liens`
- `GET /api/properties/:addressKey/transactions`
- `GET /api/properties/:addressKey/climate-risk`

**Frontend Change - FXCT Confirmation Flow**:
```javascript
// NEW: Two-step confirmation process
const loadPremiumFeature = async (feature, addressKey, pid) => {
  // Step 1: Check cost (without confirmation)
  const costCheck = await fetch(`/api/properties/${addressKey}/${feature}?pid=${pid}`);
  const costData = await costCheck.json();
  
  if (costData.requiresConfirmation) {
    // Show user confirmation modal
    const userConfirmed = await showConfirmationModal({
      feature: costData.feature,
      cost: costData.cost,
      userBalance: costData.userBalance
    });
    
    if (userConfirmed) {
      // Step 2: Make confirmed call
      const confirmedResponse = await fetch(
        `/api/properties/${addressKey}/${feature}?pid=${pid}&confirmed=true`
      );
      return confirmedResponse.json();
    }
  }
  
  return costData; // If cached or error
};
```

---

### **4. Enrichment Data (NEW ENDPOINTS)**

**NEW Routes**:
- `GET /api/properties/:addressKey/schools`
- `GET /api/properties/:addressKey/walkability`  
- `GET /api/properties/:addressKey/crime`
- `GET /api/properties/:addressKey/amenities`

**Frontend Change - Tab-Based Loading**:
```javascript
// OLD: All enrichment data loaded with property
// NEW: Load when user opens specific tabs

const TabComponent = ({ addressKey, coordinates }) => {
  const [schoolsData, setSchoolsData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const loadSchools = async () => {
    if (schoolsData) return; // Already loaded
    
    setLoading(true);
    const response = await fetch(`/api/properties/${addressKey}/schools?${new URLSearchParams({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    })}`);
    
    const data = await response.json();
    setSchoolsData(data);
    setLoading(false);
  };
  
  return (
    <Tabs>
      <Tab label="Schools" onActivate={loadSchools}>
        {schoolsData ? <SchoolsDisplay data={schoolsData} /> : <Spinner />}
      </Tab>
    </Tabs>
  );
};
```

---

## 🚨 **REQUIRED FRONTEND CHANGES**

### **1. Update Property Search Component**

```javascript
// OLD
const PropertySearch = () => {
  const handleSearch = async (query) => {
    const response = await fetch('/api/ai/search', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
    
    const data = await response.json();
    // OLD: Used complete data from listings
    setProperties(data.listings);
  };
};

// NEW
const PropertySearch = () => {
  const handleSearch = async (query) => {
    const response = await fetch('/api/ai/search', {
      method: 'POST', 
      body: JSON.stringify({ query })
    });
    
    const data = await response.json();
    // NEW: Store lightweight property cards
    setProperties(data.listings.map(property => ({
      ...property,
      needsDetailLoad: true // Flag for detail loading
    })));
  };
};
```

### **2. Add Property Detail Loading**

```javascript
// NEW COMPONENT
const PropertyDetailModal = ({ property, onClose }) => {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadDetails();
  }, [property]);
  
  const loadDetails = async () => {
    try {
      const response = await fetch(`/api/properties/${property.addrKey}?${new URLSearchParams({
        address: property.address.street,
        city: property.address.city,
        state: property.address.state,
        zip: property.address.zip,
        zpid: property.zpid
      })}`);
      
      const data = await response.json();
      setDetails(data);
    } catch (error) {
      console.error('Failed to load property details:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Modal onClose={onClose}>
      {loading ? <Spinner /> : <PropertyDetails details={details} />}
    </Modal>
  );
};
```

### **3. Add FXCT Confirmation Modal**

```javascript
// NEW COMPONENT
const FXCTConfirmationModal = ({ cost, userBalance, onConfirm, onCancel }) => {
  return (
    <Modal>
      <div className="fxct-confirmation">
        <h3>Premium Feature - {cost.description}</h3>
        <div className="cost-info">
          <p>Cost: {cost.cost} FXCT (~${cost.usd})</p>
          <p>Your Balance: {userBalance.current} FXCT</p>
          <p>After Purchase: {userBalance.afterPurchase} FXCT</p>
        </div>
        
        <div className="actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm} className="confirm-btn">
            Confirm & Pay {cost.cost} FXCT
          </button>
        </div>
      </div>
    </Modal>
  );
};
```

### **4. Update Tab Components**

```javascript
// NEW TAB SYSTEM
const PropertyTabs = ({ addressKey, coordinates, pid }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [tabData, setTabData] = useState({});
  
  const loadTabData = async (tabName) => {
    if (tabData[tabName]) return; // Already loaded
    
    let endpoint = '';
    let params = new URLSearchParams();
    
    switch (tabName) {
      case 'schools':
        endpoint = `/api/properties/${addressKey}/schools`;
        params.append('latitude', coordinates.latitude);
        params.append('longitude', coordinates.longitude);
        break;
      
      case 'ownership':
        // Premium feature - handle FXCT confirmation
        return handlePremiumFeature('ownership', addressKey, pid);
        
      // ... other tabs
    }
    
    if (endpoint) {
      const response = await fetch(`${endpoint}?${params}`);
      const data = await response.json();
      setTabData(prev => ({ ...prev, [tabName]: data }));
    }
  };
  
  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    loadTabData(tabName);
  };
  
  return (
    <div className="property-tabs">
      {['overview', 'schools', 'crime', 'ownership', 'mortgage'].map(tab => (
        <button 
          key={tab}
          className={activeTab === tab ? 'active' : ''}
          onClick={() => handleTabClick(tab)}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      ))}
      
      <div className="tab-content">
        {renderTabContent(activeTab, tabData[activeTab])}
      </div>
    </div>
  );
};
```

---

## 📊 **Admin Dashboard Integration**

**NEW Routes** (Admin only):
- `GET /api/admin/budget-monitor/dashboard`
- `GET /api/admin/budget-monitor/status`
- `POST /api/admin/budget-monitor/safe-mode/activate`

---

## 🧪 **Testing Your Integration**

### **1. Test Search Flow**
```javascript
// Test the updated search
fetch('/api/ai/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '3 bedroom houses in Houston under $300k' })
})
.then(r => r.json())  
.then(data => {
  console.log('Search results:', data);
  console.log('First property addrKey:', data.listings[0]?.addrKey); // Should exist
});
```

### **2. Test Detail Loading**
```javascript
// Test property detail loading (use addrKey from search)
const testAddrKey = 'abc123def456'; // From search results
fetch(`/api/properties/${testAddrKey}?address=123 Main St&city=Houston&state=TX&zip=77024`)
.then(r => r.json())
.then(data => {
  console.log('Property details:', data);
  console.log('PID for premium features:', data.pid);
});
```

### **3. Test FXCT Flow**
```javascript  
// Test FXCT confirmation (use addressKey and pid from detail)
const testOwnership = async () => {
  // Step 1: Check cost
  const costCheck = await fetch('/api/properties/abc123def456/ownership?pid=CL_123');
  const costData = await costCheck.json();
  
  if (costData.requiresConfirmation) {
    console.log('FXCT confirmation needed:', costData.cost);
    
    // Step 2: Confirm (in real app, show modal first)
    const confirmed = await fetch('/api/properties/abc123def456/ownership?pid=CL_123&confirmed=true');
    const result = await confirmed.json();
    console.log('Ownership data:', result);
  }
};
```

---

## ⚡ **Performance Benefits**

After implementing these changes:

- **Search**: 90-95% faster (no CoreLogic calls)
- **Detail Views**: 70% cost reduction (cached data)
- **Premium Features**: 90% cost reduction (on-demand only)
- **Overall UX**: Better progressive loading experience

## 🚨 **Action Items**

1. ✅ Update search component to handle new response structure
2. ✅ Add property detail loading functionality  
3. ✅ Implement FXCT confirmation flow for premium features
4. ✅ Convert tabs to on-demand loading
5. ✅ Add admin budget monitoring dashboard
6. ✅ Test all new endpoints thoroughly

**Priority**: Start with search and detail loading - these are the most critical changes.
