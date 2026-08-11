const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3000;

// Configuration from environment variables (see private/docker/.env.example)
function env(name, fallback) {
  const value = process.env[name];
  if (value == null || value.startsWith('${')) return fallback;
  return value;
}

const config = {
  publicUrl: env('GUZAN_PUBLIC_URL', 'https://guzan.eus'),
  mailEnabled: env('GUZAN_MAIL_ENABLED', 'true') !== 'false',
  smtp: {
    host: env('GUZAN_SMTP_HOST', 'smtp.gmail.com'),
    port: parseInt(env('GUZAN_SMTP_PORT', '465'), 10),
    secure: env('GUZAN_SMTP_SECURE', 'true') !== 'false',
    user: env('GUZAN_SMTP_USER', ''),
    pass: env('GUZAN_SMTP_PASS', '')
  },
  mailTo: env('GUZAN_MAIL_TO', '')
};

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
  review_token TEXT,
  approved INTEGER DEFAULT 0,
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
      const def = col === 'approved' ? 'INTEGER DEFAULT 0' : 'TEXT';
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

// Email notification via SMTP (Gmail app password)
let transporter = null;
function getTransporter() {
  if (!transporter && config.mailEnabled && config.smtp.user && config.smtp.pass && config.mailTo) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass }
    });
  }
  return transporter;
}

function sendSubmissionEmail(submission, reviewUrl) {
  if (!getTransporter()) {
    console.log(`[email] Skipped (SMTP not configured or GUZAN_MAIL_TO missing) for submission #${submission.id}`);
    return;
  }
  const description = submission.description || '(azalpenik gabe)';
  const html = `
    <h2>Guzanda - Bidalketa berria</h2>
    <ul>
      <li><strong>Izen Abizenak:</strong> ${escapeHtml(submission.name)}</li>
      <li><strong>Kontaktua:</strong> ${escapeHtml(submission.contact)}</li>
      <li><strong>Deskribapena:</strong><br>${escapeHtml(description)}</li>
      ${submission.audio ? '<li><strong>Audio:</strong> egiaztatu orrian</li>' : ''}
    </ul>
    <p>Ikusi eta onartzeko: <a href="${reviewUrl}">${reviewUrl}</a></p>
  `;
  const text = [
    `Guzanda - Bidalketa berria #${submission.id}`,
    `Izen Abizenak: ${submission.name}`,
    `Kontaktua: ${submission.contact}`,
    `Deskribapena: ${description}`,
    submission.audio ? 'Audioa: errepaso orrian entzun daiteke' : '',
    `Errepasatu / Review: ${reviewUrl}`
  ].filter(Boolean).join('\n');
  getTransporter().sendMail({
    from: config.smtp.user,
    to: config.mailTo,
    subject: `[Guzanda] Bidalketa berria #${submission.id} - ${submission.name}`,
    text,
    html
  }).then(() => {
    console.log(`[email] Sent review link for submission #${submission.id} to ${config.mailTo}`);
  }).catch((err) => {
    console.error(`[email] Failed for submission #${submission.id}: ${err.message}`);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// Review lookup helpers
function getSubmissionByToken(token, cb) {
  db.get(`SELECT * FROM guzanda WHERE review_token = ?`, [token], cb);
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
  const reviewToken = crypto.randomBytes(24).toString('hex');
  const sql = `INSERT INTO guzanda (name, contact, description, audio_file, audio, review_token) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(sql, [name, contact, description || null, req.file ? req.file.filename : null, audio, reviewToken], function(err) {
    if (err) {
      return res.status(500).send(err.message);
    }
    const submission = {
      id: this.lastID,
      name,
      contact,
      description: description || null,
      audio: req.file ? req.file.filename : null
    };
    const reviewUrl = `${config.publicUrl}/review/${reviewToken}`;
    sendSubmissionEmail(submission, reviewUrl);
    let html = fs.readFileSync(path.join(__dirname, '../public', 'guzanda-success.html'), 'utf8');
    html = html.split('{{name}}').join(name);
    res.send(html);
  });
});

// Review routes: only reachable with the unguessable per-submission token
app.get('/review/:token', (req, res) => {
  getSubmissionByToken(req.params.token, (err, row) => {
    if (err || !row) {
      return res.status(404).send('Not Found');
    }
    let html = fs.readFileSync(path.join(__dirname, 'review.html'), 'utf8');
    const audioSrc = row.audio ? `/review/${req.params.token}/audio` : null;
    const audioTag = audioSrc
      ? `<audio controls src="${audioSrc}"></audio>`
      : '<p>Audioa ez da grabatu</p>';
    const statusBadge = row.approved
      ? '<span class="badge approved">Onartua / Approved</span>'
      : '<span class="badge pending">Erabakitzeke</span>';
    const approveForm = row.approved
      ? ''
      : `<form method="post" action="/review/${req.params.token}/approve">
           <button type="submit" class="cta">Onartu</button>
         </form>`;
    html = html
      .split('{{id}}').join(row.id)
      .split('{{name}}').join(escapeHtml(row.name))
      .split('{{contact}}').join(escapeHtml(row.contact))
      .split('{{description}}').join(escapeHtml(row.description || '(azalpenik gabe)'))
      .split('{{created_at}}').join(escapeHtml(row.created_at))
      .split('{{audio_tag}}').join(audioTag)
      .split('{{status_badge}}').join(statusBadge)
      .split('{{approve_form}}').join(approveForm);
    res.send(html);
  });
});

app.post('/review/:token/approve', (req, res) => {
  getSubmissionByToken(req.params.token, (err, row) => {
    if (err || !row) {
      return res.status(404).send('Not Found');
    }
    db.run(`UPDATE guzanda SET approved = 1 WHERE id = ?`, [row.id], (updateErr) => {
      if (updateErr) {
        return res.status(500).send(updateErr.message);
      }
      console.log(`Submission #${row.id} approved.`);
      res.redirect(`/review/${req.params.token}`);
    });
  });
});

app.get('/review/:token/audio', (req, res) => {
  getSubmissionByToken(req.params.token, (err, row) => {
    if (err || !row || !row.audio || !fs.existsSync(row.audio)) {
      return res.status(404).send('Not Found');
    }
    res.setHeader('Content-Type', 'audio/webm');
    res.sendFile(row.audio);
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});