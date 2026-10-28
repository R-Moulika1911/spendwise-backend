/** OpenAI-compatible tool defs for the expense Q&A agent. Tools run on the phone. */

export const ASK_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_total',
      description:
        'Sum of expenses for an optional category and/or month (YYYY-MM). Omit category for all categories. Omit month for the current month.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Category name exactly as listed for the user',
          },
          month: {
            type: 'string',
            description: 'Month as YYYY-MM',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_expenses',
      description:
        'List recent expenses matching optional filters. Returns amount, category, date, note.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          month: { type: 'string', description: 'YYYY-MM' },
          limit: {
            type: 'integer',
            description: 'Max rows (default 10, max 25)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_months',
      description:
        'Compare total spending (and per-category totals) between two months a and b (YYYY-MM).',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'string', description: 'First month YYYY-MM' },
          b: { type: 'string', description: 'Second month YYYY-MM' },
        },
        required: ['a', 'b'],
      },
    },
  },
];

export function buildAskSystemPrompt({ categories, today, currency }) {
  return [
    'You are SpendWise, a helpful expense assistant.',
    'Answer using ONLY data from the provided tools. Never invent totals.',
    `Today is ${today}. Currency symbol is ${currency || '₹'}.`,
    `Known categories: ${JSON.stringify(categories)}.`,
    'When the user asks about spending, call tools first. You may call multiple tools.',
    'After tool results arrive, reply in clear natural language (English or match the user language).',
    'Be concise. Include numbers with the currency symbol when relevant.',
    'If data is empty, say so honestly.',
  ].join('\n');
}

/**
 * Sanitize client messages into a safe Groq message list (without system).
 */
export function sanitizeAskMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw.slice(-20)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role;
    if (role === 'user' || role === 'assistant' || role === 'tool') {
      const entry = { role };
      if (typeof m.content === 'string') entry.content = m.content.slice(0, 4000);
      else if (m.content == null) entry.content = null;
      if (role === 'assistant' && Array.isArray(m.tool_calls)) {
        entry.tool_calls = m.tool_calls;
      }
      if (role === 'tool' && typeof m.tool_call_id === 'string') {
        entry.tool_call_id = m.tool_call_id;
        entry.content = String(m.content ?? '').slice(0, 8000);
      }
      out.push(entry);
    }
  }
  return out;
}
