# FractionaX Backend - Project Structure

## 📁 Directory Organization

```
FractionaX-Backend/
├── 📂 config/                    # Configuration files
│   ├── 📄 pricing.js             # FXCT pricing configuration
│   ├── 📄 providerPricing.js     # External provider pricing
│   └── 📄 ip-blocking.json       # IP blocking rules
│
├── 📂 controllers/               # Route controllers
│   ├── 📄 authController.js      # Authentication logic
│   ├── 📄 fctController.js       # FCT token operations
│   └── 📄 ticketController.js    # Support ticket handling
│
├── 📂 docs/                      # Technical documentation
│   ├── 📂 readme-files/          # README collection
│   │   ├── 📄 MAIN-README.md     # Core project documentation
│   │   ├── 📄 DOCS-README.md     # Documentation index
│   │   ├── 📄 SUPPORT-TICKETS-README.md
│   │   └── 📄 TESTS-README.md
│   ├── 📄 API_ROUTES_COST_OPTIMIZED.md
│   ├── 📄 CACHING_IMPLEMENTATION_SUMMARY.md
│   ├── 📄 CORELOGIC_IMPLEMENTATION_SUMMARY.md
│   ├── 📄 DAILY_WORKFLOW_SETUP.md
│   ├── 📄 ENHANCED_ANALYTICS_GUIDE.md
│   ├── 📄 Fast-Address-Pipeline.md
│   ├── 📄 FREEMIUM_SYSTEM.md
│   ├── 📄 FREEMIUM_TESTING_GUIDE.md
│   ├── 📄 FRONTEND_INTEGRATION_GUIDE.md
│   ├── 📄 GLOBAL_CACHE_DEPLOYMENT_STATUS.md
│   ├── 📄 GLOBAL_CACHING_STRATEGY.md
│   ├── 📄 PROJECT_STRUCTURE_ANALYSIS.md
│   ├── 📄 REDIS_CACHING_RECOMMENDATIONS.md
│   ├── 📄 SLACK_ADMIN_INTEGRATION.md
│   ├── 📄 SLACK_SUPER_ADMIN_BOT.md
│   ├── 📄 WALLET_INTEGRATION_GUIDE.md
│   └── 📄 WALLET_SYSTEM_README.md
│
├── 📂 middleware/                # Express middleware
│   ├── 📄 auth.js                # JWT authentication
│   ├── 📄 authorizeAdmin.js      # Admin authorization
│   ├── 📄 deductFxct.js          # FXCT token deduction
│   ├── 📄 freemiumRateLimit.js   # Freemium rate limiting
│   ├── 📄 networkAnalytics.js    # Network monitoring
│   ├── 📄 rateLimiterRedis.js    # Redis-based rate limiting
│   ├── 📄 security.js            # Security headers
│   └── 📄 sessionTracking.js     # User session tracking
│
├── 📂 models/                    # Database schemas (Mongoose)
│   ├── 📄 User.js                # User accounts and profiles
│   ├── 📄 Wallet.js              # Wallet and token models
│   ├── 📄 Property.js            # Property data model
│   ├── 📄 SupportTicket.js       # Customer support tickets
│   ├── 📄 AuditLog.js            # System audit logging
│   ├── 📄 BlockedIP.js           # IP blocking system
│   ├── 📄 NetworkAnalytics.js    # Network usage analytics
│   ├── 📄 UserSession.js         # User session management
│   ├── 📄 BlogPost.js            # Blog content management
│   ├── 📄 FastComp.js            # Fast property comparables
│   ├── 📄 SuggestedDeal.js       # AI-suggested deals
│   ├── 📄 Subscriber.js          # Email subscribers
│   ├── 📄 ProviderPriceOverride.js # Pricing overrides
│   ├── 📄 taskModel.js           # Task management
│   ├── 📄 CoreLogicCache.js      # CoreLogic API caching
│   ├── 📄 SearchCache.js         # Search result caching
│   └── 📄 ZillowImageCache.js    # Zillow image caching
│
├── 📂 routes/                    # API routes
│   ├── 📂 api/                   # Public API routes
│   │   ├── 📂 admin/             # Admin-specific routes
│   │   │   └── 📄 budget-monitor.js
│   │   ├── 📂 ai/                # AI-powered endpoints
│   │   │   ├── 📄 faq.js         # AI FAQ system
│   │   │   ├── 📄 fastComp.js    # Fast property comparison
│   │   │   ├── 📄 fullComp.js    # Full property analysis
│   │   │   ├── 📄 pipeline.js    # AI processing pipeline
│   │   │   ├── 📄 search.js      # AI property search
│   │   │   ├── 📄 search_refactored.js # Refactored search
│   │   │   └── 📄 smartSearch.js # Smart search algorithms
│   │   ├── 📂 cache/             # Caching endpoints
│   │   │   ├── 📄 globalStats.js # Global cache statistics
│   │   │   └── 📄 searchStats.js # Search cache stats
│   │   ├── 📂 properties/        # Property data routes
│   │   │   ├── 📄 detail.js      # Property details
│   │   │   ├── 📄 enrichment.js  # Property enrichment
│   │   │   └── 📄 premium.js     # Premium property data
│   │   ├── 📄 blog.js            # Blog management
│   │   ├── 📄 emailCollection.js # Email collection
│   │   ├── 📄 googleMapsTest.js  # Google Maps integration
│   │   ├── 📄 properties.js      # Property search
│   │   ├── 📄 suggestedRoutes.js # Route suggestions
│   │   └── 📄 uploads.js         # File upload handling
│   ├── 📂 ai/                    # AI route groupings
│   │   └── 📄 security.js        # AI security analysis
│   ├── 📄 admin.js               # Admin panel routes
│   ├── 📄 adminPricing.js        # Admin pricing management
│   ├── 📄 attomData.js           # Attom Data integration
│   ├── 📄 auth.js                # Authentication routes
│   ├── 📄 cacheStats.js          # Cache statistics
│   ├── 📄 kyc.js                 # KYC verification
│   ├── 📄 pricing.js             # Public pricing routes
│   ├── 📄 schoolInfo.js          # School information
│   ├── 📄 security.js            # Security endpoints
│   ├── 📄 sessionHistory.js      # Session management
│   ├── 📄 supportTickets.js      # Support system
│   ├── 📄 tasks.js               # Task management
│   ├── 📄 tickets.js             # Ticketing system
│   ├── 📄 tokenPrices.js         # Token pricing
│   ├── 📄 users.js               # User management
│   ├── 📄 wallet.js              # Wallet operations
│   └── 📄 webhooks.js            # Webhook handlers
│
├── 📂 scripts/                   # Utility scripts
│   ├── 📂 admin-utils/           # Admin utility scripts
│   │   ├── 📄 README.md          # Admin utils documentation
│   │   ├── 📄 reset-password.js  # Password reset utility
│   │   ├── 📄 unlock-account.js  # Account unlock utility
│   │   └── 📄 unlock_account.js  # Legacy unlock script
│   ├── 📂 test-scripts/          # Test utilities
│   │   ├── 📄 README.md          # Test scripts documentation
│   │   ├── 📄 test-kyc.js        # KYC testing
│   │   ├── 📄 test-local-slack.js # Local Slack testing
│   │   ├── 📄 test-slack-integration.js # Slack integration tests
│   │   └── 📄 testRedis.js       # Redis testing
│   ├── 📄 check-production.sh    # Production health checks
│   ├── 📄 debug-kyc.js           # KYC debugging
│   ├── 📄 debug_costs.js         # Cost analysis debugging
│   ├── 📄 force-deploy.sh        # Deployment script
│   ├── 📄 manual-deployment-commands.txt # Deployment commands
│   ├── 📄 mock-data-generator.js # Test data generation
│   ├── 📄 populateNetworkAnalytics.js # Network data population
│   ├── 📄 populateTestData.js    # Test data population
│   ├── 📄 test-cache-system.js   # Cache system testing
│   ├── 📄 test-global-api-integration.js # API integration tests
│   └── 📄 test-global-caching.js # Global cache testing
│
├── 📂 services/                  # Business logic services
│   ├── 📂 ai/                    # AI-powered services
│   │   ├── 📄 blogSEOAnalyzer.js # Blog SEO analysis
│   │   ├── 📄 faqAssistant.js    # FAQ automation
│   │   ├── 📄 promptBuilder.js   # AI prompt construction
│   │   ├── 📄 searchRefiner.js   # Search result refinement
│   │   ├── 📄 securityAnalysisService.js # Security analysis
│   │   └── 📄 summarizer.js      # Content summarization
│   ├── 📄 amenityScorer.js       # Property amenity scoring
│   ├── 📄 attom.js               # Attom Data service
│   ├── 📄 costTableService.js    # API cost management
│   ├── 📄 dailyWorkflowService.js # Daily automation
│   ├── 📄 fetchZillow.js         # Zillow data fetching
│   ├── 📄 fxctRatesService.js    # FXCT rate calculations
│   ├── 📄 googleNearby.js        # Google Places integration
│   ├── 📄 greatSchools.js        # School data service
│   ├── 📄 helpScoutService.js    # Help Scout integration
│   ├── 📄 ipBlockingService.js   # IP blocking management
│   ├── 📄 ipGeolocation.js       # IP geolocation service
│   ├── 📄 observabilityService.js # System observability
│   ├── 📄 openaiService.js       # OpenAI integration
│   ├── 📄 overageHandlerService.js # Usage overage handling
│   ├── 📄 priceFeedService.js    # Price feed integration
│   ├── 📄 realTimeAnalytics.js   # Real-time analytics
│   ├── 📄 scheduledTaskService.js # Scheduled task management
│   ├── 📄 slackService.js        # Slack bot integration
│   ├── 📄 sumsubService.js       # Sumsub KYC integration
│   ├── 📄 threatIntelligence.js  # Security threat analysis
│   ├── 📄 tokenIssuanceService.js # Token issuance logic
│   ├── 📄 walletService.js       # Wallet operations
│   └── 📄 websocketService.js    # WebSocket management
│
├── 📂 tests/                     # Test suites
│   ├── 📂 ai/                    # AI functionality tests
│   │   ├── 📄 test_ai_search_dealfinder.js
│   │   ├── 📄 test_ai_search_suggested.js
│   │   └── 📄 test_fastcomp_debug.js
│   ├── 📂 corelogic/             # CoreLogic integration tests
│   │   ├── 📄 test_corelogic_auth.js
│   │   ├── 📄 test_corelogic_debug.js
│   │   ├── 📄 test_corelogic_direct.js
│   │   ├── 📄 test_corelogic_integration.js
│   │   ├── 📄 test_corelogic_no_zip.js
│   │   ├── 📄 test_corelogic_v2.js
│   │   └── 📄 test_super_client.js
│   ├── 📂 examples/              # Test examples
│   │   └── 📄 FastAddressLookup.html
│   ├── 📄 test-freemium.js       # Freemium system tests
│   ├── 📄 test_endpoints.ps1     # PowerShell endpoint tests
│   └── 📄 test_optimized_search.js # Search optimization tests
│
├── 📂 utils/                     # Helper utilities
│   ├── 📄 coreLogicAuth.js       # CoreLogic authentication
│   ├── 📄 coreLogicCacheWrapper.js # CoreLogic caching
│   ├── 📄 coreLogicClientV2.js   # CoreLogic API client
│   ├── 📄 coreLogicSuperClient.js # Enhanced CoreLogic client
│   ├── 📄 coreLogicBudgetWatchdog.js # Budget monitoring
│   ├── 📄 freemiumDataLimiter.js # Freemium data limiting
│   ├── 📄 helpscoutClient.js     # Help Scout client
│   ├── 📄 logAudit.js            # Audit logging utilities
│   ├── 📄 redisClient.js         # Redis client wrapper
│   └── 📄 slackClient.js         # Slack API client
│
├── 📂 logs/                      # Log files (gitignored)
│   ├── 📄 ip-blocking-report-2025-08-*.json
│   └── ...
│
├── 📂 .do/                       # DigitalOcean configuration
│   ├── 📄 app.yaml              # App platform config
│   └── 📄 deploy.template.yaml   # Deployment template
│
├── 📂 .github/                   # GitHub configuration
│   ├── 📄 dependabot.yaml       # Dependency updates
│   └── 📂 workflows/
│       └── 📄 deploy.yml         # CI/CD pipeline
│
├── 📄 index.js                   # Main application entry point
├── 📄 package.json               # Node.js dependencies
├── 📄 wallet.js                  # Wallet system integration
├── 📄 Dockerfile                 # Docker configuration
├── 📄 .gitignore                 # Git ignore rules
├── 📄 .yarnrc                    # Yarn configuration
├── 📄 slack-manifest.json        # Slack app manifest
├── 📄 slack-manifest-production.json # Production Slack config
├── 📄 README.md                  # Main project documentation
└── 📄 PROJECT_STRUCTURE.md       # This file
```

