const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const crypto = require('crypto');
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

// CSRF protection: tokens are issued on GET, stored in an in-memory store,
// delivered via cookie + a hidden field, and validated on POST.
const csrfTokens = new Map();
const CSRF_TTL_MS = 2 * 60 * 60 * 1000;

function issueCsrfToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  for (const [key, expires] of csrfTokens) {
    if (now > expires) csrfTokens.delete(key);
  }
  csrfTokens.set(token, now + CSRF_TTL_MS);
  return token;
}

function isValidCsrfToken(token) {
  if (!token || !csrfTokens.has(token)) return false;
  csrfTokens.delete(token);
  return true;
}

function extractCookie(req, name) {
  const header = req.headers['cookie'] || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === name) return decodeURIComponent(value);
  }
  return null;
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.get('/guzanda', (req, res) => {
  const token = issueCsrfToken();
  let html = fs.readFileSync(path.join(__dirname, '../public', 'guzanda.html'), 'utf8');
  html = html.replace(
    '</form>',
    `<input type="hidden" name="csrf_token" value="${token}">\n        </form>`
  );
  res.setHeader('Set-Cookie', `csrf_token=${token}; Path=/; HttpOnly; SameSite=Lax`);
  res.send(html);
});

app.post('/guzanda', upload.single('audio'), (req, res) => {
  const { name, contact, description } = req.body;
  const audio = req.file ? fs.realpathSync(path.join(uploadDir, req.file.filename)) : null;

  // CSRF validation
  const formToken = req.body && req.body.csrf_token;
  const cookieToken = extractCookie(req, 'csrf_token');
  if (!formToken || formToken !== cookieToken || !isValidCsrfToken(formToken)) {
    return res.status(403).send('Invalid or missing CSRF token. Please refresh the form and try again.');
  }

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
    let html = fs.readFileSync(path.join(__dirname, '../public', 'guzanda-success.html'), 'utf8');
    html = html.split('{{name}}').join(name);
    res.send(html);
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});