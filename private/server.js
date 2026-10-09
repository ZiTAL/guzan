'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');

const config = require('./config');
const routes = require('./routes');
const { isBlocked } = require('./lib/ip-blacklist');

const app = express();
const port = config.port;

// Trust forwarded client IPs only from the configured reverse proxy addresses.
app.set('trust proxy', config.trustProxy);

// Middleware
app.use((req, res, next) => {
  if (isBlocked(req.ip)) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// Keep sensitive-looking file extensions inaccessible even if one is copied
// into the public directory in the future.
app.use((req, res, next) => {
  if (/\.(?:db|md)$/i.test(req.path)) {
    return res.status(404).send('Not Found');
  }
  next();
});

app.use(express.urlencoded({ extended: true, limit: '16kb', parameterLimit: 10 }));
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

// Optional request logging (opt-in via GUZAN_LOG_REQUESTS=true)
if (config.logRequests) {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - UA: "${req.headers['user-agent']}"`);
    next();
  });
}

app.use(routes);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).send(
      tooLarge ? 'Audio file is too large (maximum 16 MB).' : 'Invalid form upload.'
    );
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).send('Request body is too large.');
  }
  if (err.type === 'entity.parse.failed' || err.type === 'parameters.too.many') {
    return res.status(400).send('Invalid request body.');
  }
  console.error('[server] Request failed:', err.message);
  return res.status(500).send('Internal Server Error');
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
