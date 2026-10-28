import { clientIdentity } from '../middleware/optionalAuth.js';
import { checkDailyLimit, consumeDailyLimit } from '../services/rateLimit.js';
import { groqConfigured, groqModel } from '../services/groq.js';

export function dailyLimit() {
  const n = Number(process.env.AI_DAILY_LIMIT || 40);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40;
}

export function requireGroq(res) {
  if (!groqConfigured()) {
    res.status(503).json({
      error: 'AI is not configured',
      details: 'Set GROQ_API_KEY on the server',
    });
    return false;
  }
  return true;
}

/** @returns {{ ok: true, identity: string, limit: number } | { ok: false }} */
export function guardQuota(req, res) {
  const identity = clientIdentity(req);
  const limit = dailyLimit();
  const quota = checkDailyLimit(identity, limit);
  if (!quota.allowed) {
    res.status(429).json({
      error: 'Daily AI limit reached',
      limit: quota.limit,
      remaining: 0,
      resetDate: quota.resetDate,
    });
    return { ok: false };
  }
  return { ok: true, identity, limit };
}

export function usagePayload(identity, limit) {
  const used = consumeDailyLimit(identity, limit);
  return {
    remaining: used.remaining,
    limit: used.limit,
    resetDate: used.resetDate,
  };
}

export function statusPayload(req) {
  const identity = clientIdentity(req);
  const limit = dailyLimit();
  const quota = checkDailyLimit(identity, limit);
  return {
    configured: groqConfigured(),
    model: groqModel(),
    usage: {
      remaining: quota.remaining,
      limit: quota.limit,
      resetDate: quota.resetDate,
    },
  };
}
