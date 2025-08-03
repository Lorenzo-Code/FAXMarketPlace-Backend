const Redis = require("ioredis");

const localHost = process.env.REDIS_HOST || "127.0.0.1";
const localPort = process.env.REDIS_PORT || "6379";
const localUrl = `redis://${localHost}:${localPort}`;
const prodUrl = process.env.REDIS_URL;

let client = null;
let connected = false;

function createRedisClient(url) {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
}

const tryConnect = async (url) => {
  return new Promise((resolve) => {
    const tempClient = createRedisClient(url);

    tempClient.once("ready", () => {
      console.log(`✅ Connected to Redis at ${url}`);
      resolve(tempClient);
    });

    tempClient.once("error", async (err) => {
      console.warn(`⚠️ Redis connection failed at ${url}: ${err.message}`);
      try {
        tempClient.removeAllListeners();
        await tempClient.quit();
      } catch {
        tempClient.disconnect();
      }
      resolve(null);
    });

    tempClient.connect().catch(() => {});
  });
};

const initRedis = async () => {
  if (connected) return;
  client = await tryConnect(localUrl);
  if (client) {
    connected = true;
    return;
  }
  client = await tryConnect(prodUrl);
  if (client) {
    connected = true;
    return;
  }
  console.warn("❌ Redis connection failed — both local and fallback failed.");
  client = null;
};

const ensureConnected = async () => {
  if (!connected || !client) {
    await initRedis();
  }
};

const getAsync = async (key) => {
  await ensureConnected();
  const value = await client?.get(key);
  if (!value) return null;
  
  try {
    return JSON.parse(value);
  } catch (parseError) {
    console.warn(`⚠️ Corrupted cache data for key "${key}", deleting:`, parseError.message);
    // Delete the corrupted cache entry
    await client?.del(key);
    return null;
  }
};

const setAsync = async (key, value, ttl = 86400) => {
  await ensureConnected();
  if (!client || value === undefined) return;
  const shortTTL = key.includes("new-build") ? 3600 : ttl;
  if (process.env.NODE_ENV === "development") {
    console.log(`📝 Setting Redis key "${key}" with TTL = ${shortTTL}s`);
  }
  await client.set(key, JSON.stringify(value), "EX", shortTTL);
};

const incrementCounter = async (key) => {
  await ensureConnected();
  if (!client) return;
  await client.incr(key);
};

const deleteAsync = async (key) => {
  await ensureConnected();
  if (!client) return;
  console.log(`🗑️ Deleting Redis key: "${key}"`);
  await client.del(key);
};

const deletePatternAsync = async (pattern) => {
  await ensureConnected();
  if (!client) return;
  const keys = await client.keys(pattern);
  if (keys.length > 0) {
    console.log(`🗑️ Deleting ${keys.length} Redis keys matching: "${pattern}"`);
    await client.del(...keys);
  }
};

const getUserKey = (req) => {
  return req.user?.id || req.sessionID || "anon";
};

// Optional helpers for caching CoreLogic
const getCachedCoreLogic = async (lat, lng) => {
  const key = `corelogic:${lat.toFixed(5)}:${lng.toFixed(5)}`;
  return await getAsync(key);
};

const setCachedCoreLogic = async (lat, lng, data, ttl = 3600) => {
  const key = `corelogic:${lat.toFixed(5)}:${lng.toFixed(5)}`;
  await setAsync(key, data, ttl);
};

process.on("unhandledRejection", (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes("ECONNREFUSED 127.0.0.1:6379")) return;
  console.error("🛑 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  const msg = err?.message || String(err);
  if (msg.includes("ECONNREFUSED 127.0.0.1:6379")) return;
  console.error("🛑 Uncaught Exception:", err);
});

module.exports = {
  getAsync,
  setAsync,
  incrementCounter,
  deleteAsync,
  deletePatternAsync,
  getUserKey,
  client,
  ensureConnected,
  getCachedCoreLogic,
  setCachedCoreLogic
};