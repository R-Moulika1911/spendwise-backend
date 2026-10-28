import { admin } from '../config/firebase.js';

/** Attaches req.user when a valid Bearer token is present; never blocks. */
export async function optionalAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return next();
    const decoded = await admin.auth().verifyIdToken(match[1]);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
    };
  } catch {
    // ignore invalid token for optional auth
  }
  return next();
}

export function clientIdentity(req) {
  if (req.user?.uid) return `uid:${req.user.uid}`;
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req.ip ||
    'anon';
  return `ip:${ip}`;
}
