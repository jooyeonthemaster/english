// ============================================================================
// Super Admin Authentication — Separate JWT auth for platform administrators
// Uses dedicated cookie to avoid conflicts with Staff NextAuth session
// ============================================================================

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const ADMIN_JWT_SECRET = (() => {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("ADMIN_JWT_SECRET or NEXTAUTH_SECRET environment variable must be set");
  }
  return new TextEncoder().encode(secret);
})();
const COOKIE_NAME = "yshin-admin-session";
const TOKEN_EXPIRY = "7d";

interface AdminTokenPayload extends JWTPayload {
  adminId: string;
  email: string;
  name: string;
  role: string; // "SUPER_ADMIN" | "SUPPORT"
}

/**
 * Login a super admin by email and password.
 */
export async function loginAdmin(email: string, password: string) {
  const admin = await prisma.superAdmin.findUnique({
    where: { email },
  });

  if (!admin || !admin.isActive) {
    throw new Error("Invalid credentials");
  }

  const isValid = await bcrypt.compare(password, admin.password);
  if (!isValid) {
    throw new Error("Invalid credentials");
  }

  const token = await new SignJWT({
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  } satisfies AdminTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(ADMIN_JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

/**
 * Get current admin session from cookie.
 */
export async function getAdminSession(): Promise<AdminTokenPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, ADMIN_JWT_SECRET);
    return payload as AdminTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Require admin auth — throws if not authenticated.
 */
export async function requireAdminAuth(requiredRole?: "SUPER_ADMIN" | "SUPPORT") {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("Admin authentication required");
  }
  if (requiredRole && session.role !== requiredRole && session.role !== "SUPER_ADMIN") {
    throw new Error("Insufficient admin permissions");
  }
  return session;
}

/**
 * Logout admin — clear cookie.
 */
export async function logoutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
