const pool = require('../config/db');

const createFriendshipTable = async () => {
  const query = `
    DO $$ BEGIN
        CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        requester_id INTEGER NOT NULL REFERENCES users(id),
        addressee_id INTEGER NOT NULL REFERENCES users(id),
        status friendship_status DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(requester_id, addressee_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships(requester_id, addressee_id);
  `;
  try {
    await pool.query(query);
    console.log("Friendships table created successfully");
  } catch (err) {
    console.error("Error creating friendships table", err);
  }
};

const sendRequest = async (requesterId, addresseeId) => {
    // Check if reverse request exists
    const checkQuery = `SELECT * FROM friendships WHERE requester_id = $1 AND addressee_id = $2`;
    const checkRes = await pool.query(checkQuery, [addresseeId, requesterId]);
    
    if (checkRes.rows.length > 0) {
        if (checkRes.rows[0].status === 'pending') {
             // Accept the reverse request automatically? Or throw error?
             // For now, let's just throw error saying request exists
             throw new Error("Friend request already pending from this user.");
        }
        if (checkRes.rows[0].status === 'accepted') {
            throw new Error("You are already friends.");
        }
    }

    const query = `
        INSERT INTO friendships (requester_id, addressee_id)
        VALUES ($1, $2)
        RETURNING *;
    `;
    const res = await pool.query(query, [requesterId, addresseeId]);
    return res.rows[0];
};

const acceptRequest = async (requestId, userId) => {
    // Only the addressee can accept
    const query = `
        UPDATE friendships 
        SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
        RETURNING *;
    `;
    const res = await pool.query(query, [requestId, userId]);
    return res.rows[0];
};

const rejectRequest = async (requestId, userId) => {
     // Addressee can reject, Requester can cancel
     const query = `
        DELETE FROM friendships 
        WHERE id = $1 AND (addressee_id = $2 OR requester_id = $2)
     `;
     await pool.query(query, [requestId, userId]);
};

const getFriends = async (userId) => {
    const query = `
        SELECT 
            f.id as friendship_id,
            CASE 
                WHEN f.requester_id = $1 THEN u2.username 
                ELSE u1.username 
            END as friend_username,
            CASE 
                WHEN f.requester_id = $1 THEN u2.id 
                ELSE u1.id 
            END as friend_id,
            f.created_at
        FROM friendships f
        JOIN users u1 ON f.requester_id = u1.id
        JOIN users u2 ON f.addressee_id = u2.id
        WHERE (f.requester_id = $1 OR f.addressee_id = $1)
        AND f.status = 'accepted';
    `;
    const res = await pool.query(query, [userId]);
    return res.rows;
};

const getPendingRequests = async (userId) => {
    const query = `
        SELECT 
            f.id,
            f.requester_id,
            u.username as requester_username,
            f.created_at
        FROM friendships f
        JOIN users u ON f.requester_id = u.id
        WHERE f.addressee_id = $1 AND f.status = 'pending';
    `;
    const res = await pool.query(query, [userId]);
    return res.rows;
};

// Helper to get friend IDs for social feed
const getFriendIds = async (userId) => {
    const friends = await getFriends(userId);
    return friends.map(f => f.friend_id);
};

const checkFriendshipStatus = async (userA, userB) => {
    if (userA === userB) return 'self';
    const query = `
        SELECT status FROM friendships 
        WHERE (requester_id = $1 AND addressee_id = $2) 
           OR (requester_id = $2 AND addressee_id = $1)
    `;
    const res = await pool.query(query, [userA, userB]);
    if (res.rows.length === 0) return 'none';
    return res.rows[0].status;
};

module.exports = {
    createFriendshipTable,
    sendRequest,
    acceptRequest,
    rejectRequest,
    getFriends,
    getPendingRequests,
    getFriendIds,
    checkFriendshipStatus
};
