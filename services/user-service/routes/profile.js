const express = require('express');
const router = express.Router();
const libraryModel = require('../models/library');
const userModel = require('../models/user');
const redisClient = require('../config/redis');
const producer = require('../config/kafka');

router.get('/', async (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.redirect('/auth/login');

  try {
    const user = await userModel.findUserByUsername(username);
    const rawStats = await libraryModel.getStats(user.id);
    const library = await libraryModel.getUserLibrary(user.id); // For recent activity
    
    let total = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    const byType = {};
    const byStatus = {};

    rawStats.forEach(row => {
        const count = parseInt(row.total_items);
        total += count;
        
        // Avg Rating logic (row.avg_rating is per group)
        if (row.avg_rating) {
            ratingSum += parseFloat(row.avg_rating) * count;
            ratingCount += count;
        }

        // By Type
        if (row.media_type) {
            byType[row.media_type] = (byType[row.media_type] || 0) + count;
        }

        // By Status
        if (row.status) {
            byStatus[row.status] = (byStatus[row.status] || 0) + count;
        }
    });

    const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : 0;

    res.render('profile', { 
        title: 'My Profile', 
        username, 
        user,
        stats: { total, avgRating, byType, byStatus },
        recent: library.slice(0, 5) 
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

router.get('/edit', async (req, res) => {
    const username = req.cookies.username;
    if (!username) return res.redirect('/auth/login');
    
    try {
        const user = await userModel.findUserByUsername(username);
        res.render('profile_edit', { title: 'Edit Profile', username, user });
    } catch (err) {
        console.error(err);
        res.redirect('/profile');
    }
});

router.post('/edit', async (req, res) => {
    const currentUsername = req.cookies.username;
    const sessionId = req.cookies.session_id;
    const { new_username, email, bio } = req.body;
    
    // Fallback if new_username is not provided
    const targetUsername = new_username || currentUsername;

    try {
        // 1. Check uniqueness if changing
        if (targetUsername !== currentUsername) {
            const existing = await userModel.findUserByUsername(targetUsername);
            if (existing) {
                // Fetch user data again to render the form correctly
                const user = await userModel.findUserByUsername(currentUsername);
                return res.render('profile_edit', { 
                    title: 'Edit Profile', 
                    username: currentUsername, 
                    user: { ...user, email, bio }, // Preserve input
                    error: 'Username already taken' 
                });
            }
        }

        // 2. Update DB
        // updateUser(currentUsername, newUsername, email, bio)
        await userModel.updateUser(currentUsername, targetUsername, email, bio);

        // 3. Update Redis Session
        if (sessionId) {
            const sessionKey = `session:${sessionId}`;
            const sessionDataString = await redisClient.get(sessionKey);
            if (sessionDataString) {
                const sessionData = JSON.parse(sessionDataString);
                sessionData.username = targetUsername;
                // Extend session
                await redisClient.set(sessionKey, JSON.stringify(sessionData), { EX: 86400 });
            }
        }

        // 4. Send Kafka Event (User Updated)
        if (targetUsername !== currentUsername) {
            try {
                // We reuse 'user-registered' topic for now as a general user-events channel
                await producer.send({
                    topic: 'user-registered',
                    messages: [
                        { 
                            value: JSON.stringify({ 
                                event: 'user_updated',
                                old_username: currentUsername,
                                new_username: targetUsername
                            }) 
                        },
                    ],
                });
                console.log(`[Profile] Emitted user_updated event: ${currentUsername} -> ${targetUsername}`);
            } catch (kErr) {
                console.error("[Profile] Kafka send error:", kErr);
            }
        }

        // 5. Update Cookie (Legacy/Shared)
        res.cookie('username', targetUsername, { path: '/', httpOnly: true });

        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating profile");
    }
});

module.exports = router;
