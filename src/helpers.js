'use strict';

const { marked } = require('marked');

marked.setOptions({ breaks: true, gfm: true });

/** Convert an arbitrary string into a URL-safe slug. */
function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/** Format an integer amount of minor units (cents) as a currency string. */
function formatMoney(cents, currency = 'USD', symbol = '$') {
  const value = (Number(cents || 0) / 100).toFixed(2);
  // Simple symbol-prefixed formatting with thousands separators.
  const [whole, frac] = value.split('.');
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${symbol}${withSep}.${frac}`;
}

/** Parse a user-entered price like "19.99" or "$1,299" into integer cents. */
function parsePriceToCents(input) {
  const num = parseFloat(String(input).replace(/[^0-9.]/g, ''));
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

/** Render markdown content to safe-ish HTML for display. */
function renderMarkdown(text) {
  return marked.parse(String(text || ''));
}

/** Truncate plain text to a length, adding an ellipsis. */
function truncate(text, len = 160) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > len ? s.slice(0, len - 1).trimEnd() + '…' : s;
}

/** Format an ISO/SQLite datetime string into a readable date. */
function formatDate(value) {
  if (!value) return '';
  const d = new Date(value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Escape HTML for safe interpolation in non-EJS contexts. */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  slugify,
  formatMoney,
  parsePriceToCents,
  renderMarkdown,
  truncate,
  formatDate,
  escapeHtml,
};
