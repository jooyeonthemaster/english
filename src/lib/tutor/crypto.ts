import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes } from "crypto";

function getPepper(): string {
  return process.env.TUTOR_STUDENT_CODE_PEPPER ?? process.env.NEXTAUTH_SECRET ?? "dev-tutor-pepper";
}

export function normalizeTutorCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function createStudentCodeLookupHmac(academyId: string, code: string): string {
  return createHmac("sha256", getPepper())
    .update(`${academyId}:${normalizeTutorCode(code)}`)
    .digest("hex");
}

export async function hashStudentCode(academyId: string, code: string): Promise<string> {
  return bcrypt.hash(`${academyId}:${normalizeTutorCode(code)}`, 12);
}

export async function verifyStudentCodeHash(
  academyId: string,
  code: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(`${academyId}:${normalizeTutorCode(code)}`, hash);
}

export function createDeviceFingerprintSeed(): string {
  return randomBytes(24).toString("base64url");
}

export function hashDeviceFingerprint(seed: string, userAgent: string): string {
  return createHash("sha256").update(`${seed}:${userAgent}`).digest("hex");
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
