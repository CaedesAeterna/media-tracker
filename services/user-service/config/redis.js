const { createClient } = require('redis');

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

// Construct the Redis URL. 
// Note: In some setups 'redis://host:port' is preferred.
const redisUrl = `redis://${redisHost}:${redisPort}`;

console.log(`[Redis Config] Initializing client for ${redisUrl}`);

const client = createClient({
  url: redisUrl
});

client.on('error', (err) => console.error('[Redis Client Error]', err));
client.on('connect', () => console.log('[Redis Client] Connected to Redis'));

// We must connect explicitly with v4+
(async () => {
  try {
    await client.connect();
  } catch (err) {
    console.error('[Redis Client] Failed to connect initially', err);
  }
})();

/**
 * Redis Client Wrapper
 * Exports the connected client for use in sessions and caching.
 */
module.exports = client;
