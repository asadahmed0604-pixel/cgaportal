/* Chhota history-API router — /product/:slug jaise patterns. */

const routes = [];
let current = null;
let onChange = () => {};

export function route(pattern, view) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ pattern, rx, keys, view });
}

export function match(pathname) {
  for (const r of routes) {
    const m = pathname.match(r.rx);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { ...r, params };
  }
  return null;
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.origin);
  if (url.pathname + url.search === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  handle();
}

/* URL ke query params ko bina scroll/render ke badalna (shop filters ke liye) */
export function setQuery(params) {
  const url = new URL(location.href);
  Object.entries(params).forEach(([k, v]) => {
    if (v === '' || v == null || v === 'all') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  });
  history.replaceState({}, '', url);
}

export const query = () => Object.fromEntries(new URL(location.href).searchParams);

function handle() {
  const found = match(location.pathname);
  current = found;
  onChange(found, location.pathname);
}

export function start(cb) {
  onChange = cb;
  addEventListener('popstate', handle);
  document.addEventListener('click', (e) => {
    /* pehle kisi aur handler ne rok diya (jaise card ka add-to-cart) to yahan kuch na karein */
    if (e.defaultPrevented) return;
    const a = e.target.closest('a[href^="/"]');
    if (!a || a.target === '_blank' || a.hasAttribute('data-external') || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });
  handle();
}

export const currentRoute = () => current;
