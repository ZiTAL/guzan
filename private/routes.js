'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');

const config = require('./config');
const { getSubmissionByToken, insertSubmission, setApproved } = require('./lib/db');
const { escapeHtml, issueCsrfToken, isValidCsrfToken, extractCookie } = require('./lib/security');
const { renderPage } = require('./lib/templates');
const { sendSubmissionEmail } = require('./lib/email');
const { getInstagramPosts } = require('./lib/instagram');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
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

const APPROVED = 1;
const REJECTED = 0;
const PENDING = -1;

function statusBadge(approved) {
  if (approved === APPROVED) return '<span class="badge approved">Onartua</span>';
  if (approved === REJECTED) return '<span class="badge rejected">Ezeztatuta</span>';
  return '<span class="badge pending">Erabakitzeke</span>';
}

function approveForm(token) {
  return `<form method="post" action="/review/${token}/approve">
           <button type="submit" class="cta approve">Onartu</button>
           <button type="submit" class="cta reject" formaction="/review/${token}/reject">Ezeztatu</button>
         </form>`;
}

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

router.post('/guzanda', upload.single('audio'), (req, res) => {
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
  insertSubmission({
    name,
    contact,
    description: description || null,
    audioFile: req.file ? req.file.filename : null,
    audio,
    reviewToken
  }, (err, lastID) => {
    if (err) {
      return res.status(500).send(err.message);
    }
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
    html = html.split('{{name}}').join(name);
    res.send(html);
  });
});

// Review routes: only reachable with the unguessable per-submission token
router.get('/review/:token', (req, res) => {
  getSubmissionByToken(req.params.token, (err, row) => {
    if (err || !row) {
      return res.status(404).send('Not Found');
    }
    let html = fs.readFileSync(path.join(__dirname, 'review.html'), 'utf8');
    const audioSrc = row.audio ? `/review/${req.params.token}/audio` : null;
    const audioTag = audioSrc
      ? `<audio controls src="${audioSrc}"></audio>`
      : '<p>Audioa ez da grabatu</p>';
    html = html
      .split('{{id}}').join(row.id)
      .split('{{name}}').join(escapeHtml(row.name))
      .split('{{contact}}').join(escapeHtml(row.contact))
      .split('{{description}}').join(escapeHtml(row.description || '(azalpenik gabe)'))
      .split('{{created_at}}').join(escapeHtml(row.created_at))
      .split('{{audio_tag}}').join(audioTag)
      .split('{{status_badge}}').join(statusBadge(row.approved))
      .split('{{approve_form}}').join(approveForm(req.params.token));
    res.send(html);
  });
});

router.post('/review/:token/approve', (req, res) => {
  getSubmissionByToken(req.params.token, (err, row) => {
    if (err || !row) {
      return res.status(404).send('Not Found');
    }
    setApproved(row.id, APPROVED, (updateErr) => {
      if (updateErr) {
        return res.status(500).send(updateErr.message);
      }
      console.log(`Submission #${row.id} approved.`);
      res.redirect(`/review/${req.params.token}`);
    });
  });
});

router.post('/review/:token/reject', (req, res) => {
  getSubmissionByToken(req.params.token, (err, row) => {
    if (err || !row) {
      return res.status(404).send('Not Found');
    }
    setApproved(row.id, REJECTED, (updateErr) => {
      if (updateErr) {
        return res.status(500).send(updateErr.message);
      }
      console.log(`Submission #${row.id} rejected.`);
      res.redirect(`/review/${req.params.token}`);
    });
  });
});

router.get('/review/:token/audio', (req, res) => {
  getSubmissionByToken(req.params.token, (err, row) => {
    if (err || !row || !row.audio || !fs.existsSync(row.audio)) {
      return res.status(404).send('Not Found');
    }
    res.setHeader('Content-Type', 'audio/webm');
    res.sendFile(row.audio);
  });
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
