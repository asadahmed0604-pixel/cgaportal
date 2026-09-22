/* Checkout — teen qadam, sticky summary, promo code. */

import { api } from '../api.js';
import { icons } from '../art.js';
import { el, els, esc, html, money, toast, bind, formValues, reveal } from '../ui.js';
import { state, refreshCart } from '../store.js';
import { artFor } from './components.js';
import { navigate } from '../router.js';

const STEPS = ['Pata', 'Adayegi', 'Nazar-e-sani'];

export default {
  async render() {
    await refreshCart();
    const cart = state.cart;
    if (!cart.items.length) {
      return `<div class="wrap section center">
        <h1>Cart khali hai</h1>
        <p class="muted">Pehle kuch pasand kar lein, phir yahan wapas aayein.</p>
        <a class="btn" href="/shop">Dukan dekhein</a></div>`;
    }
    const u = state.user || {};
    return html`
    <div class="wrap section">
      <span class="eyebrow">Checkout</span>
      <h1>Order mukammal karein</h1>
      ${state.user ? '' : `<p class="muted">Mehmaan ke tor par bhi order kar sakte hain —
        ya <button class="link-underline" id="loginLink">log in karein</button> taake order mehfooz rahe.</p>`}

      <div class="checkout" style="margin-top:26px">
        <div>
          <div class="steps">${STEPS.map((s, i) => `<div class="step ${i === 0 ? 'on' : ''}" data-step="${i}">${i + 1}. ${s}</div>`).join('')}</div>

          <form id="co">
            <section data-pane="0">
              <div class="field-row">
                <label class="field"><span>Poora naam *</span><input name="name" required value="${esc(u.name || '')}"></label>
                <label class="field"><span>WhatsApp number *</span><input name="phone" required placeholder="03XX XXXXXXX" value="${esc(u.phone || '')}"></label>
              </div>
              <label class="field"><span>Email</span><input type="email" name="email" value="${esc(u.email || '')}" placeholder="order ki tafseel yahan bhejenge"></label>
              <label class="field"><span>Poora pata *</span><textarea name="address" required style="min-height:80px" placeholder="Ghar/flat, gali, ilaqa">${esc(u.address || '')}</textarea></label>
              <div class="field-row">
                <label class="field"><span>Sheher *</span><input name="city" required value="${esc(u.city || '')}"></label>
                <label class="field"><span>Postal code</span><input name="postal" value="${esc(u.postal || '')}"></label>
              </div>
              <label class="field"><span>Koi hidayat? (optional)</span><input name="notes" placeholder="Jaise: shaam ko dein, ya gift card par yeh likhein"></label>
              <button class="btn btn-block" type="button" data-next="1">Aage barhein ${icons.arrow}</button>
            </section>

            <section data-pane="1" hidden>
              <label class="pay-option on">
                <input type="radio" name="paymentMethod" value="cod" checked>
                <span><b>Cash on delivery</b><br><span class="muted">Courier ko samaan milte waqt paisay dein. Poore Pakistan mein.</span></span>
              </label>
              <label class="pay-option">
                <input type="radio" name="paymentMethod" value="bank">
                <span><b>Bank transfer</b><br><span class="muted">Order ke baad WhatsApp par account number bhej denge. Transfer ke baad order pack ho jata hai.</span></span>
              </label>
              <div class="row" style="margin-top:18px">
                <button class="btn btn-ghost" type="button" data-next="0">Peeche</button>
                <button class="btn grow" type="button" data-next="2">Aage barhein ${icons.arrow}</button>
              </div>
            </section>

            <section data-pane="2" hidden>
              <div class="card" style="padding:18px;margin-bottom:16px">
                <h3>Aap ka pata</h3>
                <p class="muted" id="reviewAddr" style="margin:0"></p>
              </div>
              <div class="card" style="padding:18px;margin-bottom:16px">
                <h3>Adayegi</h3>
                <p class="muted" id="reviewPay" style="margin:0"></p>
              </div>
              <div class="row">
                <button class="btn btn-ghost" type="button" data-next="1">Peeche</button>
                <button class="btn grow" type="submit" id="place">Order dein · <span id="finalTotal">${money(cart.total)}</span></button>
              </div>
              <p class="faint center" style="margin-top:12px">Order dete hi WhatsApp par tasdeeq aa jayegi.</p>
            </section>
          </form>
        </div>

        <aside class="card summary">
          <h3>Aap ka order</h3>
          <div id="lines">
            ${cart.items.map((i) => `
              <div class="row" style="padding:8px 0">
                <span class="thumb" style="width:46px;height:50px;border-radius:8px;overflow:hidden;flex:none">${artFor(i)}</span>
                <span class="grow"><b style="font-size:.9rem">${esc(i.name)}</b><br><span class="faint">${i.qty} × ${money(i.price)}</span></span>
                <span>${money(i.price * i.qty)}</span>
              </div>`).join('')}
          </div>
          <div class="row" style="margin:14px 0">
            <input id="promo" placeholder="Promo code" style="text-transform:uppercase" aria-label="Promo code">
            <button class="btn btn-ghost btn-sm" id="applyPromo" type="button">Lagayein</button>
          </div>
          <div id="promoNote"></div>
          <div class="summary-row"><span>Samaan</span><b id="sSub">${money(cart.subtotal)}</b></div>
          <div class="summary-row hide" id="sDiscRow"><span>Discount</span><b id="sDisc" style="color:var(--accent)"></b></div>
          <div class="summary-row"><span>Delivery</span><b id="sShip">${cart.shipping ? money(cart.shipping) : 'Free'}</b></div>
          <div class="summary-total"><span>Kul</span><span id="sTotal">${money(cart.total)}</span></div>
          <p class="faint" style="margin-top:12px">${cart.subtotal >= cart.freeShippingOver
            ? 'Delivery free hai 🌿'
            : `Rs ${(cart.freeShippingOver - cart.subtotal).toLocaleString('en-PK')} aur — phir delivery free.`}</p>
        </aside>
      </div>
    </div>`;
  },

  async mount(root) {
    const form = el('#co', root);
    if (!form) return;
    let promo = null;
    let step = 0;

    const totals = () => {
      const cart = state.cart;
      const discount = promo ? promo.discount : 0;
      const shipping = cart.subtotal - discount >= cart.freeShippingOver ? 0 : state.catalog.shipping.flat;
      return { discount, shipping, total: Math.max(0, cart.subtotal - discount + shipping) };
    };

    const paint = () => {
      const t = totals();
      el('#sDiscRow', root).classList.toggle('hide', !t.discount);
      el('#sDisc', root).textContent = '− ' + money(t.discount);
      el('#sShip', root).textContent = t.shipping ? money(t.shipping) : 'Free';
      el('#sTotal', root).textContent = money(t.total);
      el('#finalTotal', root).textContent = money(t.total);
    };

    const goto = (n) => {
      const pane = els('[data-pane]', root)[n];
      if (n > step) {
        /* aage jaane se pehle mojooda pane ki validation */
        const fields = els(`[data-pane="${step}"] [required]`, root);
        for (const f of fields) {
          if (!f.reportValidity()) return;
        }
      }
      step = n;
      els('[data-pane]', root).forEach((p, i) => { p.hidden = i !== n; });
      els('.step', root).forEach((s, i) => {
        s.classList.toggle('on', i === n);
        s.classList.toggle('done', i < n);
      });
      if (n === 2) {
        const v = formValues(form);
        el('#reviewAddr', root).textContent = `${v.name} · ${v.phone}\n${v.address}, ${v.city} ${v.postal || ''}`.trim();
        el('#reviewPay', root).textContent = v.paymentMethod === 'bank' ? 'Bank transfer' : 'Cash on delivery';
      }
      pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    bind(root, '[data-next]', 'click', (e, t) => goto(+t.dataset.next));
    bind(root, '.step', 'click', (e, t) => goto(+t.dataset.step));
    bind(root, '.pay-option', 'click', (e, t) => {
      els('.pay-option', root).forEach((o) => o.classList.toggle('on', o === t));
    });
    bind(root, '#loginLink', 'click', () => document.dispatchEvent(new Event('auth:open')));

    el('#applyPromo', root).addEventListener('click', async () => {
      const code = el('#promo', root).value.trim();
      const note = el('#promoNote', root);
      if (!code) return;
      try {
        promo = await api.post('/api/promo/check', { code });
        note.innerHTML = `<div class="note ok" style="margin-bottom:10px">${esc(promo.code)} lag gaya — ${money(promo.discount)} kam.</div>`;
        paint();
      } catch (err) {
        promo = null;
        note.innerHTML = `<div class="note" style="margin-bottom:10px">${esc(err.message)}</div>`;
        paint();
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = el('#place', root);
      btn.disabled = true;
      try {
        const v = formValues(form);
        const r = await api.post('/api/orders', { ...v, promoCode: promo ? promo.code : '' });
        await refreshCart();
        navigate('/order/' + r.code);
      } catch (err) {
        toast(err.message, 'bad');
        btn.disabled = false;
      }
    });

    paint();
    reveal(root);
  },
};
