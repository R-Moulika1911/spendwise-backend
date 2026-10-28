const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function groqModel() {
  return process.env.GROQ_MODEL?.trim() || 'llama-3.1-8b-instant';
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
 * Simple system+user JSON chat (Idea 1 style).
 */
export async function groqChat({ system, user, temperature = 0, maxTokens = 256 }) {
  const message = await groqCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    maxTokens,
    jsonMode: true,
  });
  const content = message.content;
  if (!content || typeof content !== 'string') {
    const err = new Error('Empty response from Groq');
    err.status = 502;
    throw err;
  }
  return content;
}