## 🔧 Key Components

### **Entry Point**
- **`index.js`** - Main application server with Express setup, middleware configuration, route mounting, and WebSocket initialization

### **Core Services**
- **Authentication** - JWT-based auth with role-based access control
- **Wallet System** - FXCT token management with custodial wallets
- **Real Estate API** - Property search, analysis, and valuation
- **AI Analytics** - Property analysis and market insights
- **Admin Tools** - Comprehensive Slack-based administration

### **Data Layer**
- **MongoDB** - Primary database with Mongoose ODM
- **Redis** - Caching layer for performance optimization
- **External APIs** - CoreLogic, Zillow, OpenAI, and more

## 📊 Architecture Patterns

### **MVC Pattern**
```
Models (models/) ←→ Controllers (controllers/) ←→ Views (API responses)
                              ↕
                    Services (services/)
```

### **Middleware Stack**
```
Request → Security → Auth → Rate Limiting → FXCT Deduction → Routes
```

### **Caching Strategy**
```
Redis L1 Cache → Database L2 → External APIs (fallback)
```

## 🚀 Quick Navigation

### **Development**
- Start here: `README.md`
- Project structure: `PROJECT_STRUCTURE.md` (this file)
- Main entry: `index.js`
- Environment setup: `.env.example`

### **API Development**
- Routes: `routes/` directory
- Business logic: `services/` directory  
- Data models: `models/` directory
- Middleware: `middleware/` directory

