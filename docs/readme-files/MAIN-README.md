# FractionaX Backend - Core Documentation

## Project Overview

FractionaX Backend is a comprehensive real estate investment platform that provides:

- **Real Estate Data API** - Property search, analysis, and valuation
- **User Management** - Authentication, KYC, and subscription management
- **Wallet System** - FXCT token management with custodial wallets
- **Admin Tools** - Comprehensive Slack-based administration
- **AI-Powered Analytics** - Property analysis and market insights

## Architecture

### Core Components

1. **API Layer** (`routes/`)
   - RESTful API endpoints for all platform functionality
   - Authentication and authorization middleware
   - Rate limiting and security controls

2. **Business Logic** (`services/`)
   - Core business logic separated from routing
   - External API integrations (CoreLogic, Zillow, etc.)
   - AI and analytics services

3. **Data Layer** (`models/`)
   - MongoDB schemas with Mongoose
   - User, property, transaction, and audit models
   - Caching layer with Redis integration

4. **Admin Layer** (`Slack Integration`)
   - 100+ admin commands via Slack bot
   - Real-time monitoring and alerts
   - User management and support tools

## Key Features

### 🏠 Real Estate API
- Property search and discovery
- Detailed property analytics
- Market comparables and valuations
- Climate risk and neighborhood data

### 💰 Wallet System
- Custodial FXCT token wallets
- Automatic token issuance for subscriptions
- Usage-based deductions for API calls
- Secure withdrawal system

### 🛡️ Admin Tools
- Slack-based administration
- User account management
- System monitoring and alerts
- Compliance and audit tools

### 🔍 AI Analytics
- Property analysis and scoring
- Market trend insights
- Investment recommendations
- Automated report generation

## Getting Started

### Prerequisites
- Node.js 16+
- MongoDB
- Redis
- External API keys (CoreLogic, OpenAI, etc.)

### Installation
```bash
# Clone and install
git clone <repository>
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Start development
npm run dev
```

### Environment Configuration
See the main README.md for complete environment variable setup.

## Development

### Project Structure
```
FractionaX-Backend/
├── config/           # Configuration files
├── controllers/      # Route controllers
├── middleware/       # Express middleware
├── models/          # Database models
├── routes/          # API routes
├── services/        # Business logic
├── tests/           # Test suites
├── utils/           # Helper utilities
└── scripts/         # Utility scripts
```

### Key Services
- **walletService** - Wallet and token management
- **realTimeAnalytics** - Usage and performance tracking
- **slackService** - Admin bot integration
- **openaiService** - AI-powered analysis

## Testing

### Test Structure
- **API Tests** - Endpoint functionality
- **CoreLogic Tests** - External API integration
- **AI Tests** - Analytics and scoring
- **Performance Tests** - Caching and optimization

### Running Tests
```bash
# Run all tests
npm test

# Run specific test suites
node tests/corelogic/test_corelogic_integration.js
node tests/ai/test_ai_search_dealfinder.js
```

## Deployment

### Production Setup
1. Configure production environment variables
2. Set up MongoDB and Redis instances
3. Configure external API access
4. Deploy with proper security settings

### Docker Support
```bash
# Build and run
docker build -t fractionax-backend .
docker run -p 5000:5000 fractionax-backend
```

## Documentation Links

- **[API Documentation](../API_ROUTES_COST_OPTIMIZED.md)** - Complete API reference
- **[Wallet System](../../WALLET_SYSTEM_README.md)** - Token and wallet management
- **[Slack Admin Bot](../../SLACK_SUPER_ADMIN_BOT.md)** - Admin tools and commands
- **[Caching Strategy](../CACHING_IMPLEMENTATION_SUMMARY.md)** - Performance optimization
- **[CoreLogic Integration](../CORELOGIC_IMPLEMENTATION_SUMMARY.md)** - External API setup

## Security

- JWT-based authentication
- Role-based access control
- API rate limiting
- Input validation and sanitization
- Secure webhook handling

## Monitoring

- Health check endpoints
- Real-time performance metrics
- Error logging and alerting
- Admin dashboard via Slack

## Support

- Use Slack admin commands for operational support
- Check documentation for implementation details
- Create GitHub issues for bugs and feature requests
