const jwt = require("jsonwebtoken");
const { getAsync, setAsync } = require("../utils/redisClient");

// 🔐 Verify JWT Token with User Session Caching
const verifyToken = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    console.warn("🛑 No token provided, authorization denied");
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    // 📥 Check cache first for massive performance boost
    const cacheKey = `user:session:${token.slice(-10)}`; // Use last 10 chars for key
    const cachedUser = await getAsync(cacheKey);
    
    if (cachedUser) {
      console.log('📥 Cache hit for user session');
      req.user = JSON.parse(cachedUser);
      return next();
    }

    // 🔍 Decode JWT if not cached
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("🔑 Token decoded:", decoded);
    req.user = decoded;
    
    // 💾 Cache user session for 15 minutes (optimal security/performance balance)
    await setAsync(cacheKey, JSON.stringify(decoded), 900);
    console.log(`📝 Cached user session for: ${decoded._id || decoded.id}`);
    
    next();
  } catch (err) {
    console.error("❌ Token verification failed:", err.message);
    res.status(401).json({ msg: "Invalid token" });
  }
};

// 🛡️ Authorize Admin Only
const authorizeAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({ msg: "Access denied — Admins only" });
};

// ✅ Export both middlewares
module.exports = {
  verifyToken,
  authorizeAdmin,
};
