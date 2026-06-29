'use strict';

/**
 * Seeds the database with a default admin account, site settings, and sample
 * content (pages, blog posts, product categories, and products).
 *
 *   node src/seed.js            -> seed only if empty (safe to run anytime)
 *   node src/seed.js --reset    -> wipe content tables and re-seed
 *
 * Works against the configured DATABASE_URL — a local file by default, or a
 * remote Turso database when DATABASE_URL/DATABASE_AUTH_TOKEN are set.
 */

const bcrypt = require('bcryptjs');
const { db, init } = require('./db');
const config = require('./config');
const { slugify } = require('./helpers');

const RESET = process.argv.includes('--reset');

async function upsertSetting(key, value) {
  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

async function ensureAdmin() {
  const existing = await db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(config.admin.username);
  if (existing) return;
  const hash = bcrypt.hashSync(config.admin.password, 10);
  await db
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(config.admin.username, hash, 'admin');
  console.log(`  • created admin user "${config.admin.username}"`);
}

async function seedSettings() {
  const defaults = {
    site_name: 'Aurora Goods',
    tagline: 'Curated essentials for modern living',
    currency: 'USD',
    currency_symbol: '$',
    contact_email: 'hello@auroragoods.example',
    contact_phone: '+1 (555) 200-3040',
    address: '128 Market Street, Suite 4, Portland, OR',
    hero_title: 'Things you will actually love to own',
    hero_subtitle:
      'A small, carefully chosen collection of home, desk, and everyday goods — managed end-to-end from our own CMS.',
    footer_about:
      'Aurora Goods is a demo storefront powered by a custom Node.js + libSQL CMS: pages, blog, and a full product catalog, all editable from the admin panel.',
    social_twitter: 'https://twitter.com',
    social_instagram: 'https://instagram.com',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (RESET) {
      await upsertSetting(k, v);
    } else {
      const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
      if (!row) await upsertSetting(k, v);
    }
  }
}

async function clearContent() {
  await db.exec(`
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM products;
    DELETE FROM categories;
    DELETE FROM posts;
    DELETE FROM pages;
    DELETE FROM messages;
  `);
}

async function seedPages() {
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM pages').get()).n;
  if (count > 0) return;
  const pages = [
    {
      slug: 'about',
      title: 'About Us',
      show_in_nav: 1,
      sort: 1,
      body: `## Our story

Aurora Goods began with a simple idea: **own less, but own better.** Every item in our
shop is chosen for how it feels to use day after day.

We are also a working demonstration of a fully dynamic website — this very page, the blog,
and every product are stored in a database and editable from the admin panel. Nothing here
is hard-coded.

### What we value

- **Craft** — products that are built to last.
- **Clarity** — honest descriptions, fair prices.
- **Care** — friendly support, easy returns.

> "The best things are the ones you reach for without thinking."

Want to get in touch? Visit our [contact page](/contact).`,
    },
    {
      slug: 'shipping-returns',
      title: 'Shipping & Returns',
      show_in_nav: 0,
      sort: 2,
      body: `## Shipping

Orders are processed within 1–2 business days. Standard shipping takes 3–5 business days.

## Returns

Not in love with it? Return any item within **30 days** for a full refund. Items must be
unused and in original packaging.`,
    },
  ];
  const stmt = db.prepare(
    `INSERT INTO pages (slug, title, body, status, show_in_nav, sort)
     VALUES (@slug, @title, @body, 'published', @show_in_nav, @sort)`
  );
  for (const p of pages) await stmt.run(p);
  console.log(`  • seeded ${pages.length} pages`);
}

async function seedPosts() {
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM posts').get()).n;
  if (count > 0) return;
  const posts = [
    {
      title: 'Designing a desk you actually want to sit at',
      excerpt:
        'A few small, inexpensive changes that make a workspace feel calmer and more focused.',
      image:
        'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=1200&q=70',
      body: `A good desk isn't about expensive gear — it's about removing friction. Here are three
changes that made the biggest difference for us.

### 1. One light, warm and low

Swap the overhead glare for a single warm desk lamp. Your eyes will thank you by 4pm.

### 2. A home for every cable

Cable clutter is visual noise. A small tray under the desk hides it instantly.

### 3. One object that sparks joy

A plant, a print, a well-made mug — one thing that makes you glad to sit down.`,
    },
    {
      title: 'The case for buying fewer, better things',
      excerpt:
        'Why a small, considered collection beats a drawer full of almost-right items.',
      image:
        'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=70',
      body: `We've all got the drawer — the one full of things that were *almost* right. Buying
fewer, better things is less about minimalism and more about **not settling**.

When you own one great water bottle instead of five mediocre ones, you reach for it without
thinking. That ease is the whole point.`,
    },
    {
      title: 'How this site is built (and why it matters)',
      excerpt:
        'A peek behind the curtain: a custom CMS, a real database, and a storefront — no page is hard-coded.',
      image:
        'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=70',
      body: `Every page you see here is **dynamic**. The text, the blog, and the entire product
catalog live in a database and are edited through an admin panel.

### Under the hood

- **Node.js + Express** for the server
- **libSQL / SQLite** for the database
- **EJS** templates for server-rendered pages
- A full **admin CMS** for pages, posts, products, and orders

That means adding a product or publishing a post takes seconds — no developer required.`,
    },
  ];
  const stmt = db.prepare(
    `INSERT INTO posts (slug, title, excerpt, body, image, status)
     VALUES (@slug, @title, @excerpt, @body, @image, 'published')`
  );
  for (const p of posts) await stmt.run({ ...p, slug: slugify(p.title) });
  console.log(`  • seeded ${posts.length} blog posts`);
}

async function seedShop() {
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM products').get()).n;
  if (count > 0) return;

  const categories = [
    { name: 'Home', slug: 'home', sort: 1 },
    { name: 'Desk', slug: 'desk', sort: 2 },
    { name: 'Everyday', slug: 'everyday', sort: 3 },
  ];
  const catStmt = db.prepare(
    'INSERT INTO categories (name, slug, sort) VALUES (@name, @slug, @sort)'
  );
  const catId = {};
  for (const c of categories) {
    const info = await catStmt.run(c);
    catId[c.slug] = info.lastInsertRowid;
  }

  const products = [
    {
      name: 'Ceramic Pour-Over Set',
      cat: 'home',
      price: 4800,
      stock: 24,
      featured: 1,
      image:
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=70',
      description:
        'A matte stoneware pour-over and carafe for a slow, satisfying morning cup. Holds 600ml.',
    },
    {
      name: 'Linen Throw Blanket',
      cat: 'home',
      price: 7900,
      stock: 12,
      featured: 1,
      image:
        'https://images.unsplash.com/photo-1580301762395-21ce84d00bc6?auto=format&fit=crop&w=900&q=70',
      description:
        'Stonewashed European linen that gets softer with every wash. Generous 130×170cm size.',
    },
    {
      name: 'Solid Oak Desk Tray',
      cat: 'desk',
      price: 3400,
      stock: 40,
      featured: 1,
      image:
        'https://images.unsplash.com/photo-1593642634367-d91a135587b5?auto=format&fit=crop&w=900&q=70',
      description:
        'A simple oiled-oak valet for pens, keys, and the little things. Hand-finished edges.',
    },
    {
      name: 'Warm LED Desk Lamp',
      cat: 'desk',
      price: 6200,
      stock: 18,
      featured: 0,
      image:
        'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=70',
      description:
        'Dimmable, flicker-free, and warm (2700K). The only light your desk needs after dark.',
    },
    {
      name: 'Insulated Water Bottle',
      cat: 'everyday',
      price: 2900,
      stock: 60,
      featured: 1,
      image:
        'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=70',
      description:
        'Keeps drinks cold 24h, hot 12h. Powder-coated 18/8 steel, 600ml, leak-proof lid.',
    },
    {
      name: 'Canvas Everyday Tote',
      cat: 'everyday',
      price: 3800,
      stock: 35,
      featured: 0,
      image:
        'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=900&q=70',
      description:
        'Heavyweight 16oz cotton canvas with reinforced straps. Carries far more than it looks.',
    },
    {
      name: 'Minimal Wall Clock',
      cat: 'home',
      price: 5400,
      stock: 0,
      featured: 0,
      image:
        'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=900&q=70',
      description:
        'Silent sweep movement and a clean, numberless face. Currently out of stock.',
    },
    {
      name: 'Leather Cable Organizer',
      cat: 'desk',
      price: 1900,
      stock: 80,
      featured: 0,
      image:
        'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=900&q=70',
      description:
        'Full-grain leather snaps that tame charging cables and earbuds. Set of three.',
    },
  ];

  const stmt = db.prepare(
    `INSERT INTO products (slug, name, description, price, image, category_id, stock, featured, status)
     VALUES (@slug, @name, @description, @price, @image, @category_id, @stock, @featured, 'published')`
  );
  for (const p of products) {
    await stmt.run({
      slug: slugify(p.name),
      name: p.name,
      description: p.description,
      price: p.price,
      image: p.image,
      category_id: catId[p.cat],
      stock: p.stock,
      featured: p.featured,
    });
  }
  console.log(
    `  • seeded ${categories.length} categories and ${products.length} products`
  );
}

async function seedSampleOrder() {
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM orders').get()).n;
  if (count > 0) return;
  const p = await db.prepare('SELECT * FROM products LIMIT 1').get();
  if (!p) return;
  const total = p.price * 2;
  const info = await db
    .prepare(
      `INSERT INTO orders (customer_name, email, phone, address, total, status, notes)
       VALUES (?, ?, ?, ?, ?, 'paid', ?)`
    )
    .run(
      'Jamie Rivera',
      'jamie@example.com',
      '+1 555 0100',
      '42 Elm Street, Portland, OR',
      total,
      'Sample order created by the seeder.'
    );
  await db
    .prepare(
      `INSERT INTO order_items (order_id, product_id, name, price, qty)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(info.lastInsertRowid, p.id, p.name, p.price, 2);
  console.log('  • seeded 1 sample order');
}

async function run() {
  console.log(`Seeding database${RESET ? ' (reset mode)' : ''}…`);
  await init();
  await ensureAdmin();
  if (RESET) await clearContent();
  await seedSettings();
  await seedPages();
  await seedPosts();
  await seedShop();
  await seedSampleOrder();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
