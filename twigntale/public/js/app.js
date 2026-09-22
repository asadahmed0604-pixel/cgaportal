/* Twig n Tale — app shell: header, cart drawer, search, auth, routing. */

import { api } from './api.js';
import { icons } from './art.js';
import { el, els, esc, html, money, toast, bind, reveal, debounce, formValues, modal, closeModal } from './ui.js';
import * as store from './store.js';
import { state } from './store.js';
import { route, start, navigate } from './router.js';
import { artFor } from './views/components.js';

import home from './views/home.js';
import shop from './views/shop.js';
import product from './views/product.js';
import checkout from './views/checkout.js';
import admin from './views/admin.js';
import { account, orderView } from './views/account.js';
import { about, contact, notFound } from './views/pages.js';

/* ---------------- theme ---------------- */
const THEME_KEY = 'tnt-theme';
function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* private mode */ }
  const btn = el('#theme');
  if (btn) {
    btn.innerHTML = mode === 'dark' ? icons.sun : icons.moon;
    btn.setAttribute('aria-label', mode === 'dark' ? 'Roshni wala theme' : 'Andhera theme');
  }
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
}

/* ---------------- shell ---------------- */
const NAV = [['/', 'Ghar'], ['/shop', 'Dukan'], ['/about', 'Kahani'], ['/contact', 'Raabta']];

function shell() {
  document.body.insertAdjacentHTML('afterbegin', html`
  <a href="#view" class="btn btn-sm" style="position:absolute;left:-9999px"
     onfocus="this.style.left='12px';this.style.top='12px';this.style.zIndex='200'"
     onblur="this.style.left='-9999px'">Seedha content par jayein</a>

  <header class="header" id="header">
    <div class="wrap">
      <a class="brand" href="/">${icons.logo}<span>Twig n Tale<small>Handmade · Lahore</small></span></a>
      <nav class="nav" id="nav">${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
      <div class="header-actions">
        <button class="btn-icon" id="search" aria-label="Talash">${icons.search}</button>
        <button class="btn-icon" id="theme" aria-label="Theme">${icons.moon}</button>
        <button class="btn-icon" id="acct" aria-label="Account">${icons.user}</button>
        <button class="btn-icon" id="cartBtn" aria-label="Cart">${icons.cart}<span class="cart-count hide" id="cartCount">0</span></button>
        <button class="btn-icon menu-toggle" id="menu" aria-label="Menu" aria-expanded="false">${icons.menu}</button>
      </div>
    </div>
  </header>

  <main id="view"></main>

  <footer class="footer">
    <div class="wrap footer-grid">
      <div>
        <div class="brand" style="color:#fff">${icons.logo}<span>Twig n Tale</span></div>
        <p style="color:rgba(232,226,213,.7);font-size:.92rem;max-width:34ch;margin-top:12px">
          Chhote batch mein banayi gayi candles, ceramics aur sukhaye hue phool — Lahore se poore Pakistan tak.</p>
        <form class="newsletter-form" id="news">
          <input type="email" name="email" required placeholder="aapka@email.com" aria-label="Email">
          <button class="btn btn-clay btn-sm" type="submit">Join</button>
        </form>
      </div>
      <div><h4>Dukan</h4>${['candles', 'ceramics', 'florals', 'paper', 'gifting']
        .map((c) => `<a href="/shop?cat=${c}">${c[0].toUpperCase() + c.slice(1)}</a>`).join('')}</div>
      <div><h4>Madad</h4>
        <a href="/contact">Raabta</a><a href="/about">Hamari kahani</a>
        <a href="/account">Mera account</a><a href="/shop">Delivery & wapsi</a></div>
      <div><h4>Raabta</h4>
        <a href="tel:03029255003">0302 9255003</a>
        <a href="mailto:hello@twigntale.com">hello@twigntale.com</a>
        <span style="color:rgba(232,226,213,.6);font-size:.9rem;display:block;padding:4px 0">Roz 10:00 – 20:00</span></div>
    </div>
    <div class="wrap footer-bottom">
      <span>© ${new Date().getFullYear()} Twig n Tale · Har cheez haath se banti hai</span>
      <span>Cash on delivery · Bank transfer</span>
    </div>
  </footer>

  <div class="scrim" id="scrim"></div>

  <aside class="drawer" id="cart" aria-label="Cart" aria-hidden="true">
    <div class="drawer-head"><h3 style="margin:0">Aap ka cart</h3>
      <button class="btn-icon" data-close-cart aria-label="Band karein">${icons.x}</button></div>
    <div class="drawer-body" id="cartBody"></div>
    <div class="drawer-foot" id="cartFoot"></div>
  </aside>

  <div class="search-overlay" id="searchOverlay">
    <div class="search-panel">
      <input id="sq" type="search" placeholder="Kya dhoond rahe hain? candle, mug, phool…" aria-label="Talash">
      <div class="search-results" id="sr"></div>
    </div>
  </div>`);
}

