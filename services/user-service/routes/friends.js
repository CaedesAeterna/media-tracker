const express = require('express');
const router = express.Router();
const userModel = require('../models/user');
const friendshipModel = require('../models/friendship');

// Send Friend Request
router.post('/request', async (req, res) => {
    try {
        const { target_username } = req.body;
        const requesterId = req.user.id;

        if (!target_username) {
            return res.redirect('/friends?error=Username+is+required');
        }

        const targetUser = await userModel.findUserByUsername(target_username);
        if (!targetUser) {
            return res.redirect('/friends?error=User+not+found');
        }

        if (targetUser.id === requesterId) {
            return res.redirect('/friends?error=You+cannot+add+yourself');
        }

        await friendshipModel.sendRequest(requesterId, targetUser.id);
        
        // TODO: Emit Kafka event 'friend_request_sent' here

        res.redirect('/friends?success=Request+sent');
    } catch (err) {
        console.error("Friend Request Error:", err);
        // Handle "Duplicate request" error gracefully
        if (err.message.includes('already')) {
             return res.redirect('/friends?error=' + encodeURIComponent(err.message));
        }
        res.status(500).send("Error sending friend request: " + err.message);
    }
});

// Accept Request
router.post('/accept/:id', async (req, res) => {
    try {
        const requestId = req.params.id;
        const userId = req.user.id;

        await friendshipModel.acceptRequest(requestId, userId);
        
        // TODO: Emit Kafka event 'friend_request_accepted' here

        res.redirect('/friends');
    } catch (err) {
        console.error("Accept Request Error:", err);
        res.status(500).send("Error accepting request");
    }
});

// Reject/Cancel Request
router.post('/reject/:id', async (req, res) => {
    try {
        const requestId = req.params.id;
        const userId = req.user.id;

        await friendshipModel.rejectRequest(requestId, userId);
        res.redirect('/friends');
    } catch (err) {
        console.error("Reject Request Error:", err);
        res.status(500).send("Error rejecting request");
    }
});

// List Friends & Requests (Render the page)
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const friends = await friendshipModel.getFriends(userId);
        const pendingRequests = await friendshipModel.getPendingRequests(userId);

        res.render('friends', { 
            user: req.user,
            friends, 
            pendingRequests,
            title: 'My Friends',
            error: req.query.error,
            success: req.query.success
        });
    } catch (err) {
        console.error("List Friends Error:", err);
        res.status(500).send("Error retrieving friends");
    }
});

module.exports = router;
