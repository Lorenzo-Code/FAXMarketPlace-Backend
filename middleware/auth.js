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
    // 📥 Try to check cache first (gracefully handle Redis failures)
    let cachedUser = null;
    try {
      const cacheKey = `user:session:${token.slice(-10)}`; // Use last 10 chars for key
      cachedUser = await getAsync(cacheKey);
      
      if (cachedUser) {
        console.log('📥 Cache hit for user session');
        req.user = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser;
        return next();
      }
    } catch (cacheErr) {
      console.warn('⚠️ Cache lookup failed, proceeding without cache:', cacheErr.message);
    }

    // 🔍 Decode JWT (fallback or no cache)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("🔑 Token decoded:", decoded.email || decoded._id);
    req.user = decoded;
    
    // 💾 Try to cache user session (gracefully handle Redis failures)
    try {
      const cacheKey = `user:session:${token.slice(-10)}`;
      await setAsync(cacheKey, JSON.stringify(decoded), 900);
      console.log(`📝 Cached user session for: ${decoded.email || decoded._id}`);
    } catch (cacheErr) {
      console.warn('⚠️ Cache write failed, continuing without cache:', cacheErr.message);
    }
    
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
