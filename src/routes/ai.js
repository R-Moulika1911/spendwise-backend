import { Router } from 'express';

import { optionalAuth } from '../middleware/optionalAuth.js';
import {
  ASK_TOOLS,
  buildAskSystemPrompt,
  sanitizeAskMessages,
} from '../services/askTools.js';
import { groqChat, groqCompletion } from '../services/groq.js';
import {
  extractJsonObject,
  validateParsedExpense,
} from '../utils/parseExpenseValidate.js';
import {
  guardQuota,
  requireGroq,
  statusPayload,
  usagePayload,
} from '../utils/aiQuota.js';

const router = Router();
router.use(optionalAuth);

function normalizeCategories(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => String(c).trim()).filter(Boolean);
}

function todayFromBody(body) {
  return typeof body?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
    ? body.today
    : new Date().toISOString().slice(0, 10);
}

/**
 * POST /ai/parse-expense
 * Body: { text, categories: string[], today?: "YYYY-MM-DD" }
 */
router.post('/parse-expense', async (req, res) => {
  try {
    if (!requireGroq(res)) return;

    const text = String(req.body?.text ?? '').trim();
    if (!text || text.length > 500) {
      return res.status(400).json({
        error: 'text is required (max 500 characters)',
      });
    }

    const categories = normalizeCategories(req.body?.categories);
    if (categories.length === 0) {
      return res.status(400).json({ error: 'categories array is required' });
    }

    const today = todayFromBody(req.body);
    const gated = guardQuota(req, res);
    if (!gated.ok) return;

    const system = [
      'You convert a natural-language expense into JSON.',
      'Reply with ONLY a JSON object. No markdown. No explanation.',
      'Schema: {"amount":number,"category":string,"date":"YYYY-MM-DD","note":string|null}',
      'Rules:',
      `- category MUST be exactly one of: ${JSON.stringify(categories)}`,
      `- today is ${today}; resolve relative words (yesterday, today, last Monday) to YYYY-MM-DD`,
      '- date must not be after today',
      '- amount is a positive number (strip currency words like rupees, rs, ₹)',
      '- note is a short label without the amount (or null)',
      '- if category is unclear, use Other if present, else the closest match',
    ].join('\n');

    const content = await groqChat({
      system,
      user: `Expense text: ${text}`,
      temperature: 0,
    });
    const parsed = extractJsonObject(content);
    const validated = validateParsedExpense(parsed, { categories, today });
    if (!validated.ok) {
      return res.status(422).json({
        error: 'Could not parse expense',
        details: validated.error,
        raw: parsed,
      });
    }

    return res.json({
      data: validated.data,
      usage: usagePayload(gated.identity, gated.limit),
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || 'AI parse failed',
      details: err.details,
    });
  }
});

/**
 * POST /ai/suggest-category
 * Body: { note, categories: string[] }
 */
router.post('/suggest-category', async (req, res) => {
  try {
    if (!requireGroq(res)) return;

    const note = String(req.body?.note ?? '').trim();
    if (!note || note.length > 200) {
      return res.status(400).json({ error: 'note is required (max 200 characters)' });
    }
    const categories = normalizeCategories(req.body?.categories);
    if (categories.length === 0) {
      return res.status(400).json({ error: 'categories array is required' });
    }

    const gated = guardQuota(req, res);
    if (!gated.ok) return;

    const system = [
      'Suggest one expense category for a short note.',
      'Reply with ONLY JSON: {"category":string,"confidence":"high"|"medium"|"low"}',
      `category MUST be exactly one of: ${JSON.stringify(categories)}`,
    ].join('\n');

    const content = await groqChat({
      system,
      user: `Note: ${note}`,
      temperature: 0,
      maxTokens: 80,
    });
    const parsed = extractJsonObject(content) || {};
    const rawCat = String(parsed.category ?? '').trim();
    const category =
      categories.find((c) => c.toLowerCase() === rawCat.toLowerCase()) ||
      categories.find((c) => c.toLowerCase() === 'other') ||
      categories[categories.length - 1];
    const confidence = ['high', 'medium', 'low'].includes(parsed.confidence)
      ? parsed.confidence
      : 'medium';

    return res.json({
      data: { category, confidence },
      usage: usagePayload(gated.identity, gated.limit),
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || 'Category suggest failed',
      details: err.details,
    });
  }
});

