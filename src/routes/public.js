'use strict';

const express = require('express');
const router = express.Router();

const { db, Posts, Products, Categories, Pages } = require('../store');

/* -------------------------------- Home -------------------------------- */

router.get('/', async (req, res) => {
  const [featured, latestPosts, categories] = await Promise.all([
    Products.featured(4),
    Posts.published(3),
    Categories.withCounts(),
  ]);
  res.render('public/home', { title: 'Home', featured, latestPosts, categories });
});

/* -------------------------------- Shop -------------------------------- */

router.get('/shop', async (req, res) => {
  const categorySlug = req.query.category || null;
  const search = (req.query.q || '').trim() || null;
  const [products, categories, activeCategory] = await Promise.all([
    Products.published({ categorySlug, search }),
    Categories.withCounts(),
    categorySlug ? Categories.bySlug(categorySlug) : Promise.resolve(null),
  ]);
  res.render('public/shop', {
    title: activeCategory ? activeCategory.name : 'Shop',
    products,
    categories,
    activeCategory: categorySlug,
    search: search || '',
  });
});

/* ------------------------------ Product ------------------------------- */

router.get('/product/:slug', async (req, res) => {
  const product = await Products.bySlug(req.params.slug);
  if (!product) {
    return res.status(404).render('404', { title: 'Product not found' });
  }
  res.render('public/product', {
    title: product.name,
    product,
    related: await Products.related(product, 3),
  });
});

/* -------------------------------- Blog -------------------------------- */

router.get('/blog', async (req, res) => {
  res.render('public/blog', { title: 'Blog', posts: await Posts.published() });
});

router.get('/blog/:slug', async (req, res) => {
  const post = await Posts.bySlug(req.params.slug);
  if (!post) {
    return res.status(404).render('404', { title: 'Post not found' });
  }
  const recent = await Posts.published(4);
  const more = recent.filter((p) => p.id !== post.id).slice(0, 3);
  res.render('public/post', { title: post.title, post, more });
});

/* ------------------------------ Contact ------------------------------- */

router.get('/contact', (req, res) => {
  res.render('public/contact', { title: 'Contact', form: {}, errors: {} });
});

router.post('/contact', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const subject = (req.body.subject || '').trim();
  const body = (req.body.message || '').trim();

  const errors = {};
  if (!name) errors.name = 'Please tell us your name.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'A valid email is required.';
  if (!body) errors.message = 'Please enter a message.';

  if (Object.keys(errors).length) {
    return res.status(400).render('public/contact', {
      title: 'Contact',
      form: { name, email, subject, message: body },
      errors,
    });
  }

  await db
    .prepare('INSERT INTO messages (name, email, subject, body) VALUES (?, ?, ?, ?)')
    .run(name, email, subject, body);

  req.session.flash = {
    type: 'success',
    message: 'Thanks — your message has been sent. We will be in touch soon.',
  };
  res.redirect('/contact');
});

/* ------------------------- CMS-managed pages -------------------------- */
// Keep this LAST so it does not shadow fixed routes above.

router.get('/page/:slug', async (req, res) => {
  const page = await Pages.bySlug(req.params.slug);
  if (!page || page.status !== 'published') {
    return res.status(404).render('404', { title: 'Page not found' });
  }
  res.render('public/page', { title: page.title, page });
});

module.exports = router;
