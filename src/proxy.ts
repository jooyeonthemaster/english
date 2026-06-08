import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

export const proxy = auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isStaffLoggedIn = !!req.auth?.user;
  const staffRole = (req.auth?.user as unknown as Record<string, unknown>)?.role as string | undefined;

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();

    const adminSession = req.cookies.get("yshin-admin-session");
    const adminLoginUrl = new URL("/admin/login", req.nextUrl.origin);
    if (!adminSession?.value) return NextResponse.redirect(adminLoginUrl);

    const secret = process.env.ADMIN_JWT_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) return NextResponse.redirect(adminLoginUrl);

    try {
      await jwtVerify(adminSession.value, new TextEncoder().encode(secret));
    } catch {
      return NextResponse.redirect(adminLoginUrl);
    }
  }

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

  if (pathname.startsWith("/teacher") && !isStaffLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/student")) {
    if (pathname === "/student/login") return NextResponse.next();
    const studentSession = req.cookies.get("student-session");
    if (!studentSession?.value) {
      const loginUrl = new URL("/student/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith("/tutor")) {
    const segments = pathname.split("/").filter(Boolean);
    const isTutorLogin = segments.length === 2;
    if (!isTutorLogin) {
      const tutorSession = req.cookies.get("tutor-student-session");
      if (!tutorSession?.value) {
        const academy = segments[1] ?? "";
        const loginUrl = new URL(`/tutor/${academy}`, req.nextUrl.origin);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  if (pathname.startsWith("/parent")) {
    if (pathname === "/parent/login") return NextResponse.next();
    const parentSession = req.cookies.get("parent-session");
    if (!parentSession?.value) {
      const loginUrl = new URL("/parent/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname === "/login" && isStaffLoggedIn) {
    const redirectTo =
      staffRole === "DIRECTOR"
        ? "/director/workbench/questions/generate"
        : "/teacher";
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
    "/tutor/:path*",
    "/parent/:path*",
    "/login",
  ],
};
