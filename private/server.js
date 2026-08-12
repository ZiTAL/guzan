const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3000;

// Configuration from environment variables (see docker/.env.example)
function env(name, fallback) {
  const value = process.env[name];
  if (value == null || value.startsWith('${')) return fallback;
  return value;
}

const config = {
  publicUrl: env('GUZAN_PUBLIC_URL', 'https://guzan.eus'),
  instagramUser: env('GUZAN_INSTAGRAM_USER', 'guzanbermeo'),
  instagramCacheTtlMs: parseInt(env('GUZAN_INSTAGRAM_CACHE_TTL', '3600'), 10) * 1000,
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
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

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

// Shared partials (single source of truth for repeated markup)
const FOOTER_PARTIAL = fs.readFileSync(path.join(__dirname, 'partials', 'footer.html'), 'utf8');

function renderPage(file) {
  let html = fs.readFileSync(file, 'utf8');
  return html.split('{{footer}}').join(FOOTER_PARTIAL);
}

// Instagram feed proxy: scrapes the profile page with Playwright to get the
// latest posts, caches them, and exposes them at /api/instagram. Falls back
// gracefully to an empty list (the frontend then renders its static cards).
const instagramCache = { posts: [], fetchedAt: 0 };

let instagramBrowserPromise = null;

async function getInstagramBrowser() {
  if (!instagramBrowserPromise) {
    const { chromium } = require('playwright');
    instagramBrowserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return instagramBrowserPromise;
}

async function scrapeInstagramWithPlaywright() {
  const browser = await getInstagramBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES'
  });
  try {
    const page = await context.newPage();
    await page.goto(`https://www.instagram.com/${config.instagramUser}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    try {
      await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', { timeout: 15000 });
    } catch (_) {
      // selector may not appear if a login wall shows; extraction handles that
    }
    const grid = await page.evaluate(() => {
      const seen = new Set();
      const out = [];
      for (const a of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
        const m = a.href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        const img = a.querySelector('img');
        out.push({
          link: a.href,
          thumbnail: img ? img.currentSrc || img.src || '' : ''
        });
        if (out.length >= 3) break;
      }
      return out;
    });

    const posts = [];
    for (const entry of grid) {
      let title = '';
      try {
        // Open each post and read the real caption from its page metadata
        // (the profile grid only exposes auto-generated image alt text).
        await page.goto(entry.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
        title = await page.evaluate(() => {
          const m = document.querySelector('meta[name="description"]') ||
                   document.querySelector('meta[property="og:description"]');
          if (!m || !m.content) return '';
          const start = m.content.indexOf(': "');
          if (start === -1) return m.content;
          const inner = m.content.slice(start + 3);
          const end = inner.lastIndexOf('"');
          return end > 0 ? inner.slice(0, end).trim() : inner.trim();
        });
      } catch (err) {
        console.error('[instagram] caption fetch failed:', err.message);
      }
      posts.push({ title, link: entry.link, thumbnail: entry.thumbnail });
    }
    return posts;
  } finally {
    await context.close();
  }
}

async function fetchInstagramPosts() {
  try {
    const posts = await scrapeInstagramWithPlaywright();
    return posts;
  } catch (err) {
    console.error('[instagram] Playwright scrape failed:', err.message);
    instagramBrowserPromise = null;
    return [];
  }
}

async function getInstagramPosts() {
  const now = Date.now();
  if (instagramCache.posts.length && now - instagramCache.fetchedAt < config.instagramCacheTtlMs) {
    return instagramCache.posts;
  }
  const posts = await fetchInstagramPosts();
  instagramCache.posts = posts;
  instagramCache.fetchedAt = now;
  return posts;
}

app.get('/api/instagram', async (req, res) => {
  try {
    const posts = await getInstagramPosts();
    res.json({ posts });
  } catch (_) {
    res.status(500).json({ posts: [] });
  }
});

// Routes
app.get('/', (req, res) => {
  res.send(renderPage(path.join(__dirname, '../public', 'index.html')));
});
app.get('/guzanda', (req, res) => {
  const token = issueCsrfToken();
  let html = renderPage(path.join(__dirname, '../public', 'guzanda.html'));
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
    let html = renderPage(path.join(__dirname, '../public', 'guzanda-success.html'));
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
    const statusBadge = row.approved === 1
      ? '<span class="badge approved">Onartua</span>'
      : row.approved === 0
        ? '<span class="badge rejected">Ezeztatuta</span>'
        : '<span class="badge pending">Erabakitzeke</span>';
    const approveForm = `<form method="post" action="/review/${req.params.token}/approve">
           <button type="submit" class="cta approve">Onartu</button>
           <button type="submit" class="cta reject" formaction="/review/${req.params.token}/reject">Ezeztatu</button>
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

app.post('/review/:token/reject', (req, res) => {
  getSubmissionByToken(req.params.token, (err, row) => {
    if (err || !row) {
      return res.status(404).send('Not Found');
    }
    db.run(`UPDATE guzanda SET approved = 0 WHERE id = ?`, [row.id], (updateErr) => {
      if (updateErr) {
        return res.status(500).send(updateErr.message);
      }
      console.log(`Submission #${row.id} rejected.`);
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