'use strict';

/**
 * Session-backed shopping cart helpers.
 * The cart lives at req.session.cart = { items: [{ id, slug, name, price, image, qty, stock }] }
 */

function ensure(session) {
  if (!session.cart || !Array.isArray(session.cart.items)) {
    session.cart = { items: [] };
  }
  return session.cart;
}

function add(session, product, qty = 1) {
  const cart = ensure(session);
  qty = Math.max(1, parseInt(qty, 10) || 1);
  const existing = cart.items.find((i) => i.id === product.id);
  const maxStock = product.stock > 0 ? product.stock : 0;
  if (existing) {
    existing.qty = Math.min(existing.qty + qty, maxStock || existing.qty + qty);
  } else {
    cart.items.push({
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.image,
      stock: product.stock,
      qty: Math.min(qty, maxStock || qty),
    });
  }
  return cart;
}

function update(session, productId, qty) {
  const cart = ensure(session);
  qty = parseInt(qty, 10) || 0;
  const idx = cart.items.findIndex((i) => i.id === Number(productId));
  if (idx === -1) return cart;
  if (qty <= 0) {
    cart.items.splice(idx, 1);
  } else {
    const item = cart.items[idx];
    item.qty = item.stock > 0 ? Math.min(qty, item.stock) : qty;
  }
  return cart;
}

function remove(session, productId) {
  const cart = ensure(session);
  cart.items = cart.items.filter((i) => i.id !== Number(productId));
  return cart;
}

function clear(session) {
  session.cart = { items: [] };
}

function totals(session) {
  const cart = ensure(session);
  const subtotal = cart.items.reduce((n, i) => n + i.price * i.qty, 0);
  const count = cart.items.reduce((n, i) => n + i.qty, 0);
  return { subtotal, count, items: cart.items };
}

module.exports = { ensure, add, update, remove, clear, totals };
