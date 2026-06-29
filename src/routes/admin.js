'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');

const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { upload, saveUpload } = require('../uploads');
const {
  db,
  getSettings,
  setSetting,
  Products,
  Categories,
  Posts,
  Pages,
  Orders,
  Messages,
  dashboardStats,
} = require('../store');
const { slugify, parsePriceToCents } = require('../helpers');

// All admin pages use the admin layout by default (login overrides to false).
router.use((req, res, next) => {
  res.locals.layout = 'layouts/admin';
  next();
});

/* --------------------------- Helpers ---------------------------------- */

/** Resolve the image value: prefer an uploaded file, else a pasted URL. */
async function resolveImage(req, fallback) {
  if (req.file) {
    const url = await saveUpload(req.file);
    if (url) return url;
  }
  const url = (req.body.image_url || '').trim();
  if (url) return url;
  return fallback === undefined ? null : fallback;
}

/** Make a slug unique within a table (appends -2, -3, … on collision). */
async function uniqueSlug(table, desired, excludeId = null) {
  const base = slugify(desired);
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const row = excludeId
      ? await db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).get(slug, excludeId)
      : await db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(slug);
    if (!row) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

/* ------------------------------- Auth --------------------------------- */

router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', layout: false, error: null });
});

router.post('/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).render('admin/login', {
      title: 'Admin Login',
      layout: false,
      error: 'Invalid username or password.',
    });
  }
  req.session.admin = { id: user.id, username: user.username, role: user.role };
  const dest = req.session.returnTo || '/admin';
  delete req.session.returnTo;
  flash(req, 'success', `Welcome back, ${user.username}.`);
  res.redirect(dest);
});

router.post('/logout', (req, res) => {
  req.session.admin = null;
  res.redirect('/admin/login');
});

// Everything below requires authentication.
router.use(requireAdmin);

/* ----------------------------- Dashboard ------------------------------ */

router.get('/', async (req, res) => {
  const [stats, recentOrders, lowStock] = await Promise.all([
    dashboardStats(),
    Orders.recent(5),
    db
      .prepare("SELECT * FROM products WHERE status='published' AND stock <= 3 ORDER BY stock ASC LIMIT 5")
      .all(),
  ]);
  res.render('admin/dashboard', { title: 'Dashboard', stats, recentOrders, lowStock });
});

/* ------------------------------ Products ------------------------------ */

router.get('/products', async (req, res) => {
  res.render('admin/products', { title: 'Products', products: await Products.all() });
});

router.get('/products/new', async (req, res) => {
  res.render('admin/product-form', {
    title: 'New Product',
    product: { status: 'published', stock: 0, featured: 0, price: 0 },
    categories: await Categories.all(),
    isNew: true,
  });
});

router.post('/products', upload.single('image'), async (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim();
  if (!name) {
    flash(req, 'error', 'Product name is required.');
    return res.redirect('/admin/products/new');
  }
  await db
    .prepare(
      `INSERT INTO products (slug, name, description, price, image, category_id, stock, featured, status)
       VALUES (@slug, @name, @description, @price, @image, @category_id, @stock, @featured, @status)`
    )
    .run({
      slug: await uniqueSlug('products', b.slug || name),
      name,
      description: (b.description || '').trim(),
      price: parsePriceToCents(b.price),
      image: await resolveImage(req, null),
      category_id: b.category_id ? parseInt(b.category_id, 10) : null,
      stock: parseInt(b.stock, 10) || 0,
      featured: b.featured ? 1 : 0,
      status: b.status === 'draft' ? 'draft' : 'published',
    });
  flash(req, 'success', `Product “${name}” created.`);
  res.redirect('/admin/products');
});

router.get('/products/:id/edit', async (req, res) => {
  const [product, categories] = await Promise.all([
    Products.byId(req.params.id),
    Categories.all(),
  ]);
  if (!product) return res.redirect('/admin/products');
  res.render('admin/product-form', { title: 'Edit Product', product, categories, isNew: false });
});

