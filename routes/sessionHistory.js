const express = require('express');
const router = express.Router();

// GET /api/session/history
router.get('/', (req, res) => {
  const history = req.session.chat_history || [];

  if (!history.length) {
    return res.status(200).json({
      message: "No history found for this session.",
      session_id: req.sessionID,
      chat_history: []
    });
  }

  res.status(200).json({
    session_id: req.sessionID,
    total_messages: history.length,
    chat_history: history
  });
});

// Optional: Clear session history manually
router.post('/reset', (req, res) => {
  req.session.chat_history = [];
  res.status(200).json({ message: "Session chat history cleared." });
});

module.exports = router;
