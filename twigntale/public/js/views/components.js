/* Baar baar istemal hone wale UI tukre. */

import { productArt, icons } from '../art.js';
import { esc, money, stars } from '../ui.js';
import { state } from '../store.js';

export const isDark = () => document.documentElement.dataset.theme === 'dark';

export function artFor(p, variant = 0) {
  if (p.imageUrl) return `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy">`;
  return productArt(p.motif, p.hue, p.slug || String(p.id), variant, { dark: isDark(), label: p.name });
}

export function productCard(p) {
  const saved = state.wishlist.has(p.id);
  const off = p.compareAt && p.compareAt > p.price
    ? Math.round(((p.compareAt - p.price) / p.compareAt) * 100) : 0;
  const out = p.stock <= 0;

  return `
  <article class="pcard reveal" data-product="${p.id}">
    ${off ? `<span class="tag">${off}% kam</span>` : (p.featured ? '<span class="tag tag-soft">Pasandeeda</span>' : '')}
    ${out ? '<span class="tag tag-out" style="left:auto;right:12px">Stock nahi</span>' : `
      <button class="wish ${saved ? 'on' : ''}" data-wish="${p.id}" aria-pressed="${saved}"
              aria-label="Wishlist mein ${saved ? 'se hatayein' : 'daalein'}">${icons.heart}</button>`}
    <a class="pcard-art" href="/product/${esc(p.slug)}" aria-label="${esc(p.name)}">
      ${artFor(p)}
      <span class="pcard-actions">
        ${out ? '' : `<button class="btn btn-sm" data-add="${p.id}">Cart mein daalein</button>`}
      </span>
    </a>
    <div class="pcard-body">
      ${p.category ? `<span class="faint">${esc(p.category.name)}</span>` : ''}
      <a class="pcard-title" href="/product/${esc(p.slug)}">${esc(p.name)}</a>
      ${p.reviewCount ? `<div>${stars(p.rating, p.reviewCount)}</div>` : ''}
      <div class="pcard-price">
        <span>${money(p.price)}</span>
        ${p.compareAt && p.compareAt > p.price ? `<s>${money(p.compareAt)}</s>` : ''}
      </div>
    </div>
  </article>`;
}

export function emptyState(title, body, action = '') {
  return `<div class="empty">${icons.box}<h3>${esc(title)}</h3><p>${esc(body)}</p>${action}</div>`;
}

export function pageHead(eyebrow, title, sub = '') {
  return `<div class="center" style="max-width:640px;margin:0 auto 12px">
    <span class="eyebrow">${esc(eyebrow)}</span>
    <h1>${esc(title)}</h1>
    ${sub ? `<p class="muted">${esc(sub)}</p>` : ''}
  </div>`;
}
