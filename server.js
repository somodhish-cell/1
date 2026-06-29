'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
require('express-async-errors'); // route async errors to the error handler
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');

const config = require('./src/config');
const { init } = require('./src/db');
const SqliteSessionStore = require('./src/session-store');
const localsMiddleware = require('./src/middleware/locals');

// On Vercel/serverless the project filesystem is read-only — never try to
// create local data/upload directories there (it would throw at cold start).
// See README "Deploying to Vercel": persistence must move to managed services.
if (!config.isServerless) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

// Fail fast if a real session secret was not provided in production.
if (config.isProd && config.usingDefaultSecret) {
  throw new Error(
    'SESSION_SECRET must be set to a strong random value in production ' +
      '(configure it in Vercel → Project → Settings → Environment Variables).'
  );
}

// Initialize the database schema (async). Requests wait on this promise via the
// gate middleware below, so the schema is guaranteed ready before any query runs.
const dbReady = init();

const app = express();

// Trust the Vercel/reverse-proxy hop so secure cookies and req.protocol work.
app.set('trust proxy', 1);

// Ensure the database schema is initialized before handling any request.
app.use((req, res, next) => {
  dbReady.then(() => next()).catch(next);
});

// View engine + layouts
app.set('view engine', 'ejs');
app.set('views', path.join(config.rootDir, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/public'); // default layout
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static assets
app.use(express.static(path.join(config.rootDir, 'public')));
// Serve uploaded images explicitly so they work even when UPLOADS_DIR points at
// a persistent volume outside the public/ folder (and when not using Blob).
if (!config.useBlob) {
  app.use('/uploads', express.static(config.uploadsDir));
}

// Sessions (persisted to SQLite so logins/carts survive restarts)
app.use(
  session({
    store: new SqliteSessionStore(),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      sameSite: 'lax',
      secure: config.isProd,
    },
  })
);

// Shared view locals (settings, nav, cart, flash, helpers)
app.use(localsMiddleware);

// Routes
app.use('/', require('./src/routes/public'));
app.use('/cart', require('./src/routes/cart'));
app.use('/admin', require('./src/routes/admin'));

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found' });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Something went wrong',
    message: config.isProd ? 'An unexpected error occurred.' : err.message,
    stack: config.isProd ? null : err.stack,
  });
});

// Start a real HTTP listener only when run directly (local / container hosts).
// On Vercel the app is imported by api/index.js and invoked per-request, so
// app.listen() must NOT run there.
if (require.main === module && !config.isServerless) {
  app.listen(config.port, () => {
    console.log(`\n  ${'='.repeat(48)}`);
    console.log(`  ${'Aurora Goods'} — dynamic CMS + shop`);
    console.log(`  Storefront : http://localhost:${config.port}`);
    console.log(`  Admin CMS  : http://localhost:${config.port}/admin`);
    console.log(`  Login      : ${config.admin.username} / (your ADMIN_PASSWORD)`);
    console.log(`  ${'='.repeat(48)}\n`);
  });
}

// Export the Express app so serverless platforms can use it as a handler.
module.exports = app;
