# FractionaX Backend 🏠💰

A comprehensive real estate investment platform backend with advanced admin capabilities via Slack integration.

## 🚀 Features

### **Core Platform**
- **Real Estate Investment Management** - Property tokenization and fractional ownership
- **User Management** - KYC verification, account management, role-based access
- **Financial Operations** - Wallet management, transactions, withdrawals
- **Analytics Dashboard** - Revenue tracking, user metrics, property performance

### **🛡️ FractionaX Super Admin Bot**
- **100+ Admin Commands** - Complete platform management via Slack
- **8 Command Categories** - User, System, Wallet, Security, Support, Compliance, Alerts, Analytics
- **Enterprise Security** - Signature verification, audit trails, role-based access
- **Real-time Operations** - Instant admin actions directly from Slack

## 📁 Project Structure

```
FractionaX-Backend/
├── 📂 config/           # Configuration files
├── 📂 controllers/      # Route controllers
├── 📂 docs/            
│   ├── 📂 readme-files/    # All README documentation
│   └── 📄 *.md            # Technical documentation
├── 📂 middleware/       # Express middleware
├── 📂 models/          # MongoDB schemas
├── 📂 routes/          # API routes
├── 📂 scripts/
│   ├── 📂 admin-utils/     # Admin utility scripts
│   └── 📂 test-scripts/    # Testing utilities
├── 📂 services/        # Business logic services
├── 📂 tests/           # Comprehensive test suites
├── 📂 utils/           # Helper utilities
└── 📄 slack-manifest.json # Slack app configuration
```

## 🛠️ Quick Start

### **Prerequisites**
- Node.js 16+
- MongoDB
- Redis
- Slack workspace (for admin features)

### **Installation**
```bash
# Clone repository
git clone https://github.com/Lorenzo-Code/FractionaX-Backend.git

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

### **Environment Variables**
```env
# Core
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/fractionax
JWT_SECRET=your-jwt-secret

# Redis
REDIS_URL=redis://localhost:6379

# Slack Admin Bot
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_SUPPORT_CHANNEL_ID=your-channel-id

# External APIs
CORELOGIC_API_KEY=your-api-key
HELPSCOUT_WEBHOOK_SECRET=your-webhook-secret
```

## 🎯 Slack Super Admin Bot

Transform your Slack workspace into a powerful admin control center:

### **Command Categories**
- **👤 `/user`** - User management (15+ commands)
- **⚙️ `/system`** - System operations (12+ commands)  
- **💰 `/wallet`** - Financial management (10+ commands)
- **🔐 `/security`** - Security operations (12+ commands)
- **🎫 `/support`** - Support management (8+ commands)
- **🛡️ `/compliance`** - KYC & compliance (10+ commands)
- **🚨 `/alerts`** - Monitoring & alerts (8+ commands)
- **📊 `/analytics`** - Reports & analytics (15+ commands)

### **Quick Commands**
```bash
/admin                              # Overview of all commands
/user info john@example.com         # Get user details
/system status                      # System health check
/wallet pending                     # Pending withdrawals
/security alerts                    # Security dashboard
```

**📖 Full Documentation:** [Slack Super Admin Bot Guide](SLACK_SUPER_ADMIN_BOT.md)

## 🔧 Admin Utilities

Located in `scripts/admin-utils/`:

```bash
# Unlock user account
node scripts/admin-utils/unlock-account.js user@example.com

# Reset user password
node scripts/admin-utils/reset-password.js user@example.com "NewPassword123!"
```

## 🧪 Testing

### **Test Suites**
- **API Tests** - Comprehensive endpoint testing
- **CoreLogic Integration** - Property data API tests
- **AI Search** - Deal finder and suggestion tests
- **Redis Caching** - Performance testing

### **Run Tests**
```bash
# All tests
npm test

# Specific test suites
npm run test:api
npm run test:corelogic
npm run test:ai
```

## 📚 Documentation

All documentation is organized in `docs/readme-files/`:

- **[Main README](docs/readme-files/MAIN-README.md)** - Original project documentation
- **[Tests README](docs/readme-files/TESTS-README.md)** - Testing guidelines
- **[Support Tickets README](docs/readme-files/SUPPORT-TICKETS-README.md)** - Support system docs
- **[Docs README](docs/readme-files/DOCS-README.md)** - Documentation index

## 🚀 Deployment

### **Production Setup**
```bash
# Build for production
npm run build

# Start production server
npm start
```

### **Docker Support**
```bash
# Build image
docker build -t fractionax-backend .

# Run container
docker run -p 5000:5000 fractionax-backend
```

## 🔐 Security

- **JWT Authentication** - Secure user sessions
- **Role-Based Access Control** - Admin, user, moderator roles
- **Rate Limiting** - API protection against abuse
- **Input Validation** - Comprehensive data sanitization
- **Slack Signature Verification** - Secure webhook handling

## 📊 Monitoring

- **Health Checks** - `/api/health` endpoint
- **Error Logging** - Comprehensive error tracking
- **Performance Metrics** - Redis caching analytics
- **Admin Alerts** - Real-time Slack notifications

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Slack Admin Bot** - Use `/admin` for comprehensive help
- **Documentation** - Check `docs/` for detailed guides
- **Issues** - Create GitHub issues for bug reports

---

**🏠 Built for the future of real estate investment** | **🛡️ Powered by Slack Super Admin Bot**
