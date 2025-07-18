const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: +process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

module.exports = async function sendEmail({ to, subject, text, html }) {
  try {
    await transport.sendMail({
      from: `"No Reply" <${process.env.SMTP_FROM}>`,
      to,
      subject,
      text,
      html, // include HTML body
    });
    console.log('Email sent to:', to);
  } catch (error) {
    console.error('Email send failed:', error);
    throw error;
  }
};