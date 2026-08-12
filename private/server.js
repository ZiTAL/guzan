'use strict';

const express = require('express');
const path = require('path');

const config = require('./config');
const routes = require('./routes');

const app = express();
const port = config.port;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

// Optional request logging (opt-in via GUZAN_LOG_REQUESTS=true)
if (config.logRequests) {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - UA: "${req.headers['user-agent']}"`);
    next();
  });
}

// Prevent direct access to .db and .md files - fake as 404
app.use((req, res, next) => {
  if (req.path.endsWith('.db') || req.path.endsWith('.md')) {
    return res.status(404).send('Not Found');
  }
  next();
});

app.use(routes);

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
