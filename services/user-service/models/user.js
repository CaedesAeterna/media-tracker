const pool = require('../config/db');

const createTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      bio TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    // Migration for existing tables (Idempotent)
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;");
    console.log("Users table checked/created successfully");
  } catch (err) {
    console.error("Error creating users table", err);
  }
};

const createUser = async (username, password, email) => {
  const query = 'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING *';
  const values = [username, password, email || null];
  const res = await pool.query(query, values);
  return res.rows[0];
};

const findUserByUsername = async (username) => {
  const query = 'SELECT * FROM users WHERE username = $1';
  const res = await pool.query(query, [username]);
  return res.rows[0];
};

const findUserByUsernameInsensitive = async (username) => {
  const query = 'SELECT * FROM users WHERE LOWER(username) = LOWER($1)';
  const res = await pool.query(query, [username]);
  return res.rows[0];
};

const updateUser = async (currentUsername, newUsername, email, bio) => {
  const query = 'UPDATE users SET username = $2, email = $3, bio = $4 WHERE username = $1 RETURNING *';
  const values = [currentUsername, newUsername, email, bio];
  const res = await pool.query(query, values);
  return res.rows[0];
};

module.exports = {
  createTable,
  createUser,
  findUserByUsername,
  findUserByUsernameInsensitive,
  updateUser
};
