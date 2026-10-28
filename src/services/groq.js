import { extractJsonObject, isJsonValidateError } from '../utils/extractJson.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function groqModel() {
  return process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b';
}

/**
 * Low-level Groq chat completion.
 * @returns {Promise<{ role: string, content: string|null, tool_calls?: any[] }>}
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
 * gpt-oss models sometimes fail Groq's json_object validation.
 */
export async function groqChat({
  system,
  user,
  temperature = 0,
  maxTokens = 512,
}) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  // Attempt 1–2: strict JSON mode
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await groqCompletion({
        messages,
        temperature: attempt === 0 ? temperature : 0,
        maxTokens,
        jsonMode: true,
      });
      const content = message.content;
      if (content && typeof content === 'string' && content.trim()) {
        return content;
      }
    } catch (err) {
      if (!isJsonValidateError(err) || attempt === 1) {
        // fall through to plain-text attempt below on validate errors
        if (!isJsonValidateError(err)) throw err;
      }
    }
  }

  // Attempt 3: no response_format — parse ourselves
  const plainSystem = `${system}\n\nIMPORTANT: Return ONLY a valid JSON object. No markdown. No extra text.`;
  const message = await groqCompletion({
    messages: [
      { role: 'system', content: plainSystem },
      { role: 'user', content: user },
    ],
    temperature: 0,
    maxTokens,
    jsonMode: false,
  });
  const content = message.content;
  if (!content || typeof content !== 'string') {
    const err = new Error('Empty response from Groq');
    err.status = 502;
    throw err;
  }
  // Ensure it at least looks like JSON; callers still extractJsonObject
  if (!extractJsonObject(content)) {
    const err = new Error('Model returned non-JSON content');
    err.status = 422;
    err.details = { content: content.slice(0, 500) };
    throw err;
  }
  return content;
}
