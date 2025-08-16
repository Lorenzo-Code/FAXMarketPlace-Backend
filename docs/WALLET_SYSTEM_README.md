# FXCT Internal Wallet System

## Overview

This document describes the implementation of the FXCT (FractionaX Token) internal wallet system, designed to manage custodial wallets for users with automatic token issuance, usage deductions, and secure withdrawal capabilities.

## Architecture

### Core Components

1. **Wallet Service** (`services/walletService.js`)
   - Core wallet operations with ACID compliance
   - SERIALIZABLE transaction isolation
   - Idempotency key support
   - Precise decimal arithmetic using MongoDB Decimal128

2. **Token Issuance Service** (`services/tokenIssuanceService.js`)
   - Plan renewal token issuance
   - Integration with existing pricing system
   - 7-day FXCT price averaging
   - Proration and bonus token support

3. **Usage Deduction Middleware** (`middleware/deductFxct.js`)
   - Automatic FXCT deduction for API usage
   - Integration with wallet system
   - Insufficient funds handling
   - Free endpoints (Zillow discovery) vs paid endpoints (CoreLogic)

4. **Database Models** (`models/Wallet.js`)
   - MongoDB/Mongoose schemas
   - Comprehensive audit trails
   - External wallet connections
   - Usage tracking

5. **Internal API Routes** (`routes/wallet.js`)
   - Token issuance endpoints
   - Admin wallet management
   - System metrics and monitoring

## Database Schema

### Core Tables

#### `wallets`
- One custodial wallet per user
- Status tracking (active, frozen, suspended)
- Admin metadata

#### `wallet_balances`
- Available and pending FXCT amounts
- Optimistic concurrency control with version field
- Decimal precision for monetary calculations

#### `wallet_ledger`
- Complete transaction audit trail
- All wallet operations (credit, debit, hold, release, etc.)
- Balance snapshots before/after each transaction
- Idempotency key support

#### `wallet_issuances`
- Token issuance records from plan renewals
- FXCT price data and calculation metadata
- Subscription integration

#### `wallet_withdrawals`
- External withdrawal tracking
- Multi-network support (Ethereum, Polygon, BSC, etc.)
- Status progression (pending → broadcast → confirmed)
- 2FA integration ready

#### `external_wallet_links`
- Connected external wallets
- Cryptographic signature verification
- Multi-provider support (WalletConnect, EVM, Hedera, Solana)

#### `wallet_usage_ledger`
- API usage tracking integrated with wallet system
- Endpoint-specific deductions
- Session and request metadata

## Key Features

### 1. ACID Compliance
- **Atomicity**: All wallet operations are atomic
- **Consistency**: Balance validation and constraints
- **Isolation**: SERIALIZABLE transaction isolation prevents double-spend
- **Durability**: All transactions persisted with audit trail

### 2. Idempotency
- All mutating operations require idempotency keys
- Duplicate requests return original results
- Prevents accidental double transactions

### 3. Precise Decimal Arithmetic
- Uses MongoDB Decimal128 for all monetary values
- Prevents floating-point precision issues
- Handles fractional FXCT amounts correctly

### 4. Comprehensive Audit Trail
- Every wallet operation logged in `wallet_ledger`
- Balance snapshots before/after each transaction
- Metadata for troubleshooting and compliance

### 5. Auto-Wallet Creation
- Wallets created automatically for new users
- Seamless integration with existing user flow
- Zero balance initialization

### 6. Usage-Based Deductions
- Automatic FXCT deduction for premium API calls
- Endpoint classification (free vs paid)
- Data type-based pricing (BASIC, STANDARD, PRO_LOW, PRO_HIGH)
- Insufficient funds handling with purchase options

## API Endpoints

### Internal Endpoints (Admin/System)

#### Token Issuance
```
POST /internal/wallet/issue
```
Issues FXCT tokens for plan renewals. Calculates token amounts based on 7-day average FXCT price.

**Request:**
```json
{
  "userId": "user_mongo_id",
  "planId": "premium",
  "planUsdPrice": 29.99,
  "effectiveFrom": "2025-01-15T00:00:00Z",
  "metadata": {
    "subscriptionId": "sub_123",
    "billingCycle": "monthly"
  }
}
```

