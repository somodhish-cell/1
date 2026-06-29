'use strict';

/**
 * Minimal .env loader (no external dependency).
 * Reads key=value pairs from a .env file in the project root, if present,
 * without overwriting variables already set in the real environment.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const DEFAULT_SECRET = 'dev-insecure-secret-change-me';

const config = {
  rootDir,
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  // True on Vercel/AWS Lambda style platforms (read-only, ephemeral FS).
  isServerless: !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME),
  sessionSecret: process.env.SESSION_SECRET || DEFAULT_SECRET,
  usingDefaultSecret: !process.env.SESSION_SECRET,
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
  dataDir: path.join(rootDir, 'data'),
  dbPath: path.join(rootDir, 'data', 'app.db'),
  // Where uploaded images are written on disk. Override with UPLOADS_DIR to point
  // at a mounted persistent volume on container hosts.
  uploadsDir: process.env.UPLOADS_DIR || path.join(rootDir, 'public', 'uploads'),

  // Database connection (libSQL).
  //  - Local / container hosts: a file URL on the persistent disk (default).
  //  - Vercel / serverless:     a remote Turso URL via DATABASE_URL.
  dbUrl: process.env.DATABASE_URL || `file:${path.join(rootDir, 'data', 'app.db')}`,
  dbAuthToken: process.env.DATABASE_AUTH_TOKEN || undefined,

  // File uploads: use Vercel Blob when a token is present, else local disk.
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || undefined,
};

// Uploads go to Blob when we have a token (required on serverless), else disk.
config.useBlob = !!config.blobToken;

module.exports = config;
