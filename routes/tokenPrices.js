const express = require('express');
const router = express.Router();

// Mock token prices — you can update this later to fetch live data
router.get('/', (req, res) => {
  res.json({
    fct: {
      price: 0.2739,
      bid: 0.2715,
      ask: 0.2742,
    },
    fst: {
      price: 1.0000,
      bid: 0.9998,
      ask: 1.0004,
    },
  });
});

module.exports = router;
