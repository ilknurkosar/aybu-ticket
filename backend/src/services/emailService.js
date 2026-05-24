const crypto = require('crypto');
const { Resend } = require('resend');
const { env } = require('../config/env');
const redis = require('../cache/redis');

let resendClient;

function getResend() {
  if (!resendClient && env.resendApiKey) {
    resendClient = new Resend(env.resendApiKey);
  }
  return resendClient;
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
  const resend = getResend();
  if (!resend) return code;
  const { error } = await resend.emails.send({
    from: env.verificationEmailFrom,
    to: [email],
    subject: 'AYBU Cinema — Email Verification',
    html: `<div style="background:#0d0a09;color:#f0ebe5;font-family:sans-serif;padding:32px;max-width:480px">
      <h1 style="color:#d4a84f;margin:0 0 8px">AYBU Cinema</h1>
      <p style="color:#b8a98a">Use the code below to verify your email:</p>
      <div style="font-size:36px;letter-spacing:8px;text-align:center;padding:24px;background:#1a1512;border-radius:12px;margin:16px 0;color:#d4a84f;font-weight:700">${code}</div>
      <p style="color:#8a7a6a">This code expires in ${env.verificationCodeTtl / 60} minutes.</p>
    </div>`
  });
  if (error) throw new Error(error.message);
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
