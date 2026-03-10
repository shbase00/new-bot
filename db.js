const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'collabs.db');

// Make sure the folder exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);

// ====== Create tables if they don't exist ======
db.prepare(`
  CREATE TABLE IF NOT EXISTS collabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    supply TEXT,
    date TEXT,
    price TEXT,
    spots TEXT,
    requirements TEXT,
    note TEXT,
    image TEXT,
    deadline INTEGER,
    channel_id TEXT,
    status TEXT DEFAULT 'active'
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collab_id INTEGER,
    user_id TEXT,
    username TEXT,
    tier TEXT,
    community TEXT,
    contest_link TEXT,
    contest_time INTEGER,
    sheet_link TEXT,
    sheet_time INTEGER
  )
`).run();

// ====== IMPORTANT: Export the db so other files can use it ======
module.exports = db;