/* ---------------- cart drawer ---------------- */
function paintCart() {
  const cart = state.cart;
  const count = el('#cartCount');
  if (count) {
    count.textContent = cart.count;
    count.classList.toggle('hide', !cart.count);
  }
  const body = el('#cartBody');
  if (!body) return;

  body.innerHTML = cart.items.length ? cart.items.map((i) => `
    <div class="cart-line" data-line="${i.id}">
      <a class="thumb" href="/product/${esc(i.slug)}">${artFor(i)}</a>
      <div>
        <a href="/product/${esc(i.slug)}"><b style="font-size:.94rem">${esc(i.name)}</b></a>
        <div class="faint">${money(i.price)} fi adad</div>
        <div class="qty" style="margin-top:6px">
          <button data-cstep="-1" data-id="${i.id}" data-qty="${i.qty}" aria-label="Kam">−</button>
          <span>${i.qty}</span>
          <button data-cstep="1" data-id="${i.id}" data-qty="${i.qty}" aria-label="Zyada">+</button>
        </div>
      </div>
      <div style="text-align:right">
        <b>${money(i.price * i.qty)}</b><br>
        <button class="btn-icon" data-remove="${i.id}" aria-label="Hatayein" style="width:32px;height:32px">${icons.trash}</button>
      </div>
    </div>`).join('') :
    `<div class="empty">${icons.cart}<h3>Cart khali hai</h3>
      <p>Abhi kuch pasand nahi kiya.</p><a class="btn" href="/shop" data-close-cart>Dukan dekhein</a></div>`;

  const left = Math.max(0, cart.freeShippingOver - cart.subtotal);
  el('#cartFoot').innerHTML = cart.items.length ? `
    ${left ? `<div class="faint" style="margin-bottom:10px">Rs ${left.toLocaleString('en-PK')} aur — phir delivery free.
      <span style="display:block;height:5px;border-radius:3px;background:var(--line);margin-top:6px;overflow:hidden">
        <span style="display:block;height:100%;width:${Math.min(100, (cart.subtotal / cart.freeShippingOver) * 100)}%;background:var(--accent);transition:width .5s"></span></span></div>`
      : '<div class="note ok" style="margin-bottom:10px">Delivery free hai 🌿</div>'}
    <div class="summary-row"><span>Samaan</span><b>${money(cart.subtotal)}</b></div>
    <div class="summary-row"><span>Delivery</span><b>${cart.shipping ? money(cart.shipping) : 'Free'}</b></div>
    <div class="summary-total"><span>Kul</span><span>${money(cart.total)}</span></div>
    <a class="btn btn-block" href="/checkout" data-close-cart style="margin-top:14px">Checkout ${icons.arrow}</a>` : '';
}

