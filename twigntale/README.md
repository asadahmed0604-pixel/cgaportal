# Twig n Tale

Handmade candles, ceramics aur dried florals ke liye poora online store —
storefront, cart, checkout, customer account aur admin console, sab aik hi app mein.

**Koi dependency nahi.** `npm install` ki zaroorat nahi, koi native build nahi, koi CDN nahi.
Sirf Node chahiye (22.5 ya us se naya — `node:sqlite` ke liye).

```bash
npm run seed     # sirf pehli baar — sample products aur do accounts banata hai
npm start        # http://localhost:3000
```

Seed ke baad:

| Role     | Email                  | Password   |
|----------|------------------------|------------|
| Admin    | admin@twigntale.com    | twig2026   |
| Customer | demo@twigntale.com     | demo1234   |

Promo codes: `WELCOME10` (10% off, Rs 3,000+), `FREESHIP` (Rs 250 off, Rs 2,500+), `TWIG500` (Rs 500 off, Rs 6,000+).

> **Pehla kaam:** live karne se pehle admin ka password badal lein (ya `server/seed.js`
> mein apna email/password likh kar `npm run reseed` chalayein).

---

## 1. Customer kya kar sakta hai

- **Home** — animated hero, categories, featured products, kahani, testimonials
- **Shop** — live search, category chips, qeemat ki range, sort, "sirf stock wali",
  "aur dikhayein"; har filter URL mein chala jata hai (link share ho sakta hai)
- **Product** — 4 artwork variants, qty stepper, tabs (tafseel / maloomat / delivery / reviews),
  related products, wishlist
- **Cart drawer** — qty badalna, hatana, "free delivery tak kitna baqi hai" ka progress bar
- **Checkout** — teen qadam (pata → adayegi → nazar-e-sani), promo code, COD ya bank transfer.
  Mehmaan bhi order kar sakta hai — login zaroori nahi.
- **Order page** — order number, status timeline, poori tafseel. Mehmaan ka order bhi
  usi browser mein khulta hai (guest token cookie se).
- **Account** — orders, wishlist, apni maloomat
- **Reviews** — sirf wahi log likh sakte hain jinhon ne woh cheez khareedi ho
- **Dark mode**, Cmd/Ctrl + K se talash, keyboard se chalne wale modals aur drawer

## 2. Admin console (`/admin`)

- **Dashboard** — aamdani, orders, customers, 14 din ka revenue chart (hover + table view),
  sab se zyada bikne wali cheezein, kam hota hua stock
- **Products** — banayein, badlein, chhupayein; qeemat, stock, featured, artwork ka rang aur shakal
- **Orders** — haalat badlein (placed → confirmed → packed → shipped → delivered / cancelled).
  Cancel karne par stock wapas add ho jata hai.
- **Customers**, **Promo codes**, **Newsletter** ki list

## 3. Tasveerein kahan se aati hain

Koi tasveer file nahi hai. Har product ka artwork uske `slug` se **generate** hota hai
(`public/js/art.js`) — wahi slug hamesha wahi artwork banata hai. Apni asli tasveer lagani ho
to admin mein product ke "tasveer ka link" wale khaane mein URL daal dein, artwork ki jagah
wohi lag jayegi.

## 4. Live karna

```bash
NODE_ENV=production PORT=3000 npm start
```

Nginx / cPanel se apne domain ko is port par proxy karein aur SSL laga dein.
`NODE_ENV=production` par login cookie sirf HTTPS par chalti hai.

Backup mein sirf `data/` folder chahiye — poora database wahi hai.

Environment variables: `PORT` (default 3000), `DATA_DIR` (default `./data`).

## 5. Code kahan hai

```
server/
  server.js   HTTP server, static files, SPA fallback
  api.js      poora REST API (auth, catalog, cart, orders, admin)
  db.js       SQLite schema + migrations
  auth.js     scrypt passwords, cookie sessions
  util.js     JSON body, cookies, validation
  seed.js     sample data
public/
  index.html  aik hi safha — baqi sab client-side router chalata hai
  css/app.css design tokens + components (light aur dark)
  js/
    app.js       header, footer, cart drawer, search, auth modal, routing
    api.js       fetch wrapper      store.js  client state
    router.js    history router     art.js    procedural SVG artwork + icons
    ui.js        toast, modal, reveal, formatting
    views/       home, shop, product, checkout, account, admin, pages
```

Database SQLite hai (`node:sqlite`). Agar kabhi `better-sqlite3` par jana ho to sirf
`server/db.js` ki pehli lines badalni hain — baqi code `q.get / q.all / q.run` ke peeche hai.

---

Twig n Tale · 0302 9255003 · hello@twigntale.com
