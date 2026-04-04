"use client";

import { useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, User, BookOpenCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudentHeader } from "@/components/layout/student-header";
import { QueryProvider } from "@/providers/query-provider";
import { useHeaderData } from "@/hooks/use-student-data";

// ---------------------------------------------------------------------------
// Marquee messages
// ---------------------------------------------------------------------------
const MARQUEE_MESSAGES = [
  "오늘도 한 걸음 더! 꾸준함이 실력이 됩니다 💪",
  "🔥 30일 연속 학습 달성하면 문화상품권 1만원!",
  "상위 1%는 매일 학습합니다. 오늘도 시작해볼까요?",
  "미션 달성하면 XP 배율 보너스! ✨",
  "어제보다 1문제 더! 작은 차이가 큰 변화를 만듭니다",
  "🏆 이번 주 랭킹 도전! XP를 모아보세요",
  "틀린 문제 복습하면 정답률 2배 UP! 📈",
  "매일 3분 투자로 영어 실력이 달라집니다",
];
const MARQUEE_CHUNK = MARQUEE_MESSAGES.join("   ✦   ");

// ---------------------------------------------------------------------------
// 3 sections
// ---------------------------------------------------------------------------
const SECTIONS = [
  { label: "학습", icon: BookOpenCheck, href: "/student/learn", keyColor: "var(--key-learn)" },
  { label: "홈", icon: Home, href: "/student", keyColor: "var(--key-home)" },
  { label: "마이", icon: User, href: "/student/mypage", keyColor: "var(--key-mypage)" },
];

function getSectionIndex(pathname: string): number {
  if (pathname.startsWith("/student/learn")) return 0;
  if (pathname === "/student") return 1;
  if (pathname.startsWith("/student/mypage")) return 2;
  // 출석/자료실은 홈 키컬러 사용
  if (pathname.startsWith("/student/attendance")) return 1;
  if (pathname.startsWith("/student/resources")) return 1;
  return -1;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export default function StudentAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <StudentAppLayoutInner>{children}</StudentAppLayoutInner>
    </QueryProvider>
  );
}

function StudentAppLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: headerData } = useHeaderData();

  const isLoginPage = pathname === "/student/login";
  const isLearningSession =
    pathname.includes("/learn/") &&
    (pathname.includes("/session") || pathname.includes("/stories"));
  const hideChrome = isLoginPage || isLearningSession;

  const currentSection = getSectionIndex(pathname);

  // --- 현재 탭의 키컬러를 CSS 변수로 설정 ---
  useEffect(() => {
    if (currentSection >= 0 && currentSection < SECTIONS.length) {
      document.documentElement.style.setProperty("--key-color", SECTIONS[currentSection].keyColor);
    }
  }, [currentSection]);

  // --- Swipe detection ---
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const swipeBlocked = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    // 가로 스크롤 가능한 요소 안에서 시작된 터치는 탭 스와이프 차단
    const target = e.target as HTMLElement;
    const scrollParent = target.closest(".overflow-x-auto, .overflow-x-scroll, [data-no-swipe]");
    swipeBlocked.current = !!scrollParent;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (currentSection < 0 || swipeBlocked.current) return;

    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx < 0 && currentSection < SECTIONS.length - 1) {
        router.push(SECTIONS[currentSection + 1].href);
      } else if (dx > 0 && currentSection > 0) {
        router.push(SECTIONS[currentSection - 1].href);
      }
    }
  }, [currentSection, router]);

  // --- Tab helpers ---
  function isActive(href: string) {
    if (href === "/student") {
      return pathname === "/student" ||
        pathname.startsWith("/student/attendance") ||
        pathname.startsWith("/student/resources");
    }
    return pathname.startsWith(href);
  }

  // 메인 3탭 페이지인지 판별 (학생 정보 + 마퀴 표시용)
  const isMainTab = pathname === "/student" ||
    pathname === "/student/learn" ||
    pathname === "/student/mypage";

  if (hideChrome) {
    return (
      <div className="flex justify-center bg-white" style={{ minHeight: "100dvh" }}>
        <div className="w-full max-w-2xl" style={{ minHeight: "100dvh" }}>{children}</div>
      </div>
    );
  }

  return (
    <div className="flex justify-center" style={{ height: "100dvh", backgroundColor: "var(--base-bg)" }}>
      <div className="w-full max-w-2xl flex flex-col" style={{ height: "100dvh" }}>
        {/* 헤더 — 고정 */}
        <div className="shrink-0 z-40" style={{ backgroundColor: "var(--base-bg)" }}>
          <StudentHeader
            academyName={headerData?.academyName}
          />
        </div>

        {/* 콘텐츠 — 스크롤 */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* 메인 탭: 학생 정보 + 마퀴 */}
          {isMainTab && headerData && (
            <div className="text-center pt-6 pb-2 px-5">
              <h1 className="text-3xl font-bold text-black tracking-tight">
                {headerData.studentName}
              </h1>
              <p className="text-sm text-black mt-1">
                {headerData.schoolName ? `${headerData.schoolName} · ` : ""}{headerData.grade}학년
              </p>
            </div>
          )}
          {isMainTab && (
            <div className="overflow-hidden px-5 mb-6">
              <div className="flex whitespace-nowrap" style={{ animation: "marquee-loop 30s linear infinite" }}>
                <span className="text-xs font-medium text-gray-400 shrink-0 px-2">{MARQUEE_CHUNK}</span>
                <span className="text-xs font-medium text-gray-400 shrink-0 px-2">{MARQUEE_CHUNK}</span>
              </div>
            </div>
          )}
          <div className="pb-4">
            {children}
          </div>
        </main>

        {/* 하단 탭바 — Google One 스타일 3탭 */}
        <div
          className="shrink-0 z-30 pb-[max(0.5rem,env(safe-area-inset-bottom,0.5rem))]"
          style={{ backgroundColor: "var(--base-bg)" }}
        >
          <div className="flex items-center justify-around h-16 px-6">
            {SECTIONS.map((section) => (
              <TabItem
                key={section.href}
                tab={section}
                active={isActive(section.href)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Item — Google One 스타일 (아이콘+텍스트, 활성=pill)
// ---------------------------------------------------------------------------
function TabItem({
  tab,
  active,
}: {
  tab: { label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; href: string; keyColor: string };
  active: boolean;
}) {
  const Icon = tab.icon;

  return (
    <Link
      href={tab.href}
      className={cn(
        "flex items-center gap-2 px-5 py-2.5 rounded-full transition-all",
        active ? "font-semibold" : "text-black",
      )}
      style={active ? {
        backgroundColor: `color-mix(in srgb, ${tab.keyColor} 12%, white)`,
        color: tab.keyColor,
      } : undefined}
    >
      <Icon
        className="w-6 h-6"
        strokeWidth={active ? 2.5 : 1.8}
      />
      <span className="text-sm">{tab.label}</span>
    </Link>
  );
}
