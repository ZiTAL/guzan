'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');

const config = require('./config');
const { getSubmissionByTokenAsync, insertSubmissionAsync, setApprovedAsync } = require('./lib/db');
const { escapeHtml, issueCsrfToken, isValidCsrfToken, extractCookie } = require('./lib/security');
const { renderPage, fillTemplate, statusBadge, approveForm } = require('./lib/templates');
const { sendSubmissionEmail } = require('./lib/email');
const { getInstagramPosts } = require('./lib/instagram');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File upload setup: store under a random name so user-supplied filenames
// never end up in the filesystem
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    const safeExt = /^\.[a-z0-9]+$/.test(originalExt) ? originalExt : '.webm';
    cb(null, Date.now() + '-' + crypto.randomBytes(8).toString('hex') + safeExt);
  }
});
const upload = multer({ storage: storage });

const APPROVED = 1;
const REJECTED = 0;

// Routes
router.get('/', (req, res) => {
  res.send(renderPage(path.join(__dirname, '../public', 'index.html')));
});

router.get('/guzanda', (req, res) => {
  const token = issueCsrfToken();
  let html = renderPage(path.join(__dirname, '../public', 'guzanda.html'));
  html = html.replace(
    '</form>',
    `<input type="hidden" name="csrf_token" value="${token}">\n        </form>`
  );
  res.setHeader('Set-Cookie', `csrf_token=${token}; Path=/; HttpOnly; SameSite=Lax`);
  res.send(html);
});

router.post('/guzanda', upload.single('audio'), async (req, res) => {
  try {
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
    const lastID = await insertSubmissionAsync({
      name,
      contact,
      description: description || null,
      audioFile: req.file ? req.file.filename : null,
      audio,
      reviewToken
    });
    const submission = {
      id: lastID,
      name,
      contact,
      description: description || null,
      audio: req.file ? req.file.filename : null
    };
    const reviewUrl = `${config.publicUrl}/review/${reviewToken}`;
    sendSubmissionEmail(submission, reviewUrl);
    let html = renderPage(path.join(__dirname, '../public', 'guzanda-success.html'));
    html = fillTemplate(html, { name: escapeHtml(name) });
    res.send(html);
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

// Review routes: only reachable with the unguessable per-submission token
router.get('/review/:token', async (req, res) => {
  try {
    const row = await getSubmissionByTokenAsync(req.params.token);
    if (!row) {
      return res.status(404).send('Not Found');
    }
    const template = fs.readFileSync(path.join(__dirname, 'review.html'), 'utf8');
    const audioSrc = row.audio ? `/review/${req.params.token}/audio` : null;
    const audioTag = audioSrc
      ? `<audio controls src="${audioSrc}"></audio>`
      : '<p>Audioa ez da grabatu</p>';
    const html = fillTemplate(template, {
      id: row.id,
      name: escapeHtml(row.name),
      contact: escapeHtml(row.contact),
      description: escapeHtml(row.description || '(azalpenik gabe)'),
      created_at: escapeHtml(row.created_at),
      audio_tag: audioTag,
      status_badge: statusBadge(row.approved),
      approve_form: approveForm(req.params.token)
    });
    res.send(html);
  } catch (_) {
    return res.status(404).send('Not Found');
  }
});

router.post('/review/:token/approve', async (req, res) => {
  try {
    const row = await getSubmissionByTokenAsync(req.params.token);
    if (!row) {
      return res.status(404).send('Not Found');
    }
    await setApprovedAsync(row.id, APPROVED);
    console.log(`Submission #${row.id} approved.`);
    res.redirect(`/review/${req.params.token}`);
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

router.post('/review/:token/reject', async (req, res) => {
  try {
    const row = await getSubmissionByTokenAsync(req.params.token);
    if (!row) {
      return res.status(404).send('Not Found');
    }
    await setApprovedAsync(row.id, REJECTED);
    console.log(`Submission #${row.id} rejected.`);
    res.redirect(`/review/${req.params.token}`);
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

router.get('/review/:token/audio', async (req, res) => {
  try {
    const row = await getSubmissionByTokenAsync(req.params.token);
    if (!row || !row.audio || !fs.existsSync(row.audio)) {
      return res.status(404).send('Not Found');
    }
    res.setHeader('Content-Type', 'audio/webm');
    res.sendFile(row.audio);
  } catch (_) {
    return res.status(404).send('Not Found');
  }
});

router.get('/api/instagram', async (req, res) => {
  try {
    const posts = await getInstagramPosts();
    res.json({ posts });
  } catch (_) {
    res.status(500).json({ posts: [] });
  }
});

module.exports = router;
