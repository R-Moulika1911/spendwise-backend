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

    // Prefer array when it appears before an object (multi-expense replies).
    const arrStart = trimmed.indexOf('[');
    const objStart = trimmed.indexOf('{');
    if (arrStart >= 0 && (objStart < 0 || arrStart < objStart)) {
      const arrEnd = trimmed.lastIndexOf(']');
      if (arrEnd > arrStart) {
        try {
          return JSON.parse(trimmed.slice(arrStart, arrEnd + 1));
        } catch {
          // fall through to object
        }
      }
    }

    if (objStart >= 0) {
      const end = trimmed.lastIndexOf('}');
      if (end > objStart) {
        try {
          return JSON.parse(trimmed.slice(objStart, end + 1));
        } catch {
          return null;
        }
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
