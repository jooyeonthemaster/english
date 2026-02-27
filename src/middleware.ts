import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;

  // Admin routes protection (except login page)
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!isLoggedIn) {
      const loginUrl = new URL("/admin/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect authenticated users away from login page
  if (pathname === "/admin/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));
  }

  // Student mypage routes protection
  if (pathname.includes("/mypage")) {
    // Check for student session cookie
    const studentSession = req.cookies.get("student-session");
    if (!studentSession?.value) {
      // Extract school slug from URL pattern: /[schoolSlug]/mypage
      const segments = pathname.split("/");
      const schoolSlug = segments[1];
      const loginUrl = new URL("/login", req.nextUrl.origin);
      if (schoolSlug) {
        loginUrl.searchParams.set("school", schoolSlug);
      }
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/:path*/mypage/:path*",
  ],
};
