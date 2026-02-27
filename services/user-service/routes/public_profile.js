const express = require('express');
const router = express.Router();
const userModel = require('../models/user');
const libraryModel = require('../models/library');
const friendshipModel = require('../models/friendship');

router.get('/:username', async (req, res) => {
    try {
        const targetUsername = req.params.username;
        const visitorId = req.user.id; // From requireAuth middleware

        const targetUser = await userModel.findUserByUsername(targetUsername);
        
        if (!targetUser) {
            return res.status(404).send("User not found");
        }

        const friendshipStatus = await friendshipModel.checkFriendshipStatus(visitorId, targetUser.id);
        
        // Logic:
        // 1. If Self: Show Full Profile (Redirect to /profile or show public view?) -> Show Public View (Read Only version)
        // 2. If Friend: Show Library
        // 3. If None/Pending: Show only Bio and "Add Friend" button.

        const canViewLibrary = (friendshipStatus === 'accepted' || friendshipStatus === 'self');

        let library = [];
        let stats = null;

        if (canViewLibrary) {
            library = await libraryModel.getUserLibrary(targetUser.id);
            const rawStats = await libraryModel.getStats(targetUser.id);
            
            // Process Stats (Copied from profile.js - maybe refactor later)
            let total = 0;
            let ratingSum = 0;
            let ratingCount = 0;
            const byType = {};
            const byStatus = {};

            rawStats.forEach(row => {
                const count = parseInt(row.total_items);
                total += count;
                if (row.avg_rating) {
                    ratingSum += parseFloat(row.avg_rating) * count;
                    ratingCount += count;
                }
                if (row.media_type) byType[row.media_type] = (byType[row.media_type] || 0) + count;
                if (row.status) byStatus[row.status] = (byStatus[row.status] || 0) + count;
            });
            const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : 0;
            stats = { total, avgRating, byType, byStatus };
        }

        res.render('public_profile', {
            title: `${targetUser.username}'s Profile`,
            user: req.user, // The logged in user (visitor)
            targetUser: targetUser, // The profile owner
            friendshipStatus,
            canViewLibrary,
            library,
            stats
        });

    } catch (err) {
        console.error("Public Profile Error:", err);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
