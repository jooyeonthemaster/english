export function normalizeAcademySlugParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
