/* Server se baat karne ka aik hi darwaza. */

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* khali jawab */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Kuch ghalat ho gaya (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const qs = (params) => {
  const usable = Object.entries(params || {}).filter(([, v]) => v !== '' && v != null && v !== 'all');
  return usable.length ? '?' + new URLSearchParams(usable) : '';
};

export const api = {
  get: (p, params) => request('GET', p + qs(params)),
  post: (p, body) => request('POST', p, body || {}),
  patch: (p, body) => request('PATCH', p, body || {}),
  del: (p) => request('DELETE', p),
};
