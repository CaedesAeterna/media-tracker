const express = require('express');
const router = express.Router();
const userModel = require('../models/user');
const libraryModel = require('../models/library');

// JSON API for Aggregator Service
router.get('/data', async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ error: "Missing username" });

  try {
    const user = await userModel.findUserByUsername(username);
    if (!user) return res.status(404).json({ error: "User not found" });

    const rawStats = await libraryModel.getStats(user.id);
    
    // Quick Calc
    let total = 0;
    rawStats.forEach(r => total += parseInt(r.total_items));

    res.json({
        username: user.username,
        join_date: user.created_at,
        total_items: total,
        breakdown: rawStats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
