const axios = require('axios');

const BASE_URL = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0';

const headers = {
  apikey: process.env.ATTOM_API_KEY,
  Host: 'api.gateway.attomdata.com',
  'User-Agent': 'FractionaX-Agent/1.0',
  Accept: 'application/json',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive'
};

async function request(endpoint, params) {
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers,
      params
    });
    return response.data;
  } catch (error) {
    console.error("❌ Attom API error:", error.response?.data || error.message);
    return res.status(400).json({
      error: "Failed to fetch property details from Attom",
      details: error.response?.data || error.message
    });
  }

}

module.exports = {
  getPropertyDetail: (address, postalcode) =>
    request('/property/detail', { address, postalcode }),

  getBasicProfile: (address, postalcode) =>
    request('/property/basicprofile', { address, postalcode }),

  getAssessmentDetail: (address, postalcode) =>
    request('/assessment/assessmentdetail', { address, postalcode }),

  getSaleHistory: (address, postalcode) =>
    request('/sales/salehistory', { address, postalcode }),

  getAvmDetail: (address, postalcode) =>
    request('/avm/detail', { address, postalcode }),

  getFloodData: (address, postalcode) =>
    request('/flood/detail', { address, postalcode }),

  getCrimeData: (postalcode) =>
    request('/community/crime', { postalcode })
};
