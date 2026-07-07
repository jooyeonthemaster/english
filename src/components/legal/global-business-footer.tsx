"use client";

import { usePathname } from "next/navigation";
import { BusinessInfoBlock } from "@/components/legal/business-info-block";

const APP_SHELL_PREFIXES = [
  "/director",
  "/teacher",
  "/student",
  "/parent",
  "/tutor",
];

function isHandledByAppShell(pathname: string) {
  if (pathname === "/admin/login") return false;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  return APP_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function GlobalBusinessFooter() {
  const pathname = usePathname();

  if (isHandledByAppShell(pathname)) return null;

  // print:hidden — 공개 리포트(/r) 등에서 인쇄/PDF 시 사업자 고지 2쪽이
  // 산출물 말미에 붙는 낭비 방지(웹 화면 고지는 유지, 인쇄물엔 불요).
  return <BusinessInfoBlock compact className="bg-white print:hidden" />;
}
