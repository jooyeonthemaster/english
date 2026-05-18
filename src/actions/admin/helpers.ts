import crypto from "crypto";

// ---------------------------------------------------------------------------
// Shared internal types & helpers for admin server actions.
// ---------------------------------------------------------------------------

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface RegistrationFilters {
  status?: string;
}

export interface ApproveData {
  planTier: string;
  initialCredits?: number;
  reviewNote?: string;
}

/**
 * Generate a URL-safe slug from an academy name.
 * For Korean names, produces a random slug like "academy-a1b2c3d4".
 * For ASCII names, converts to lowercase kebab-case with a short suffix.
 */
export function generateSlug(name: string): string {
  const suffix = crypto.randomBytes(4).toString("hex"); // 8 hex chars
  // Strip non-ASCII to check if there's usable Latin text
  const ascii = name.replace(/[^\x20-\x7E]/g, "").trim();
  if (ascii.length >= 2) {
    const base = ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `${base}-${suffix}`;
  }
  return `academy-${suffix}`;
}

/**
 * Generate a random 8-character alphanumeric password.
 */
export function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}
