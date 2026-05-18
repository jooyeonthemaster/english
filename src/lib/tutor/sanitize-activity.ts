type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const HIDDEN_KEY_PATTERN = /(correct|answer|solution|explanation|modelanswer|answerkey|accepted|expected|rubric|score)/i;

export function sanitizeTutorActivityPayload(payload: unknown): Record<string, JsonValue> {
  const sanitized = sanitizeValue(payload);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized
    : {};
}

function sanitizeValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !HIDDEN_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeValue(item)]),
  );
}
