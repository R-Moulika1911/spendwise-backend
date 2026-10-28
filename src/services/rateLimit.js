/** Simple in-memory daily quota (per process). Fine for a single Render free instance. */

const buckets = new Map();

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function bucketKey(identity) {
  return `${dayKey()}:${identity}`;
}

/**
 * @param {string} identity uid or IP
 * @param {number} limit
 * @returns {{ allowed: boolean, remaining: number, limit: number, resetDate: string }}
 */
export function checkDailyLimit(identity, limit) {
  const key = bucketKey(identity);
  const used = buckets.get(key) || 0;
  const remaining = Math.max(0, limit - used);
  return {
    allowed: used < limit,
    remaining,
    limit,
    resetDate: dayKey(),
  };
}

export function consumeDailyLimit(identity, limit) {
  const status = checkDailyLimit(identity, limit);
  if (!status.allowed) return status;
  const key = bucketKey(identity);
  const used = (buckets.get(key) || 0) + 1;
  buckets.set(key, used);
  // Opportunistic cleanup of old days
  if (buckets.size > 5000) {
    const today = dayKey();
    for (const k of buckets.keys()) {
      if (!k.startsWith(today)) buckets.delete(k);
    }
  }
  return {
    allowed: true,
    remaining: Math.max(0, limit - used),
    limit,
    resetDate: dayKey(),
  };
}
