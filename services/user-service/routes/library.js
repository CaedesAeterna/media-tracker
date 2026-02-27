const express = require('express');
const router = express.Router();
const libraryModel = require('../models/library');
const userModel = require('../models/user');

// Middleware to check if user is "logged in" (Simulated via cookie or query param for this MVP)
// For simplicity in this CLI context, we will ask for username in query or body, 
// or assume a 'session' if we had a browser with cookies. 
// REAL WORLD: Use JWT or Session Cookies.
// MVP HACK: We'll accept ?username=... query param to identify the user for GET routes.

router.get('/', async (req, res) => {
  const username = req.cookies.username || req.query.username;
  console.log(`[Library] Fetching library for user: ${username}`);
  
  if (!username) return res.redirect('/auth/login');

  try {
    const user = await userModel.findUserByUsername(username);
    if (!user) {
        console.log(`[Library] User not found: ${username}`);
        return res.redirect('/auth/login');
    }

    const library = await libraryModel.getUserLibrary(user.id);
    console.log(`[Library] Found ${library.length} items for ${username}`);
    res.render('library', { title: 'My Library', library, username });
  } catch (err) {
    console.error("[Library] Error:", err);
    res.status(500).send("Server Error");
  }
});

router.get('/history', async (req, res) => {
  const username = req.cookies.username;
  const { title } = req.query; // Optional filter by title

  if (!username) return res.redirect('/auth/login');

  try {
    const user = await userModel.findUserByUsername(username);
    if (!user) return res.redirect('/auth/login');

    let history;
    if (title) {
        history = await libraryModel.getHistoryByTitle(user.id, title);
    } else {
        history = await libraryModel.getHistory(user.id);
    }
    
    res.render('history', { title: 'History', history, username, filterTitle: title });
  } catch (err) {
    console.error("[History] Error:", err);
    res.status(500).send("Server Error");
  }
});

router.post('/add', async (req, res) => {
  const username = req.cookies.username || req.body.username;
  const { mediaId, mediaTitle, title, mediaType, status } = req.body;
  const finalTitle = mediaTitle || title;
  
  console.log(`[Library] Adding item: ${finalTitle} (${mediaType}) for user: ${username}`);

  try {
    const user = await userModel.findUserByUsername(username);
    if (!user) return res.status(400).send("User not found");

    await libraryModel.addToLibrary(user.id, mediaId, finalTitle, mediaType, status);
    console.log(`[Library] Item added successfully`);
    res.redirect(`/library`);
  } catch (err) {
    if (err.message === 'Item already in library') {
        console.log(`[Library] Item already exists. Skipping.`);
        // Ideally we would show a flash message, but for now just redirect back
        return res.redirect(`/library`);
    }
    console.error("[Library] Error adding item:", err);
    res.status(500).send("Error adding to library");
  }
});

router.post('/update', async (req, res) => {
    // rating might be "" if left empty in the form. Convert to null for DB.
    let { id, username, status, progress, rating, season, episode, action, review, watched_date, is_rewatch } = req.body;
    
    if (rating === "") {
        rating = null;
    }
    
    // Checkbox handling
    const rewatch = (is_rewatch === 'on' || is_rewatch === 'true');

    // Handle Quick Increment Logic
    if (action === 'inc_season') {
        season = parseInt(season || 0) + 1;
    } else if (action === 'inc_episode') {
        episode = parseInt(episode || 0) + 1;
    } else if (action === 'inc_progress') {
        if (!progress) {
            progress = "1";
        } else {
            // Find the last number in the string and increment it
            progress = progress.replace(/(\d+)(?!.*\d)/, (match) => parseInt(match) + 1);
            // If no number found, append 1
            if (progress === req.body.progress) {
                progress += " 1";
            }
        }
    }

    try {
        await libraryModel.updateEntry(id, status, progress, rating, season, episode, review, watched_date, rewatch);
        
        if (req.body.ajax) {
            return res.json({ success: true });
        }
        
        res.redirect(`/library`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating entry");
    }
});

router.post('/delete', async (req, res) => {
    // Fallback to cookie if username is not in body (e.g. from the 'X' button form)
    const username = req.body.username || req.cookies.username;
    const { id } = req.body;
    
    try {
        const user = await userModel.findUserByUsername(username);
        if (!user) return res.status(401).send("Unauthorized");

        await libraryModel.deleteFromLibrary(id, user.id);
        console.log(`[Library] Item ${id} deleted by user ${username}`);
        res.redirect('/library');
    } catch (err) {
        console.error("[Library] Error deleting item:", err);
        res.status(500).send("Error deleting item");
    }
});

module.exports = router;