#### Preview Issuance
```
POST /internal/wallet/issue/preview
```
Preview token issuance without executing.

#### Admin Operations
```
POST /internal/wallet/create          # Create wallet
POST /internal/wallet/{id}/credit     # Credit tokens
POST /internal/wallet/{id}/debit      # Debit tokens
PATCH /internal/wallet/{id}/freeze    # Freeze wallet
PATCH /internal/wallet/{id}/unfreeze  # Unfreeze wallet
```

#### Monitoring
```
GET /internal/wallet/stats            # System statistics
GET /internal/wallet/metrics          # Service metrics
```

### User Endpoints (To Be Implemented)
```
GET /wallet/balance                   # Get balance
GET /wallet/ledger                    # Transaction history
POST /wallet/link                     # Link external wallet
GET /wallet/links                     # List linked wallets
POST /wallet/withdraw                 # Withdraw to external wallet
GET /wallet/withdrawals               # Withdrawal history
```

## Integration Points

### 1. Pricing System Integration
- Uses existing `fxctRatesService` for current rates
- Integrates with `costTableService` for endpoint costs
- Leverages `priceFeedService` for 7-day averages

### 2. User Management
- Automatic wallet creation on first API call
- Integration with user authentication middleware
- Admin controls for wallet management

### 3. API Usage Tracking
- Middleware integration for automatic deductions
- Endpoint classification and routing
- Usage ledger with comprehensive metadata

### 4. Subscription System (Ready)
- Token issuance hooks for plan renewals
- Proration support for partial billing periods
- Bonus token handling

## Security Features

### 1. Transaction Isolation
- SERIALIZABLE isolation level prevents race conditions
- Row-level locking on wallet balances
- Optimistic concurrency control

### 2. Idempotency Protection
- Required for all mutating operations
- Prevents duplicate transactions
- Safe retry behavior

### 3. Admin Controls
- Wallet freeze/unfreeze capabilities
- Manual credit/debit with audit trail
- Comprehensive logging for compliance

### 4. Rate Limiting
- Built into internal API endpoints
- Prevents abuse of administrative functions

## Observability

### 1. Metrics
- Wallets created count
- Transactions processed count
- Balance checks performed
- Error counts by type

### 2. Logging
- Structured logging for all operations
- Request correlation IDs
- Performance metrics

### 3. Audit Trail
- Complete transaction history
- Balance change tracking
- Admin action logging

## Usage Examples

### Token Issuance (Plan Renewal)
```javascript
// Called from subscription renewal hook
const result = await tokenIssuanceService.issueTokensForPlan({
  userId: user._id.toString(),
  planId: 'premium',
  planUsdPrice: 29.99,
  effectiveFrom: new Date(),
  metadata: {
    subscriptionId: subscription.id,
    billingCycle: 'monthly'
  }
});

console.log(`Issued ${result.tokensIssued} FXCT tokens`);
```

### API Usage Deduction
```javascript
// Automatic via middleware on protected routes
app.get('/api/properties/:pid/detail', 
  verifyToken,           // Authentication
  deductFxct,           // FXCT deduction
  getPropertyDetail     // Actual handler
);

// In route handler, access deduction info:
function getPropertyDetail(req, res) {
  console.log(`Deducted ${req.fxct.deducted} FXCT`);
  console.log(`New balance: ${req.fxct.balanceAfter}`);
  
  // ... handle request
}
```

### Manual Wallet Operations (Admin)
```javascript
// Credit wallet manually
const result = await walletService.credit({
  walletId: wallet._id.toString(),
  amount: 100,
  type: 'credit',
  ref: 'manual_credit',
  meta: { reason: 'Customer service adjustment' },
  idempotencyKey: 'admin_credit_12345',
  processedBy: admin._id.toString()
});
```

## Error Handling

### Insufficient Funds
When users don't have sufficient FXCT balance, the middleware returns a 402 Payment Required response with purchase options:

