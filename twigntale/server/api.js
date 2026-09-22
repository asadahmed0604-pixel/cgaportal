'use strict';
/* REST API — storefront, cart, checkout, account aur admin. */

const crypto = require('node:crypto');
const { q, now } = require('./db');
const auth = require('./auth');
const {
  readJson, sendJson, httpError, isEmail, str, int, clamp, slugify, require_,
} = require('./util');

const SHIPPING_FLAT = 250;          // PKR
const FREE_SHIPPING_OVER = 5000;    // is se upar delivery free
const ORDER_FLOW = ['placed', 'confirmed', 'packed', 'shipped', 'delivered'];
const ORDER_STATUSES = [...ORDER_FLOW, 'cancelled'];

/* ---------- chhota router ---------- */
const routes = [];
const on = (method, pattern, handler) => {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, rx, keys, handler });
};

async function handleApi(req, res, pathname, query, ctx) {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.rx);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readJson(req) : {};
    const out = await r.handler({ ctx, params, query, body, req, res });
    if (!res.writableEnded) sendJson(res, out && out.__status ? out.__status : 200, out ?? { ok: true });
    return true;
  }
  return false;
}

/* ---------- shared shapers ---------- */
const money = (n) => Math.max(0, Math.round(n));

function shapeProduct(p) {
  if (!p) return null;
  let details = [];
  try { details = JSON.parse(p.details || '[]'); } catch { details = []; }
  return {
    id: p.id, slug: p.slug, name: p.name, price: p.price, compareAt: p.compare_at,
    stock: p.stock, shortDesc: p.short_desc, description: p.description, details,
    motif: p.motif, hue: p.hue, imageUrl: p.image_url,
    featured: !!p.featured, active: !!p.active,
    category: p.category_slug ? { slug: p.category_slug, name: p.category_name } : null,
    rating: p.rating ? Math.round(p.rating * 10) / 10 : 0,
    reviewCount: p.review_count || 0,
    createdAt: p.created_at,
  };
}

const PRODUCT_SELECT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name,
         (SELECT AVG(rating) FROM reviews r WHERE r.product_id = p.id) AS rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
    FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

function cartState(owner) {
  const rows = q.all(`
    SELECT ci.id, ci.qty, p.id AS product_id, p.slug, p.name, p.price, p.stock, p.motif, p.hue, p.image_url, p.active
      FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.owner = ? ORDER BY ci.added_at`, owner);

  const items = rows.filter((r) => r.active).map((r) => ({
    id: r.id, productId: r.product_id, slug: r.slug, name: r.name,
    price: r.price, qty: Math.min(r.qty, Math.max(r.stock, 0)) || r.qty,
    stock: r.stock, motif: r.motif, hue: r.hue, imageUrl: r.image_url,
    lineTotal: r.price * r.qty,
  }));
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FLAT;
  return { items, subtotal, count, shipping, freeShippingOver: FREE_SHIPPING_OVER, total: subtotal + shipping };
}

function checkPromo(code, subtotal) {
  const p = q.get('SELECT * FROM promos WHERE code = ? AND active = 1', String(code || '').toUpperCase().trim());
  if (!p) throw httpError(400, 'Yeh promo code maujood nahi');
  if (p.expires_at && new Date(p.expires_at) < new Date()) throw httpError(400, 'Is code ki tareekh guzar chuki');
  if (p.max_uses != null && p.uses >= p.max_uses) throw httpError(400, 'Is code ki limit poori ho gayi');
  if (subtotal < p.min_subtotal) throw httpError(400, `Yeh code Rs ${p.min_subtotal} se upar chalta hai`);
  const discount = p.kind === 'percent' ? Math.round((subtotal * p.value) / 100) : Math.min(p.value, subtotal);
  return { code: p.code, kind: p.kind, value: p.value, discount };
}

/* ================= auth ================= */

