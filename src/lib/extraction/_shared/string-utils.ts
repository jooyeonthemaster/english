/**
 * String / array coercion helpers shared by restoration, problem-evidence
 * and OCR sub-domains. Previously duplicated in three places.
 */

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return typeof value === "string" && value.trim() ? [value] : [];
  }
  return value
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    .filter((item) => item.trim().length > 0);
}

export function mergeUniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Tolerant variant used by Gemini structured-OCR responses, where the model
 * sometimes returns a single string for a field declared as `string[]`.
 *   - string  → [string] (empty string → [])
 *   - array of mixed → array of strings (non-strings dropped)
 *   - null / undefined / other → []
 */
export function coerceStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value.length > 0 ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}
