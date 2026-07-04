export const DEFAULT_DIRECTOR_REDIRECT = "/director/workbench/questions/generate";
export const DEFAULT_TEACHER_REDIRECT = "/teacher";

function isAllowedStaffCallbackPath(pathname: string): boolean {
  return (
    pathname === "/director" ||
    pathname.startsWith("/director/") ||
    pathname === "/teacher" ||
    pathname.startsWith("/teacher/")
  );
}

export function normalizeStaffCallbackUrl(
  value: string | null | undefined,
  fallback: string = DEFAULT_DIRECTOR_REDIRECT,
): string {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return fallback;
  }

  try {
    const url = new URL(raw, "https://smoat.local");
    if (url.origin !== "https://smoat.local") return fallback;
    if (!isAllowedStaffCallbackPath(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function optionalStaffCallbackUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return normalizeStaffCallbackUrl(value);
}
