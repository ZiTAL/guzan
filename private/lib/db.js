'use strict';

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(path.join(__dirname, '..', 'guzanda.db'), (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the guzanda database.');
});

// Create table if not exists
db.run(`CREATE TABLE IF NOT EXISTS guzanda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  description TEXT,
  audio_file TEXT,
  audio TEXT,
  review_token TEXT,
  approved INTEGER DEFAULT -1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Migrate existing databases: add missing columns if needed
const migratableColumns = ['audio', 'review_token', 'approved'];
db.all(`PRAGMA table_info(guzanda)`, (err, rows) => {
  if (err) {
    console.error(err.message);
    return;
  }
  const existing = rows.map((col) => col.name);
  for (const col of migratableColumns) {
    if (!existing.includes(col)) {
      const def = col === 'approved' ? 'INTEGER DEFAULT -1' : 'TEXT';
      db.run(`ALTER TABLE guzanda ADD COLUMN ${col} ${def}`, (alterErr) => {
        if (alterErr) {
          console.error(`Could not add "${col}" column: ${alterErr.message}`);
        } else {
          console.log(`Added "${col}" column to guzanda table.`);
        }
      });
    }
  }
});

function getSubmissionByToken(token, cb) {
  db.get(`SELECT * FROM guzanda WHERE review_token = ?`, [token], cb);
}

function insertSubmission(data, cb) {
  const sql = `INSERT INTO guzanda (name, contact, description, audio_file, audio, review_token) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(sql, [data.name, data.contact, data.description, data.audioFile, data.audio, data.reviewToken], function(err) {
    if (err) return cb(err);
    cb(null, this.lastID);
  });
}

function setApproved(id, value, cb) {
  db.run(`UPDATE guzanda SET approved = ? WHERE id = ?`, [value, id], cb);
}

module.exports = { getSubmissionByToken, insertSubmission, setApproved };