on('POST', '/api/auth/register', async ({ body, ctx, res }) => {
  require_(body, ['name', 'email', 'password']);
  if (!isEmail(body.email)) throw httpError(400, 'Email theek nahi lag raha');
  if (String(body.password).length < 6) throw httpError(400, 'Password kam az kam 6 characters ka rakhein');
  const email = str(body.email, 160).toLowerCase();
  if (q.get('SELECT id FROM users WHERE email = ?', email)) throw httpError(409, 'Is email par pehle se account hai');

  const info = q.run(
    'INSERT INTO users (name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    str(body.name, 80), email, str(body.phone, 30), auth.hashPassword(String(body.password)), 'customer', now());
  const id = Number(info.lastInsertRowid);
  auth.mergeGuestCart(ctx.owner, id);
  auth.createSession(res, id);
  return { id, name: str(body.name, 80), email, role: 'customer' };
});

on('POST', '/api/auth/login', async ({ body, ctx, res }) => {
  require_(body, ['email', 'password']);
  const user = q.get('SELECT * FROM users WHERE email = ?', str(body.email, 160).toLowerCase());
  if (!user || !auth.verifyPassword(String(body.password), user.password_hash)) {
    throw httpError(401, 'Email ya password ghalat hai');
  }
  auth.mergeGuestCart(ctx.owner, user.id);
  auth.createSession(res, user.id);
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

on('POST', '/api/auth/logout', async ({ req, res }) => { auth.destroySession(req, res); return { ok: true }; });

/* Log in na hone par bhi 200 — client sirf null dekh kar faisla karta hai. */
on('GET', '/api/me', async ({ ctx }) => ctx.user || { guest: true });

on('PATCH', '/api/me', async ({ ctx, body }) => {
  const u = auth.requireUser(ctx);
  q.run('UPDATE users SET name = ?, phone = ?, address = ?, city = ?, postal = ? WHERE id = ?',
    str(body.name, 80) || u.name, str(body.phone, 30), str(body.address, 300), str(body.city, 80), str(body.postal, 20), u.id);
  return q.get('SELECT id, name, email, phone, role, address, city, postal FROM users WHERE id = ?', u.id);
});

/* ================= catalog ================= */

on('GET', '/api/catalog', async () => {
  const categories = q.all(`
    SELECT c.slug, c.name, c.tagline,
           (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS count
      FROM categories c ORDER BY c.sort, c.name`);
  const range = q.get('SELECT MIN(price) AS min, MAX(price) AS max FROM products WHERE active = 1') || {};
  return {
    categories,
    priceRange: { min: range.min || 0, max: range.max || 0 },
    shipping: { flat: SHIPPING_FLAT, freeOver: FREE_SHIPPING_OVER },
  };
});

on('GET', '/api/products', async ({ query }) => {
  const where = ['p.active = 1'];
  const args = [];
  const search = str(query.q, 60);
  if (search) { where.push('(p.name LIKE ? OR p.short_desc LIKE ? OR p.description LIKE ?)'); args.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (query.cat && query.cat !== 'all') { where.push('c.slug = ?'); args.push(str(query.cat, 60)); }
  if (query.min) { where.push('p.price >= ?'); args.push(int(query.min)); }
  if (query.max) { where.push('p.price <= ?'); args.push(int(query.max)); }
  if (query.featured === '1') where.push('p.featured = 1');
  if (query.inStock === '1') where.push('p.stock > 0');

  const order = {
    new: 'p.created_at DESC',
    priceAsc: 'p.price ASC',
    priceDesc: 'p.price DESC',
    rating: 'rating DESC NULLS LAST',
    name: 'p.name ASC',
  }[query.sort] || 'p.featured DESC, p.created_at DESC';

  const limit = clamp(int(query.limit, 12), 1, 48);
  const page = Math.max(1, int(query.page, 1));
  const sqlWhere = 'WHERE ' + where.join(' AND ');
  const total = q.get(`SELECT COUNT(*) AS n FROM products p LEFT JOIN categories c ON c.id = p.category_id ${sqlWhere}`, ...args).n;
  const rows = q.all(`${PRODUCT_SELECT} ${sqlWhere} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);

  return { items: rows.map(shapeProduct), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
});

on('GET', '/api/products/:slug', async ({ params }) => {
  const p = q.get(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.active = 1`, params.slug);
  if (!p) throw httpError(404, 'Yeh cheez nahi mili');
  const reviews = q.all(`
    SELECT r.rating, r.title, r.body, r.created_at, u.name AS author
      FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = ? ORDER BY r.created_at DESC LIMIT 20`, p.id);
  const related = q.all(`${PRODUCT_SELECT} WHERE p.active = 1 AND p.id != ? AND p.category_id IS ? ORDER BY RANDOM() LIMIT 4`, p.id, p.category_id);
  return { product: shapeProduct(p), reviews, related: related.map(shapeProduct) };
});

on('POST', '/api/products/:id/reviews', async ({ ctx, params, body }) => {
  const u = auth.requireUser(ctx);
  const id = int(params.id);
  if (!q.get('SELECT id FROM products WHERE id = ?', id)) throw httpError(404, 'Product nahi mila');
  const bought = q.get(`SELECT 1 AS ok FROM order_items oi JOIN orders o ON o.id = oi.order_id
                         WHERE o.user_id = ? AND oi.product_id = ?`, u.id, id);
  if (!bought) throw httpError(403, 'Review sirf khareedne ke baad likh sakte hain');
  const rating = clamp(int(body.rating, 5), 1, 5);
  q.run(`INSERT INTO reviews (product_id, user_id, rating, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id, user_id) DO UPDATE SET rating = excluded.rating, title = excluded.title,
           body = excluded.body, created_at = excluded.created_at`,
    id, u.id, rating, str(body.title, 120), str(body.body, 1500), now());
  return { ok: true };
});

/* ================= cart ================= */

on('GET', '/api/cart', async ({ ctx }) => cartState(ctx.owner));

on('POST', '/api/cart', async ({ ctx, body }) => {
  const productId = int(body.productId);
  const qty = clamp(int(body.qty, 1), 1, 99);
  const p = q.get('SELECT id, stock FROM products WHERE id = ? AND active = 1', productId);
  if (!p) throw httpError(404, 'Product nahi mila');
  if (p.stock <= 0) throw httpError(409, 'Yeh cheez abhi stock mein nahi');
  const existing = q.get('SELECT id, qty FROM cart_items WHERE owner = ? AND product_id = ?', ctx.owner, productId);
  const nextQty = clamp((existing ? existing.qty : 0) + qty, 1, Math.min(99, p.stock));
  if (existing) q.run('UPDATE cart_items SET qty = ? WHERE id = ?', nextQty, existing.id);
  else q.run('INSERT INTO cart_items (owner, product_id, qty, added_at) VALUES (?, ?, ?, ?)', ctx.owner, productId, nextQty, now());
  return cartState(ctx.owner);
});

on('PATCH', '/api/cart/:id', async ({ ctx, params, body }) => {
  const item = q.get('SELECT ci.id, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.id = ? AND ci.owner = ?', int(params.id), ctx.owner);
  if (!item) throw httpError(404, 'Cart item nahi mila');
  const qty = clamp(int(body.qty, 1), 0, Math.min(99, item.stock));
  if (qty === 0) q.run('DELETE FROM cart_items WHERE id = ?', item.id);
  else q.run('UPDATE cart_items SET qty = ? WHERE id = ?', qty, item.id);
  return cartState(ctx.owner);
});

on('DELETE', '/api/cart/:id', async ({ ctx, params }) => {
  q.run('DELETE FROM cart_items WHERE id = ? AND owner = ?', int(params.id), ctx.owner);
  return cartState(ctx.owner);
});

on('POST', '/api/promo/check', async ({ ctx, body }) => {
  const { subtotal } = cartState(ctx.owner);
  return checkPromo(body.code, subtotal);
});

/* ================= wishlist ================= */

on('GET', '/api/wishlist', async ({ ctx }) => {
  if (!ctx.user) return { items: [] };
  const rows = q.all(`${PRODUCT_SELECT} JOIN wishlist w ON w.product_id = p.id WHERE w.user_id = ? ORDER BY w.created_at DESC`, ctx.user.id);
  return { items: rows.map(shapeProduct) };
});

on('POST', '/api/wishlist', async ({ ctx, body }) => {
  const u = auth.requireUser(ctx);
  const id = int(body.productId);
  const existing = q.get('SELECT 1 AS ok FROM wishlist WHERE user_id = ? AND product_id = ?', u.id, id);
  if (existing) { q.run('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?', u.id, id); return { saved: false }; }
  q.run('INSERT INTO wishlist (user_id, product_id, created_at) VALUES (?, ?, ?)', u.id, id, now());
  return { saved: true };
});

/* ================= checkout & orders ================= */

on('POST', '/api/orders', async ({ ctx, body }) => {
  require_(body, ['name', 'phone', 'address', 'city']);
  const cart = cartState(ctx.owner);
  if (!cart.items.length) throw httpError(400, 'Cart khali hai');

  const method = ['cod', 'bank'].includes(body.paymentMethod) ? body.paymentMethod : 'cod';
  let discount = 0, promoCode = null;
  if (str(body.promoCode)) {
    const promo = checkPromo(body.promoCode, cart.subtotal);
    discount = promo.discount; promoCode = promo.code;
  }

  /* stock dobara check — client par bharosa nahi */
  for (const it of cart.items) {
    const fresh = q.get('SELECT stock, name FROM products WHERE id = ?', it.productId);
    if (!fresh || fresh.stock < it.qty) throw httpError(409, `"${it.name}" ka itna stock nahi raha`);
  }

  const shipping = cart.subtotal - discount >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FLAT;
  const total = money(cart.subtotal - discount + shipping);
  const code = 'TNT-' + crypto.randomBytes(3).toString('hex').toUpperCase();

  const info = q.run(`
    INSERT INTO orders (code, user_id, guest_token, status, subtotal, discount, shipping, total, promo_code,
                        payment_method, name, phone, email, address, city, postal, notes, created_at)
    VALUES (?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    code, ctx.user ? ctx.user.id : null, ctx.user ? null : ctx.guest,
    cart.subtotal, discount, shipping, total, promoCode, method,
    str(body.name, 80), str(body.phone, 30), str(body.email, 160) || (ctx.user ? ctx.user.email : null),
    str(body.address, 300), str(body.city, 80), str(body.postal, 20), str(body.notes, 500), now());

  const orderId = Number(info.lastInsertRowid);
  for (const it of cart.items) {
    q.run('INSERT INTO order_items (order_id, product_id, name, slug, price, qty) VALUES (?, ?, ?, ?, ?, ?)',
      orderId, it.productId, it.name, it.slug, it.price, it.qty);
    q.run('UPDATE products SET stock = stock - ? WHERE id = ?', it.qty, it.productId);
  }
  q.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)',
    orderId, 'placed', 'Order mil gaya', now());
  if (promoCode) q.run('UPDATE promos SET uses = uses + 1 WHERE code = ?', promoCode);
  q.run('DELETE FROM cart_items WHERE owner = ?', ctx.owner);

  return { code, total, status: 'placed' };
});

function orderDetail(row) {
  const items = q.all('SELECT product_id AS productId, name, slug, price, qty FROM order_items WHERE order_id = ?', row.id);
  const events = q.all('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id', row.id);
  return { ...row, items, events, flow: ORDER_FLOW };
}

on('GET', '/api/orders', async ({ ctx }) => {
  const u = auth.requireUser(ctx);
  const rows = q.all(`
    SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
      FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC`, u.id);
  return { items: rows };
});

on('GET', '/api/orders/:code', async ({ ctx, params }) => {
  const row = q.get('SELECT * FROM orders WHERE code = ?', str(params.code, 20).toUpperCase());
  if (!row) throw httpError(404, 'Order nahi mila');
  /* apna order: logged-in maalik, admin, ya wohi mehmaan jis ne order diya tha */
  const mine = (ctx.user && (row.user_id === ctx.user.id || ctx.user.role === 'admin'))
    || (row.guest_token && row.guest_token === ctx.guest);
  if (!mine) throw httpError(403, 'Yeh order aap ka nahi');
  return orderDetail(row);
});

/* ================= newsletter ================= */

on('POST', '/api/newsletter', async ({ body }) => {
  if (!isEmail(body.email)) throw httpError(400, 'Email theek nahi lag raha');
  q.run('INSERT INTO newsletter (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING',
    str(body.email, 160).toLowerCase(), now());
  return { ok: true };
});

/* ================= admin ================= */

on('GET', '/api/admin/stats', async ({ ctx }) => {
  auth.requireAdmin(ctx);
  const sold = q.get("SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE status != 'cancelled'");
  const pending = q.get("SELECT COUNT(*) AS n FROM orders WHERE status IN ('placed','confirmed','packed')").n;
  const customers = q.get("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").n;
  const lowStock = q.all('SELECT name, stock, slug FROM products WHERE active = 1 AND stock <= 3 ORDER BY stock LIMIT 8');
  const topProducts = q.all(`
    SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.price) AS revenue
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status != 'cancelled' GROUP BY oi.name ORDER BY revenue DESC LIMIT 6`);
  /* Pichle 14 din — jin dinon koi order nahi aaya wo bhi zero ke saath,
     warna time series mein ghalat tasveer banti hai. */
  const rows = q.all(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS orders, SUM(total) AS revenue
      FROM orders WHERE status != 'cancelled' GROUP BY day`);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const hit = byDay.get(day);
    daily.push({ day, orders: hit ? hit.orders : 0, revenue: hit ? hit.revenue : 0 });
  }
  return {
    revenue: sold.revenue, orders: sold.orders, pending, customers,
    subscribers: q.get('SELECT COUNT(*) AS n FROM newsletter').n,
    lowStock, topProducts, daily,
  };
});

on('GET', '/api/admin/products', async ({ ctx, query }) => {
  auth.requireAdmin(ctx);
  const search = str(query.q, 60);
  const rows = search
    ? q.all(`${PRODUCT_SELECT} WHERE p.name LIKE ? ORDER BY p.id DESC`, `%${search}%`)
    : q.all(`${PRODUCT_SELECT} ORDER BY p.id DESC`);
  return { items: rows.map(shapeProduct) };
});

function productPayload(body) {
  const name = str(body.name, 120);
  if (!name) throw httpError(400, 'Naam zaroori hai');
  const cat = str(body.category, 60);
  const category = cat ? q.get('SELECT id FROM categories WHERE slug = ?', cat) : null;
  return {
    name,
    slug: slugify(body.slug || name),
    category_id: category ? category.id : null,
    price: Math.max(0, int(body.price)),
    compare_at: body.compareAt ? Math.max(0, int(body.compareAt)) : null,
    stock: Math.max(0, int(body.stock)),
    short_desc: str(body.shortDesc, 200),
    description: str(body.description, 4000),
    details: JSON.stringify(Array.isArray(body.details) ? body.details.slice(0, 10).map((d) => str(d, 120)) : []),
    motif: ['leaf', 'bloom', 'fern', 'berry', 'wave'].includes(body.motif) ? body.motif : 'leaf',
    hue: clamp(int(body.hue, 150), 0, 360),
    image_url: str(body.imageUrl, 400) || null,
    featured: body.featured ? 1 : 0,
    active: body.active === false ? 0 : 1,
  };
}

on('POST', '/api/admin/products', async ({ ctx, body }) => {
  auth.requireAdmin(ctx);
  const p = productPayload(body);
  if (q.get('SELECT id FROM products WHERE slug = ?', p.slug)) p.slug += '-' + crypto.randomBytes(2).toString('hex');
  const info = q.run(`INSERT INTO products (slug, name, category_id, price, compare_at, stock, short_desc, description,
      details, motif, hue, image_url, featured, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.slug, p.name, p.category_id, p.price, p.compare_at, p.stock, p.short_desc, p.description,
    p.details, p.motif, p.hue, p.image_url, p.featured, p.active, now());
  return { id: Number(info.lastInsertRowid), slug: p.slug };
});

on('PATCH', '/api/admin/products/:id', async ({ ctx, params, body }) => {
  auth.requireAdmin(ctx);
  const id = int(params.id);
  const existing = q.get('SELECT id, slug FROM products WHERE id = ?', id);
  if (!existing) throw httpError(404, 'Product nahi mila');
  const p = productPayload({ ...body, slug: body.slug || existing.slug });
  const clash = q.get('SELECT id FROM products WHERE slug = ? AND id != ?', p.slug, id);
  if (clash) p.slug += '-' + crypto.randomBytes(2).toString('hex');
  q.run(`UPDATE products SET slug = ?, name = ?, category_id = ?, price = ?, compare_at = ?, stock = ?,
         short_desc = ?, description = ?, details = ?, motif = ?, hue = ?, image_url = ?, featured = ?, active = ?
         WHERE id = ?`,
    p.slug, p.name, p.category_id, p.price, p.compare_at, p.stock, p.short_desc, p.description,
    p.details, p.motif, p.hue, p.image_url, p.featured, p.active, id);
  return { ok: true, slug: p.slug };
});

on('DELETE', '/api/admin/products/:id', async ({ ctx, params }) => {
  auth.requireAdmin(ctx);
  q.run('UPDATE products SET active = 0 WHERE id = ?', int(params.id));
  return { ok: true };
});

on('GET', '/api/admin/orders', async ({ ctx, query }) => {
  auth.requireAdmin(ctx);
  const status = str(query.status, 20);
  const rows = status && ORDER_STATUSES.includes(status)
    ? q.all('SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 100', status)
    : q.all('SELECT * FROM orders ORDER BY id DESC LIMIT 100');
  return { items: rows.map(orderDetail), statuses: ORDER_STATUSES };
});

on('PATCH', '/api/admin/orders/:id', async ({ ctx, params, body }) => {
  auth.requireAdmin(ctx);
  const status = str(body.status, 20);
  if (!ORDER_STATUSES.includes(status)) throw httpError(400, 'Yeh status theek nahi');
  const order = q.get('SELECT * FROM orders WHERE id = ?', int(params.id));
  if (!order) throw httpError(404, 'Order nahi mila');
  if (status === 'cancelled' && order.status !== 'cancelled') {
    for (const it of q.all('SELECT product_id, qty FROM order_items WHERE order_id = ?', order.id)) {
      if (it.product_id) q.run('UPDATE products SET stock = stock + ? WHERE id = ?', it.qty, it.product_id);
    }
  }
  q.run('UPDATE orders SET status = ? WHERE id = ?', status, order.id);
  q.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)',
    order.id, status, str(body.note, 200), now());
  return { ok: true };
});

on('GET', '/api/admin/customers', async ({ ctx }) => {
  auth.requireAdmin(ctx);
  return {
    items: q.all(`
      SELECT u.id, u.name, u.email, u.phone, u.city, u.created_at,
             (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
             (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.status != 'cancelled') AS spent
        FROM users u WHERE u.role = 'customer' ORDER BY u.id DESC LIMIT 200`),
  };
});

on('GET', '/api/admin/promos', async ({ ctx }) => {
  auth.requireAdmin(ctx);
  return { items: q.all('SELECT * FROM promos ORDER BY code') };
});

on('POST', '/api/admin/promos', async ({ ctx, body }) => {
  auth.requireAdmin(ctx);
  const code = str(body.code, 24).toUpperCase().replace(/\s+/g, '');
  if (!code) throw httpError(400, 'Code likhein');
  const kind = body.kind === 'flat' ? 'flat' : 'percent';
  q.run(`INSERT INTO promos (code, kind, value, min_subtotal, max_uses, active, expires_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(code) DO UPDATE SET kind = excluded.kind, value = excluded.value,
           min_subtotal = excluded.min_subtotal, max_uses = excluded.max_uses, expires_at = excluded.expires_at`,
    code, kind, Math.max(1, int(body.value, 10)), Math.max(0, int(body.minSubtotal)),
    body.maxUses ? int(body.maxUses) : null, str(body.expiresAt, 30) || null);
  return { ok: true, code };
});

on('DELETE', '/api/admin/promos/:code', async ({ ctx, params }) => {
  auth.requireAdmin(ctx);
  q.run('UPDATE promos SET active = 0 WHERE code = ?', str(params.code, 24).toUpperCase());
  return { ok: true };
});

on('GET', '/api/admin/newsletter', async ({ ctx }) => {
  auth.requireAdmin(ctx);
  return { items: q.all('SELECT email, created_at FROM newsletter ORDER BY created_at DESC LIMIT 500') };
});

module.exports = { handleApi, SHIPPING_FLAT, FREE_SHIPPING_OVER };
