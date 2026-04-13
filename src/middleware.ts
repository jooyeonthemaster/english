import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isStaffLoggedIn = !!req.auth?.user;
  const staffRole = (req.auth?.user as unknown as Record<string, unknown>)?.role as string | undefined;

  // =========================================================================
  // Admin routes — require valid JWT in nara-admin-session cookie
  // =========================================================================
  if (pathname.startsWith("/admin")) {
    // Allow access to admin login page without auth
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }

    const adminSession = req.cookies.get("nara-admin-session");
    const adminLoginUrl = new URL("/admin/login", req.nextUrl.origin);

    // No cookie at all — redirect immediately
    if (!adminSession?.value) {
      return NextResponse.redirect(adminLoginUrl);
    }

    // Verify the JWT signature and expiration
    const secret = process.env.ADMIN_JWT_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      // No secret available to verify — treat as unauthorized
      return NextResponse.redirect(adminLoginUrl);
    }

    try {
      const encodedSecret = new TextEncoder().encode(secret);
      await jwtVerify(adminSession.value, encodedSecret);
    } catch {
      // Verification failed (expired, tampered, malformed, etc.)
      return NextResponse.redirect(adminLoginUrl);
    }
  }

  // =========================================================================
  // Director routes — require DIRECTOR role
  // =========================================================================
  if (pathname.startsWith("/director")) {
    if (!isStaffLoggedIn) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (staffRole !== "DIRECTOR") {
      return NextResponse.redirect(new URL("/teacher", req.nextUrl.origin));
    }
  }

  // =========================================================================
  // Teacher routes — require DIRECTOR or TEACHER role
  // =========================================================================
  if (pathname.startsWith("/teacher")) {
    if (!isStaffLoggedIn) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // =========================================================================
  // Student routes — require student session cookie
  // =========================================================================
  if (pathname.startsWith("/student")) {
    if (pathname === "/student/login") {
      return NextResponse.next();
    }
    const studentSession = req.cookies.get("student-session");
    if (!studentSession?.value) {
      const loginUrl = new URL("/student/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // =========================================================================
  // Parent routes — require parent session cookie
  // =========================================================================
  if (pathname.startsWith("/parent")) {
    if (pathname === "/parent/login") {
      return NextResponse.next();
    }
    const parentSession = req.cookies.get("parent-session");
    if (!parentSession?.value) {
      const loginUrl = new URL("/parent/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // =========================================================================
  // Login page — redirect if already logged in
  // =========================================================================
  if (pathname === "/login" && isStaffLoggedIn) {
    const redirectTo = staffRole === "DIRECTOR" ? "/director" : "/teacher";
    return NextResponse.redirect(new URL(redirectTo, req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/director/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/parent/:path*",
    "/login",
  ],
};
