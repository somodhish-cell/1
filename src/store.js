'use strict';

/**
 * Thin async data-access layer over the libSQL database.
 * Every method returns a Promise — callers must `await`.
 */

const { db } = require('./db');

/* ----------------------------- Settings ------------------------------ */

async function getSettings() {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

async function setSetting(key, value) {
  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value == null ? '' : String(value));
}

/* ------------------------------ Pages -------------------------------- */

const Pages = {
  navPages: () =>
    db
      .prepare(
        `SELECT slug, title FROM pages
         WHERE status = 'published' AND show_in_nav = 1
         ORDER BY sort, title`
      )
      .all(),
  bySlug: (slug) => db.prepare('SELECT * FROM pages WHERE slug = ?').get(slug),
  all: () => db.prepare('SELECT * FROM pages ORDER BY sort, title').all(),
  byId: (id) => db.prepare('SELECT * FROM pages WHERE id = ?').get(id),
};

/* ------------------------------ Posts -------------------------------- */

const Posts = {
  published: (limit) => {
    const sql =
      `SELECT * FROM posts WHERE status = 'published'
       ORDER BY published_at DESC, id DESC` + (limit ? ' LIMIT ?' : '');
    const stmt = db.prepare(sql);
    return limit ? stmt.all(limit) : stmt.all();
  },
  bySlug: (slug) =>
    db.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'").get(slug),
  all: () => db.prepare('SELECT * FROM posts ORDER BY published_at DESC, id DESC').all(),
  byId: (id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id),
};

/* ---------------------------- Categories ----------------------------- */

const Categories = {
  all: () => db.prepare('SELECT * FROM categories ORDER BY sort, name').all(),
  bySlug: (slug) => db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug),
  byId: (id) => db.prepare('SELECT * FROM categories WHERE id = ?').get(id),
  withCounts: () =>
    db
      .prepare(
        `SELECT c.*, COUNT(p.id) AS product_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id AND p.status = 'published'
         GROUP BY c.id ORDER BY c.sort, c.name`
      )
      .all(),
};

/* ----------------------------- Products ------------------------------ */

const Products = {
  published: ({ categorySlug, search, limit } = {}) => {
    const where = ["p.status = 'published'"];
    const params = {};
    if (categorySlug) {
      where.push('c.slug = @categorySlug');
      params.categorySlug = categorySlug;
    }
    if (search) {
      where.push('(p.name LIKE @q OR p.description LIKE @q)');
      params.q = `%${search}%`;
    }
    let sql = `SELECT p.*, c.name AS category_name, c.slug AS category_slug
               FROM products p LEFT JOIN categories c ON c.id = p.category_id
               WHERE ${where.join(' AND ')}
               ORDER BY p.featured DESC, p.created_at DESC, p.id DESC`;
    if (limit) {
      sql += ' LIMIT @limit';
      params.limit = limit;
    }
    const stmt = db.prepare(sql);
    return Object.keys(params).length ? stmt.all(params) : stmt.all();
  },
  featured: (limit = 4) =>
    db
      .prepare(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.status = 'published' AND p.featured = 1
         ORDER BY p.created_at DESC LIMIT ?`
      )
      .all(limit),
  bySlug: (slug) =>
    db
      .prepare(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.slug = ? AND p.status = 'published'`
      )
      .get(slug),
  byId: (id) => db.prepare('SELECT * FROM products WHERE id = ?').get(id),
  all: () =>
    db
      .prepare(
        `SELECT p.*, c.name AS category_name
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         ORDER BY p.created_at DESC, p.id DESC`
      )
      .all(),
  related: (product, limit = 3) =>
    db
      .prepare(
        `SELECT p.*, c.slug AS category_slug FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.status = 'published' AND p.id != @id
           AND (p.category_id = @category_id OR @category_id IS NULL)
         ORDER BY RANDOM() LIMIT @limit`
      )
      .all({ id: product.id, category_id: product.category_id ?? null, limit }),
};

/* ------------------------------ Orders ------------------------------- */

const Orders = {
  all: () => db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC').all(),
  byId: (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id),
  items: (orderId) =>
    db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId),
  recent: (limit = 5) =>
    db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit),
};

/* ----------------------------- Messages ------------------------------ */

const Messages = {
  all: () => db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all(),
  byId: (id) => db.prepare('SELECT * FROM messages WHERE id = ?').get(id),
  unreadCount: async () =>
    (await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0').get()).n,
};

/* ------------------------------ Stats -------------------------------- */

async function dashboardStats() {
  const one = async (sql) => (await db.prepare(sql).get()).n;
  return {
    products: await one('SELECT COUNT(*) AS n FROM products'),
    posts: await one('SELECT COUNT(*) AS n FROM posts'),
    pages: await one('SELECT COUNT(*) AS n FROM pages'),
    orders: await one('SELECT COUNT(*) AS n FROM orders'),
    pendingOrders: await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'"),
    unreadMessages: await Messages.unreadCount(),
    revenue: await one(
      "SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE status IN ('paid','shipped')"
    ),
  };
}

module.exports = {
  db,
  getSettings,
  setSetting,
  Pages,
  Posts,
  Categories,
  Products,
  Orders,
  Messages,
  dashboardStats,
};
