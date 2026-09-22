/* Admin console — dashboard, products, orders, customers, promos, subscribers. */

import { api } from '../api.js';
import { el, els, esc, html, money, when, toast, bind, formValues, modal, closeModal } from '../ui.js';
import { state, isAdmin } from '../store.js';

const TABS = [
  ['dash', 'Dashboard'], ['products', 'Products'], ['orders', 'Orders'],
  ['customers', 'Customers'], ['promos', 'Promo codes'], ['subs', 'Newsletter'],
];

const MOTIFS = ['leaf', 'bloom', 'fern', 'berry', 'wave'];

export default {
  async render() {
    if (!isAdmin()) {
      return `<div class="wrap section center"><h1>Yeh hissa sirf admin ke liye hai</h1>
        <p class="muted">Admin account se log in karein.</p>
        <button class="btn" id="openAuth">Log in</button></div>`;
    }
    return html`
    <div class="wrap admin">
      <nav class="admin-nav">
        ${TABS.map(([k, t], i) => `<button data-atab="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}
      </nav>
      <div id="apanel"><div class="card" style="padding:30px">Load ho raha hai…</div></div>
    </div>`;
  },

  async mount(root) {
    bind(root, '#openAuth', 'click', () => document.dispatchEvent(new Event('auth:open')));
    if (!isAdmin()) return;

    const panel = el('#apanel', root);
    const show = async (key) => {
      els('[data-atab]', root).forEach((b) => b.classList.toggle('on', b.dataset.atab === key));
      panel.innerHTML = '<div class="card" style="padding:30px">Load ho raha hai…</div>';
      try { await PANELS[key](panel); }
      catch (err) { panel.innerHTML = `<div class="note">${esc(err.message)}</div>`; }
    };
    bind(root, '[data-atab]', 'click', (e, t) => show(t.dataset.atab));
    await show('dash');
  },
};

/* ---------------- dashboard ---------------- */

/* 14 din ka revenue — aik hi series, is liye aik hi rang aur koi legend nahi.
   Har bar par hover se tafseel, aur neeche wahi data table ki soorat mein. */
function revenueChart(daily) {
  if (!daily.length) return '<p class="muted">Abhi koi order nahi — chart tab banega.</p>';
  const max = Math.max(...daily.map((d) => d.revenue || 0), 1);
  const peak = daily.reduce((a, b) => ((b.revenue || 0) > (a.revenue || 0) ? b : a), daily[0]);
  const label = (day) => new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return `
  <div class="row-between" style="align-items:baseline">
    <h3 style="margin:0">Pichle ${daily.length} din ki aamdani</h3>
    <button class="chip" data-toggle-table aria-expanded="false">Table</button>
  </div>
  <div class="faint">Sab se zyada: ${money(peak.revenue)} — ${label(peak.day)}</div>
  <div class="chart" role="img" aria-label="Rozana aamdani ka bar chart, ${daily.length} din">
    ${daily.map((d, i) => `
      <div class="chart-col" tabindex="0" data-bar
           data-tip="${esc(label(d.day))} · ${money(d.revenue)} · ${d.orders} order">
        <div class="chart-bar" style="height:${Math.max(2, ((d.revenue || 0) / max) * 100)}%"></div>
        <span class="chart-label">${i % 2 === 0 ? label(d.day).split(' ')[0] : '&nbsp;'}</span>
      </div>`).join('')}
  </div>
  <div class="table-wrap" hidden data-table>
    <table><thead><tr><th>Din</th><th>Orders</th><th>Aamdani</th></tr></thead>
      <tbody>${daily.map((d) => `<tr><td>${label(d.day)}</td><td>${d.orders}</td><td>${money(d.revenue)}</td></tr>`).join('')}</tbody>
    </table>
  </div>`;
}

const PANELS = {
  async dash(panel) {
    const s = await api.get('/api/admin/stats');
    panel.innerHTML = html`
      <div class="stat-grid">
        ${[
          ['Kul aamdani', money(s.revenue)], ['Orders', s.orders],
          ['Kaam baqi', s.pending], ['Customers', s.customers], ['Newsletter', s.subscribers],
        ].map(([t, v]) => `<div class="card stat"><span class="faint">${t}</span><b>${v}</b></div>`).join('')}
      </div>

      <div class="card" style="padding:22px">${revenueChart(s.daily || [])}</div>

      <div class="grid grid-2" style="margin-top:18px">
        <div class="card" style="padding:22px">
          <h3>Sab se zyada bikne wali</h3>
          ${s.topProducts.length ? `<table><tbody>${s.topProducts.map((p) => `
            <tr><td>${esc(p.name)}</td><td class="faint">${p.qty} adad</td><td style="text-align:right"><b>${money(p.revenue)}</b></td></tr>`).join('')}
            </tbody></table>` : '<p class="muted">Abhi koi bikri nahi.</p>'}
        </div>
        <div class="card" style="padding:22px">
          <h3>Stock kam ho raha hai</h3>
          ${s.lowStock.length ? `<table><tbody>${s.lowStock.map((p) => `
            <tr><td>${esc(p.name)}</td><td style="text-align:right">
              <span class="pill ${p.stock <= 0 ? 'pill-cancelled' : 'pill-placed'}">${p.stock} bache</span></td></tr>`).join('')}
            </tbody></table>` : '<p class="muted">Sab theek hai.</p>'}
        </div>
      </div>

      <div class="toast hide" id="tip" style="position:fixed;pointer-events:none;z-index:130"></div>`;

    /* hover/focus par tooltip */
    const tip = el('#tip', panel);
    const place = (e, t) => {
      tip.textContent = t.dataset.tip;
      tip.classList.remove('hide');
      const r = t.getBoundingClientRect();
      tip.style.left = Math.min(window.innerWidth - 180, Math.max(12, r.left + r.width / 2 - 90)) + 'px';
      tip.style.top = Math.max(12, r.top - 46) + 'px';
      tip.style.bottom = 'auto';
      tip.style.transform = 'none';
    };
    bind(panel, '[data-bar]', 'mouseover', place);
    bind(panel, '[data-bar]', 'focusin', place);
    panel.addEventListener('mouseleave', () => tip.classList.add('hide'), true);
    bind(panel, '[data-toggle-table]', 'click', (e, t) => {
      const table = el('[data-table]', panel);
      table.hidden = !table.hidden;
      t.setAttribute('aria-expanded', String(!table.hidden));
      t.classList.toggle('on', !table.hidden);
    });
  },

  async products(panel) {
    const r = await api.get('/api/admin/products');
    panel.innerHTML = html`
      <div class="row-between" style="margin-bottom:16px">
        <h2 style="margin:0">Products <span class="faint">(${r.items.length})</span></h2>
        <button class="btn btn-sm" data-new>+ Nayi cheez</button>
      </div>
      <div class="card table-wrap"><table>
        <thead><tr><th>Naam</th><th>Category</th><th>Qeemat</th><th>Stock</th><th>Haalat</th><th></th></tr></thead>
        <tbody>${r.items.map((p) => `
          <tr data-row="${p.id}">
            <td><b>${esc(p.name)}</b>${p.featured ? ' <span class="pill">Featured</span>' : ''}</td>
            <td class="faint">${esc(p.category ? p.category.name : '—')}</td>
            <td>${money(p.price)}</td>
            <td><span class="pill ${p.stock <= 3 ? 'pill-placed' : ''}">${p.stock}</span></td>
            <td>${p.active ? '<span class="pill pill-delivered">Live</span>' : '<span class="pill">Chhupi hui</span>'}</td>
            <td style="text-align:right">
              <button class="chip" data-edit='${esc(JSON.stringify(p))}'>Badlein</button>
              <button class="chip" data-del="${p.id}">Hatayein</button>
            </td>
          </tr>`).join('')}
        </tbody></table></div>`;

    bind(panel, '[data-new]', 'click', () => productForm(null, panel));
    bind(panel, '[data-edit]', 'click', (e, t) => productForm(JSON.parse(t.dataset.edit), panel));
    bind(panel, '[data-del]', 'click', async (e, t) => {
      if (!confirm('Yeh cheez dukan se hata dein?')) return;
      await api.del('/api/admin/products/' + t.dataset.del);
      toast('Hata diya');
      PANELS.products(panel);
    });
  },

  async orders(panel) {
    const r = await api.get('/api/admin/orders');
    panel.innerHTML = html`
      <div class="row-between" style="margin-bottom:16px">
        <h2 style="margin:0">Orders</h2>
        <select id="ofilter" style="max-width:190px">
          <option value="">Sab</option>
          ${r.statuses.map((s) => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div id="olist">${orderTable(r)}</div>`;

    el('#ofilter', panel).addEventListener('change', async (e) => {
      const data = await api.get('/api/admin/orders', { status: e.target.value });
      el('#olist', panel).innerHTML = orderTable(data);
    });

    bind(panel, '[data-status]', 'change', async (e, t) => {
      try {
        await api.patch('/api/admin/orders/' + t.dataset.status, { status: t.value });
        toast('Haalat badal di');
      } catch (err) { toast(err.message, 'bad'); }
    });
    bind(panel, '[data-oexpand]', 'click', (e, t) => {
      const row = el(`[data-odetail="${t.dataset.oexpand}"]`, panel);
      row.hidden = !row.hidden;
    });
  },

  async customers(panel) {
    const r = await api.get('/api/admin/customers');
    panel.innerHTML = `
      <h2>Customers <span class="faint">(${r.items.length})</span></h2>
      <div class="card table-wrap"><table>
        <thead><tr><th>Naam</th><th>Email</th><th>Phone</th><th>Sheher</th><th>Orders</th><th>Kharch</th><th>Shamil hue</th></tr></thead>
        <tbody>${r.items.map((c) => `<tr>
          <td><b>${esc(c.name)}</b></td><td>${esc(c.email)}</td><td>${esc(c.phone || '—')}</td>
          <td>${esc(c.city || '—')}</td><td>${c.orders}</td><td>${money(c.spent)}</td>
          <td class="faint">${when(c.created_at)}</td></tr>`).join('')}
        </tbody></table></div>`;
  },

  async promos(panel) {
    const r = await api.get('/api/admin/promos');
    panel.innerHTML = html`
      <div class="row-between" style="margin-bottom:16px"><h2 style="margin:0">Promo codes</h2></div>
      <div class="card table-wrap" style="margin-bottom:18px"><table>
        <thead><tr><th>Code</th><th>Chhoot</th><th>Kam az kam</th><th>Istemal</th><th>Haalat</th><th></th></tr></thead>
        <tbody>${r.items.map((p) => `<tr>
          <td><b>${esc(p.code)}</b></td>
          <td>${p.kind === 'percent' ? p.value + '%' : money(p.value)}</td>
          <td>${p.min_subtotal ? money(p.min_subtotal) : '—'}</td>
          <td>${p.uses}${p.max_uses ? ' / ' + p.max_uses : ''}</td>
          <td>${p.active ? '<span class="pill pill-delivered">Chal raha</span>' : '<span class="pill">Band</span>'}</td>
          <td style="text-align:right">${p.active ? `<button class="chip" data-pdel="${esc(p.code)}">Band karein</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>

      <form class="card" id="promoForm" style="padding:22px;max-width:520px">
        <h3>Naya code</h3>
        <div class="field-row">
          <label class="field"><span>Code</span><input name="code" required placeholder="EID20" style="text-transform:uppercase"></label>
          <label class="field"><span>Qism</span><select name="kind"><option value="percent">Percent</option><option value="flat">Rupay</option></select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Value</span><input type="number" name="value" required value="10"></label>
          <label class="field"><span>Kam az kam order</span><input type="number" name="minSubtotal" value="0"></label>
        </div>
        <label class="field"><span>Kitni baar chalega (khali = bay-hisaab)</span><input type="number" name="maxUses"></label>
        <button class="btn" type="submit">Banayein</button>
      </form>`;

    el('#promoForm', panel).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/admin/promos', formValues(e.target));
        toast('Code ban gaya');
        PANELS.promos(panel);
      } catch (err) { toast(err.message, 'bad'); }
    });
    bind(panel, '[data-pdel]', 'click', async (e, t) => {
      await api.del('/api/admin/promos/' + encodeURIComponent(t.dataset.pdel));
      PANELS.promos(panel);
    });
  },

  async subs(panel) {
    const r = await api.get('/api/admin/newsletter');
    panel.innerHTML = `
      <div class="row-between" style="margin-bottom:16px">
        <h2 style="margin:0">Newsletter <span class="faint">(${r.items.length})</span></h2>
        <button class="btn btn-sm btn-ghost" id="copy">Sab emails copy karein</button>
      </div>
      <div class="card table-wrap"><table><thead><tr><th>Email</th><th>Kab</th></tr></thead>
        <tbody>${r.items.map((s) => `<tr><td>${esc(s.email)}</td><td class="faint">${when(s.created_at)}</td></tr>`).join('')
          || '<tr><td colspan="2" class="muted">Abhi koi nahi.</td></tr>'}</tbody></table></div>`;
    el('#copy', panel).addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(r.items.map((s) => s.email).join(', '));
        toast('Copy ho gaya');
      } catch { toast('Copy nahi ho saka', 'bad'); }
    });
  },
};

function orderTable(r) {
  if (!r.items.length) return '<div class="card muted" style="padding:30px">Koi order nahi.</div>';
  return `<div class="card table-wrap"><table>
    <thead><tr><th>Order</th><th>Customer</th><th>Kul</th><th>Adayegi</th><th>Tareekh</th><th>Haalat</th><th></th></tr></thead>
    <tbody>${r.items.map((o) => `
      <tr>
        <td><b>${esc(o.code)}</b></td>
        <td>${esc(o.name)}<br><span class="faint">${esc(o.phone)}</span></td>
        <td>${money(o.total)}</td>
        <td class="faint">${o.payment_method === 'bank' ? 'Bank' : 'COD'}</td>
        <td class="faint">${when(o.created_at)}</td>
        <td>
          <select data-status="${o.id}" style="min-width:130px">
            ${r.statuses.map((s) => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><button class="chip" data-oexpand="${o.id}">Tafseel</button></td>
      </tr>
      <tr data-odetail="${o.id}" hidden><td colspan="7">
        <div style="padding:8px 0">
          <b>Samaan:</b> ${o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join(' · ')}<br>
          <b>Pata:</b> ${esc(o.address)}, ${esc(o.city)} ${esc(o.postal || '')}<br>
          ${o.notes ? `<b>Hidayat:</b> ${esc(o.notes)}<br>` : ''}
          ${o.promo_code ? `<b>Promo:</b> ${esc(o.promo_code)} (− ${money(o.discount)})` : ''}
        </div>
      </td></tr>`).join('')}
    </tbody></table></div>`;
}

function productForm(p, panel) {
  const cats = state.catalog.categories || [];
  modal(`
    <h3>${p ? 'Cheez badlein' : 'Nayi cheez'}</h3>
    <form id="pform">
      <label class="field"><span>Naam *</span><input name="name" required value="${p ? esc(p.name) : ''}"></label>
      <div class="field-row">
        <label class="field"><span>Category</span><select name="category">
          <option value="">—</option>
          ${cats.map((c) => `<option value="${esc(c.slug)}" ${p && p.category && p.category.slug === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Stock</span><input type="number" name="stock" value="${p ? p.stock : 10}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Qeemat (Rs) *</span><input type="number" name="price" required value="${p ? p.price : ''}"></label>
        <label class="field"><span>Purani qeemat</span><input type="number" name="compareAt" value="${p && p.compareAt ? p.compareAt : ''}"></label>
      </div>
      <label class="field"><span>Chhota tearuf</span><input name="shortDesc" maxlength="200" value="${p ? esc(p.shortDesc || '') : ''}"></label>
      <label class="field"><span>Poori tafseel</span><textarea name="description">${p ? esc(p.description || '') : ''}</textarea></label>
      <label class="field"><span>Maloomat (har line alag)</span><textarea name="detailsText" style="min-height:80px">${p ? esc((p.details || []).join('\n')) : ''}</textarea></label>
      <div class="field-row">
        <label class="field"><span>Artwork shakal</span><select name="motif">
          ${MOTIFS.map((m) => `<option value="${m}" ${p && p.motif === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select></label>
        <label class="field"><span>Rang (0–360)</span><input type="number" name="hue" min="0" max="360" value="${p ? p.hue : 150}"></label>
      </div>
      <label class="field"><span>Apni tasveer ka link (optional)</span><input name="imageUrl" value="${p ? esc(p.imageUrl || '') : ''}"></label>
      <div class="row" style="margin-bottom:14px">
        <label class="row" style="gap:6px"><input type="checkbox" name="featured" style="width:auto" ${p && p.featured ? 'checked' : ''}> Featured</label>
        <label class="row" style="gap:6px"><input type="checkbox" name="active" style="width:auto" ${!p || p.active ? 'checked' : ''}> Dukan mein dikhayein</label>
      </div>
      <div class="row"><button class="btn grow" type="submit">Mehfooz karein</button>
      <button class="btn btn-ghost" type="button" data-close>Rehne dein</button></div>
    </form>`, {
    wide: true,
    onMount(m) {
      el('#pform', m).onsubmit = async (e) => {
        e.preventDefault();
        const v = formValues(e.target);
        const payload = {
          ...v,
          details: (v.detailsText || '').split('\n').map((s) => s.trim()).filter(Boolean),
          featured: !!e.target.featured.checked,
          active: !!e.target.active.checked,
        };
        try {
          if (p) await api.patch('/api/admin/products/' + p.id, payload);
          else await api.post('/api/admin/products', payload);
          closeModal();
          toast('Mehfooz ho gaya');
          PANELS.products(panel);
        } catch (err) { toast(err.message, 'bad'); }
      };
    },
  });
}
