import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isStaffLoggedIn = !!req.auth?.user;
  const staffRole = (req.auth?.user as unknown as Record<string, unknown>)?.role as string | undefined;

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
    "/director/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/parent/:path*",
    "/login",
  ],
};
