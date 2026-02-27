const pool = require('../config/db');

const createLibraryTable = async () => {
  const queryLibrary = `
    CREATE TABLE IF NOT EXISTS user_library (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      media_id VARCHAR(50) NOT NULL,
      media_title VARCHAR(255),
      media_type VARCHAR(50),
      status VARCHAR(50) DEFAULT 'Plan to Watch',
      progress VARCHAR(50),
      current_season INTEGER DEFAULT 0,
      current_episode INTEGER DEFAULT 0,
      rating INTEGER CHECK (rating >= 0 AND rating <= 10),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  const queryHistory = `
    CREATE TABLE IF NOT EXISTS library_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      media_title VARCHAR(255),
      action_type VARCHAR(50), -- ADDED, UPDATED, RATED
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryLibrary);
    await pool.query(queryHistory);
    
    // Migrations for Social Features
    await pool.query("ALTER TABLE user_library ADD COLUMN IF NOT EXISTS review_text TEXT;");
    await pool.query("ALTER TABLE user_library ADD COLUMN IF NOT EXISTS watched_date DATE;");
    await pool.query("ALTER TABLE user_library ADD COLUMN IF NOT EXISTS is_rewatch BOOLEAN DEFAULT FALSE;");
    
    console.log("User Library and History tables created/updated successfully");
  } catch (err) {
    console.error("Error creating tables", err);
  }
};

const addHistory = async (userId, title, action, details) => {
    try {
        const query = `INSERT INTO library_history (user_id, media_title, action_type, details) VALUES ($1, $2, $3, $4)`;
        await pool.query(query, [userId, title, action, details]);
    } catch (err) {
        console.error("Failed to log history:", err);
    }
};

const addToLibrary = async (userId, mediaId, title, type, status) => {
  // Check if item already exists
  const checkQuery = 'SELECT id FROM user_library WHERE user_id = $1 AND media_id = $2';
  const checkRes = await pool.query(checkQuery, [userId, mediaId]);
  
  if (checkRes.rows.length > 0) {
    throw new Error('Item already in library');
  }

  const query = `
    INSERT INTO user_library (user_id, media_id, media_title, media_type, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const values = [userId, mediaId, title, type, status || 'Plan to Watch'];
  const res = await pool.query(query, values);
  
  await addHistory(userId, title, 'ADDED', `Added to library as ${status || 'Plan to Watch'}`);
  
  return res.rows[0];
};

const getUserLibrary = async (userId) => {
  const query = 'SELECT * FROM user_library WHERE user_id = $1 ORDER BY created_at DESC';
  const res = await pool.query(query, [userId]);
  return res.rows;
};

const getHistory = async (userId) => {
    const query = 'SELECT * FROM library_history WHERE user_id = $1 ORDER BY created_at DESC';
    const res = await pool.query(query, [userId]);
    return res.rows;
};

const getHistoryByTitle = async (userId, title) => {
    const query = 'SELECT * FROM library_history WHERE user_id = $1 AND media_title = $2 ORDER BY created_at DESC';
    const res = await pool.query(query, [userId, title]);
    return res.rows;
};

const getItemById = async (id) => {
    const res = await pool.query('SELECT * FROM user_library WHERE id = $1', [id]);
    return res.rows[0];
};

const updateEntry = async (id, status, progress, rating, season, episode, review, date, rewatch) => {
  // Fetch old state for comparison
  const oldItem = await getItemById(id);
  
  const query = `
    UPDATE user_library 
    SET status = $1, progress = $2, rating = $3, current_season = $4, current_episode = $5,
        review_text = $6, watched_date = $7, is_rewatch = $8
    WHERE id = $9 
    RETURNING *;
  `;
  const res = await pool.query(query, [
      status, progress, rating, season || 0, episode || 0, 
      review || null, date || null, rewatch || false, 
      id
  ]);
  const newItem = res.rows[0];

  if (oldItem && newItem) {
      const changes = [];
      if (oldItem.status !== newItem.status) changes.push(`Status: ${oldItem.status} -> ${newItem.status}`);
      if (oldItem.progress !== newItem.progress) changes.push(`Progress: ${oldItem.progress} -> ${newItem.progress}`);
      if (oldItem.rating !== newItem.rating) changes.push(`Rating: ${oldItem.rating} -> ${newItem.rating}`);
      if (oldItem.current_season !== newItem.current_season) changes.push(`Season: ${oldItem.current_season} -> ${newItem.current_season}`);
      if (oldItem.current_episode !== newItem.current_episode) changes.push(`Episode: ${oldItem.current_episode} -> ${newItem.current_episode}`);
      if (oldItem.review_text !== newItem.review_text) changes.push(`Review Updated`);
      
      if (changes.length > 0) {
          await addHistory(oldItem.user_id, oldItem.media_title, 'UPDATED', changes.join(', '));
      }
  }

  return newItem;
};

const deleteFromLibrary = async (id, userId) => {
    // Check if the item belongs to the user
    const item = await getItemById(id);
    if (!item || item.user_id !== userId) {
        throw new Error("Item not found or unauthorized");
    }

    const query = 'DELETE FROM user_library WHERE id = $1';
    await pool.query(query, [id]);
    
    await addHistory(userId, item.media_title, 'REMOVED', `Removed from library`);
};

const getStats = async (userId) => {
  const query = `
    SELECT 
      COUNT(*) as total_items,
      AVG(rating) as avg_rating,
      media_type,
      status
    FROM user_library 
    WHERE user_id = $1
    GROUP BY media_type, status;
  `;
  const res = await pool.query(query, [userId]);
  return res.rows;
};

module.exports = {
  createLibraryTable,
  addToLibrary,
  getUserLibrary,
  updateEntry,
  deleteFromLibrary,
  getStats,
  getHistory,
  getHistoryByTitle
};
