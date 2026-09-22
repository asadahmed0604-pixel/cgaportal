/* Home — hero, categories, featured, kahani, testimonials. */

import { api } from '../api.js';
import { heroArt, icons, productArt } from '../art.js';
import { el, els, esc, html, reveal, skeletons, bind } from '../ui.js';
import { state } from '../store.js';
import { productCard, isDark } from './components.js';

const QUOTES = [
  ['Candle ka jar itna pyara hai ke main ne use brush holder bana liya. Khushbu bhi teen ghante tak rehti hai.', 'Hira, Karachi'],
  ['Meri behen ko Slow Evening Box bheja tha. Us ne kaha zindagi mein itni soch samajh kar diya gaya tohfa nahi mila.', 'Bilal, Islamabad'],
  ['Mug har roz istemal hota hai. Teen mahine ho gaye, glaze waisa ka waisa hai.', 'Areeba, Lahore'],
];

export default {
  async render() {
    return html`
    <section class="hero">
      <div class="blob blob-1"></div><div class="blob blob-2"></div>
      <div class="wrap hero-grid">
        <div>
          <span class="eyebrow">Handmade · Lahore</span>
          <h1>Chhoti cheezein,<br><em>lambi kahaniyan</em></h1>
          <p class="lead">Haath se dhaali candles, chaak par bane ceramics aur sukhaye hue phool —
            har cheez chhote batch mein banti hai, is liye har cheez thori si alag hoti hai.</p>
          <div class="hero-cta">
            <a class="btn" href="/shop">Sab kuch dekhein ${icons.arrow}</a>
            <a class="btn btn-ghost" href="/shop?cat=gifting">Tohfe</a>
          </div>
          <div class="hero-stats">
            <div><b>2,400+</b><span class="faint">khush gharane</span></div>
            <div><b>3–5 din</b><span class="faint">poore Pakistan mein</span></div>
            <div><b>Rs 5,000+</b><span class="faint">par free delivery</span></div>
          </div>
        </div>
        <div class="hero-art reveal">
          ${heroArt(isDark())}
          <div class="hero-badge">
            <span style="color:var(--accent)">${icons.leafSmall}</span>
            <div><b style="font-size:.9rem">Chhote batch mein banaya gaya</b>
            <div class="faint">Har hafte sirf 40 candles</div></div>
          </div>
        </div>
      </div>
    </section>

    <div class="marquee" aria-hidden="true">
      <div class="marquee-track">
        <span>${Array(2).fill('Soy wax · Chaak par bane ceramics · Sukhaye hue phool · Letterpress cards · Chhote batch · Haath se lipta hua').join('<span> · </span>')}</span>
        <span>${Array(2).fill('Soy wax · Chaak par bane ceramics · Sukhaye hue phool · Letterpress cards · Chhote batch · Haath se lipta hua').join('<span> · </span>')}</span>
      </div>
    </div>

    <section class="section wrap">
      <div class="section-head">
        <div><span class="eyebrow">Alaamaat</span><h2>Kahan se shuru karein</h2></div>
        <a class="link-underline muted" href="/shop">Poori dukan</a>
      </div>
      <div class="grid grid-4" id="cats"></div>
    </section>

    <section class="section wrap" style="padding-top:0">
      <div class="section-head">
        <div><span class="eyebrow">Is hafte</span><h2>Jo sab se zyada pasand aaya</h2></div>
        <a class="link-underline muted" href="/shop?sort=new">Nayi cheezein</a>
      </div>
      <div class="grid grid-4" id="featured">${skeletons(4)}</div>
    </section>

    <section class="section" style="background:var(--surface-2)">
      <div class="wrap split">
        <div class="reveal">
          <span class="eyebrow">Hamari kahani</span>
          <h2>Aik mez, do haath, bohat saara sabr</h2>
          <p class="muted">Twig n Tale 2021 mein aik chhote se garage se shuru hua — pehli candle apni ammi ke liye
            banayi thi. Aaj bhi har candle usi tarah dhaali jati hai: chhote batch, asli soy wax,
            aur koi jaldi nahi.</p>
          <p class="muted">Hum plastic ki packing nahi karte. Har order recycled kaghaz mein lipta
            aata hai, saath mein haath se likha card.</p>
          <a class="btn btn-ghost" href="/about">Aur parhein ${icons.arrow}</a>
        </div>
        <div class="reveal" style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px">
          ${['leaf', 'bloom', 'fern', 'berry'].map((m, i) => `
            <div class="card" style="aspect-ratio:1;border-radius:var(--r-md)">
              ${productArt(m, 120 + i * 55, 'story' + i, i, { dark: isDark(), label: 'Studio' })}
            </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="section wrap center">
      <span class="eyebrow">Logon ne kya kaha</span>
      <div id="quotes" style="max-width:660px;margin:0 auto;min-height:130px">
        ${QUOTES.map((q, i) => `
          <figure class="quote-slide" data-i="${i}" style="margin:0;${i ? 'display:none' : ''}">
            <p class="quote">“${esc(q[0])}”</p>
            <figcaption class="faint">— ${esc(q[1])}</figcaption>
          </figure>`).join('')}
      </div>
      <div class="dots" id="dots">
        ${QUOTES.map((_, i) => `<button data-dot="${i}" class="${i ? '' : 'on'}" aria-label="Quote ${i + 1}"></button>`).join('')}
      </div>
    </section>

    <section class="section wrap">
      <div class="grid grid-3">
        ${[
          [icons.truck, 'Poore Pakistan mein', 'Lahore, Karachi, Islamabad aur us se aage — 3 se 5 din.'],
          [icons.box, 'Tohfe ke liye tayyar', 'Har order recycled kaghaz aur haath ke likhe card ke saath.'],
          [icons.spark, 'Chhote batch', 'Har cheez limited hai — dobara banne mein waqt lagta hai.'],
        ].map(([icon, t, d]) => `
          <div class="card reveal" style="padding:26px">
            <span style="color:var(--accent)">${icon}</span>
            <h3 style="margin-top:12px">${t}</h3><p class="muted" style="margin:0">${d}</p>
          </div>`).join('')}
      </div>
    </section>`;
  },

  async mount(root) {
    /* categories */
    const cats = state.catalog.categories || [];
    el('#cats', root).innerHTML = cats.map((c, i) => `
      <a class="pcard reveal" href="/shop?cat=${esc(c.slug)}">
        <span class="pcard-art">${productArt(['leaf', 'wave', 'fern', 'bloom', 'berry'][i % 5], 90 + i * 48, 'cat-' + c.slug, i, { dark: isDark(), label: c.name })}</span>
        <span class="pcard-body">
          <span class="pcard-title">${esc(c.name)}</span>
          <span class="faint">${esc(c.tagline || '')}</span>
          <span class="faint" style="margin-top:6px">${c.count} cheezein</span>
        </span>
      </a>`).join('');

    /* featured */
    try {
      const r = await api.get('/api/products', { featured: 1, limit: 8 });
      el('#featured', root).innerHTML = r.items.map(productCard).join('');
    } catch {
      el('#featured', root).innerHTML = '<p class="muted">Abhi cheezein load nahi ho saken.</p>';
    }

    /* testimonial carousel */
    const slides = els('.quote-slide', root);
    const dots = els('[data-dot]', root);
    let idx = 0, timer;
    const show = (i) => {
      idx = (i + slides.length) % slides.length;
      slides.forEach((s, n) => { s.style.display = n === idx ? '' : 'none'; });
      dots.forEach((d, n) => d.classList.toggle('on', n === idx));
    };
    const loop = () => { timer = setInterval(() => show(idx + 1), 6000); };
    bind(root, '[data-dot]', 'click', (e, t) => { clearInterval(timer); show(+t.dataset.dot); loop(); });
    loop();
    root.addEventListener('view:unmount', () => clearInterval(timer));

    reveal(root);
  },
};
