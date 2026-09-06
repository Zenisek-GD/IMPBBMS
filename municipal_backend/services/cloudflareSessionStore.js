import session from "express-session";
import { env } from "cloudflare:workers";

const FALLBACK_TTL_MS = 8 * 60 * 60 * 1000;

const expiresAt = (sessionData) => {
  const expires = sessionData?.cookie?.expires;
  const value = expires ? new Date(expires).getTime() : NaN;
  return Number.isFinite(value) ? value : Date.now() + FALLBACK_TTL_MS;
};

// express-session expects Node-style callbacks. D1 is promise based, so this
// tiny adapter gives the existing authentication code durable sessions without
// changing every req.session call in the application.
class CloudflareD1SessionStore extends session.Store {
  #db;

  constructor(db = env.SESSIONS) {
    super();
    if (!db) throw new Error("The SESSIONS D1 binding is missing.");
    this.#db = db;
  }

  get(sid, callback) {
    this.#db
      .prepare("SELECT data FROM sessions WHERE sid = ? AND expires_at > ?")
      .bind(sid, Date.now())
      .first()
      .then((row) => callback(null, row ? JSON.parse(row.data) : null))
      .catch(callback);
  }

  set(sid, sessionData, callback = () => {}) {
    this.#db
      .prepare(
        "INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at"
      )
      .bind(sid, JSON.stringify(sessionData), expiresAt(sessionData))
      .run()
      .then(() => callback(null))
      .catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.#db
      .prepare("DELETE FROM sessions WHERE sid = ?")
      .bind(sid)
      .run()
      .then(() => callback(null))
      .catch(callback);
  }

  touch(sid, sessionData, callback = () => {}) {
    this.#db
      .prepare("UPDATE sessions SET expires_at = ? WHERE sid = ?")
      .bind(expiresAt(sessionData), sid)
      .run()
      .then(() => callback(null))
      .catch(callback);
  }
}

export const createCloudflareSessionStore = () => new CloudflareD1SessionStore();
