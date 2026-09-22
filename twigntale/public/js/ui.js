/* DOM helpers, toasts, modal, scroll-reveal, formatting. */

export const el = (sel, root = document) => root.querySelector(sel);
export const els = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-PK');

export const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (vals[i] ?? ''), '');
}

/* event delegation — views markup string se bante hain, isliye yeh sab se aasan hai */
export function bind(root, selector, event, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

/* ---------- toasts ---------- */
let toastBox;
export function toast(message, kind = 'ok') {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('role', 'status');
    toastBox.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastBox);
  }
  const node = document.createElement('div');
  node.className = 'toast' + (kind === 'bad' ? ' bad' : '');
  node.textContent = message;
  toastBox.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(10px)';
    setTimeout(() => node.remove(), 320);
  }, 2600);
}

/* ---------- modal ---------- */
let openModal = null;
export function modal(contentHtml, { wide = false, onMount } = {}) {
  closeModal();
  const node = document.createElement('div');
  node.className = 'modal' + (wide ? ' modal-wide' : '');
  node.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${contentHtml}</div>`;
  document.body.appendChild(node);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => node.classList.add('open'));
  node.addEventListener('mousedown', (e) => { if (e.target === node) closeModal(); });
  bind(node, '[data-close]', 'click', () => closeModal());
  openModal = node;
  if (onMount) onMount(node);
  const focusable = node.querySelector('input, select, textarea, button');
  if (focusable) setTimeout(() => focusable.focus(), 60);
  return node;
}

export function closeModal() {
  if (!openModal) return;
  const node = openModal;
  openModal = null;
  document.body.style.overflow = '';
  node.classList.remove('open');
  setTimeout(() => node.remove(), 260);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ---------- scroll reveal ---------- */
let observer;
export function reveal(root = document) {
  if (!('IntersectionObserver' in window)) {
    els('.reveal', root).forEach((n) => n.classList.add('in'));
    return;
  }
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        setTimeout(() => entry.target.classList.add('in'), Math.min(i * 60, 300));
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: .08 });
  }
  els('.reveal:not(.in)', root).forEach((n) => observer.observe(n));
}

/* ---------- misc ---------- */
export function debounce(fn, ms = 260) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function stars(rating, count) {
  const full = Math.round(rating || 0);
  const star = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5-4.8-4.6 6.6-.9Z"/></svg>`;
  let out = '<span class="stars" aria-label="' + (rating || 0) + ' out of 5">';
  for (let i = 1; i <= 5; i++) out += `<span style="opacity:${i <= full ? 1 : .22}">${star}</span>`;
  out += '</span>';
  if (count != null) out += ` <span class="faint">(${count})</span>`;
  return out;
}

export function formValues(form) {
  const out = {};
  new FormData(form).forEach((v, k) => { out[k] = typeof v === 'string' ? v.trim() : v; });
  return out;
}

export function skeletons(n, className = 'skel skel-card') {
  return Array.from({ length: n }, () => `<div class="${className}"></div>`).join('');
}
