# Aurora Goods — Dynamic Website (CMS + Database + E‑commerce)

A complete, dynamic, database‑driven website with a built‑in **content management
system (CMS)** and a working **online store**. Nothing is hard‑coded — every page,
blog post, product, and setting lives in a database and is editable from the admin
panel.

Built with **Node.js + Express + libSQL (SQLite)** and server‑rendered **EJS**
templates. It runs locally with **zero external setup** — the database is a local
file by default and no native build tools are required. The same codebase also
deploys to **Vercel** (with a hosted Turso database + Vercel Blob) and to any
**container host** (Render/Railway/Fly.io) **unchanged**.

---

## ✨ Features

**Public storefront (7 pages)**
- **Home** — hero, category chips, featured products, latest blog posts.
- **Shop** — product grid with category filter + search, stock/featured badges.
- **Product** — detail page, quantity selector, related products, add to cart.
- **Blog** — post listing and individual post pages (Markdown content).
- **Pages** — CMS‑managed static pages (e.g. About, Shipping & Returns).
- **Contact** — validated form that saves messages to the database.
- **Cart & Checkout** — session cart, checkout form, order confirmation.

**E‑commerce**
- Categories, prices (safe integer cents), images, stock levels, featured flag.
- Session‑based cart (add / update qty / remove).
- Checkout creates an order + line items in a single transaction and decrements stock.
- Out‑of‑stock handling.

**Admin CMS** (`/admin`, login‑protected)
- Dashboard with stats (products, orders, posts, unread messages, revenue, low stock).
- **Products** + **Categories** — full create / edit / delete, image upload or URL.
- **Blog posts** — Markdown editor, draft/published, featured image.
- **Pages** — Markdown, show‑in‑nav toggle, sort order.
- **Orders** — view line items, update status (pending / paid / shipped / cancelled).
- **Messages** — read contact submissions, mark read, delete.
- **Settings** — site name, tagline, currency, contact info, hero/footer text, socials,
  and admin password change.

---

## 🚀 Quick start

Requirements: **Node.js 18+** (the project pins **22.x** to match the Vercel runtime).

```bash
npm install        # install dependencies (no compilation needed)
npm run seed       # create the admin user + sample content
npm start          # start the server
```

Then open:

- Storefront → <http://localhost:3000>
- Admin CMS  → <http://localhost:3000/admin>

**Default admin login:** `admin` / `admin123`
> Change the password under **Admin → Settings**, or set `ADMIN_PASSWORD` before the
> first `npm run seed`.

---

## ⚙️ Configuration

Copy `.env.example` to `.env` to override defaults (all optional):

| Variable          | Default            | Purpose                                  |
| ----------------- | ------------------ | ---------------------------------------- |
| `PORT`            | `3000`             | Port the server listens on               |
| `NODE_ENV`        | `development`      | `production` enables secure cookies      |
| `SESSION_SECRET`  | dev secret         | **Change in production** (cookie signing)|
| `ADMIN_USERNAME`  | `admin`            | Admin account created on first seed      |
| `ADMIN_PASSWORD`  | `admin123`         | Admin password created on first seed     |

> If port 3000 is busy, run with another port: `PORT=3010 npm start`.

---

## 📜 Scripts

| Command          | What it does                                             |
| ---------------- | -------------------------------------------------------- |
| `npm start`      | Start the server                                         |
| `npm run dev`    | Start with auto‑reload (`node --watch`)                  |
| `npm run seed`   | Seed admin + sample content (safe — only fills if empty) |
| `npm run reset`  | Wipe content tables and re‑seed fresh sample data        |

---

## 🗂️ Project structure

```
.
├── server.js                 # App entry: Express setup, sessions, routes (exports app)
├── api/index.js              # Vercel serverless entry (re-exports the app)
├── vercel.json               # Vercel routing + function config
├── Dockerfile                # Container image for persistent-disk hosts
├── render.yaml               # Render Blueprint (one-click deploy w/ disk)
├── src/
│   ├── config.js             # Env/config loader + serverless detection
│   ├── db.js                 # libSQL client, schema, async prepare/transaction
│   ├── seed.js               # Admin + sample content seeder (idempotent)
│   ├── store.js              # Async data‑access layer (queries)
│   ├── cart.js               # Session cart logic
│   ├── uploads.js            # Image uploads → Vercel Blob (serverless) or disk
│   ├── helpers.js            # slug, money, markdown, date helpers
│   ├── session-store.js      # libSQL‑backed express-session store
│   ├── middleware/
│   │   ├── auth.js           # Admin route guard
│   │   └── locals.js         # Shared view data (settings, nav, cart, flash)
│   └── routes/
│       ├── public.js         # Home, shop, product, blog, pages, contact
│       ├── cart.js           # Cart + checkout + orders
│       └── admin.js          # Full admin CMS
├── views/                    # EJS templates (layouts, partials, public, admin)
├── public/                   # CSS, client JS, uploaded images
└── data/                     # Local libSQL database file (generated, gitignored)
```

