'use strict';
/* Pehli baar chalane ke liye: categories, products, promo codes aur do demo accounts. */

const { q, now } = require('./db');
const { hashPassword } = require('./auth');

const FORCE = process.argv.includes('--force');

const CATEGORIES = [
  ['candles', 'Candles', 'Soy wax, haath se dhalay hue', 1],
  ['ceramics', 'Ceramics', 'Chaak par banaye gaye mug aur bowls', 2],
  ['florals', 'Dried Florals', 'Sukhaye hue phool jo mahine chalte hain', 3],
  ['paper', 'Paper & Ink', 'Stationery, cards aur prints', 4],
  ['gifting', 'Gift Sets', 'Bandhe bandhaye tohfe', 5],
];

const PRODUCTS = [
  ['candles', 'Cedar & Smoke Candle', 3400, 4200, 24, 'leaf', 148,
    'Cedarwood, halki smoke aur vetiver — sardi ki shaam wali khushbu.',
    'Soy wax, cotton baati, 45 ghante ki roshni. Haath se dhaali gayi har candle apne shaishe ke jar mein aati hai — jal jaane ke baad jar ko brush holder bana lein.',
    ['Wax: 100% soy', 'Jalne ka waqt: ~45 ghante', 'Wazan: 220g', 'Khushbu: cedar, smoke, vetiver'], 1],
  ['candles', 'Jasmine Night Candle', 3200, null, 18, 'bloom', 300,
    'Raat ki rani aur sandalwood — Lahore ke aangan wali yaad.',
    'Raat ki rani ki asli khushbu ko sandalwood ke saath balance kiya gaya hai. Bedroom ke liye behtareen.',
    ['Wax: 100% soy', 'Jalne ka waqt: ~40 ghante', 'Wazan: 200g'], 1],
  ['candles', 'Orchard Tin Trio', 5900, 7200, 12, 'berry', 12,
    'Teen chhoti candles — peach, fig aur bergamot.',
    'Safar ke liye tin jars mein teen chhoti candles. Tohfe ke liye tayyar box mein aati hain.',
    ['3 x 90g tins', 'Jalne ka waqt: ~15 ghante fi tin'], 0],
  ['ceramics', 'Speckled Clay Mug', 2600, null, 30, 'wave', 28,
    'Chaak par banaya gaya mug — har aik thora sa alag.',
    'Stoneware clay, matte speckled glaze, andar se food-safe. Microwave aur dishwasher dono theek hain.',
    ['Capacity: 300ml', 'Stoneware, lead-free glaze', 'Dishwasher safe'], 1],
  ['ceramics', 'Olive Ripple Bowl', 3900, 4600, 14, 'wave', 90,
    'Salad ya fruit ke liye gehra bowl, zaitooni glaze.',
    'Haath se banaya gaya ripple pattern — do bowls kabhi bilkul aik jaise nahi hote.',
    ['Diameter: 20cm', 'Stoneware', 'Oven safe 180°C tak'], 0],
  ['ceramics', 'Pebble Vase', 4500, null, 9, 'leaf', 168,
    'Chhoti vase jo dried stems ke liye bani hai.',
    'Gol pebble shape, matte cream glaze. Hamare dried bunches ke saath perfect jodi.',
    ['Height: 16cm', 'Watertight'], 1],
  ['ceramics', 'Breakfast Plate Set', 7800, 9500, 7, 'wave', 40,
    'Chaar plates, ek jaisi mitti, alag alag rang.',
    'Rozana istemal ke liye mazboot stoneware plates ka set.',
    ['4 plates, 22cm', 'Dishwasher safe'], 0],
  ['florals', 'Wild Meadow Bunch', 4200, null, 16, 'fern', 60,
    'Sukhaye hue grasses aur bunny tails ka gucha.',
    'Paani ki zaroorat nahi — saal bhar wahi rehta hai. Dhoop se door rakhein taake rang na urhe.',
    ['Height: ~50cm', 'Natural dried stems', 'Paani nahi chahiye'], 1],
  ['florals', 'Preserved Eucalyptus', 3600, 4200, 21, 'fern', 130,
    'Asli eucalyptus, preserved — narm aur khushboodar.',
    'Glycerine se preserve ki gayi shakhein, mahine tak narm rehti hain.',
    ['Height: ~45cm', 'Preserved, dried nahi'], 0],
  ['florals', 'Pampas Cloud', 5400, null, 11, 'fern', 45,
    'Teen bare pampas plumes — kamre ka kona bhar dete hain.',
    'Halka sa hairspray karein to jhadna kam ho jata hai.',
    ['Height: ~90cm', '3 stems'], 1],
  ['paper', 'Letterpress Card Set', 1800, null, 40, 'bloom', 340,
    'Chhe cards, cotton paper par letterpress.',
    'Khali andar se — shukriya, salgirah, ya bas "yaad aaye". Envelopes shamil hain.',
    ['6 cards + envelopes', '300gsm cotton paper'], 0],
  ['paper', 'Botanical Print — Fern', 2900, 3500, 25, 'fern', 155,
    'A3 art print, matte archival paper par.',
    'Hamari apni fern illustration, archival ink se chhapi. Frame shamil nahi.',
    ['Size: A3 (30x42cm)', 'Archival matte 250gsm'], 1],
  ['paper', 'Linen Notebook', 2400, null, 33, 'leaf', 200,
    'Kapre ki jild wali notebook, 160 sade safhe.',
    'Lay-flat binding — likhte waqt safhe khud khule rehte hain.',
    ['160 pages, 100gsm', 'A5, lay-flat binding'], 0],
  ['paper', 'Seed Paper Tags', 1200, null, 50, 'berry', 100,
    'Tohfe ke tags jo baad mein boye ja sakte hain.',
    'Har tag mein basil ke beej hain — mitti mein daalein, paani dein, ug jayega.',
    ['10 tags + jute string', 'Basil seeds'], 0],
  ['gifting', 'The Slow Evening Box', 8900, 11000, 10, 'bloom', 20,
    'Candle, mug aur notebook — sab aik box mein.',
    'Hamara sab se maqbool tohfa: Cedar & Smoke candle, Speckled mug aur Linen notebook, tissue paper aur haath se likhe card ke saath.',
    ['3 cheezein', 'Gift box + card shamil', 'Card par apna paighaam likhwayein'], 1],
  ['gifting', 'Housewarming Basket', 12500, 15000, 6, 'leaf', 160,
    'Naye ghar ke liye: bowl, candle, florals.',
    'Olive Ripple Bowl, Jasmine Night candle aur Wild Meadow bunch — seagrass basket mein.',
    ['3 cheezein + basket', 'Free delivery'], 1],
  ['gifting', 'Desk Reset Kit', 5600, null, 15, 'wave', 210,
    'Mug, notebook aur seed paper tags.',
    'Kaam ki meaz ko thora insaani banane ke liye chhota sa set.',
    ['3 cheezein', 'Gift box shamil'], 0],
  ['gifting', 'Mini Thank You Set', 3200, 3800, 20, 'berry', 350,
    'Chhoti candle aur cards — halka sa shukriya.',
    'Un logon ke liye jinhe bara tohfa dena ajeeb lage.',
    ['Mini tin candle + 3 cards'], 0],
];

