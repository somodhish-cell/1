'use strict';

// Vercel serverless entry point.
// Vercel routes every non-static request here (see vercel.json) and uses the
// exported Express app as the request handler. No app.listen() runs here.
//
// NOTE: this app is only fully functional on Vercel once its persistence layer
// (database, sessions, file uploads) has been moved off the local filesystem to
// managed services — see the "Deploying to Vercel" section of the README.
module.exports = require('../server.js');
