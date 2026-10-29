const MAX_EXPENSES = 20;

/**
 * Normalize LLM JSON into one validated expense draft.
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
  let date = parseFlexibleDate(raw.date, today);
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

/**
 * Accepts a single expense object, `{ expenses: [...] }`, or a bare array.
 * @param {unknown} raw
 * @param {{ categories: string[], today: string }} ctx
 */
export function validateParsedExpenses(raw, ctx) {
  let items = [];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.expenses)) {
      items = raw.expenses;
    } else if (raw.amount != null) {
      items = [raw];
    } else {
      return { ok: false, error: 'Model did not return expenses' };
    }
  } else {
    return { ok: false, error: 'Model did not return a JSON object' };
  }

  if (items.length === 0) {
    return { ok: false, error: 'No expenses found in text' };
  }
  if (items.length > MAX_EXPENSES) {
    return {
      ok: false,
      error: `Too many expenses (max ${MAX_EXPENSES})`,
    };
  }

  const expenses = [];
  for (let i = 0; i < items.length; i++) {
    const validated = validateParsedExpense(items[i], ctx);
    if (!validated.ok) {
      return {
        ok: false,
        error: `Expense ${i + 1}: ${validated.error}`,
      };
    }
    expenses.push(validated.data);
  }

  return { ok: true, data: { expenses } };
}

function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return utcYmd(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Accept YYYY-MM-DD plus common day/month forms the model may emit. */
function parseFlexibleDate(value, today) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const iso = parseIsoDate(value);
    if (iso) return iso;

    const t = value.trim();
    // DD/MM/YYYY or DD-MM-YYYY
    let m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return utcYmd(Number(m[3]), Number(m[2]), Number(m[1]));

    // DD/MM (current year from today)
    m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) {
      return utcYmd(today.getUTCFullYear(), Number(m[2]), Number(m[1]));
    }

    // 28 Oct / 28 Oct 2026 / Oct 28 / Oct 28 2026
    const months = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12,
    };
    m = t.match(
      /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?$/i,
    );
    if (m) {
      const mo = months[m[2].toLowerCase()];
      if (mo) {
        return utcYmd(
          m[3] ? Number(m[3]) : today.getUTCFullYear(),
          mo,
          Number(m[1]),
        );
      }
    }
    m = t.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i);
    if (m) {
      const mo = months[m[1].toLowerCase()];
      if (mo) {
        return utcYmd(
          m[3] ? Number(m[3]) : today.getUTCFullYear(),
          mo,
          Number(m[2]),
        );
      }
    }
    return null;
  }
  return null;
}

function utcYmd(y, mo, d) {
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return null;
  }
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
