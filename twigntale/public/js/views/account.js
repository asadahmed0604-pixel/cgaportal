/* Account — orders, wishlist, profile. Aur alag se order tracking page. */

import { api } from '../api.js';
import { icons } from '../art.js';
import { el, els, esc, html, money, when, toast, bind, formValues, reveal } from '../ui.js';
import { state, logout, loadWishlist } from '../store.js';
import { productCard, emptyState } from './components.js';
import { navigate } from '../router.js';

const STATUS_TEXT = {
  placed: 'Mil gaya', confirmed: 'Tasdeeq ho gayi', packed: 'Pack ho gaya',
  shipped: 'Raste mein', delivered: 'Pahunch gaya', cancelled: 'Mansookh',
};

export const statusPill = (s) => `<span class="pill pill-${s}">${STATUS_TEXT[s] || s}</span>`;

export const account = {
  async render() {
    if (!state.user) {
      return `<div class="wrap section center">
        <h1>Pehle log in karein</h1>
        <p class="muted">Apne orders aur wishlist dekhne ke liye.</p>
        <button class="btn" id="openAuth">Log in / account banayein</button></div>`;
    }
    const u = state.user;
    return html`
    <div class="wrap section">
      <div class="row-between">
        <div>
          <span class="eyebrow">Account</span>
          <h1 style="margin-bottom:4px">Assalam-o-alaikum, ${esc(u.name.split(' ')[0])}</h1>
          <p class="muted">${esc(u.email)}</p>
        </div>
        <button class="btn btn-ghost btn-sm" id="logout">Log out</button>
      </div>

      <div class="tabs" style="margin-top:20px">
        <button class="active" data-tab="orders">Orders</button>
        <button data-tab="wish">Wishlist</button>
        <button data-tab="profile">Maloomat</button>
      </div>

      <div data-panel="orders"><div class="card" style="padding:20px">Load ho raha hai…</div></div>
      <div data-panel="wish" hidden><div class="grid grid-4" id="wishGrid"></div></div>
      <div data-panel="profile" hidden>
        <form id="profile" class="card" style="padding:24px;max-width:560px">
          <div class="field-row">
            <label class="field"><span>Naam</span><input name="name" value="${esc(u.name)}"></label>
            <label class="field"><span>WhatsApp</span><input name="phone" value="${esc(u.phone || '')}"></label>
          </div>
          <label class="field"><span>Pata</span><textarea name="address" style="min-height:70px">${esc(u.address || '')}</textarea></label>
          <div class="field-row">
            <label class="field"><span>Sheher</span><input name="city" value="${esc(u.city || '')}"></label>
            <label class="field"><span>Postal code</span><input name="postal" value="${esc(u.postal || '')}"></label>
          </div>
          <button class="btn" type="submit">Mehfooz karein</button>
        </form>
      </div>
    </div>`;
  },

  async mount(root) {
    bind(root, '#openAuth', 'click', () => document.dispatchEvent(new Event('auth:open')));
    if (!state.user) return;

    bind(root, '[data-tab]', 'click', (e, t) => {
      els('[data-tab]', root).forEach((b) => b.classList.toggle('active', b === t));
      els('[data-panel]', root).forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
    });

    bind(root, '#logout', 'click', async () => {
      await logout();
      toast('Log out ho gaye');
      navigate('/');
    });

    /* orders */
    try {
      const r = await api.get('/api/orders');
      el('[data-panel="orders"]', root).innerHTML = r.items.length ? `
        <div class="card table-wrap"><table>
          <thead><tr><th>Order</th><th>Tareekh</th><th>Cheezein</th><th>Kul</th><th>Haalat</th><th></th></tr></thead>
          <tbody>${r.items.map((o) => `
            <tr><td><b>${esc(o.code)}</b></td><td>${when(o.created_at)}</td><td>${o.item_count}</td>
              <td>${money(o.total)}</td><td>${statusPill(o.status)}</td>
              <td><a class="link-underline" href="/order/${esc(o.code)}">Dekhein</a></td></tr>`).join('')}
          </tbody></table></div>` :
        emptyState('Abhi koi order nahi', 'Pehla order dene ke baad yahan sab nazar aayega.',
          '<a class="btn" href="/shop" style="margin-top:14px">Dukan dekhein</a>');
    } catch (err) {
      el('[data-panel="orders"]', root).innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    }

    /* wishlist */
    try {
      const w = await api.get('/api/wishlist');
      await loadWishlist();
      el('#wishGrid', root).innerHTML = w.items.length ? w.items.map(productCard).join('') :
        emptyState('Wishlist khali hai', 'Dil wale nishan par click karke cheezein yahan mehfooz karein.');
      reveal(root);
    } catch { /* khamoshi se chhorh dein */ }

    /* profile */
    el('#profile', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        state.user = await api.patch('/api/me', formValues(e.target));
        toast('Maloomat mehfooz ho gayi');
      } catch (err) { toast(err.message, 'bad'); }
    });
  },
};

