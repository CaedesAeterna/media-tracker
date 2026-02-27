const redisClient = require('../config/redis');

/**
 * Session Authentication Middleware
 * 
 * This middleware replaces the simple cookie check.
 * 1. Retrieves 'session_id' from cookies.
 * 2. Checks if that session ID exists in Redis.
 * 3. If exists, retrieves user data, refreshes the TTL, and attaches user to req.
 * 4. If invalid or expired, redirects to /auth/login.
 */
const requireAuth = async (req, res, next) => {
  const sessionId = req.cookies.session_id;

  if (!sessionId) {
    console.log(`[Auth Middleware] No session_id cookie found. Redirecting to login.`);
    return res.redirect('/auth/login');
  }

  try {
    // Redis key format: session:{uuid}
    const sessionKey = `session:${sessionId}`;
    const sessionDataString = await redisClient.get(sessionKey);

    if (!sessionDataString) {
      console.log(`[Auth Middleware] Session ${sessionId} not found or expired in Redis.`);
      // Clear the invalid cookie
      res.clearCookie('session_id', { path: '/' });
      return res.redirect('/auth/login');
    }

    // Parse the session data (stored as JSON)
    const sessionData = JSON.parse(sessionDataString);

    // Refresh Session TTL (e.g., extend by another 24 hours on activity)
    // 86400 seconds = 24 hours
    await redisClient.expire(sessionKey, 86400);

    // Attach user info to request for downstream routes
    req.user = {
      id: sessionData.id,
      username: sessionData.username
    };
    
    // Also make it available to views (locals)
    res.locals.user = req.user;

    next();
  } catch (err) {
    console.error(`[Auth Middleware] Error validating session:`, err);
    res.status(500).send('Internal Server Error during Authentication');
  }
};

module.exports = requireAuth;