### **Testing**
- Test suites: `tests/` directory
- Test scripts: `scripts/test-scripts/`
- Test documentation: `docs/readme-files/TESTS-README.md`

### **Admin Operations**
- Slack bot: `docs/SLACK_SUPER_ADMIN_BOT.md`
- Admin utilities: `scripts/admin-utils/`
- Admin routes: `routes/admin.js`

### **Wallet System**
- Documentation: `docs/WALLET_SYSTEM_README.md`
- Integration guide: `docs/WALLET_INTEGRATION_GUIDE.md`
- Service: `services/walletService.js`
- Main export: `wallet.js`

### **Documentation**
- Technical docs: `docs/` directory
- API documentation: `docs/API_ROUTES_COST_OPTIMIZED.md`
- Implementation guides: `docs/readme-files/`

## 🔐 Security & Compliance

### **Authentication Flow**
1. JWT token validation (`middleware/auth.js`)
2. Role-based authorization (`middleware/authorizeAdmin.js`)
3. Rate limiting (`middleware/rateLimiterRedis.js`)
4. Security headers (`middleware/security.js`)

### **Data Protection**
- Input validation and sanitization
- SQL injection prevention (MongoDB ODM)
- XSS protection
- CORS configuration
- Secure session management

### **Audit & Compliance**
- Complete audit logging (`models/AuditLog.js`)
- User session tracking (`middleware/sessionTracking.js`)
- Transaction ledgers (`models/Wallet.js`)
- Admin action logging (`utils/logAudit.js`)

