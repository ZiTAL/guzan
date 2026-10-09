'use strict';

const crypto = require('crypto');

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// CSRF protection: tokens are issued on GET, stored in an in-memory store,
// delivered via cookie + a hidden field, and validated on POST.
const csrfTokens = new Map();
const CSRF_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CSRF_TOKENS = 10000;

function issueCsrfToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  let oldest = csrfTokens.entries().next();
  while (!oldest.done && oldest.value[1] <= now) {
    csrfTokens.delete(oldest.value[0]);
    oldest = csrfTokens.entries().next();
  }
  if (csrfTokens.size >= MAX_CSRF_TOKENS) {
    csrfTokens.delete(csrfTokens.keys().next().value);
  }
  csrfTokens.set(token, now + CSRF_TTL_MS);
  return token;
}

function isValidCsrfToken(token) {
  if (!token || !csrfTokens.has(token)) return false;
  const expires = csrfTokens.get(token);
  csrfTokens.delete(token);
  return expires > Date.now();
}

function extractCookie(req, name) {
  const header = req.headers['cookie'] || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

module.exports = { escapeHtml, issueCsrfToken, isValidCsrfToken, extractCookie };
