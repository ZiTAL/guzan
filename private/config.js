'use strict';

function env(name, fallback) {
  const value = process.env[name];
  if (value == null || value.startsWith('${')) return fallback;
  return value;
}

module.exports = {
  port: process.env.PORT || 3000,
  logRequests: env('GUZAN_LOG_REQUESTS', 'false') === 'true',
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
