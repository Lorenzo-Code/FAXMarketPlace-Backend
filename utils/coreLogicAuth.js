const axios = require("axios");

let cachedToken = null;
let expiresAt = null;

async function getCoreLogicAccessToken() {
  const now = Date.now();
  if (cachedToken && expiresAt && now < expiresAt) {
    console.log("⚡ Using cached CoreLogic token");
    return cachedToken;
  }

  console.log("🔄 Fetching new CoreLogic access token...");
  const tokenUrl = process.env.CORELOGIC_TOKEN_URL;
  const auth = {
    username: process.env.CORELOGIC_CLIENT_ID,
    password: process.env.CORELOGIC_CLIENT_SECRET,
  };

  console.log(`🔑 Token URL: ${tokenUrl}`);
  console.log(`🔑 Client ID: ${process.env.CORELOGIC_CLIENT_ID}`);
  console.log(`🔑 Client Secret: ${process.env.CORELOGIC_CLIENT_SECRET ? '[SET]' : '[NOT SET]'}`);

  try {
    const { data } = await axios.post(tokenUrl, "", { auth });
    console.log("✅ CoreLogic token obtained successfully");

    cachedToken = data.access_token;
    expiresAt = now + parseInt(data.expires_in) * 1000 - 30000; // renew 30s early
    
    console.log(`🔑 Token expires at: ${new Date(expiresAt).toISOString()}`);
    return cachedToken;
  } catch (err) {
    console.error("❌ CoreLogic OAuth Error:", {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data
    });
    throw new Error("Failed to get CoreLogic token");
  }
}

module.exports = { getCoreLogicAccessToken };
