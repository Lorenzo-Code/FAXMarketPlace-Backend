const express = require('express');
const router = express.Router();
const attom = require('../attom'); // Adjust path if needed

// POST /api/attom-data
// Request body: { address, zip_code, data_required: ["flood", "crime", "avm", etc.] }
router.post('/', async (req, res) => {
  const { address, zip_code, data_required = [] } = req.body;

  if (!address || !zip_code || !Array.isArray(data_required)) {
    return res.status(400).json({
      error: "Request must include address, zip_code, and data_required[]"
    });
  }

  const results = {};
  const errors = [];

  for (const type of data_required) {
    try {
      switch (type) {
        case "property_detail":
          results.property_detail = await attom.getPropertyDetail(address, zip_code);
          break;
        case "basic_profile":
          results.basic_profile = await attom.getBasicProfile(address, zip_code);
          break;
        case "assessment":
          results.assessment = await attom.getAssessmentDetail(address, zip_code);
          break;
        case "sale_history":
          results.sale_history = await attom.getSaleHistory(address, zip_code);
          break;
        case "avm":
          results.avm = await attom.getAvmDetail(address, zip_code);
          break;
        case "flood":
          results.flood = await attom.getFloodData(address, zip_code);
          break;
        case "crime":
          results.crime = await attom.getCrimeData(zip_code);
          break;
        default:
          errors.push(`Unknown data type: ${type}`);
      }
    } catch (err) {
      errors.push(`Failed to fetch ${type}: ${err.message}`);
    }
  }

  res.status(200).json({
    address,
    zip_code,
    requested: data_required,
    results,
    ...(errors.length ? { errors } : {})
  });
});

module.exports = router;
