/* Shop — live filters, URL ke saath synced. */

import { api } from '../api.js';
import { icons } from '../art.js';
import { el, esc, html, reveal, skeletons, debounce, bind } from '../ui.js';
import { state } from '../store.js';
import { productCard, emptyState } from './components.js';
import { query, setQuery } from '../router.js';

const SORTS = [
  ['', 'Hamari tarteeb'], ['new', 'Nayi pehle'], ['priceAsc', 'Qeemat: kam se zyada'],
  ['priceDesc', 'Qeemat: zyada se kam'], ['rating', 'Sab se zyada pasand'], ['name', 'Naam (A–Z)'],
];

export default {
  async render() {
    const q = query();
    const cats = state.catalog.categories || [];
    return html`
    <div class="wrap section" style="padding-bottom:28px">
      <span class="eyebrow">Dukan</span>
      <h1 style="margin-bottom:6px">Sab kuch</h1>
      <p class="muted">Chhote batch mein banayi gayi har cheez — candles se lekar cards tak.</p>

      <div class="filters" style="margin-top:22px">
        <button class="chip ${!q.cat || q.cat === 'all' ? 'on' : ''}" data-cat="all">Sab</button>
        ${cats.map((c) => `<button class="chip ${q.cat === c.slug ? 'on' : ''}" data-cat="${esc(c.slug)}">${esc(c.name)} <span class="faint">${c.count}</span></button>`).join('')}
      </div>

      <div class="filter-bar">
        <label style="position:relative;flex:1;min-width:200px;display:block">
          <input id="q" type="search" placeholder="Talash karein — candle, mug, phool…" value="${esc(q.q || '')}"
                 style="padding-left:40px" aria-label="Talash">
          <span style="position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--text-faint)">${icons.search}</span>
        </label>
        <select id="sort" aria-label="Tarteeb">
          ${SORTS.map(([v, t]) => `<option value="${v}" ${q.sort === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <input id="min" type="number" min="0" placeholder="Rs kam se kam" value="${esc(q.min || '')}" style="max-width:150px" aria-label="Kam se kam qeemat">
        <input id="max" type="number" min="0" placeholder="Rs zyada se zyada" value="${esc(q.max || '')}" style="max-width:160px" aria-label="Zyada se zyada qeemat">
        <button class="chip ${q.inStock === '1' ? 'on' : ''}" id="stock" aria-pressed="${q.inStock === '1'}">Sirf stock wali</button>
        <button class="chip" id="reset">Saaf karein</button>
        <span class="faint grow" style="text-align:right" id="count"></span>
      </div>

      <div class="grid grid-4" id="items">${skeletons(8)}</div>
      <div class="center" style="margin-top:34px">
        <button class="btn btn-ghost hide" id="more">Aur dikhayein</button>
      </div>
    </div>`;
  },

  async mount(root) {
    let page = 1;
    let loading = false;

    const readFilters = () => ({
      q: el('#q', root).value.trim(),
      cat: root.querySelector('.chip.on[data-cat]')?.dataset.cat || 'all',
      sort: el('#sort', root).value,
      min: el('#min', root).value,
      max: el('#max', root).value,
      inStock: el('#stock', root).classList.contains('on') ? '1' : '',
    });

    async function load(append = false) {
      if (loading) return;
      loading = true;
      const f = readFilters();
      setQuery({ ...f, page: page > 1 ? page : '' });
      const grid = el('#items', root);
      if (!append) grid.innerHTML = skeletons(8);
      try {
        const r = await api.get('/api/products', { ...f, page, limit: 12 });
        const cards = r.items.map(productCard).join('');
        if (append) grid.insertAdjacentHTML('beforeend', cards);
        else grid.innerHTML = cards || emptyState('Kuch nahi mila', 'Filter thora kam karke dekhein.',
          '<button class="btn btn-ghost" id="reset2" style="margin-top:14px">Filter saaf karein</button>');
        el('#count', root).textContent = r.total ? `${r.total} cheezein` : '';
        el('#more', root).classList.toggle('hide', r.page >= r.pages);
        reveal(grid);
      } catch (err) {
        el('#items', root).innerHTML = `<p class="muted">${esc(err.message)}</p>`;
      } finally { loading = false; }
    }

    const reload = () => { page = 1; load(false); };

    bind(root, '[data-cat]', 'click', (e, t) => {
      root.querySelectorAll('[data-cat]').forEach((c) => c.classList.toggle('on', c === t));
      reload();
    });
    el('#q', root).addEventListener('input', debounce(reload, 300));
    el('#sort', root).addEventListener('change', reload);
    el('#min', root).addEventListener('change', reload);
    el('#max', root).addEventListener('change', reload);
    el('#stock', root).addEventListener('click', (e) => {
      const on = e.currentTarget.classList.toggle('on');
      e.currentTarget.setAttribute('aria-pressed', on);
      reload();
    });
    bind(root, '#reset, #reset2', 'click', () => {
      el('#q', root).value = ''; el('#min', root).value = ''; el('#max', root).value = '';
      el('#sort', root).value = ''; el('#stock', root).classList.remove('on');
      root.querySelectorAll('[data-cat]').forEach((c) => c.classList.toggle('on', c.dataset.cat === 'all'));
      reload();
    });
    el('#more', root).addEventListener('click', () => { page++; load(true); });

    await load(false);
  },
};
