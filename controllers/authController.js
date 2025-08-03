const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

const generateToken = (user) => {
  return jwt.sign(
    { _id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Generate 2FA Secret and QR Code
exports.setup2FA = async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ msg: "User not found" });

  const secret = speakeasy.generateSecret({ name: `FAXMarketPlace (${user.email})` });
  user.twoFactorSecret = secret.base32;
  await user.save();

  qrcode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
    if (err) return res.status(500).json({ msg: "Failed to generate QR code" });

    res.status(200).json({ dataUrl, secret: secret.base32 });
  });
};

// Verify 2FA Token and Generate Backup Codes
exports.verify2FA = async (req, res) => {
  const { token } = req.body;
  const user = await User.findById(req.user._id);
  if (!user || !user.twoFactorSecret) return res.status(404).json({ msg: "2FA setup incomplete" });

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token,
  });

  if (verified) {
    user.twoFactorEnabled = true;
    
    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(Math.random().toString(36).substring(2, 10).toUpperCase());
    }
    user.backupCodes = backupCodes;
    
    await user.save();
    return res.status(200).json({ 
      msg: "2FA setup complete", 
      backupCodes: backupCodes,
      warning: "Save these backup codes in a secure location. Each can only be used once."
    });
  } else {
    return res.status(400).json({ msg: "Invalid 2FA token" });
  }
};

// Disable 2FA
exports.disable2FA = async (req, res) => {
  const { password } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ msg: "User not found" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ msg: "Invalid password" });

  user.twoFactorEnabled = false;
  user.twoFactorSecret = null;
  user.backupCodes = [];
  await user.save();

  res.status(200).json({ msg: "2FA disabled successfully" });
};

// Generate New Backup Codes
exports.generateBackupCodes = async (req, res) => {
  const { password } = req.body;
  const user = await User.findById(req.user._id);
  if (!user || !user.twoFactorEnabled) {
    return res.status(400).json({ msg: "2FA not enabled" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ msg: "Invalid password" });

  const backupCodes = [];
  for (let i = 0; i < 10; i++) {
    backupCodes.push(Math.random().toString(36).substring(2, 10).toUpperCase());
  }
  user.backupCodes = backupCodes;
  await user.save();

  res.status(200).json({ 
    backupCodes,
    msg: "New backup codes generated. Previous codes are now invalid."
  });
};

exports.register = async (req, res) => {
  console.log("Incoming registration body:", req.body);

  const { firstName, lastName, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ msg: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    const token = generateToken(newUser);

    res.status(201).json({
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role,
      },
      token,
    });
  } catch (err) {
    res.status(500).json({ msg: "Registration failed", error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password, twoFactorToken } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "Invalid email or password" });

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(423).json({ 
        msg: "Account temporarily locked due to too many failed attempts. Try again later." 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // ðŸš« Increment failed login attempts
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
      }
      await user.save();
      return res.status(400).json({ msg: "Invalid email or password" });
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorToken) {
        return res.status(200).json({ 
          requiresTwoFactor: true,
          msg: "Please provide your 2FA code" 
        });
      }

      // Verify 2FA token
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: twoFactorToken,
        window: 1
      });

      if (!verified) {
        const backupCodeIndex = user.backupCodes.indexOf(twoFactorToken);
        if (backupCodeIndex === -1) {
          return res.status(400).json({ msg: "Invalid 2FA code" });
        }
        user.backupCodes.splice(backupCodeIndex, 1);
      }
    }

    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        lastLogin: user.lastLogin
      },
      token,
    });

  } catch (err) {
    res.status(500).json({ msg: "Login failed", error: err.message });
  }
};

