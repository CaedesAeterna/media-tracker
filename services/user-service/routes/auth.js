const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const userModel = require('../models/user');
const producer = require('../config/kafka');
const redisClient = require('../config/redis');

router.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await userModel.findUserByUsername(username);
    if (!user) {
      return res.status(401).send('Invalid credentials');
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).send('Invalid credentials');
    }

    // --- Redis Session Management Start ---
    // Dynamically import uuidv4 to support ES Module syntax in a CommonJS file
    const { v4: uuidv4 } = await import('uuid');
    const sessionId = uuidv4(); // Generate session ID after importing uuidv4
    const sessionKey = `session:${sessionId}`;
    const sessionData = {
      id: user.id,
      username: user.username,
      // Add other needed fields here
    };

    // Store session in Redis with 24h (86400s) expiry
    await redisClient.set(sessionKey, JSON.stringify(sessionData), {
      EX: 86400
    });

    console.log(`[Auth] Login successful for ${username}. Session ${sessionId} created.`);
    
    // Set Session Cookie (Primary Auth Token)
    res.cookie('session_id', sessionId, { path: '/', httpOnly: true });
    
    // Set Username Cookie (Legacy/Display for Media Service)
    res.cookie('username', user.username, { path: '/', httpOnly: true });
    // --- Redis Session Management End ---
    
    res.redirect(`/library`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/logout', async (req, res) => {
  const sessionId = req.cookies.session_id;
  
  if (sessionId) {
    try {
      console.log(`[Auth] Logging out session ${sessionId}`);
      await redisClient.del(`session:${sessionId}`);
    } catch (err) {
      console.error(`[Auth] Error deleting session from Redis:`, err);
    }
  }

  res.clearCookie('session_id', { path: '/' });
  res.clearCookie('username', { path: '/' });
  res.redirect('/auth/login');
});

router.get('/register', (req, res) => {
  res.render('register', { title: 'Register' });
});

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await userModel.findUserByUsername(username);
    if (existingUser) {
      return res.status(400).send('User already exists');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await userModel.createUser(username, hashedPassword);
    
    // Send Kafka Event
    // await producer.send({
    //   topic: 'user-registered',
    //   messages: [
    //     { value: JSON.stringify({ userId: newUser.id, username: newUser.username }) },
    //   ],
    // });
    // console.log(`Event sent: user-registered for ${newUser.username}`);

    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
