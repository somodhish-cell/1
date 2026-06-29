'use strict';

/** Guards admin routes: redirects to the login page when not authenticated. */
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  req.session.returnTo = req.originalUrl;
  req.session.flash = { type: 'error', message: 'Please log in to continue.' };
  return res.redirect('/admin/login');
}

module.exports = { requireAdmin };
