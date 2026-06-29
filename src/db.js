'use strict';

const fs = require('fs');
const { createClient } = require('@libsql/client');
const config = require('./config');

// Ensure the data directory exists for the local file database. On serverless
// (read-only FS) we use a remote Turso URL instead, so skip the mkdir there.
if (!config.isServerless && config.dbUrl.startsWith('file:')) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

const client = createClient({
  url: config.dbUrl,
  authToken: config.dbAuthToken,
});

/**
 * Normalize the arguments passed to a prepared statement into the shape the
 * libSQL client expects: a single plain object => named args; otherwise the
 * positional argument list.
 */
function argify(args) {
  if (
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0])
  ) {
    return args[0];
  }
  return args;
}

/**
 * A small async wrapper that mimics the better-sqlite3 statement API
 * (`.get()`, `.all()`, `.run()`) on top of the async libSQL client, so the
 * data-access code reads naturally — callers just `await` the results.
 */
function prepare(sql) {
  return {
    async get(...args) {
      const res = await client.execute({ sql, args: argify(args) });
      return res.rows[0];
    },
    async all(...args) {
      const res = await client.execute({ sql, args: argify(args) });
      return res.rows;
    },
    async run(...args) {
      const res = await client.execute({ sql, args: argify(args) });
      return {
        changes: Number(res.rowsAffected),
        lastInsertRowid:
          res.lastInsertRowid != null ? Number(res.lastInsertRowid) : undefined,
      };
    },
  };
}

/** Execute one or more semicolon-separated statements (DDL, batch deletes). */
async function exec(sql) {
  await client.executeMultiple(sql);
}

/**
 * Run `fn` inside an interactive write transaction. `fn` receives a `tx` object
 * exposing the same `prepare()` API, bound to the transaction.
 */
async function transaction(fn) {
  const tx = await client.transaction('write');
  const txPrepare = (sql) => ({
    async get(...args) {
      const res = await tx.execute({ sql, args: argify(args) });
      return res.rows[0];
    },
    async all(...args) {
      const res = await tx.execute({ sql, args: argify(args) });
      return res.rows;
    },
    async run(...args) {
      const res = await tx.execute({ sql, args: argify(args) });
      return {
        changes: Number(res.rowsAffected),
        lastInsertRowid:
          res.lastInsertRowid != null ? Number(res.lastInsertRowid) : undefined,
      };
    },
  });
  try {
    const result = await fn(txPrepare);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* ignore rollback errors */
    }
    throw err;
  }
}

// Expose a better-sqlite3-like facade used throughout the app.
const db = { prepare, exec, transaction, client };

/**
 * Create the full schema if it does not yet exist. Idempotent.
 */
async function init() {
  await exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'admin',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS pages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      slug       TEXT NOT NULL UNIQUE,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'published',
      show_in_nav INTEGER NOT NULL DEFAULT 0,
      sort       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slug         TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      excerpt      TEXT NOT NULL DEFAULT '',
      body         TEXT NOT NULL DEFAULT '',
      image        TEXT,
      status       TEXT NOT NULL DEFAULT 'published',
      published_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price       INTEGER NOT NULL DEFAULT 0,
      image       TEXT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      stock       INTEGER NOT NULL DEFAULT 0,
      featured    INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'published',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      email         TEXT NOT NULL,
      phone         TEXT,
      address       TEXT,
      total         INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'pending',
      notes         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      name       TEXT NOT NULL,
      price      INTEGER NOT NULL,
      qty        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      subject    TEXT,
      body       TEXT NOT NULL,
      is_read    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid    TEXT PRIMARY KEY,
      sess   TEXT NOT NULL,
      expire INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
    CREATE INDEX IF NOT EXISTS idx_posts_status      ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);
}

module.exports = { db, init };
