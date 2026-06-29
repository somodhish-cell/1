'use strict';

/**
 * Image-upload handling that works in both environments:
 *   - Local / container hosts: write the file to public/uploads (persistent disk).
 *   - Vercel / serverless:     upload to Vercel Blob (read-only FS otherwise).
 *
 * Multer uses in-memory storage so the same buffer can go to either target.
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('./config');
const { slugify } = require('./helpers');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|gif|webp|avif)/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed.'), ok);
  },
});

function buildFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase() || '.jpg';
  const base = slugify(path.basename(originalname || 'img', ext)).slice(0, 40);
  return `${base || 'img'}-${Date.now()}${ext}`;
}

/**
 * Persist an uploaded file and return its public URL, or null if no file.
 */
async function saveUpload(file) {
  if (!file || !file.buffer) return null;
  const filename = buildFilename(file.originalname);

  if (config.useBlob) {
    // Lazy-require so local/dev installs without the package still work.
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${filename}`, file.buffer, {
      access: 'public',
      token: config.blobToken,
      contentType: file.mimetype,
      addRandomSuffix: false,
    });
    return blob.url;
  }

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadsDir, filename), file.buffer);
  return `/uploads/${filename}`;
}

module.exports = { upload, saveUpload };
