"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";

// ---------------------------------------------------------------------------
// 섹션별 타이틀
// ---------------------------------------------------------------------------
const SECTION_TITLES: Record<string, string> = {
  "/student/attendance": "출석",
  "/student/resources": "자료실",
  "/student/notifications": "알림",
  "/student/learn/review": "오답 관리",
  "/student/learn/analytics": "학습 분석",
  "/student/learn/analytics/review": "복습하기",
  "/student/mypage/settings": "설정",
  "/student/mypage/progress": "학습 추이",
  "/student/learn/ranking": "랭킹",
};

function getPageTitle(pathname: string): string | null {
  if (SECTION_TITLES[pathname]) return SECTION_TITLES[pathname];
  if (/^\/student\/learn\/analytics\/[^/]+$/.test(pathname)) return "오답 상세";
  if (/^\/student\/learn\/[^/]+\/session/.test(pathname)) return "학습 세션";
  if (/^\/student\/learn\/[^/]+\/stories/.test(pathname)) return "스토리";
  if (/^\/student\/learn\/[^/]+$/.test(pathname)) return "지문 학습";
  return null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface StudentHeaderProps {
  academyName?: string;
}

// ---------------------------------------------------------------------------
// Component — 항상 로고 헤더 + 서브페이지면 뒤로가기+제목 추가
// ---------------------------------------------------------------------------
export function StudentHeader({
  academyName = "",
}: StudentHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const isMainTab = pathname === "/student"
    || pathname === "/student/learn"
    || pathname === "/student/mypage";

  const pageTitle = getPageTitle(pathname);

  return (
    <header className="w-full" style={{ backgroundColor: "var(--base-bg)" }}>
      {/* 로고 바 — 항상 표시 */}
      <div className="flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center">
            <span className="text-xs font-black text-white">N</span>
          </div>
          <span className="text-base font-extrabold text-black tracking-tight">
            {academyName || "NARA"}
          </span>
        </div>

        <button
          onClick={() => router.push("/student/notifications")}
          className="relative p-2 rounded-2xl active:bg-black/5 transition-colors"
          aria-label="알림"
        >
          <Bell className="w-5 h-5 text-black" strokeWidth={2} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[var(--base-bg)]" />
        </button>
      </div>

      {/* 서브 페이지: 뒤로가기 + 제목 */}
      {!isMainTab && (
        <div className="flex items-center px-3 pb-2">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-2xl active:bg-black/5 transition-colors shrink-0"
            aria-label="뒤로 가기"
          >
            <ArrowLeft className="w-5 h-5 text-black" strokeWidth={2.5} />
          </button>
          {pageTitle && (
            <span className="text-lg font-bold text-black ml-1">
              {pageTitle}
            </span>
          )}
        </div>
      )}
    </header>
  );
}
