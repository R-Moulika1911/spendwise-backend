import { extractJsonObject, isJsonValidateError } from '../utils/extractJson.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function groqModel() {
  return process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b';
}

/** Pull usable text from Groq message (gpt-oss may leave content empty). */
export function messageText(message) {
  if (!message) return '';

  const fromContent = normalizeContent(message.content);
  if (fromContent.trim()) return fromContent.trim();

  // Some reasoning models put the final answer in other fields.
  for (const key of ['reasoning', 'reasoning_content', 'refusal']) {
    const v = message[key];
    if (typeof v === 'string' && v.trim()) {
      const asJson = extractJsonObject(v);
      if (asJson) return JSON.stringify(asJson);
      if (v.includes('{')) return v.trim();
    }
  }
  return '';
}

function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && typeof part.content === 'string') return part.content;
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * Low-level Groq chat completion.
 */
export async function groqCompletion({
  messages,
  tools,
  temperature = 0,
  maxTokens = 512,
  jsonMode = false,
}) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error('GROQ_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const payload = {
    model: groqModel(),
    temperature,
    max_tokens: maxTokens,
    messages,
  };
  if (tools?.length) payload.tools = tools;
  if (jsonMode) payload.response_format = { type: 'json_object' };

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      body?.error?.message || `Groq API error (${res.status})`,
    );
    err.status = res.status >= 500 ? 502 : res.status;
    err.details = body;
    throw err;
  }

  const message = body?.choices?.[0]?.message;
  if (!message) {
    const err = new Error('Empty response from Groq');
    err.status = 502;
    throw err;
  }
  return message;
}

/**
 * JSON-oriented chat with retry + non-json fallback.
 */
export async function groqChat({
  system,
  user,
  temperature = 0,
  maxTokens = 700,
}) {
  const baseMessages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const attempts = [
    { jsonMode: true, temperature, maxTokens },
    { jsonMode: true, temperature: 0, maxTokens },
    {
      jsonMode: false,
      temperature: 0,
      maxTokens,
      systemExtra:
        '\n\nIMPORTANT: Return ONLY a valid JSON object. No markdown. No extra text.',
    },
    {
      jsonMode: false,
      temperature: 0,
      maxTokens: Math.max(maxTokens, 900),
      systemExtra:
        '\n\nReturn one JSON object and nothing else. Keys must match the schema.',
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const messages = attempt.systemExtra
        ? [
            { role: 'system', content: system + attempt.systemExtra },
            { role: 'user', content: user },
          ]
        : baseMessages;

      const message = await groqCompletion({
        messages,
        temperature: attempt.temperature,
        maxTokens: attempt.maxTokens,
        jsonMode: attempt.jsonMode,
      });

      const content = messageText(message);
      if (!content) {
        lastError = new Error('Empty response from Groq');
        lastError.status = 502;
        continue;
      }

      if (extractJsonObject(content)) {
        return content;
      }

      // Got text but not JSON — keep trying
      lastError = new Error('Model returned non-JSON content');
      lastError.status = 422;
      lastError.details = { content: content.slice(0, 500) };
    } catch (err) {
      lastError = err;
      if (!isJsonValidateError(err) && err.status === 503) throw err;
      // retry other transient / validate failures
    }
  }

  throw (
    lastError ||
    Object.assign(new Error('Empty response from Groq'), { status: 502 })
  );
}