router.post('/products/:id', upload.single('image'), async (req, res) => {
  const product = await Products.byId(req.params.id);
  if (!product) return res.redirect('/admin/products');
  const b = req.body;
  const name = (b.name || '').trim() || product.name;
  await db
    .prepare(
      `UPDATE products SET
         slug=@slug, name=@name, description=@description, price=@price,
         image=@image, category_id=@category_id, stock=@stock,
         featured=@featured, status=@status, updated_at=datetime('now')
       WHERE id=@id`
    )
    .run({
      id: product.id,
      slug: await uniqueSlug('products', b.slug || name, product.id),
      name,
      description: (b.description || '').trim(),
      price: parsePriceToCents(b.price),
      image: await resolveImage(req, product.image),
      category_id: b.category_id ? parseInt(b.category_id, 10) : null,
      stock: parseInt(b.stock, 10) || 0,
      featured: b.featured ? 1 : 0,
      status: b.status === 'draft' ? 'draft' : 'published',
    });
  flash(req, 'success', `Product “${name}” updated.`);
  res.redirect('/admin/products');
});

router.post('/products/:id/delete', async (req, res) => {
  await db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Product deleted.');
  res.redirect('/admin/products');
});

/* ----------------------------- Categories ----------------------------- */

router.get('/categories', async (req, res) => {
  res.render('admin/categories', { title: 'Categories', categories: await Categories.withCounts() });
});

router.post('/categories', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (name) {
    await db
      .prepare('INSERT INTO categories (name, slug, sort) VALUES (?, ?, ?)')
      .run(name, await uniqueSlug('categories', name), parseInt(req.body.sort, 10) || 0);
    flash(req, 'success', `Category “${name}” added.`);
  }
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', async (req, res) => {
  await db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Category deleted.');
  res.redirect('/admin/categories');
});

/* ------------------------------- Posts -------------------------------- */

router.get('/posts', async (req, res) => {
  res.render('admin/posts', { title: 'Blog Posts', posts: await Posts.all() });
});

router.get('/posts/new', (req, res) => {
  res.render('admin/post-form', { title: 'New Post', post: { status: 'published' }, isNew: true });
});

router.post('/posts', upload.single('image'), async (req, res) => {
  const b = req.body;
  const title = (b.title || '').trim();
  if (!title) {
    flash(req, 'error', 'Post title is required.');
    return res.redirect('/admin/posts/new');
  }
  await db
    .prepare(
      `INSERT INTO posts (slug, title, excerpt, body, image, status)
       VALUES (@slug, @title, @excerpt, @body, @image, @status)`
    )
    .run({
      slug: await uniqueSlug('posts', b.slug || title),
      title,
      excerpt: (b.excerpt || '').trim(),
      body: b.body || '',
      image: await resolveImage(req, null),
      status: b.status === 'draft' ? 'draft' : 'published',
    });
  flash(req, 'success', `Post “${title}” created.`);
  res.redirect('/admin/posts');
});

router.get('/posts/:id/edit', async (req, res) => {
  const post = await Posts.byId(req.params.id);
  if (!post) return res.redirect('/admin/posts');
  res.render('admin/post-form', { title: 'Edit Post', post, isNew: false });
});

router.post('/posts/:id', upload.single('image'), async (req, res) => {
  const post = await Posts.byId(req.params.id);
  if (!post) return res.redirect('/admin/posts');
  const b = req.body;
  const title = (b.title || '').trim() || post.title;
  await db
    .prepare(
      `UPDATE posts SET
         slug=@slug, title=@title, excerpt=@excerpt, body=@body, image=@image,
         status=@status, updated_at=datetime('now')
       WHERE id=@id`
    )
    .run({
      id: post.id,
      slug: await uniqueSlug('posts', b.slug || title, post.id),
      title,
      excerpt: (b.excerpt || '').trim(),
      body: b.body || '',
      image: await resolveImage(req, post.image),
      status: b.status === 'draft' ? 'draft' : 'published',
    });
  flash(req, 'success', `Post “${title}” updated.`);
  res.redirect('/admin/posts');
});

router.post('/posts/:id/delete', async (req, res) => {
  await db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Post deleted.');
  res.redirect('/admin/posts');
});

/* ------------------------------- Pages -------------------------------- */

router.get('/pages', async (req, res) => {
  res.render('admin/pages', { title: 'Pages', pages: await Pages.all() });
});

router.get('/pages/new', (req, res) => {
  res.render('admin/page-form', {
    title: 'New Page',
    page: { status: 'published', show_in_nav: 0, sort: 0 },
    isNew: true,
  });
});

