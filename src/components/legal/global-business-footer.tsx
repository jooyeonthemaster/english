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

/**
 * 학생 응시면(/t/[token]) — 시험 중 화면에 외부 링크·사업자 고지 등
 * 마케팅 크롬을 노출하지 않습니다(SF3). 답안 입력(/a)·공개 리포트(/r)는
 * 응시 화면이 아니므로 기존 고지를 유지합니다.
 */
function isStudentTakingSurface(pathname: string) {
  if (pathname === "/t" || pathname.startsWith("/t/")) return true;
  // 어법 드릴(/g) — 전체화면 학습 표면이므로 마케팅 크롬 미노출.
  return pathname === "/g" || pathname.startsWith("/g/");
}

export function GlobalBusinessFooter() {
  const pathname = usePathname();

  if (isHandledByAppShell(pathname)) return null;
  if (isStudentTakingSurface(pathname)) return null;

  // print:hidden — 공개 리포트(/r) 등에서 인쇄/PDF 시 사업자 고지 2쪽이
  // 산출물 말미에 붙는 낭비 방지(웹 화면 고지는 유지, 인쇄물엔 불요).
  return <BusinessInfoBlock compact className="bg-white print:hidden" />;
}