## 🚦 Development Workflow

### **Local Development**
1. Clone repository
2. Install dependencies: `npm install`
3. Configure environment: Copy `.env.example` to `.env`
4. Start services: MongoDB, Redis
5. Run development: `npm run dev`

### **Testing**
1. Unit tests: `npm test`
2. Integration tests: `node tests/[specific-test].js`
3. Script utilities: `node scripts/test-scripts/[test-name].js`

### **Deployment**
1. Production build: `npm run build`
2. Docker deployment: `docker build -t fractionax-backend .`
3. Manual deployment: `scripts/manual-deployment-commands.txt`
4. Health checks: `scripts/check-production.sh`

## 📈 Performance & Monitoring

### **Caching Strategy**
- **Redis L1**: Hot data, frequently accessed
- **Database L2**: Warm data, moderately accessed
- **External APIs**: Cold data, fallback layer

### **Monitoring**
- Real-time analytics (`services/realTimeAnalytics.js`)
- Performance metrics (`middleware/networkAnalytics.js`)
- Error tracking (`utils/logAudit.js`)
- Health checks (`/api/health` endpoint)

### **Optimization**
- Database query optimization
- Redis caching for API responses
- Response compression
- Rate limiting and throttling

---

## 📞 Support & Maintenance

For development questions and operational support:

1. **Documentation** - Check relevant README files
2. **Slack Admin Bot** - Use `/admin` command for help
3. **Error Logs** - Check `logs/` directory
4. **Test Scripts** - Use utilities in `scripts/` directory

**Last Updated:** August 15, 2025
**Version:** 1.0.0
