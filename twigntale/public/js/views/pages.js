/* Static-sa content — about aur contact. */

import { icons, productArt } from '../art.js';
import { api } from '../api.js';
import { el, html, reveal, toast, formValues } from '../ui.js';
import { isDark } from './components.js';

export const about = {
  async render() {
    return html`
    <div class="wrap-narrow section">
      <span class="eyebrow">Hamari kahani</span>
      <h1>Twig n Tale</h1>
      <p class="lead muted">Aik chhoti si studio, jahan har cheez haath se banti hai aur koi jaldi nahi hoti.</p>
      <div class="card reveal" style="aspect-ratio:16/7;margin:26px 0">
        ${productArt('fern', 140, 'about-hero', 2, { dark: isDark(), label: 'Studio' })}
      </div>
      <p class="muted">2021 mein pehli candle apni ammi ke liye banayi thi — cedarwood aur thora sa dhuan.
        Un ke dostoon ne poocha kahan se li, aur baat wahin se shuru ho gayi.</p>
      <p class="muted">Aaj bhi hum chhote batch mein kaam karte hain. Har hafte sirf 40 candles banti hain,
        ceramics chaak par ghumti hain, aur phool khud sukhaye jate hain. Is liye har cheez bilkul aik jaisi nahi hoti —
        aur hamare khayal mein yehi sab se achi baat hai.</p>
      <div class="grid grid-3 section" style="padding-bottom:0">
        ${[
          [icons.leafSmall, 'Asli cheezein', 'Soy wax, asli mitti, asli phool. Koi paraffin nahi.'],
          [icons.box, 'Plastic se door', 'Recycled kaghaz, kapre ki thaili, aur haath ka likha card.'],
          [icons.spark, 'Chhote batch', 'Jitna achi tarah ban sake, utna hi banate hain.'],
        ].map(([i, t, d]) => `<div class="card reveal" style="padding:24px">
          <span style="color:var(--accent)">${i}</span><h3 style="margin-top:10px">${t}</h3>
          <p class="muted" style="margin:0">${d}</p></div>`).join('')}
      </div>
    </div>`;
  },
  async mount(root) { reveal(root); },
};

export const contact = {
  async render() {
    return html`
    <div class="wrap-narrow section">
      <span class="eyebrow">Raabta</span>
      <h1>Baat karni hai?</h1>
      <p class="muted">Order, custom gifting ya bulk ke liye — WhatsApp sab se tez hai.</p>
      <div class="grid grid-2" style="margin:26px 0">
        <div class="card" style="padding:22px"><h3>WhatsApp</h3>
          <p class="muted" style="margin:0">0302 9255003<br><span class="faint">Roz 10:00 – 20:00</span></p></div>
        <div class="card" style="padding:22px"><h3>Email</h3>
          <p class="muted" style="margin:0">hello@twigntale.com<br><span class="faint">24 ghante mein jawab</span></p></div>
      </div>
      <form id="contactForm" class="card" style="padding:24px">
        <div class="field-row">
          <label class="field"><span>Naam</span><input name="name" required></label>
          <label class="field"><span>Email</span><input type="email" name="email" required></label>
        </div>
        <label class="field"><span>Paighaam</span><textarea name="message" required></textarea></label>
        <button class="btn" type="submit">Bhejein</button>
        <p class="faint" style="margin:10px 0 0">Bhejne par aap ka email hamari list mein aa jata hai — kabhi bhi nikal sakte hain.</p>
      </form>
    </div>`;
  },
  async mount(root) {
    el('#contactForm', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = formValues(e.target);
      try {
        await api.post('/api/newsletter', { email: v.email });
        e.target.reset();
        toast('Paighaam mil gaya — jald jawab denge');
      } catch (err) { toast(err.message, 'bad'); }
    });
    reveal(root);
  },
};

export const notFound = {
  async render() {
    return `<div class="wrap section center" style="padding-block:90px">
      <h1>Yeh safha nahi mila</h1>
      <p class="muted">Shayad link purana hai.</p>
      <a class="btn" href="/">Ghar wapas</a></div>`;
  },
  async mount() {},
};