export const orderView = {
  async render(params) {
    let o;
    try { o = await api.get('/api/orders/' + encodeURIComponent(params.code)); }
    catch (err) {
      return `<div class="wrap section center"><h1>Order nahi mila</h1>
        <p class="muted">${esc(err.message)}</p><a class="btn" href="/shop">Dukan dekhein</a></div>`;
    }
    this._o = o;
    const done = o.flow.indexOf(o.status);
    return html`
    <div class="wrap-narrow section">
      <div class="center" style="margin-bottom:28px">
        <span style="color:var(--accent);display:inline-block">${icons.check}</span>
        <h1 style="margin:8px 0 4px">Shukriya!</h1>
        <p class="muted">Order <b>${esc(o.code)}</b> mil gaya hai — ${when(o.created_at)}</p>
        ${statusPill(o.status)}
      </div>

      <div class="card" style="padding:24px">
        <h3>Kahan tak pahuncha</h3>
        ${o.status === 'cancelled'
          ? '<p class="muted">Yeh order mansookh kar diya gaya hai.</p>'
          : `<ul class="timeline">${o.flow.map((s, i) => `
              <li class="${i < done ? 'done' : ''} ${i === done ? 'now' : ''}">
                <b>${STATUS_TEXT[s]}</b>
                <div class="faint">${esc((o.events.find((e) => e.status === s) || {}).created_at ? when(o.events.find((e) => e.status === s).created_at) : (i <= done ? '' : 'aage'))}</div>
              </li>`).join('')}</ul>`}
      </div>

      <div class="card" style="padding:24px;margin-top:18px">
        <h3>Samaan</h3>
        ${o.items.map((i) => `
          <div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line-soft)">
            <span>${esc(i.name)} <span class="faint">× ${i.qty}</span></span>
            <b>${money(i.price * i.qty)}</b></div>`).join('')}
        <div class="summary-row" style="margin-top:12px"><span>Samaan</span><b>${money(o.subtotal)}</b></div>
        ${o.discount ? `<div class="summary-row"><span>Discount ${o.promo_code ? `(${esc(o.promo_code)})` : ''}</span><b style="color:var(--accent)">− ${money(o.discount)}</b></div>` : ''}
        <div class="summary-row"><span>Delivery</span><b>${o.shipping ? money(o.shipping) : 'Free'}</b></div>
        <div class="summary-total"><span>Kul</span><span>${money(o.total)}</span></div>
      </div>

      <div class="card" style="padding:24px;margin-top:18px">
        <h3>Delivery</h3>
        <p class="muted" style="margin:0">${esc(o.name)} · ${esc(o.phone)}<br>${esc(o.address)}, ${esc(o.city)} ${esc(o.postal || '')}</p>
        <p class="faint" style="margin-top:10px">${o.payment_method === 'bank' ? 'Bank transfer — account ki tafseel WhatsApp par aayegi.' : 'Cash on delivery'}</p>
      </div>

      <div class="center" style="margin-top:26px">
        <a class="btn btn-ghost" href="/shop">Aur dekhein</a>
        ${state.user ? '<a class="btn btn-ghost" href="/account">Mere orders</a>' : ''}
      </div>
    </div>`;
  },
  async mount(root) { reveal(root); },
};
