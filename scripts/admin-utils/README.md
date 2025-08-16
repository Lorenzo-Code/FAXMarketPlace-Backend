# Admin Utilities

Command-line utilities for FractionaX Backend administration.

## Available Scripts

### Password Management

#### `reset-password.js`
Reset a user's password.

```bash
node scripts/admin-utils/reset-password.js user@example.com "NewPassword123!"
```

### Account Management

#### `unlock-account.js`
Unlock a locked user account.

```bash
node scripts/admin-utils/unlock-account.js user@example.com
```

#### `unlock_account.js` 
Alternative unlock script (legacy).

```bash
node scripts/admin-utils/unlock_account.js user@example.com
```

## Usage Notes

- All scripts require proper environment configuration
- MongoDB connection must be available
- Scripts will output success/failure status
- Use these scripts for emergency admin operations

## Security

- These scripts bypass normal authentication
- Use only for legitimate administrative purposes
- Log all usage for audit purposes
- Ensure secure access to server environment

## Related

- For regular admin operations, use the Slack Admin Bot
- See [SLACK_SUPER_ADMIN_BOT.md](../../SLACK_SUPER_ADMIN_BOT.md) for comprehensive admin commands

# Admin Utilities 🔧

Command-line utilities for emergency admin operations and account management.

## 🚀 Available Utilities

### **1. Account Unlock Utility**

Unlock locked user accounts and reset failed login attempts.

**Files:**
- `unlock-account.js` - Generic account unlock utility
- `unlock_account.js` - Quick unlock for specific email (lorenzo@fxst.io)

**Usage:**
```bash
# Generic unlock (shows all users if email not found)
node scripts/admin-utils/unlock-account.js user@example.com

# Quick unlock for lorenzo@fxst.io
node scripts/admin-utils/unlock_account.js
```

**What it does:**
- ✅ Unlocks locked accounts
- ✅ Resets failed login attempts to 0
- ✅ Shows detailed user status
- ✅ Lists all users if email not found
- ✅ Handles account suspension warnings

### **2. Password Reset Utility**

Reset user passwords with strong validation.

**File:** `reset-password.js`

**Usage:**
```bash
node scripts/admin-utils/reset-password.js user@example.com "NewPassword123!"
```

**Password Requirements:**
- Minimum 8 characters
- Must contain uppercase letter
- Must contain lowercase letter  
- Must contain number
- Must contain special character (!@#$%^&*(),.?":{}|<>)

**What it does:**
- ✅ Validates password strength
- ✅ Hashes password securely (bcrypt with 12 salt rounds)
- ✅ Resets account lockout status
- ✅ Verifies password works after update
- ✅ Shows user details and status

## ⚠️ Important Notes

### **Security Considerations**
- **These utilities directly access the database**
- **Use only in emergency situations**
- **Ensure MongoDB connection is secure**
- **Passwords are logged to console during testing**

### **Environment Requirements**
- **MongoDB connection** - Requires valid MONGO_URI in .env
- **Node.js dependencies** - Run `npm install` first
- **Environment variables** - Ensure .env file is properly configured

### **Usage Guidelines**

1. **Emergency Account Recovery**
   ```bash
   # User locked out and can't login
   node scripts/admin-utils/unlock-account.js user@example.com
   ```

2. **Password Reset Requests**
   ```bash
   # User forgot password or needs secure reset
   node scripts/admin-utils/reset-password.js user@example.com "TempPassword123!"
   ```

3. **Account Status Check**
   ```bash
   # Just want to see user details without making changes
   node scripts/admin-utils/unlock-account.js user@example.com
   ```

## 🔐 Security Best Practices

### **Before Running Utilities:**
1. ✅ Verify user identity through alternative means
2. ✅ Check if user requested the action
3. ✅ Document the reason for manual intervention
4. ✅ Ensure you have proper admin authorization

### **After Running Utilities:**
1. ✅ Notify user of the account changes
2. ✅ Recommend they change temporary passwords
3. ✅ Monitor account for suspicious activity
4. ✅ Log the administrative action

### **Alternative Methods:**

Before using command-line utilities, consider these alternatives:

1. **Slack Admin Bot** (Recommended)
   ```bash
   /user unlock user@example.com
   /security reset-password user@example.com
   ```

2. **Admin Panel** - Use web interface when available
3. **API Endpoints** - Use authenticated admin API calls

## 📊 Utility Output Examples

### **Unlock Account Success:**
```
📦 Connected to MongoDB

👤 User Details:
Email: user@example.com
Name: John Smith
Role: user
Suspended: ✅ NO
Email Verified: ✅ YES
2FA Enabled: 🔐 YES
Failed Login Attempts: 5
Account Locked Until: 2024-08-11T22:15:30.000Z
Last Login: 2024-08-10T14:30:00.000Z
Created: 2024-01-15T10:00:00.000Z

🔒 ACCOUNT IS CURRENTLY LOCKED
Time remaining: 15 minutes

🔓 Unlocking account...
✅ Account unlocked successfully!

🎉 Account status updated. You should now be able to log in.
```

### **Password Reset Success:**
```
📦 Connected to MongoDB

👤 Found user: John Smith (user@example.com)
Role: user
Current Status: ✅ ACTIVE

🔐 Hashing new password...
✅ Password updated successfully!
✅ Account lockout status cleared!

🔍 Verifying new password...
✅ Password verification successful!

🎉 Password reset complete!
📧 You can now log in with:
   Email: user@example.com
   Password: [YOUR NEW PASSWORD]
```

## 🚨 Emergency Procedures

### **Mass Account Lockout:**
If multiple accounts are locked due to system issues:

```bash
# Create a script to unlock multiple accounts
for email in "user1@example.com" "user2@example.com" "user3@example.com"
do
    echo "Unlocking $email..."
    node scripts/admin-utils/unlock-account.js "$email"
    sleep 2
done
```

### **Database Connection Issues:**
1. Check MONGO_URI in .env file
2. Verify MongoDB service is running
3. Test connection with: `node -e "require('mongoose').connect(process.env.MONGO_URI).then(() => console.log('Connected')).catch(console.error)"`

### **Utility Errors:**
- **User not found**: Script lists all available users
- **Invalid password**: Shows specific validation errors
- **Database errors**: Check MongoDB logs and connection

---

**⚠️ Use these utilities responsibly and only for legitimate admin operations!**