---

## 🧱 Data model

`users`, `settings`, `pages`, `posts`, `categories`, `products`, `orders`,
`order_items`, `messages`.

Prices are stored as **integer minor units (cents)** to avoid floating‑point money
bugs and formatted for display via the currency settings.

---

## 🛒 Try it out

1. Log in to `/admin` and add a product (upload an image or paste an image URL).
2. Visit `/shop`, add items to the cart, and complete checkout.
3. Back in `/admin/orders`, watch the order arrive and update its status.
4. Publish a blog post and a new page (toggle “show in navigation”).
5. Tweak branding under **Settings** and watch the site update instantly.

---

## 🔒 Production notes

This is a complete demo/starter. Before going live you should:
- Set a strong `SESSION_SECRET` and `NODE_ENV=production` (enables secure cookies).
- Change the default admin password.
- Put the app behind HTTPS (e.g. a reverse proxy).
- Integrate a real payment provider in the checkout step (currently records orders
  as `pending` without charging).

## ▲ Deploying to Vercel

The app is fully Vercel‑compatible: it exports the Express app as a serverless
function (`api/index.js`), reads/writes a **hosted Turso (libSQL)** database, stores
uploads in **Vercel Blob**, and persists sessions in the database. The same libSQL
client talks to a local file in dev and to Turso in production — no code changes.

**Steps:**

1. **Create a Turso database** and grab its URL + auth token
   (`turso db create aurora && turso db show aurora --url && turso db tokens create aurora`).
2. **Create a Vercel Blob store** (Vercel → Storage → Blob) to get a
   `BLOB_READ_WRITE_TOKEN`.
3. **Set Environment Variables** in Vercel → Project → Settings → Environment Variables:

   | Variable                | Required | Notes                                           |
   | ----------------------- | -------- | ----------------------------------------------- |
   | `SESSION_SECRET`        | ✅ yes   | Long random string; prod boot fails without it. |
   | `DATABASE_URL`          | ✅ yes   | `libsql://your-db.turso.io`                      |
   | `DATABASE_AUTH_TOKEN`   | ✅ yes   | Turso token.                                    |
   | `BLOB_READ_WRITE_TOKEN` | ✅ yes   | From Vercel Blob (enables image uploads).       |
   | `ADMIN_USERNAME`        | optional | Defaults to `admin`.                            |
   | `ADMIN_PASSWORD`        | optional | Set a strong value before seeding.              |

4. **Seed the Turso database once** (from your machine, pointing at Turso):
   ```bash
   DATABASE_URL=libsql://your-db.turso.io DATABASE_AUTH_TOKEN=xxx \
   ADMIN_PASSWORD=your-strong-pass node src/seed.js
   ```
5. **Deploy** (`vercel --prod`, or connect the Git repo).

> `NODE_ENV=production` is set automatically by Vercel. Never commit a `.env`.
> `vercel.json` routes non‑static requests to the function and bundles `views/**`;
> `trust proxy` makes secure cookies work behind Vercel's HTTPS proxy.

### Alternative: a container host (works unchanged, with a local DB)

Prefer not to use managed services? A **persistent‑disk platform** runs this app
**as‑is** with the local libSQL file — no Turso/Blob needed:

- **Render** — the included `render.yaml` is a one‑click Blueprint (provisions a 1 GB
  disk mounted at `/var/data`, generates `SESSION_SECRET`, seeds, and starts).
- **Docker / Railway / Fly.io / VPS** — build the `Dockerfile`; it stores the DB and
  uploads on a mounted volume (`/data`) via `DATABASE_URL` + `UPLOADS_DIR`.

## 🔐 Going further

- The checkout records orders as `pending` without charging — integrate a real
  payment provider (e.g. Stripe) for live sales.
- Consider adding `helmet` for security headers and rate‑limiting on auth routes.

## License

MIT
