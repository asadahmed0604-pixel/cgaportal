'use strict';
/* Password hashing (scrypt) aur cookie sessions — sab Node ke apne crypto se. */

const crypto = require('node:crypto');
const { q, now } = require('./db');
const { parseCookies, setCookie, clearCookie, httpError } = require('./util');

const SESSION_COOKIE = 'tnt_session';
const GUEST_COOKIE = 'tnt_guest';
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${dk}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, dk] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !dk) return false;
  const check = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(dk, 'hex');
  return known.length === check.length && crypto.timingSafeEqual(known, check);
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  q.run('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    token, userId, expires, now());
  setCookie(res, SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 });
  return token;
}

function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) q.run('DELETE FROM sessions WHERE token = ?', token);
  clearCookie(res, SESSION_COOKIE);
}

/* Har request par: user (agar logged in) aur cart ka owner key nikaalo. */
function context(req, res) {
  const cookies = parseCookies(req);
  let user = null;
  const token = cookies[SESSION_COOKIE];
  if (token) {
    const row = q.get(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.address, u.city, u.postal, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`, token);
    if (row && row.expires_at > Date.now()) {
      const { expires_at, ...rest } = row;
      user = rest;
    } else if (row) {
      q.run('DELETE FROM sessions WHERE token = ?', token);
      clearCookie(res, SESSION_COOKIE);
    }
  }

  let guest = cookies[GUEST_COOKIE];
  if (!guest) {
    guest = crypto.randomBytes(16).toString('base64url');
    setCookie(res, GUEST_COOKIE, guest, { maxAge: 86400 * 180 });
  }

  return { user, guest, owner: user ? `u:${user.id}` : `g:${guest}` };
}

/* Login ke waqt guest cart ko user ke cart mein mila do. */
function mergeGuestCart(guestOwner, userId) {
  const userOwner = `u:${userId}`;
  const items = q.all('SELECT product_id, qty FROM cart_items WHERE owner = ?', guestOwner);
  for (const it of items) {
    const existing = q.get('SELECT id, qty FROM cart_items WHERE owner = ? AND product_id = ?', userOwner, it.product_id);
    if (existing) q.run('UPDATE cart_items SET qty = ? WHERE id = ?', Math.min(99, existing.qty + it.qty), existing.id);
    else q.run('INSERT INTO cart_items (owner, product_id, qty, added_at) VALUES (?, ?, ?, ?)', userOwner, it.product_id, it.qty, now());
  }
  q.run('DELETE FROM cart_items WHERE owner = ?', guestOwner);
}

const requireUser = (ctx) => {
  if (!ctx.user) throw httpError(401, 'Pehle log in karein');
  return ctx.user;
};

const requireAdmin = (ctx) => {
  const u = requireUser(ctx);
  if (u.role !== 'admin') throw httpError(403, 'Sirf admin ke liye');
  return u;
};

function purgeExpiredSessions() {
  q.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
}

module.exports = {
  hashPassword, verifyPassword, createSession, destroySession, context,
  mergeGuestCart, requireUser, requireAdmin, purgeExpiredSessions, SESSION_COOKIE,
};
