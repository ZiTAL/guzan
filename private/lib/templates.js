'use strict';

const fs = require('fs');
const path = require('path');

// Shared partials (single source of truth for repeated markup)
const FOOTER_PARTIAL = fs.readFileSync(path.join(__dirname, '..', 'partials', 'footer.html'), 'utf8');

function renderPage(file) {
  let html = fs.readFileSync(file, 'utf8');
  return html.split('{{footer}}').join(FOOTER_PARTIAL);
}

module.exports = { renderPage };