function openCart(open = true) {
  el('#cart').classList.toggle('open', open);
  el('#cart').setAttribute('aria-hidden', String(!open));
  el('#scrim').classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

/* ---------------- search overlay ---------------- */
function openSearch(open = true) {
  const o = el('#searchOverlay');
  o.classList.toggle('open', open);
  el('#scrim').classList.toggle('open', open);
  if (open) { el('#sq').focus(); el('#sq').select(); }
  else { el('#sr').innerHTML = ''; }
  document.body.style.overflow = open ? 'hidden' : '';
}

function wireSearch() {
  const input = el('#sq');
  const results = el('#sr');
  let items = [], active = -1;

  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = '<p class="faint" style="padding:16px 20px">Kam az kam do harf likhein…</p>'; items = []; return; }
    try {
      const r = await api.get('/api/products', { q, limit: 6 });
      items = r.items;
      active = -1;
      results.innerHTML = items.length ? items.map((p, i) => `
        <button class="search-item" data-si="${i}">
          <span class="thumb">${artFor(p)}</span>
          <span><b>${esc(p.name)}</b><br><span class="faint">${esc(p.category ? p.category.name : '')}</span></span>
          <span>${money(p.price)}</span>
        </button>`).join('') + `<button class="search-item" data-all><span></span><span><b>Sab nataij dekhein</b></span><span>${icons.arrow}</span></button>`
        : '<p class="faint" style="padding:16px 20px">Kuch nahi mila.</p>';
    } catch { results.innerHTML = '<p class="faint" style="padding:16px 20px">Talash nahi ho saki.</p>'; }
  }, 240);

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    const nodes = els('[data-si]', results);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, Math.min(nodes.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      nodes.forEach((n, i) => n.classList.toggle('active', i === active));
      nodes[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) { navigate('/product/' + items[active].slug); openSearch(false); }
      else { navigate('/shop?q=' + encodeURIComponent(input.value.trim())); openSearch(false); }
    }
  });
  bind(results, '[data-si]', 'click', (e, t) => { navigate('/product/' + items[+t.dataset.si].slug); openSearch(false); });
  bind(results, '[data-all]', 'click', () => { navigate('/shop?q=' + encodeURIComponent(input.value.trim())); openSearch(false); });
}

/* ---------------- auth modal ---------------- */
function authModal(mode = 'login') {
  const isLogin = mode === 'login';
  modal(`
    <h2 style="margin-bottom:6px">${isLogin ? 'Wapas khush aamdeed' : 'Account banayein'}</h2>
    <p class="muted">${isLogin ? 'Orders aur wishlist dekhne ke liye log in karein.' : 'Aik minute ka kaam hai.'}</p>
    <form id="authForm">
      ${isLogin ? '' : '<label class="field"><span>Poora naam</span><input name="name" required></label>'}
      <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email"></label>
      ${isLogin ? '' : '<label class="field"><span>WhatsApp number</span><input name="phone" placeholder="03XX XXXXXXX"></label>'}
      <label class="field"><span>Password</span><input type="password" name="password" required minlength="6"
        autocomplete="${isLogin ? 'current-password' : 'new-password'}"></label>
      <div id="authErr"></div>
      <button class="btn btn-block" type="submit">${isLogin ? 'Log in' : 'Account banayein'}</button>
    </form>
    <p class="center" style="margin:16px 0 0">
      ${isLogin ? 'Naye hain?' : 'Pehle se account hai?'}
      <button class="link-underline" data-swap="${isLogin ? 'register' : 'login'}">${isLogin ? 'Account banayein' : 'Log in karein'}</button>
    </p>`, {
    onMount(m) {
      bind(m, '[data-swap]', 'click', (e, t) => authModal(t.dataset.swap));
      el('#authForm', m).onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          const user = await store.login(formValues(e.target), mode);
          closeModal();
          toast(`Khush aamdeed, ${user.name.split(' ')[0]}`);
          if (user.role === 'admin') navigate('/admin');
        } catch (err) {
          el('#authErr', m).innerHTML = `<div class="note" style="margin-bottom:12px">${esc(err.message)}</div>`;
          btn.disabled = false;
        }
      };
    },
  });
}

