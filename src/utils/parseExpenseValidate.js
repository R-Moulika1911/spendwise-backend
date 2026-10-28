/**
 * Normalize LLM JSON into a validated expense draft.
 * @param {unknown} raw
 * @param {{ categories: string[], today: string }} ctx
 */
export function validateParsedExpense(raw, ctx) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Model did not return a JSON object' };
  }

  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    return { ok: false, error: 'Invalid amount' };
  }

  const categories = Array.isArray(ctx.categories)
    ? ctx.categories.map((c) => String(c).trim()).filter(Boolean)
    : [];
  if (categories.length === 0) {
    return { ok: false, error: 'categories list is required' };
  }

  const categoryRaw = String(raw.category ?? '').trim();
  const category =
    categories.find((c) => c.toLowerCase() === categoryRaw.toLowerCase()) ||
    categories.find((c) => c.toLowerCase() === 'other') ||
    categories[categories.length - 1];

  const today = parseIsoDate(ctx.today) || startOfUtcDay(new Date());
  let date = parseIsoDate(raw.date);
  if (!date) {
    date = today;
  }
  const min = new Date(Date.UTC(2020, 0, 1));
  if (date < min) date = min;
  if (date > today) date = today;

  let note = raw.note == null ? null : String(raw.note).trim();
  if (note === '') note = null;
  if (note && note.length > 100) note = note.slice(0, 100);

  return {
    ok: true,
    data: {
      amount: Math.round(amount * 100) / 100,
      category,
      date: toIsoDate(date),
      note,
    },
  };
}

function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toIsoDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export { extractJsonObject } from './extractJson.js';
