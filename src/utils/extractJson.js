export function extractJsonObject(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // strip markdown fences if present
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // continue
      }
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function isJsonValidateError(err) {
  const msg = String(err?.message || '').toLowerCase();
  const code = err?.details?.error?.code || err?.details?.code;
  return (
    code === 'json_validate_failed' ||
    msg.includes('failed to validate json') ||
    msg.includes('json_validate_failed')
  );
}
