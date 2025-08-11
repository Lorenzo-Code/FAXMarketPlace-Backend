// Simplified admin-help response to fix dispatch_failed
// Replace the complex blocks version with this simple text version

case '/admin-help':
  return res.json({
    response_type: 'ephemeral',
    text: '🛠️ *FractionaX Admin Commands*\n\n' +
          '🔧 *System:* `/system-status` - Check system health\n' +
          '👤 *Users:* `/user-info [email]` - Get user details\n' +
          '🔐 *Security:* `/lock-user [email]` - Lock user account\n' +
          '💰 *Wallets:* `/wallet-activity [email]` - View transactions\n' +
          '🚨 *Alerts:* `/set-alert-threshold [type] [value]` - Set alerts\n' +
          '🛡️ *KYC:* `/kyc-status [email]` - Check KYC status\n' +
          '🎫 *Support:* `/create-ticket [subject]` - Create ticket\n\n' +
          '📚 Use any command without parameters for detailed help.'
  });

// This replaces the complex "blocks" version that might be causing the dispatch error
