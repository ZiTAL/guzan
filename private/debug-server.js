const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Debug middleware
app.use((req, res, next) => {
  console.log(`[DEBUG] ${req.method} ${req.path}`);
  console.log(`[DEBUG] Host: "${req.headers.host}"`);
  console.log(`[DEBUG] User-Agent: "${req.headers['user-agent']}"`);
  console.log(`[DEBUG] X-Forwarded-Host: "${req.headers['x-forwarded-host']}"`);
  console.log(`[DEBUG] X-Forwarded-Proto: "${req.headers['x-forwarded-proto']}"`);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/guzanda', (req, res) => {
  res.sendFile(path.join(__dirname, 'guzanda.html'));
});

app.listen(port, () => {
  console.log(`Debug server running at http://localhost:${port}`);
});