"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, UserCheck, FolderOpen, User, BookOpenCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudentHeader } from "@/components/layout/student-header";
import { getStudentHeaderData } from "@/actions/student-app";

// ---------------------------------------------------------------------------
// Header data type
// ---------------------------------------------------------------------------
interface HeaderData {
  studentName: string;
  schoolName: string;
  grade: number;
  academyName: string;
  streak: number;
}

// ---------------------------------------------------------------------------
// 5 sections (swipe order)
// ---------------------------------------------------------------------------
const SECTIONS = [
  { label: "홈", icon: Home, href: "/student" },
  { label: "출석", icon: UserCheck, href: "/student/attendance" },
  { label: "학습", icon: BookOpenCheck, href: "/student/learn" },
  { label: "자료실", icon: FolderOpen, href: "/student/resources" },
  { label: "마이", icon: User, href: "/student/mypage" },
];

function getSectionIndex(pathname: string): number {
  if (pathname === "/student") return 0;
  if (pathname.startsWith("/student/attendance")) return 1;
  if (pathname.startsWith("/student/learn")) return 2;
  if (pathname.startsWith("/student/resources")) return 3;
  if (pathname.startsWith("/student/mypage")) return 4;
  return -1;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export default function StudentAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [headerData, setHeaderData] = useState<HeaderData | null>(null);

  useEffect(() => {
    getStudentHeaderData()
      .then((d) => { if (d) setHeaderData(d); })
      .catch(() => {});
  }, []);

  const isLoginPage = pathname === "/student/login";
  const isLearningSession =
    pathname.includes("/learn/") &&
    (pathname.includes("/session") || pathname.includes("/stories"));
  const isVocabTest = pathname.includes("/vocab/") && pathname.includes("/test");
  const hideChrome = isLoginPage || isLearningSession || isVocabTest;

  const currentSection = getSectionIndex(pathname);

  // --- Swipe detection ---
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = false;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (currentSection < 0) return;

    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;

    // 가로 이동이 세로보다 크고, 최소 60px 이상 스와이프
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx < 0 && currentSection < SECTIONS.length - 1) {
        // 왼쪽 스와이프 → 다음 섹션
        router.push(SECTIONS[currentSection + 1].href);
      } else if (dx > 0 && currentSection > 0) {
        // 오른쪽 스와이프 → 이전 섹션
        router.push(SECTIONS[currentSection - 1].href);
      }
    }
  }, [currentSection, router]);

  // --- Tab helpers ---
  function isActive(href: string) {
    if (href === "/student") return pathname === "/student";
    return pathname.startsWith(href);
  }

  if (hideChrome) {
    return (
      <div className="flex justify-center bg-white" style={{ minHeight: "100dvh" }}>
        <div className="w-full max-w-2xl" style={{ minHeight: "100dvh" }}>{children}</div>
      </div>
    );
  }

  return (
    <div className="flex justify-center bg-[#F5F5F5]" style={{ height: "100dvh" }}>
      <div className="w-full max-w-2xl flex flex-col" style={{ height: "100dvh" }}>
        {/* 헤더 */}
        <div className="shrink-0 z-40 bg-[#F5F5F5]">
          <StudentHeader
            studentName={headerData?.studentName}
            schoolName={headerData?.schoolName}
            grade={headerData?.grade}
            academyName={headerData?.academyName}
            streak={headerData?.streak ?? 0}
          />
        </div>

        {/* 콘텐츠 — 스와이프 + 세로 스크롤 */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="pb-4">
            {children}
          </div>
        </main>

        {/* 하단 네비 */}
        <div className="shrink-0 z-30 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom,0.5rem))] pt-1 bg-transparent pointer-events-none">
          <div className="relative bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.10)] mx-1 pointer-events-auto">
            <div className="flex items-center h-[var(--tab-h)] px-1">
              {SECTIONS.map((section) => (
                <TabItem
                  key={section.href}
                  tab={section}
                  active={isActive(section.href)}
                  isFab={section.href === "/student/learn"}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Item
// ---------------------------------------------------------------------------
function TabItem({
  tab,
  active,
  isFab,
}: {
  tab: { label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; href: string };
  active: boolean;
  isFab?: boolean;
}) {
  const Icon = tab.icon;

  if (isFab) {
    return (
      <Link
        href={tab.href}
        className="relative flex flex-1 items-center justify-center h-full"
      >
        <div
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            "bg-gradient-to-br from-blue-500 to-indigo-600",
            "shadow-[0_4px_16px_rgba(59,130,246,0.35)]",
            "active:scale-90 transition-all duration-200",
            active && "ring-[3px] ring-blue-100",
          )}
        >
          <Icon className="text-white w-5 h-5" strokeWidth={2.5} />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={tab.href}
      className={cn(
        "relative flex flex-1 items-center justify-center h-full transition-all",
        active ? "text-blue-500" : "text-gray-400",
      )}
    >
      <Icon className={cn("w-6 h-6", active && "scale-110")} strokeWidth={active ? 2.5 : 1.8} />
    </Link>
  );
}
