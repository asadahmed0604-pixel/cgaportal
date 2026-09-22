/* Client-side state — user, cart, wishlist, catalog. Chhota sa pub/sub. */

import { api } from './api.js';

const listeners = new Set();

export const state = {
  user: null,
  cart: { items: [], subtotal: 0, count: 0, shipping: 0, total: 0, freeShippingOver: 5000 },
  wishlist: new Set(),
  catalog: { categories: [], priceRange: { min: 0, max: 0 }, shipping: { flat: 250, freeOver: 5000 } },
  ready: false,
};

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = () => listeners.forEach((fn) => fn(state));

export async function boot() {
  const [me, cart, catalog] = await Promise.allSettled([
    api.get('/api/me'), api.get('/api/cart'), api.get('/api/catalog'),
  ]);
  if (me.status === 'fulfilled' && me.value && !me.value.guest) state.user = me.value;
  if (cart.status === 'fulfilled') state.cart = cart.value;
  if (catalog.status === 'fulfilled') state.catalog = catalog.value;
  if (state.user) await loadWishlist();
  state.ready = true;
  emit();
}

export async function loadWishlist() {
  if (!state.user) { state.wishlist = new Set(); return; }
  try {
    const r = await api.get('/api/wishlist');
    state.wishlist = new Set(r.items.map((p) => p.id));
  } catch { state.wishlist = new Set(); }
}

export async function refreshCart() {
  state.cart = await api.get('/api/cart');
  emit();
  return state.cart;
}

export async function addToCart(productId, qty = 1) {
  state.cart = await api.post('/api/cart', { productId, qty });
  emit();
  return state.cart;
}

export async function setQty(itemId, qty) {
  state.cart = await api.patch('/api/cart/' + itemId, { qty });
  emit();
}

export async function removeItem(itemId) {
  state.cart = await api.del('/api/cart/' + itemId);
  emit();
}

export async function toggleWish(productId) {
  const r = await api.post('/api/wishlist', { productId });
  if (r.saved) state.wishlist.add(productId); else state.wishlist.delete(productId);
  emit();
  return r.saved;
}

export async function login(payload, mode = 'login') {
  state.user = await api.post('/api/auth/' + mode, payload);
  await Promise.all([refreshCart(), loadWishlist()]);
  emit();
  return state.user;
}

export async function logout() {
  await api.post('/api/auth/logout');
  state.user = null;
  state.wishlist = new Set();
  await refreshCart();
  emit();
}

export const isAdmin = () => !!state.user && state.user.role === 'admin';
