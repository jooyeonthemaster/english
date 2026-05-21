export function normalizeAcademySlugParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function encodedAcademyPathSegment(value: string) {
  return encodeURIComponent(normalizeAcademySlugParam(value));
}

export function tutorPath(academy: string, suffix = "") {
  const normalizedSuffix = suffix ? (suffix.startsWith("/") ? suffix : `/${suffix}`) : "";
  return `/tutor/${encodedAcademyPathSegment(academy)}${normalizedSuffix}`;
}
