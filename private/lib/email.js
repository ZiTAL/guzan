'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const { escapeHtml } = require('./security');

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

module.exports = { sendSubmissionEmail };