const PROMOS = [
  ['WELCOME10', 'percent', 10, 3000, null, null],
  ['FREESHIP', 'flat', 250, 2500, 500, null],
  ['TWIG500', 'flat', 500, 6000, 200, null],
];

function seed() {
  const existing = q.get('SELECT COUNT(*) AS n FROM products').n;
  if (existing > 0 && !FORCE) {
    console.log(`Pehle se ${existing} products maujood hain. Dobara bharne ke liye: npm run seed -- --force`);
    return;
  }
  if (FORCE) {
    for (const t of ['order_events', 'order_items', 'orders', 'cart_items', 'wishlist', 'reviews', 'products', 'categories', 'promos']) {
      q.run(`DELETE FROM ${t}`);
    }
  }

  for (const [slug, name, tagline, sort] of CATEGORIES) {
    q.run('INSERT INTO categories (slug, name, tagline, sort) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING',
      slug, name, tagline, sort);
  }

  const catId = {};
  for (const c of q.all('SELECT id, slug FROM categories')) catId[c.slug] = c.id;

  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let daysAgo = PRODUCTS.length;
  for (const [cat, name, price, compare, stock, motif, hue, short, desc, details, featured] of PRODUCTS) {
    const created = new Date(Date.now() - daysAgo-- * 864e5).toISOString();
    q.run(`INSERT INTO products (slug, name, category_id, price, compare_at, stock, short_desc, description,
             details, motif, hue, featured, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(slug) DO NOTHING`,
      slugify(name), name, catId[cat] || null, price, compare, stock, short, desc,
      JSON.stringify(details), motif, hue, featured, created);
  }

  for (const [code, kind, value, min, maxUses, expires] of PROMOS) {
    q.run(`INSERT INTO promos (code, kind, value, min_subtotal, max_uses, active, expires_at)
           VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(code) DO NOTHING`, code, kind, value, min, maxUses, expires);
  }

  const accounts = [
    ['Twig n Tale Admin', 'admin@twigntale.com', 'twig2026', 'admin'],
    ['Demo Customer', 'demo@twigntale.com', 'demo1234', 'customer'],
  ];
  for (const [name, email, password, role] of accounts) {
    if (q.get('SELECT id FROM users WHERE email = ?', email)) continue;
    q.run('INSERT INTO users (name, email, phone, password_hash, role, city, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      name, email, '0300 0000000', hashPassword(password), role, 'Lahore', now());
  }

  /* Demo customer ka aik mukammal order — taake dashboard aur reviews khali na lagein */
  const demo = q.get("SELECT id, name, email FROM users WHERE email = 'demo@twigntale.com'");
  if (demo && !q.get('SELECT id FROM orders WHERE user_id = ?', demo.id)) {
    const picks = q.all('SELECT id, name, slug, price FROM products ORDER BY id LIMIT 2');
    const subtotal = picks.reduce((s, p) => s + p.price, 0);
    const info = q.run(`INSERT INTO orders (code, user_id, status, subtotal, discount, shipping, total, payment_method,
        name, phone, email, address, city, postal, created_at)
        VALUES ('TNT-DEMO01', ?, 'delivered', ?, 0, 0, ?, 'cod', ?, '0300 0000000', ?, '12 Gulberg III', 'Lahore', '54000', ?)`,
      demo.id, subtotal, subtotal, demo.name, demo.email, new Date(Date.now() - 9 * 864e5).toISOString());
    const orderId = Number(info.lastInsertRowid);
    for (const p of picks) {
      q.run('INSERT INTO order_items (order_id, product_id, name, slug, price, qty) VALUES (?, ?, ?, ?, ?, 1)',
        orderId, p.id, p.name, p.slug, p.price);
    }
    ['placed', 'confirmed', 'packed', 'shipped', 'delivered'].forEach((status, i) => {
      q.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, ?)',
        orderId, status, null, new Date(Date.now() - (9 - i * 2) * 864e5).toISOString());
    });
    q.run(`INSERT INTO reviews (product_id, user_id, rating, title, body, created_at) VALUES (?, ?, 5, ?, ?, ?)
           ON CONFLICT(product_id, user_id) DO NOTHING`,
      picks[0].id, demo.id, 'Khushbu kamaal hai', 'Poora kamra bhar jata hai, dhuan bhi nahi. Dobara loonga.',
      new Date(Date.now() - 3 * 864e5).toISOString());
  }

  console.log('Seed mukammal.');
  console.log('  Admin    : admin@twigntale.com / twig2026');
  console.log('  Customer : demo@twigntale.com / demo1234');
  console.log('  Promo    : WELCOME10, FREESHIP, TWIG500');
}

seed();
