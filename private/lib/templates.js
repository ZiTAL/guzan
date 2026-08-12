'use strict';

const fs = require('fs');
const path = require('path');

// Shared partials (single source of truth for repeated markup)
const FOOTER_PARTIAL = fs.readFileSync(path.join(__dirname, '..', 'partials', 'footer.html'), 'utf8');

// Replace {{placeholder}} tokens with the matching value from `values`.
function fillTemplate(template, values) {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    html = html.split(`{{${key}}}`).join(String(value == null ? '' : value));
  }
  return html;
}

function renderPage(file) {
  const html = fs.readFileSync(file, 'utf8');
  return fillTemplate(html, { footer: FOOTER_PARTIAL });
}

const APPROVED = 1;
const REJECTED = 0;

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

module.exports = { renderPage, fillTemplate, statusBadge, approveForm };
