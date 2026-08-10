const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const app = express();
const port = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Debug middleware to see what's coming in
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - UA: "${req.headers['user-agent']}"`);
  next();
});

// Prevent direct access to .db and .md files - fake as 404
app.use((req, res, next) => {
  if (req.path.endsWith('.db') || req.path.endsWith('.md')) {
    return res.status(404).send('Not Found');
  }
  next();
});

// Ensure uploads directory exists
const fs = require('fs');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// File upload setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Database setup
const db = new sqlite3.Database('./guzanda.db', (err) => {
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Migrate existing databases: add 'audio' column if missing
db.all(`PRAGMA table_info(guzanda)`, (err, rows) => {
  if (err) {
    console.error(err.message);
    return;
  }
  if (!rows.some((col) => col.name === 'audio')) {
    db.run(`ALTER TABLE guzanda ADD COLUMN audio TEXT`, (alterErr) => {
      if (alterErr) {
        console.error(alterErr.message);
      } else {
        console.log('Added "audio" column to guzanda table.');
      }
    });
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.get('/guzanda', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'guzanda.html'));
});

app.post('/guzanda', upload.single('audio'), (req, res) => {
  const { name, contact, description } = req.body;
  const audio = req.file ? fs.realpathSync(path.join(uploadDir, req.file.filename)) : null;

  // Basic validation
  if (!name || !contact) {
    return res.status(400).send('Name and contact are required.');
  }

  // Insert into database
  const sql = `INSERT INTO guzanda (name, contact, description, audio_file, audio) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [name, contact, description || null, req.file ? req.file.filename : null, audio], function(err) {
    if (err) {
      return res.status(500).send(err.message);
    }
    res.send(`
      <h1>Submission Successful!</h1>
      <p>Thank you, ${name}. Your submission has been received.</p>
      <a href="/guzanda">Submit another</a> | <a href="/">Return to home</a>
    `);
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});