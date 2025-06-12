const axios = require('axios');

async function fetchAttomData(address, zip) {
  const baseUrl = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail';
  const params = {
    address,
    postalcode: zip
  };

  try {
    const response = await axios.get(baseUrl, {
      headers: {
        apikey: process.env.ATTOM_API_KEY
      },
      params
    });

    return response.data;
  } catch (error) {
    console.error("Error fetching Attom data:", error.response?.data || error.message);
    return { error: "Failed to fetch property details from Attom." };
  }
}

module.exports = { fetchAttomData };
