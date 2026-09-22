/* Product page — gallery, qty, tabs, reviews, related. */

import { api } from '../api.js';
import { icons } from '../art.js';
import { el, els, esc, html, money, reveal, stars, when, toast, bind, formValues, modal, closeModal } from '../ui.js';
import { state, addToCart, toggleWish } from '../store.js';
import { artFor, productCard } from './components.js';

function reviewsList(reviews) {
  if (!reviews.length) return '<p class="muted">Abhi tak koi review nahi — pehle aap likhein.</p>';
  return reviews.map((r) => `
    <div class="review">
      <div class="row-between"><b>${esc(r.author)}</b><span class="faint">${when(r.created_at)}</span></div>
      ${stars(r.rating)}
      ${r.title ? `<h3 style="font-size:1rem;margin:6px 0 2px">${esc(r.title)}</h3>` : ''}
      <p class="muted" style="margin:0">${esc(r.body || '')}</p>
    </div>`).join('');
}

export default {
  async render(params) {
    let data;
    try { data = await api.get('/api/products/' + encodeURIComponent(params.slug)); }
    catch { return `<div class="wrap section center"><h1>Yeh cheez nahi mili</h1>
      <p class="muted">Shayad hat chuki hai.</p><a class="btn" href="/shop">Dukan dekhein</a></div>`; }

    const p = data.product;
    this._data = data;
    const saved = state.wishlist.has(p.id);
    const off = p.compareAt && p.compareAt > p.price ? Math.round(((p.compareAt - p.price) / p.compareAt) * 100) : 0;

    return html`
    <div class="wrap">
      <nav class="faint" style="padding-top:18px">
        <a href="/">Ghar</a> · <a href="/shop">Dukan</a>
        ${p.category ? ` · <a href="/shop?cat=${esc(p.category.slug)}">${esc(p.category.name)}</a>` : ''}
      </nav>

      <div class="pdp">
        <div class="pdp-art">
          <div class="pdp-main card" id="mainArt">${artFor(p, 0)}</div>
          <div class="pdp-thumbs">
            ${[0, 1, 2, 3].map((v) => `<button data-variant="${v}" class="${v ? '' : 'active'}" aria-label="Tasveer ${v + 1}">${artFor(p, v)}</button>`).join('')}
          </div>
        </div>

        <div>
          ${p.category ? `<span class="eyebrow">${esc(p.category.name)}</span>` : ''}
          <h1 style="font-size:clamp(1.9rem,4vw,2.7rem)">${esc(p.name)}</h1>
          <div class="row" style="margin-bottom:14px">
            ${p.reviewCount ? stars(p.rating, p.reviewCount) : '<span class="faint">Abhi koi review nahi</span>'}
            ${p.stock > 0 && p.stock <= 5 ? `<span class="pill pill-placed">Sirf ${p.stock} bache</span>` : ''}
            ${p.stock <= 0 ? '<span class="pill pill-cancelled">Stock nahi</span>' : ''}
          </div>
          <p class="muted" style="font-size:1.02rem">${esc(p.shortDesc || '')}</p>

          <div class="row" style="margin:20px 0 6px">
            <span class="price-now">${money(p.price)}</span>
            ${off ? `<s class="faint">${money(p.compareAt)}</s><span class="tag" style="position:static">${off}% kam</span>` : ''}
          </div>
          <p class="faint">Delivery Rs ${state.catalog.shipping.flat} · Rs ${state.catalog.shipping.freeOver.toLocaleString('en-PK')} se upar free</p>

          <div class="row" style="margin:22px 0;flex-wrap:wrap">
            <span class="qty">
              <button data-step="-1" aria-label="Kam karein">−</button>
              <span id="qty">1</span>
              <button data-step="1" aria-label="Zyada karein">+</button>
            </span>
            <button class="btn grow" id="add" ${p.stock <= 0 ? 'disabled' : ''} style="min-width:200px">
              ${p.stock <= 0 ? 'Stock mein nahi' : 'Cart mein daalein'} ${icons.cart}
            </button>
            <button class="btn-icon ${saved ? 'wish on' : ''}" id="wish" aria-label="Wishlist" style="box-shadow:inset 0 0 0 1px var(--line)">${icons.heart}</button>
          </div>

          <div class="tabs">
            <button class="active" data-tab="story">Tafseel</button>
            <button data-tab="specs">Maloomat</button>
            <button data-tab="ship">Delivery</button>
            <button data-tab="reviews">Reviews (${data.reviews.length})</button>
          </div>

          <div data-panel="story">${(p.description || '').split('\n').map((t) => `<p class="muted">${esc(t)}</p>`).join('')}</div>
          <div data-panel="specs" hidden>
            <ul class="detail-list">${(p.details || []).map((d) => `<li>${esc(d)}</li>`).join('') || '<li>Koi khaas maloomat nahi.</li>'}</ul>
          </div>
          <div data-panel="ship" hidden>
            <ul class="detail-list">
              <li>Lahore mein 2–3 din, baaki Pakistan 3–5 din.</li>
              <li>Rs ${state.catalog.shipping.freeOver.toLocaleString('en-PK')} se upar delivery free.</li>
              <li>Cash on delivery aur bank transfer dono chalte hain.</li>
              <li>Tooti hui cheez 7 din mein badal dete hain — bas tasveer bhej dein.</li>
            </ul>
          </div>
          <div data-panel="reviews" hidden>
            <div id="reviewList">${reviewsList(data.reviews)}</div>
            <button class="btn btn-ghost btn-sm" id="writeReview" style="margin-top:14px">Review likhein</button>
          </div>
        </div>
      </div>

      ${data.related.length ? `
      <section class="section">
        <h2>Isi ke saath achi lagti hain</h2>
        <div class="grid grid-4">${data.related.map(productCard).join('')}</div>
      </section>` : ''}
    </div>`;
  },

  async mount(root) {
    const data = this._data;
    if (!data) return;
    const p = data.product;
    let qty = 1;

    bind(root, '[data-variant]', 'click', (e, t) => {
      els('[data-variant]', root).forEach((b) => b.classList.toggle('active', b === t));
      el('#mainArt', root).innerHTML = artFor(p, +t.dataset.variant);
    });

    bind(root, '[data-step]', 'click', (e, t) => {
      qty = Math.max(1, Math.min(p.stock || 1, qty + Number(t.dataset.step)));
      el('#qty', root).textContent = qty;
    });

    el('#add', root)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;            // await ke baad currentTarget null ho jata hai
      btn.disabled = true;
      try { await addToCart(p.id, qty); toast(`${p.name} cart mein daal diya`); document.dispatchEvent(new Event('cart:open')); }
      catch (err) { toast(err.message, 'bad'); }
      finally { btn.disabled = false; }
    });

    el('#wish', root)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!state.user) { document.dispatchEvent(new Event('auth:open')); return; }
      try {
        const saved = await toggleWish(p.id);
        btn.classList.toggle('on', saved);
        btn.classList.add('wish');
        btn.setAttribute('aria-pressed', String(saved));
        toast(saved ? 'Wishlist mein mehfooz' : 'Wishlist se hata diya');
      } catch (err) { toast(err.message, 'bad'); }
    });

    bind(root, '[data-tab]', 'click', (e, t) => {
      els('[data-tab]', root).forEach((b) => b.classList.toggle('active', b === t));
      els('[data-panel]', root).forEach((panel) => { panel.hidden = panel.dataset.panel !== t.dataset.tab; });
    });

    bind(root, '#writeReview', 'click', () => {
      if (!state.user) { document.dispatchEvent(new Event('auth:open')); return; }
      let rating = 5;
      const node = modal(`
        <h3>Review likhein</h3>
        <p class="muted">${esc(p.name)}</p>
        <form id="reviewForm">
          <div class="field"><span>Kitne sitare?</span>
            <div class="star-input">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-star="${i}" class="on">${icons.star}</button>`).join('')}</div>
          </div>
          <label class="field"><span>Unwan</span><input name="title" maxlength="120" placeholder="Jaise: khushbu kamaal hai"></label>
          <label class="field"><span>Aap ka tajurba</span><textarea name="body" maxlength="1500" required></textarea></label>
          <div class="row"><button class="btn grow" type="submit">Bhejein</button>
          <button class="btn btn-ghost" type="button" data-close>Rehne dein</button></div>
        </form>`, {
        onMount(m) {
          bind(m, '[data-star]', 'click', (e, t) => {
            rating = +t.dataset.star;
            els('[data-star]', m).forEach((b) => b.classList.toggle('on', +b.dataset.star <= rating));
          });
          el('#reviewForm', m).onsubmit = async (e) => {
            e.preventDefault();
            const v = formValues(e.target);
            try {
              await api.post(`/api/products/${p.id}/reviews`, { ...v, rating });
              closeModal();
              toast('Shukriya! Review shaya ho gaya');
              /* sirf reviews ka hissa naya karein — poora page reload karne ki zaroorat nahi */
              const fresh = await api.get('/api/products/' + encodeURIComponent(p.slug));
              el('#reviewList', root).innerHTML = reviewsList(fresh.reviews);
              el('[data-tab="reviews"]', root).textContent = `Reviews (${fresh.reviews.length})`;
              els('[data-tab]', root).forEach((b) => b.classList.toggle('active', b.dataset.tab === 'reviews'));
              els('[data-panel]', root).forEach((panel) => { panel.hidden = panel.dataset.panel !== 'reviews'; });
            } catch (err) { toast(err.message, 'bad'); }
          };
        },
      });
      return node;
    });

    reveal(root);
  },
};