router.post('/pages', async (req, res) => {
  const b = req.body;
  const title = (b.title || '').trim();
  if (!title) {
    flash(req, 'error', 'Page title is required.');
    return res.redirect('/admin/pages/new');
  }
  await db
    .prepare(
      `INSERT INTO pages (slug, title, body, status, show_in_nav, sort)
       VALUES (@slug, @title, @body, @status, @show_in_nav, @sort)`
    )
    .run({
      slug: await uniqueSlug('pages', b.slug || title),
      title,
      body: b.body || '',
      status: b.status === 'draft' ? 'draft' : 'published',
      show_in_nav: b.show_in_nav ? 1 : 0,
      sort: parseInt(b.sort, 10) || 0,
    });
  flash(req, 'success', `Page “${title}” created.`);
  res.redirect('/admin/pages');
});

router.get('/pages/:id/edit', async (req, res) => {
  const page = await Pages.byId(req.params.id);
  if (!page) return res.redirect('/admin/pages');
  res.render('admin/page-form', { title: 'Edit Page', page, isNew: false });
});

router.post('/pages/:id', async (req, res) => {
  const page = await Pages.byId(req.params.id);
  if (!page) return res.redirect('/admin/pages');
  const b = req.body;
  const title = (b.title || '').trim() || page.title;
  await db
    .prepare(
      `UPDATE pages SET
         slug=@slug, title=@title, body=@body, status=@status,
         show_in_nav=@show_in_nav, sort=@sort, updated_at=datetime('now')
       WHERE id=@id`
    )
    .run({
      id: page.id,
      slug: await uniqueSlug('pages', b.slug || title, page.id),
      title,
      body: b.body || '',
      status: b.status === 'draft' ? 'draft' : 'published',
      show_in_nav: b.show_in_nav ? 1 : 0,
      sort: parseInt(b.sort, 10) || 0,
    });
  flash(req, 'success', `Page “${title}” updated.`);
  res.redirect('/admin/pages');
});

router.post('/pages/:id/delete', async (req, res) => {
  await db.prepare('DELETE FROM pages WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Page deleted.');
  res.redirect('/admin/pages');
});

/* ------------------------------- Orders ------------------------------- */

router.get('/orders', async (req, res) => {
  res.render('admin/orders', { title: 'Orders', orders: await Orders.all() });
});

router.get('/orders/:id', async (req, res) => {
  const order = await Orders.byId(req.params.id);
  if (!order) return res.redirect('/admin/orders');
  res.render('admin/order-detail', {
    title: `Order #${order.id}`,
    order,
    items: await Orders.items(order.id),
  });
});

router.post('/orders/:id/status', async (req, res) => {
  const allowed = ['pending', 'paid', 'shipped', 'cancelled'];
  const status = allowed.includes(req.body.status) ? req.body.status : 'pending';
  await db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  flash(req, 'success', `Order #${req.params.id} marked “${status}”.`);
  res.redirect(`/admin/orders/${req.params.id}`);
});

/* ------------------------------ Messages ------------------------------ */

router.get('/messages', async (req, res) => {
  res.render('admin/messages', { title: 'Messages', messages: await Messages.all() });
});

router.post('/messages/:id/read', async (req, res) => {
  await db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.redirect('/admin/messages');
});

router.post('/messages/:id/delete', async (req, res) => {
  await db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Message deleted.');
  res.redirect('/admin/messages');
});

/* ------------------------------ Settings ------------------------------ */

const SETTING_KEYS = [
  'site_name', 'tagline', 'currency', 'currency_symbol',
  'contact_email', 'contact_phone', 'address',
  'hero_title', 'hero_subtitle', 'footer_about',
  'social_twitter', 'social_instagram',
];

router.get('/settings', async (req, res) => {
  res.render('admin/settings', { title: 'Site Settings', settings: await getSettings() });
});

router.post('/settings', async (req, res) => {
  for (const key of SETTING_KEYS) {
    if (key in req.body) await setSetting(key, req.body[key]);
  }
  // Optional admin password change
  const newPass = (req.body.new_password || '').trim();
  if (newPass) {
    const hash = bcrypt.hashSync(newPass, 10);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.session.admin.id);
  }
  flash(req, 'success', 'Settings saved.');
  res.redirect('/admin/settings');
});

/* --------------------------- Upload error handler --------------------- */
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err) {
    flash(req, 'error', err.message || 'Upload failed.');
    return res.redirect(req.get('Referrer') || '/admin');
  }
  next();
});

module.exports = router;