/**
 * POST /ai/ask — one agent turn (tool calls run on the device).
 * Body: { messages, categories, today, currency?, countUsage?: boolean }
 */
router.post('/ask', async (req, res) => {
  try {
    if (!requireGroq(res)) return;

    const categories = normalizeCategories(req.body?.categories);
    if (categories.length === 0) {
      return res.status(400).json({ error: 'categories array is required' });
    }

    const clientMessages = sanitizeAskMessages(req.body?.messages);
    if (clientMessages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const last = clientMessages[clientMessages.length - 1];
    const countUsage = req.body?.countUsage !== false && last?.role === 'user';

    let gated = { ok: true, identity: null, limit: null };
    if (countUsage) {
      gated = guardQuota(req, res);
      if (!gated.ok) return;
    }

    const today = todayFromBody(req.body);
    const currency = String(req.body?.currency ?? '₹').slice(0, 8);
    const system = buildAskSystemPrompt({ categories, today, currency });

    const message = await groqCompletion({
      messages: [{ role: 'system', content: system }, ...clientMessages],
      tools: ASK_TOOLS,
      temperature: 0.2,
      maxTokens: 700,
    });

    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls.map((tc) => {
          let args = {};
          try {
            args = JSON.parse(tc.function?.arguments || '{}');
          } catch {
            args = {};
          }
          return {
            id: tc.id,
            name: tc.function?.name,
            arguments: args,
          };
        })
      : [];

    const usage =
      countUsage && gated.identity
        ? usagePayload(gated.identity, gated.limit)
        : undefined;

    if (toolCalls.length > 0) {
      return res.json({
        type: 'tool_calls',
        assistant: {
          role: 'assistant',
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        },
        tool_calls: toolCalls,
        usage,
      });
    }

    const text = String(message.content ?? '').trim();
    if (!text) {
      return res.status(422).json({ error: 'Empty assistant reply' });
    }

    return res.json({
      type: 'message',
      message: text,
      assistant: { role: 'assistant', content: text },
      usage,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || 'Ask failed',
      details: err.details,
    });
  }
});

/**
 * POST /ai/insights — monthly narrative from aggregates only.
 * Body: { month, total, previousTotal, byCategory:[{name,amount,percent}], currency }
 */
router.post('/insights', async (req, res) => {
  try {
    if (!requireGroq(res)) return;

    const month = String(req.body?.month ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month must be YYYY-MM' });
    }

    const total = Number(req.body?.total);
    const previousTotal = Number(req.body?.previousTotal ?? 0);
    if (!Number.isFinite(total) || total < 0) {
      return res.status(400).json({ error: 'total must be a non-negative number' });
    }

    const byCategory = Array.isArray(req.body?.byCategory)
      ? req.body.byCategory.slice(0, 20).map((row) => ({
          name: String(row?.name ?? 'Other').slice(0, 40),
          amount: Number(row?.amount) || 0,
          percent: Number(row?.percent) || 0,
        }))
      : [];

    const currency = String(req.body?.currency ?? '₹').slice(0, 8);
    const gated = guardQuota(req, res);
    if (!gated.ok) return;

    const system = [
      'You write a short monthly spending insight for a personal expense app.',
      'Respond with a single JSON object only.',
      'Required keys: summary (string), tips (array of 2-3 short strings).',
      'Example: {"summary":"...","tips":["...","..."]}',
      'summary: 2-4 sentences. Mention top categories and vs last month if useful.',
      'Use only the numbers given. Do not invent merchants or transactions.',
      'Keep strings plain ASCII punctuation. No markdown.',
      `Currency: ${currency}`,
    ].join('\n');

    const user = JSON.stringify({
      month,
      total,
      previousTotal: Number.isFinite(previousTotal) ? previousTotal : 0,
      byCategory,
    });

    const content = await groqChat({
      system,
      user,
      temperature: 0.2,
      maxTokens: 700,
    });
    const parsed = extractJsonObject(content) || {};
    const summary = String(parsed.summary ?? '').trim().slice(0, 1200);
    const tips = Array.isArray(parsed.tips)
      ? parsed.tips.map((t) => String(t).trim()).filter(Boolean).slice(0, 5)
      : [];

    if (!summary) {
      return res.status(422).json({
        error: 'Could not generate insight',
        details: { raw: String(content).slice(0, 400) },
      });
    }

    return res.json({
      data: { summary, tips },
      usage: usagePayload(gated.identity, gated.limit),
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || 'Insights failed',
      details: err.details,
    });
  }
});

/**
 * POST /ai/budget-advice
 * Body: { monthlyBudget?, spentThisMonth, byCategory, avgDaily, daysLeft, currency }
 */
router.post('/budget-advice', async (req, res) => {
  try {
    if (!requireGroq(res)) return;

    const spentThisMonth = Number(req.body?.spentThisMonth);
    if (!Number.isFinite(spentThisMonth) || spentThisMonth < 0) {
      return res
        .status(400)
        .json({ error: 'spentThisMonth must be a non-negative number' });
    }

    const monthlyBudget =
      req.body?.monthlyBudget == null
        ? null
        : Number(req.body.monthlyBudget);
    const avgDaily = Number(req.body?.avgDaily) || 0;
    const daysLeft = Math.max(0, Number(req.body?.daysLeft) || 0);
    const currency = String(req.body?.currency ?? '₹').slice(0, 8);
    const byCategory = Array.isArray(req.body?.byCategory)
      ? req.body.byCategory.slice(0, 20).map((row) => ({
          name: String(row?.name ?? 'Other').slice(0, 40),
          amount: Number(row?.amount) || 0,
        }))
      : [];

    const gated = guardQuota(req, res);
    if (!gated.ok) return;

    const system = [
      'You give brief personal budget advice for an expense tracker.',
      'Respond with a single JSON object only.',
      'Required keys: advice (string), suggestedBudget (number or null), alert (string or null).',
      'Example: {"advice":"...","suggestedBudget":15000,"alert":null}',
      'advice: 2-4 short sentences. suggestedBudget: round number or null if fine.',
      'alert: short warning if overspend risk, else null.',
      'Keep strings plain. No markdown.',
      'Use only provided aggregates. Currency: ' + currency,
    ].join('\n');

    const user = JSON.stringify({
      monthlyBudget: Number.isFinite(monthlyBudget) ? monthlyBudget : null,
      spentThisMonth,
      avgDaily,
      daysLeft,
      byCategory,
    });

    const content = await groqChat({
      system,
      user,
      temperature: 0.2,
      maxTokens: 600,
    });
    const parsed = extractJsonObject(content) || {};
    const advice = String(parsed.advice ?? '').trim().slice(0, 1200);
    let suggestedBudget = parsed.suggestedBudget;
    if (suggestedBudget != null) {
      suggestedBudget = Number(suggestedBudget);
      if (!Number.isFinite(suggestedBudget) || suggestedBudget <= 0) {
        suggestedBudget = null;
      } else {
        suggestedBudget = Math.round(suggestedBudget);
      }
    }
    const alertRaw = parsed.alert == null ? null : String(parsed.alert).trim();
    const alert = alertRaw && alertRaw.length > 0 ? alertRaw.slice(0, 300) : null;

    if (!advice) {
      return res.status(422).json({
        error: 'Could not generate budget advice',
        details: { raw: String(content).slice(0, 400) },
      });
    }

    return res.json({
      data: { advice, suggestedBudget, alert },
      usage: usagePayload(gated.identity, gated.limit),
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || 'Budget advice failed',
      details: err.details,
    });
  }
});

router.get('/status', (req, res) => {
  res.json(statusPayload(req));
});

export default router;
