'use strict';

const express = require('express');
const router = express.Router();

const { db, Products } = require('../store');
const cart = require('../cart');

/* ------------------------------ View cart ----------------------------- */

router.get('/', (req, res) => {
  const { items, subtotal, count } = cart.totals(req.session);
  res.render('public/cart', { title: 'Your Cart', items, subtotal, count });
});

/* ------------------------------- Add ---------------------------------- */

router.post('/add', async (req, res) => {
  const product = await Products.byId(parseInt(req.body.product_id, 10));
  if (!product || product.status !== 'published') {
    req.session.flash = { type: 'error', message: 'That product is not available.' };
    return res.redirect(req.get('Referrer') || '/shop');
  }
  if (product.stock <= 0) {
    req.session.flash = { type: 'error', message: `${product.name} is out of stock.` };
    return res.redirect(req.get('Referrer') || '/shop');
  }
  cart.add(req.session, product, req.body.qty);
  req.session.flash = { type: 'success', message: `Added “${product.name}” to your cart.` };

  if (req.body.redirect === 'cart') return res.redirect('/cart');
  res.redirect(req.get('Referrer') || '/shop');
});

/* ------------------------------ Update -------------------------------- */

router.post('/update', (req, res) => {
  cart.update(req.session, req.body.product_id, req.body.qty);
  res.redirect('/cart');
});

/* ------------------------------ Remove -------------------------------- */

router.post('/remove', (req, res) => {
  cart.remove(req.session, req.body.product_id);
  req.session.flash = { type: 'success', message: 'Item removed from cart.' };
  res.redirect('/cart');
});

/* ----------------------------- Checkout ------------------------------- */

router.get('/checkout', (req, res) => {
  const { items, subtotal, count } = cart.totals(req.session);
  if (count === 0) {
    req.session.flash = { type: 'error', message: 'Your cart is empty.' };
    return res.redirect('/shop');
  }
  res.render('public/checkout', {
    title: 'Checkout',
    items,
    subtotal,
    count,
    form: {},
    errors: {},
  });
});

router.post('/checkout', async (req, res) => {
  const { items, subtotal, count } = cart.totals(req.session);
  if (count === 0) {
    req.session.flash = { type: 'error', message: 'Your cart is empty.' };
    return res.redirect('/shop');
  }

  const form = {
    customer_name: (req.body.customer_name || '').trim(),
    email: (req.body.email || '').trim(),
    phone: (req.body.phone || '').trim(),
    address: (req.body.address || '').trim(),
    notes: (req.body.notes || '').trim(),
  };

  const errors = {};
  if (!form.customer_name) errors.customer_name = 'Your name is required.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errors.email = 'A valid email is required.';
  if (!form.address) errors.address = 'A delivery address is required.';

  if (Object.keys(errors).length) {
    return res.status(400).render('public/checkout', {
      title: 'Checkout',
      items,
      subtotal,
      count,
      form,
      errors,
    });
  }

  // Persist the order + items atomically, decrementing stock.
  const orderId = await db.transaction(async (tx) => {
    const info = await tx(
      `INSERT INTO orders (customer_name, email, phone, address, total, status, notes)
       VALUES (@customer_name, @email, @phone, @address, @total, 'pending', @notes)`
    ).run({ ...form, total: subtotal });

    const id = info.lastInsertRowid;
    for (const i of items) {
      await tx(
        `INSERT INTO order_items (order_id, product_id, name, price, qty)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, i.id, i.name, i.price, i.qty);
      await tx('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(i.qty, i.id);
    }
    return id;
  });

  cart.clear(req.session);

  res.render('public/order-confirm', {
    title: 'Order Confirmed',
    orderId,
    name: form.customer_name,
    email: form.email,
    total: subtotal,
  });
});

module.exports = router;
