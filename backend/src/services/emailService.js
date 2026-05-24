const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const redis = require('../cache/redis');

let transporter;

function getTransporter() {
  if (!transporter && env.smtpUser && env.smtpPass) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    });
  }
  return transporter;
}

function verificationKey(email) {
  return `verify:email:${email.toLowerCase().trim()}`;
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function sendVerificationCode(email) {
  const code = generateCode();
  const key = verificationKey(email);
  await redis.setEx(key, { code, email }, env.verificationCodeTtl);
  const mailer = getTransporter();
  if (!mailer) throw new Error('SMTP credentials are not configured');
  await mailer.sendMail({
    from: env.verificationEmailFrom,
    to: email,
    subject: 'AYBU Cinema - Email Verification',
    text: `Your AYBU Cinema verification code is ${code}. This code expires in ${env.verificationCodeTtl / 60} minutes.`,
    html: `<div style="background:#0d0a09;color:#f0ebe5;font-family:sans-serif;padding:32px;max-width:480px">
      <h1 style="color:#d4a84f;margin:0 0 8px">AYBU Cinema</h1>
      <p style="color:#b8a98a">Use the code below to verify your email:</p>
      <div style="font-size:36px;letter-spacing:8px;text-align:center;padding:24px;background:#1a1512;border-radius:12px;margin:16px 0;color:#d4a84f;font-weight:700">${code}</div>
      <p style="color:#8a7a6a">This code expires in ${env.verificationCodeTtl / 60} minutes.</p>
    </div>`
  });
  return code;
}

async function verifyCode(email, code) {
  const key = verificationKey(email);
  const stored = await redis.getJson(key);
  if (!stored) return false;
  if (stored.code !== code) return false;
  await redis.del(key);
  return true;
}

module.exports = { sendVerificationCode, verifyCode, verificationKey };
