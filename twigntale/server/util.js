'use strict';
/* Chhoti utilities: JSON body, cookies, responses, validation. */

const MAX_BODY = 256 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(httpError(413, 'Request bohat bara hai')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(httpError(400, 'Kharab JSON')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, { maxAge = 60 * 60 * 24 * 30, httpOnly = true } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (httpOnly) bits.push('HttpOnly');
  if (process.env.NODE_ENV === 'production') bits.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, bits.join('; ')) : [bits.join('; ')]);
}

function clearCookie(res, name) { setCookie(res, name, '', { maxAge: 0 }); }

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/* --- validation --- */
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, def = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const slugify = (s) => str(s, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

function require_(obj, fields) {
  const missing = fields.filter((f) => !str(obj[f]));
  if (missing.length) throw httpError(400, `Yeh khaane zaroori hain: ${missing.join(', ')}`);
}

module.exports = {
  readJson, parseCookies, setCookie, clearCookie, sendJson, httpError,
  isEmail, str, int, clamp, slugify, require_,
};
