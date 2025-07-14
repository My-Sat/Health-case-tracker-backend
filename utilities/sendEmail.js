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

module.exports = async function sendEmail({ to, subject, text }) {
  await transport.sendMail({
    from: `"No Reply" <${process.env.SMTP_FROM}>`,
    to,
    subject,
    text,
  });
};