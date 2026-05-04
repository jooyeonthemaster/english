// @ts-nocheck

/**
 * Safely parse a JSON string into a typed value, returning a fallback on failure.
 * Handles strings, arrays, and plain objects. If fallback is an array,
 * only array results are accepted.
 */
export function parseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object" && str !== null) {
    return (Array.isArray(fallback) ? fallback : str) as T;
  }
  if (typeof str !== "string") return fallback;
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}
