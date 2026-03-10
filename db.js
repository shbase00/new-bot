const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// لو شغال على Railway هيبقى فيه VOLUME_PATH
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'collabs.db');

// تأكد إن الفولدر موجود
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
