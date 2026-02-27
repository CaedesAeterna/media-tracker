const pool = require('../config/db');

const migrate = async () => {
    try {
        console.log("Starting Migration: Adding Season/Episode columns...");
        
        await pool.query(`
            ALTER TABLE user_library 
            ADD COLUMN IF NOT EXISTS current_season INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS current_episode INTEGER DEFAULT 0;
        `);
        
        console.log("Migration successful!");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
};

migrate();
