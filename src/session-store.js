'use strict';

/**
 * An express-session store backed by the app's libSQL database.
 * Works with a local file DB (dev / container hosts) and remote Turso
 * (serverless), so sessions persist correctly on Vercel too.
 *
 * The `sessions` table is created by db.init(); this store only reads/writes it.
 */

const session = require('express-session');
const { db } = require('./db');

const DAY = 1000 * 60 * 60 * 24;

class LibsqlSessionStore extends session.Store {
  _expiry(sess) {
    if (sess && sess.cookie && sess.cookie.expires) {
      return new Date(sess.cookie.expires).getTime();
    }
    return Date.now() + DAY;
  }

  get(sid, cb) {
    db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?')
      .get(sid)
      .then((row) => {
        if (!row) return cb(null, null);
        if (Number(row.expire) < Date.now()) {
          return db
            .prepare('DELETE FROM sessions WHERE sid = ?')
            .run(sid)
            .then(() => cb(null, null))
            .catch(() => cb(null, null));
        }
        return cb(null, JSON.parse(row.sess));
      })
      .catch((err) => cb(err));
  }

  set(sid, sess, cb) {
    db.prepare(
      `INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire`
    )
      .run(sid, JSON.stringify(sess), this._expiry(sess))
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }

  touch(sid, sess, cb) {
    db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?')
      .run(this._expiry(sess), sid)
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }

  destroy(sid, cb) {
    db.prepare('DELETE FROM sessions WHERE sid = ?')
      .run(sid)
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }
}

module.exports = LibsqlSessionStore;
