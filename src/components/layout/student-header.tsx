"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronLeft, Bell } from "lucide-react";

// ---------------------------------------------------------------------------
// Sub-page titles
// ---------------------------------------------------------------------------
const SUB_PAGE_TITLES: Record<string, string> = {
  "/student/attendance": "출석",
  "/student/resources": "자료실",
  "/student/mypage": "마이페이지",
  "/student/mypage/settings": "설정",
  "/student/notifications": "알림",
  "/student/review": "오답 복습",
};

function getSubPageTitle(pathname: string): string | null {
  if (SUB_PAGE_TITLES[pathname]) return SUB_PAGE_TITLES[pathname];
  if (/^\/student\/learn\/[^/]+$/.test(pathname)) return "지문 학습";
  if (/^\/student\/vocab\/[^/]+/.test(pathname)) return "단어 시험";
  if (/^\/student\/mypage\/progress/.test(pathname)) return "학습 추이";
  return null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface StudentHeaderProps {
  studentName?: string;
  schoolName?: string;
  grade?: number;
  academyName?: string;
  streak?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StudentHeader({
  studentName = "",
  schoolName = "",
  grade,
  academyName = "",
}: StudentHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const subTitle = getSubPageTitle(pathname);
  const isSubPage = subTitle !== null;
  const isHomePage = pathname === "/student";

  // Scroll shadow detection
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const gradeLabel = grade ? `${grade}학년` : "";

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden="true" />

      <header
        className={cn(
          "sticky top-0 z-40 w-full bg-[var(--erp-surface)]/95 backdrop-blur-xl transition-shadow duration-200",
          scrolled && "shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
        )}
      >
        <div className="relative flex h-[var(--header-h)] items-center justify-between px-[var(--sp-3)]">
          {/* ── Left ── */}
          {isSubPage ? (
            <button
              onClick={() => router.back()}
              className="flex items-center gap-[var(--sp-1)] rounded-lg px-[var(--sp-1)] py-[var(--sp-1)] active:bg-[var(--erp-secondary-light)] transition-colors"
              aria-label="뒤로 가기"
            >
              <ChevronLeft className="text-[var(--erp-text)] w-[var(--icon-md)] h-[var(--icon-md)]" />
              <span className="text-[var(--fs-sm)] font-semibold text-[var(--erp-text)]">
                {subTitle}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-[var(--sp-2)]">
              {/* Academy logo placeholder + name */}
              <div className="flex items-center gap-[var(--sp-1)]">
                <div className="w-[var(--icon-md)] h-[var(--icon-md)] rounded-md bg-[var(--erp-primary)] flex items-center justify-center">
                  <span className="text-[var(--fs-caption)] font-black text-white leading-none">N</span>
                </div>
                <span className="text-[var(--fs-sm)] font-bold text-[var(--erp-text)] tracking-tight">
                  {academyName || "NARA"}
                </span>
              </div>
            </div>
          )}

          {/* ── Center: Student info (home page only) — absolute center ── */}
          {isHomePage && studentName && (
            <button
              onClick={() => router.push("/student/mypage")}
              className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center px-[var(--sp-3)] py-[var(--sp-1)] rounded-full bg-[var(--erp-secondary-light)] border border-[var(--erp-border)] active:bg-[var(--erp-border-light)] transition-colors"
            >
              <span className="text-[var(--fs-xs)] font-semibold text-[var(--erp-text)] leading-tight">
                {studentName}
              </span>
              {(schoolName || gradeLabel) && (
                <span className="text-[var(--fs-caption)] text-[var(--erp-text-muted)] leading-tight">
                  {[schoolName, gradeLabel].filter(Boolean).join(" · ")}
                </span>
              )}
            </button>
          )}

          {/* ── Right: Notification bell ── */}
          <div className="flex items-center">
            <button
              onClick={() => router.push("/student/notifications")}
              className="relative rounded-lg p-[var(--sp-1)] active:bg-[var(--erp-secondary-light)] transition-colors"
              aria-label="알림"
            >
              <Bell
                className="text-[var(--erp-text-secondary)] w-[var(--icon-md)] h-[var(--icon-md)]"
              />
              {/* Unread dot */}
              <span className="absolute top-1 right-1 w-[var(--sp-1)] h-[var(--sp-1)] rounded-full bg-[var(--erp-error)]" />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
