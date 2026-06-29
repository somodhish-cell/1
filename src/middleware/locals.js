'use strict';

/**
 * Injects values that every view needs: site settings, navigation pages,
 * cart summary, flash messages, helper functions, and the logged-in admin.
 */

const { getSettings, Pages } = require('../store');
const helpers = require('../helpers');

function cartSummary(cart) {
  const items = cart && Array.isArray(cart.items) ? cart.items : [];
  const count = items.reduce((n, i) => n + i.qty, 0);
  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  return { count, subtotal };
}

module.exports = async function locals(req, res, next) {
  try {
    const [settings, navPages] = await Promise.all([getSettings(), Pages.navPages()]);
    res.locals.settings = settings;
    res.locals.navPages = navPages;
    res.locals.currentPath = req.path;
    res.locals.admin = req.session.admin || null;

    // Cart summary for the header badge
    res.locals.cart = cartSummary(req.session.cart);

    // Flash message (one-shot)
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;

    // Currency-aware money helper bound to current settings
    const symbol = settings.currency_symbol || '$';
    const currency = settings.currency || 'USD';
    res.locals.money = (cents) => helpers.formatMoney(cents, currency, symbol);

    // Expose the rest of the helpers to templates
    res.locals.h = helpers;
    res.locals.formatDate = helpers.formatDate;
    res.locals.truncate = helpers.truncate;
    res.locals.markdown = helpers.renderMarkdown;

    res.locals.year = new Date().getFullYear();

    next();
  } catch (err) {
    next(err);
  }
};
