'use strict';

const sgMail = require('@sendgrid/mail');

const API_KEY = process.env.SENDGRID_API_KEY;
const DEFAULT_FROM = process.env.SENDGRID_FROM || process.env.FROM_EMAIL || process.env.SMTP_FROM;

if (!API_KEY) {
  throw new Error(
    'Missing SENDGRID_API_KEY environment variable. Set SENDGRID_API_KEY in your environment (Render env var).'
  );
}

if (!DEFAULT_FROM) {
  throw new Error(
    'Missing default sender address. Set SENDGRID_FROM (or FROM_EMAIL / SMTP_FROM) environment variable.'
  );
}

sgMail.setApiKey(API_KEY);

/**
 * Send an email via SendGrid.
 * @param {{to: string|string[], subject: string, text?: string, html?: string, from?: string}} options
 * @returns {Promise<*>} SendGrid response
 */
async function sendEmail({ to, subject, text, html, from }) {
  if (!to) throw new Error('sendEmail: "to" is required');
  if (!subject) throw new Error('sendEmail: "subject" is required');

  const msg = {
    to,
    from: from || DEFAULT_FROM,
    subject,
    text: text || (html ? stripHtmlToText(html) : ''),
    html: html || '',
  };

  try {
    const response = await sgMail.send(msg);
    // sgMail.send returns an array of responses; log minimal useful info
    const status =
      Array.isArray(response) && response[0] && typeof response[0].statusCode !== 'undefined'
        ? response[0].statusCode
        : 'unknown';
    console.log(`SendGrid: email to ${Array.isArray(to) ? to.join(',') : to} (status: ${status})`);
    return response;
  } catch (err) {
    console.error('SendGrid send failed:', err.toString());
    if (err.response && err.response.body) {
      console.error('SendGrid response body:', JSON.stringify(err.response.body));
    }
    throw err;
  }
}

// very small helper to produce fallback plain text from html (not perfect but useful)
function stripHtmlToText(html) {
  return String(html).replace(/(<([^>]+)>)/gi, '').replace(/\s+/g, ' ').trim();
}

module.exports = sendEmail;
