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
  KONTAKTU_BAIMENA INTEGER NOT NULL DEFAULT 0,
  audio_file TEXT,
  audio TEXT,
  review_token TEXT,
  approved INTEGER DEFAULT -1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Migrate existing databases: add missing columns if needed
db.all(`PRAGMA table_info(guzanda)`, (err, rows) => {
  if (err) {
    console.error(err.message);
    return;
  }
  const existing = rows.map((col) => col.name);

  // Preserve values from databases created before the consent column was renamed.
  const migrateConsentColumn = () => {
    db.all('PRAGMA table_info(guzanda)', (pragmaErr, currentRows) => {
      if (pragmaErr) {
        console.error(pragmaErr.message);
        return;
      }

      const consentColumn = currentRows.find((col) => col.name === 'KONTAKTU_BAIMENA');
      if (!consentColumn) {
        db.run('ALTER TABLE guzanda ADD COLUMN KONTAKTU_BAIMENA INTEGER NOT NULL DEFAULT 0', (alterErr) => {
          if (alterErr) console.error(`Could not add KONTAKTU_BAIMENA column: ${alterErr.message}`);
          else console.log('Added "KONTAKTU_BAIMENA" column to guzanda table.');
        });
      } else if (consentColumn.type.toUpperCase() !== 'INTEGER') {
        db.serialize(() => {
          db.run('ALTER TABLE guzanda ADD COLUMN KONTAKTU_BAIMENA_INTEGER INTEGER NOT NULL DEFAULT 0');
          db.run(`UPDATE guzanda
            SET KONTAKTU_BAIMENA_INTEGER = CASE
              WHEN UPPER(CAST(KONTAKTU_BAIMENA AS TEXT)) IN ('1', 'TRUE') THEN 1
              ELSE 0
            END`);
          db.run('ALTER TABLE guzanda DROP COLUMN KONTAKTU_BAIMENA');
          db.run('ALTER TABLE guzanda RENAME COLUMN KONTAKTU_BAIMENA_INTEGER TO KONTAKTU_BAIMENA', (migrationErr) => {
            if (migrationErr) console.error(`Could not convert KONTAKTU_BAIMENA values: ${migrationErr.message}`);
            else console.log('Converted KONTAKTU_BAIMENA values to 0/1.');
          });
        });
      }
    });
  };

  if (existing.includes('contact_consent') && !existing.includes('KONTAKTU_BAIMENA')) {
    db.run('ALTER TABLE guzanda RENAME COLUMN contact_consent TO KONTAKTU_BAIMENA', (renameErr) => {
      if (renameErr) {
        console.error(`Could not rename contact_consent column: ${renameErr.message}`);
      } else {
        console.log('Renamed contact_consent column to KONTAKTU_BAIMENA.');
        migrateConsentColumn();
      }
    });
  } else {
    migrateConsentColumn();
  }

  for (const col of ['audio', 'review_token', 'approved']) {
    if (!existing.includes(col)) {
      const def = col === 'approved'
        ? 'INTEGER DEFAULT -1'
        : 'TEXT';
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
  const sql = `INSERT INTO guzanda (name, contact, description, KONTAKTU_BAIMENA, audio_file, audio, review_token) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [data.name, data.contact, data.description, data.contactConsent ? 1 : 0, data.audioFile, data.audio, data.reviewToken], function(err) {
    if (err) return cb(err);
    cb(null, this.lastID);
  });
}

function setApproved(id, value, cb) {
  db.run(`UPDATE guzanda SET approved = ? WHERE id = ?`, [value, id], cb);
}

// Promise-based wrappers for the async route handlers
function getSubmissionByTokenAsync(token) {
  return new Promise((resolve, reject) => {
    getSubmissionByToken(token, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function insertSubmissionAsync(data) {
  return new Promise((resolve, reject) => {
    insertSubmission(data, (err, lastID) => {
      if (err) return reject(err);
      resolve(lastID);
    });
  });
}

function setApprovedAsync(id, value) {
  return new Promise((resolve, reject) => {
    setApproved(id, value, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = {
  getSubmissionByToken,
  insertSubmission,
  setApproved,
  getSubmissionByTokenAsync,
  insertSubmissionAsync,
  setApprovedAsync
};