/* ---------------- routing ---------------- */
const VIEWS = [
  ['/', home], ['/shop', shop], ['/product/:slug', product], ['/checkout', checkout],
  ['/order/:code', orderView], ['/account', account], ['/admin', admin],
  ['/about', about], ['/contact', contact],
];
VIEWS.forEach(([p, v]) => route(p, v));

let currentView = null;
async function renderRoute(found, pathname) {
  const view = el('#view');
  if (currentView) view.dispatchEvent(new Event('view:unmount'));
  const target = found ? found.view : notFound;
  currentView = target;

  view.style.opacity = '0';
  let markup;
  try { markup = await target.render(found ? found.params : {}); }
  catch (err) { markup = `<div class="wrap section center"><h1>Kuch ghalat ho gaya</h1><p class="muted">${esc(err.message)}</p></div>`; }
  view.innerHTML = markup;
  view.style.transition = 'opacity .28s ease';
  requestAnimationFrame(() => { view.style.opacity = '1'; });

  els('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === pathname));
  el('#nav').classList.remove('open');
  el('#menu').setAttribute('aria-expanded', 'false');

  try { await target.mount?.(view, found ? found.params : {}); } catch (err) { console.error(err); }
  reveal(view);
  if (!location.hash) scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
}

/* ---------------- boot ---------------- */
async function main() {
  shell();
  initTheme();
  wireSearch();

  el('#theme').addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  el('#menu').addEventListener('click', (e) => {
    const open = el('#nav').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  el('#cartBtn').addEventListener('click', () => openCart(true));
  el('#search').addEventListener('click', () => openSearch(true));
  el('#acct').addEventListener('click', () => {
    if (!state.user) authModal('login');
    else navigate(state.user.role === 'admin' ? '/admin' : '/account');
  });
  el('#scrim').addEventListener('click', () => { openCart(false); openSearch(false); });
  bind(document.body, '[data-close-cart]', 'click', () => openCart(false));

  el('#news').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/newsletter', formValues(e.target));
      e.target.reset();
      toast('Shukriya! Ab aap list mein hain');
    } catch (err) { toast(err.message, 'bad'); }
  });

  addEventListener('scroll', () => {
    el('#header').classList.toggle('scrolled', scrollY > 8);
  }, { passive: true });

  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(true); }
    if (e.key === 'Escape') { openCart(false); openSearch(false); }
  });

  /* poore app mein product cards ke buttons */
  bind(document.body, '[data-add]', 'click', async (e, t) => {
    e.preventDefault();
    t.disabled = true;
    try {
      await store.addToCart(+t.dataset.add, 1);
      el('#cartCount').classList.add('bump');
      setTimeout(() => el('#cartCount').classList.remove('bump'), 500);
      toast('Cart mein daal diya');
    } catch (err) { toast(err.message, 'bad'); }
    finally { t.disabled = false; }
  });

  bind(document.body, '[data-wish]', 'click', async (e, t) => {
    e.preventDefault();
    if (!state.user) { authModal('login'); return; }
    try {
      const saved = await store.toggleWish(+t.dataset.wish);
      t.classList.toggle('on', saved);
      t.setAttribute('aria-pressed', String(saved));
    } catch (err) { toast(err.message, 'bad'); }
  });

  bind(document.body, '[data-cstep]', 'click', async (e, t) => {
    const next = Number(t.dataset.qty) + Number(t.dataset.cstep);
    try { await store.setQty(+t.dataset.id, Math.max(0, next)); }
    catch (err) { toast(err.message, 'bad'); }
  });
  bind(document.body, '[data-remove]', 'click', async (e, t) => {
    try { await store.removeItem(+t.dataset.remove); toast('Hata diya'); }
    catch (err) { toast(err.message, 'bad'); }
  });

  document.addEventListener('auth:open', () => authModal('login'));
  document.addEventListener('cart:open', () => openCart(true));

  store.subscribe(paintCart);
  await store.boot();
  paintCart();
  start(renderRoute);
}

main();
