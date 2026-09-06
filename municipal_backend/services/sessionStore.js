import session from "express-session";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { LoginSession, TrustedDevice } from "../models/authSecurityModel.js";
import { recordAudit, AUDIT_ACTIONS } from "./auditLog.js";
import { expireTrustedDevice } from "./trustedDevices.js";
import { hashToken, PENDING_MFA_TTL_MS } from "./authPolicy.js";

const expiredMarker = (data) => ({
  cookie: data.cookie,
  sessionExpired: Boolean(data.userId || data.sessionExpired),
  pendingMfaExpired: Boolean(data.pendingMfaUserId || data.pendingMfaExpired),
});

const RETAIN_ENDED_MS = 24 * 60 * 60 * 1000;

export const expireStoredSession = async (row) => {
  const now = new Date();
  const [changed] = await LoginSession.update({
    endedAt: now, endReason: "expired", data: expiredMarker(row.data),
  }, { where: { id: row.id, endedAt: null, expiresAt: { [Op.lte]: now } } });
  if (changed && row.data.userId) {
    const actor = row.data.auditActor ?? { actorId: row.data.userId };
    const details = {
      ...actor, entityRef: "auth", entityId: row.data.userId,
      afterState: { sessionExpiresAt: new Date(row.data.loginSessionExpiresAt), device: "Current Browser" },
    };
    await recordAudit({ ...details, actionType: AUDIT_ACTIONS.SESSION_EXPIRED, summary: "Authenticated session expired after 30 minutes" });
    await recordAudit({ ...details, actionType: AUDIT_ACTIONS.AUTOMATIC_LOGOUT, summary: "Automatic logout" });
  }
};

// get() preserves an expiry marker long enough for middleware to return
// SESSION_EXPIRED. Neither get(), touch(), nor set() can move the deadline.
export class DatabaseSessionStore extends session.Store {
  get(sid, callback) {
    (async () => {
      const row = await LoginSession.findByPk(hashToken(sid));
      if (!row) return null;
      if (row.endedAt) return row.endReason === "expired"
        ? expiredMarker(row.data) : null;
      if (Date.now() >= new Date(row.expiresAt).getTime()) {
        await expireStoredSession(row);
        return expiredMarker(row.data);
      }
      return row.data;
    })().then((data) => callback(null, data), callback);
  }

  set(sid, data, callback = () => {}) {
    (async () => {
      const id = hashToken(sid);
      const deadline = data.loginSessionExpiresAt ?? data.pendingMfaExpiresAt ?? Date.now() + PENDING_MFA_TTL_MS;
      if (!Number.isFinite(deadline) || Date.now() >= deadline || data.sessionExpired) return;
      await sequelize.transaction(async (transaction) => {
        const row = await LoginSession.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (row) {
          if (row.endedAt || Date.now() >= new Date(row.expiresAt).getTime()) return;
          // Preserve the original deadline even if a stale request supplies a later one.
          const fixedDeadline = Math.min(deadline, new Date(row.expiresAt).getTime());
          const storedData = data.userId ? { ...data, loginSessionExpiresAt: fixedDeadline } : data;
          await row.update({ data: storedData, expiresAt: new Date(fixedDeadline) }, { transaction });
        } else {
          await LoginSession.create({
            id, data, expiresAt: new Date(deadline),
            purgeAt: new Date(deadline + RETAIN_ENDED_MS),
          }, { transaction });
        }
      });
    })().then(() => callback(null), callback);
  }

  touch(_sid, _data, callback = () => {}) { callback(null); }

  destroy(sid, callback = () => {}) {
    (async () => {
      // Keep a tombstone even when regeneration destroys an unsaved session.
      const id = hashToken(sid);
      const now = new Date();
      const [row] = await LoginSession.findOrCreate({
        where: { id }, defaults: {
          id, data: {}, expiresAt: now, endedAt: now, endReason: "revoked",
          purgeAt: new Date(now.getTime() + RETAIN_ENDED_MS),
        },
      });
      if (!row.endedAt) await row.update({ data: {}, endedAt: now, endReason: "revoked" });
    })().then(() => callback(null), callback);
  }
}

export const sweepAuthExpirations = async () => {
  const now = new Date();
  const sessions = await LoginSession.findAll({ where: { endedAt: null, expiresAt: { [Op.lte]: now } }, limit: 500 });
  for (const row of sessions) await expireStoredSession(row);
  const devices = await TrustedDevice.findAll({ where: { twoFactorTrustedUntil: { [Op.lte]: now } }, limit: 500 });
  for (const row of devices) await expireTrustedDevice(row);
  await LoginSession.destroy({ where: { purgeAt: { [Op.lte]: now } } });
};

export const startAuthExpirationSweep = () => {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try { await sweepAuthExpirations(); }
    catch { console.error("[auth] expiration cleanup failed"); }
    finally { running = false; }
  };
  const timer = setInterval(sweep, 15_000);
  timer.unref();
  return timer;
};