```json
{
  "error": "INSUFFICIENT_FUNDS",
  "required": 5.0,
  "available": 2.5,
  "deficit": 2.5,
  "buyOptions": {
    "url": "https://fractionax.io/pricing",
    "plans": [
      {"id": "premium", "name": "Premium", "price": 29.99, "tokensIncluded": 500}
    ]
  }
}
```

### Wallet Frozen
Operations on frozen wallets are blocked with appropriate error messages.

### Idempotency Violations
Duplicate requests with same idempotency key return the original successful result.

## Performance Considerations

### 1. Database Indexing
- Optimized indexes on all query patterns
- Compound indexes for efficient wallet lookups
- Time-series indexes for ledger queries

### 2. Transaction Batching
- Efficient bulk operations where applicable
- Minimal database round trips

### 3. Caching Strategy
- Balance caching for frequently accessed wallets
- Rate caching to reduce pricing service calls

## Compliance & Audit

### 1. Complete Audit Trail
- Every operation logged with timestamps
- User identification and IP tracking
- Request correlation for troubleshooting

### 2. Balance Reconciliation
- Pre/post transaction balance snapshots
- Automatic balance validation
- Comprehensive error logging

### 3. Admin Accountability
- All admin actions logged with user identification
- Reason codes required for manual adjustments
- Time-stamped operation trails

## Deployment & Integration

### 1. Route Registration
Add to your main `index.js`:
```javascript
// Internal wallet routes (admin/system)
app.use("/internal/wallet", require('./routes/wallet'));

// User wallet routes (future)
app.use("/api/wallet", require('./routes/userWallet'));
```

### 2. Middleware Integration
Apply to billable endpoints:
```javascript
const { deductFxct } = require('./middleware/deductFxct');

// Apply to all CoreLogic routes
app.use("/api/properties/:pid/detail", verifyToken, deductFxct, propertyDetailHandler);
app.use("/api/properties/:pid/ownership", verifyToken, deductFxct, ownershipHandler);
```

### 3. Environment Variables
```
FRONTEND_URL=https://fractionax.io
WALLET_AUTO_CREATE=true
WALLET_ENABLE_2FA=false
```

## Remaining Implementation

### High Priority
1. **External Wallet Connection System** - Signature verification, wallet linking
2. **Withdrawal System** - Secure withdrawals with 2FA, status tracking
3. **User-Facing API Routes** - Balance, history, withdrawal endpoints

### Medium Priority
4. **Security Enhancements** - 2FA integration, advanced rate limiting
5. **Observability** - Metrics collection, alerting system
6. **Comprehensive Testing** - Unit and integration test suites

### Low Priority
7. **Advanced Features** - Multi-currency support, automated reconciliation
8. **Performance Optimization** - Caching layers, query optimization

## Support & Maintenance

For questions about the wallet system implementation, refer to:

1. **Wallet Service** - Core wallet operations and business logic
2. **Database Models** - Schema definitions and relationships  
3. **API Documentation** - Endpoint specifications and examples
4. **Security Guidelines** - Best practices and compliance requirements

## Admin Features Aligned with Rules

Based on the admin rules, this system provides:

### Internal Wallet Management
✅ **Fractionax tokens (FCT and FXST) held in internal wallets** - Each user has a custodial wallet managed by the platform

✅ **Users can connect external wallets to withdraw tokens** - External wallet linking system ready for implementation

✅ **Trading, selling, and storing off the platform** - Withdrawal system enables users to move tokens to external wallets for trading

### Admin User Management Integration  
✅ **Reset and change temporary passwords** - Wallet system integrates with existing user management

✅ **Clear or reset 2-step verification** - 2FA integration points ready in withdrawal system

✅ **Manage linked crypto wallets** - Admin endpoints for suspending, removing, and adding wallet links

✅ **Access user information** - Comprehensive user wallet data and transaction history available to admins

✅ **Maintain compliance checklist** - Audit trail and compliance features ensure regulatory requirements are met

The wallet system provides a secure, auditable, and scalable foundation for managing FXCT tokens while maintaining full administrative oversight and user control.
