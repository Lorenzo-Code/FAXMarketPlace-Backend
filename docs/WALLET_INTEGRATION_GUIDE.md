# FXCT Wallet System Integration Guide

## Quick Integration Steps

### 1. Route Registration

Add these lines to your main `index.js` file:

```javascript
// Add after existing route imports
app.use("/internal/wallet", require('./routes/wallet'));

// Future user-facing routes (when implemented)
// app.use("/api/wallet", require('./routes/userWallet'));
```

### 2. Middleware Integration

Apply the FXCT deduction middleware to billable endpoints:

```javascript
const { deductFxct } = require('./middleware/deductFxct');

// Apply to CoreLogic premium endpoints
app.use("/api/properties/:pid/detail", verifyToken, deductFxct, yourHandler);
app.use("/api/properties/:pid/ownership", verifyToken, deductFxct, yourHandler);
app.use("/api/properties/:pid/comparables", verifyToken, deductFxct, yourHandler);

// Keep Zillow discovery endpoints free (no deductFxct middleware)
app.use("/api/properties/search", verifyToken, yourZillowHandler);
```

### 3. Subscription Integration Hook

When a user subscribes or renews, call the token issuance service:

```javascript
const { tokenIssuanceService } = require('./wallet');

// In your subscription renewal handler
async function handleSubscriptionRenewal(userId, planId, planPrice) {
  try {
    const result = await tokenIssuanceService.issueTokensForPlan({
      userId: userId,
      planId: planId, // 'premium', 'pro', 'enterprise'
      planUsdPrice: planPrice,
      effectiveFrom: new Date(),
      metadata: {
        subscriptionId: subscription.id,
        billingCycle: 'monthly'
      }
    });
    
    console.log(`✅ Issued ${result.tokensIssued} FXCT tokens to user ${userId}`);
    return result;
    
  } catch (error) {
    console.error('❌ Token issuance failed:', error.message);
    throw error;
  }
}
```

### 4. Admin Integration

For admin wallet management, the internal routes are already available:

```javascript
// Example admin operations via API calls
const adminToken = 'your_admin_jwt_token';

// Issue tokens manually
fetch('/internal/wallet/issue', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'user_mongo_id',
    planId: 'premium',
    planUsdPrice: 29.99
  })
});

// Freeze a wallet
fetch('/internal/wallet/wallet_id/freeze', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    reason: 'Fraud investigation'
  })
});
```

## Environment Variables

Add these to your `.env` file:

```bash
# Frontend URL for buy options
FRONTEND_URL=https://fractionax.io

# Wallet configuration
WALLET_AUTO_CREATE=true
WALLET_ENABLE_2FA=false

# Optional: Customize insufficient funds response
WALLET_MIN_BALANCE_ALERT=10
```

## Testing the Integration

### 1. Test Token Issuance

```bash
curl -X POST http://localhost:5000/internal/wallet/issue \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_MONGO_ID",
    "planId": "premium",
    "planUsdPrice": 29.99
  }'
```

### 2. Test Balance Check

```bash
curl -X GET http://localhost:5000/internal/wallet/metrics
```

### 3. Test API Usage Deduction

Make a request to any billable endpoint with authentication. The middleware will:
1. Auto-create a wallet if needed
2. Check FXCT balance
3. Deduct tokens for the API call
4. Return 402 if insufficient funds

## Error Handling

### Insufficient Funds Response

When users don't have enough FXCT, the API returns:

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
  },
  "timestamp": "2025-01-15T14:30:00.000Z"
}
```

Handle this in your frontend:

```javascript
// Frontend handling
if (response.status === 402) {
  const data = await response.json();
  if (data.error === 'INSUFFICIENT_FUNDS') {
    // Redirect to pricing page or show upgrade modal
    window.location.href = data.buyOptions.url;
  }
}
```

## Database Setup

The wallet models will automatically create the required collections when first used. No manual database setup is needed.

### Indexes

The following indexes are automatically created:
- User to wallet mapping
- Balance lookups
- Transaction history queries
- Admin operations

## Monitoring

### Health Check

```bash
curl http://localhost:5000/internal/wallet/metrics
```

### Admin Dashboard

The wallet stats endpoint provides comprehensive metrics:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:5000/internal/wallet/stats
```

## Common Integration Patterns

### 1. Conditional Middleware

Apply FXCT deduction only under certain conditions:

```javascript
const { conditionalDeductFxct } = require('./middleware/deductFxct');

// Only deduct for premium features
app.use("/api/properties/:pid/premium", 
  verifyToken,
  conditionalDeductFxct((req) => req.query.premium === 'true'),
  handler
);
```

### 2. Custom Endpoint Classification

Extend the middleware for new endpoints:

```javascript
// In your route file
const { fxctDeductionMiddleware } = require('./middleware/deductFxct');

// Add custom endpoint mapping
fxctDeductionMiddleware.endpointDataTypeMap['new_endpoint'] = 'PRO_HIGH';
```

### 3. Balance Checks

Check user balance before expensive operations:

```javascript
const { walletService } = require('./wallet');

async function expensiveOperation(req, res) {
  const userId = req.user._id.toString();
  const walletInfo = await walletService.getOrCreateWallet(userId);
  
  if (walletInfo.balance.available < 10) {
    return res.status(402).json({
      error: 'Insufficient funds for this operation',
      required: 10,
      available: walletInfo.balance.available
    });
  }
  
  // Proceed with operation
}
```

## Next Steps

After basic integration:

1. **Test thoroughly** with different user scenarios
2. **Monitor metrics** to ensure proper operation
3. **Implement remaining features** (external wallets, withdrawals)
4. **Add frontend integration** for balance display and purchase flows
5. **Set up monitoring alerts** for wallet system health

## Support

For issues or questions:

1. Check the comprehensive logs in the console
2. Review the wallet ledger for transaction history
3. Use the admin endpoints for troubleshooting
4. Refer to `WALLET_SYSTEM_README.md` for detailed documentation

## Troubleshooting

### Common Issues

**Wallets not created automatically:**
- Ensure middleware is properly registered
- Check that user authentication is working
- Verify MongoDB connection

**Balance not updating:**
- Check for idempotency key conflicts
- Verify transaction completion in ledger
- Ensure SERIALIZABLE transaction isolation

**Middleware not deducting:**
- Verify endpoint patterns in exemptPatterns
- Check data type mapping for endpoints
- Ensure pricing service is working

**Admin operations failing:**
- Verify admin authentication
- Check MongoDB permissions
- Review request validation errors
