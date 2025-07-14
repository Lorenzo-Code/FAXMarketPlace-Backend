const redis = require("redis");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const client = redis.createClient({ url: redisUrl });

client.on("connect", () => {
  console.log("✅ Connected to Redis");
});

client.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

// Ensure connection
const ensureRedisConnected = async () => {
  if (!client.isOpen) await client.connect();
};

// Wrapped helpers
const getAsync = async (key) => {
  await ensureRedisConnected();
  return await client.get(key);
};

const setAsync = async (key, value, ttl = 86400) => {
  const shorterTTL = key.includes("new-build") ? 3600 : ttl;
  await ensureRedisConnected();
  await client.set(key, value, { EX: shorterTTL });
};

const incrementCounter = async (key) => {
  await ensureRedisConnected();
  await client.incr(key);
};

module.exports = {
  client,
  getAsync,
  setAsync,
  incrementCounter,
  ensureRedisConnected
};
