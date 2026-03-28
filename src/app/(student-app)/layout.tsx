"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UserCheck, FolderOpen, User, BookOpenCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudentHeader } from "@/components/layout/student-header";
import { getStudentDashboard } from "@/actions/student-app";

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
// 5-tab bottom navigation (center = floating CTA)
// ---------------------------------------------------------------------------
const bottomTabs = [
  { label: "홈", icon: Home, href: "/student" },
  { label: "출석", icon: UserCheck, href: "/student/attendance" },
  // center (index 2) is the floating "공부하러가기" button, handled separately
  { label: "자료실", icon: FolderOpen, href: "/student/resources" },
  { label: "마이", icon: User, href: "/student/mypage" },
];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export default function StudentAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [headerData, setHeaderData] = useState<HeaderData | null>(null);

  useEffect(() => {
    getStudentDashboard()
      .then((d) =>
        setHeaderData({
          studentName: d.student.name,
          schoolName: d.student.schoolName ?? "",
          grade: d.student.grade,
          academyName: d.student.academyName ?? "",
          streak: d.student.streak,
        }),
      )
      .catch(() => {});
  }, []);

  // --- Hide chrome conditions ---
  const isLoginPage = pathname === "/student/login";
  const isLearningSession =
    pathname.includes("/learn/") &&
    (pathname.includes("/session") || pathname.includes("/stories"));
  const isVocabTest = pathname.includes("/vocab/") && pathname.includes("/test");
  const hideChrome = isLoginPage || isLearningSession || isVocabTest;

  function isActive(href: string) {
    if (href === "/student") return pathname === "/student";
    return pathname.startsWith(href);
  }

  const isLearnActive = pathname.startsWith("/student/learn");

  return (
    <div className="flex justify-center min-h-screen bg-[var(--erp-bg)]">
      <div className="w-full max-w-2xl bg-[var(--erp-surface)] min-h-screen flex flex-col relative">
        {/* Header */}
        {!hideChrome && (
          <StudentHeader
            studentName={headerData?.studentName}
            schoolName={headerData?.schoolName}
            grade={headerData?.grade}
            academyName={headerData?.academyName}
            streak={headerData?.streak ?? 0}
          />
        )}

        {/* Content */}
        <main
          className={cn(
            "flex-1 flex flex-col",
            !hideChrome && "pb-[calc(var(--tab-h)+1rem+env(safe-area-inset-bottom,0px))]",
          )}
        >
          {children}
        </main>

        {/* Bottom Navigation — 5 tabs with floating center CTA */}
        {!hideChrome && (
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-30 safe-bottom">
            <div className="relative bg-[var(--erp-surface)] shadow-[0_-1px_4px_rgba(0,0,0,0.06)]">
              {/* Notch background behind FAB */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-[calc(var(--fab-size)*0.4)] w-[calc(var(--fab-size)+1.25rem)] h-[calc(var(--fab-size)*0.4+1px)] bg-[var(--erp-surface)] rounded-t-[50%]"
                aria-hidden="true"
              />

              <div className="flex items-center h-[var(--tab-h)]">
                {/* Left 2 tabs */}
                {bottomTabs.slice(0, 2).map((tab) => (
                  <TabItem
                    key={tab.href}
                    tab={tab}
                    active={isActive(tab.href)}
                  />
                ))}

                {/* Center spacer for floating button */}
                <div className="flex-1" />

                {/* Right 2 tabs */}
                {bottomTabs.slice(2).map((tab) => (
                  <TabItem
                    key={tab.href}
                    tab={tab}
                    active={isActive(tab.href)}
                  />
                ))}
              </div>

              {/* Floating center CTA — 공부하러가기 */}
              <Link
                href="/student/learn"
                className={cn(
                  "absolute left-1/2 -translate-x-1/2",
                  "flex items-center justify-center",
                  "w-[var(--fab-size)] h-[var(--fab-size)] rounded-full",
                  "shadow-lg active:scale-95 transition-transform",
                  isLearnActive
                    ? "bg-[var(--erp-primary)] shadow-blue-500/30"
                    : "bg-[var(--erp-primary)] shadow-blue-500/20",
                )}
                style={{ top: `calc(-1 * var(--fab-size) * 0.4)` }}
              >
                <BookOpenCheck className="text-white w-[var(--icon-md)] h-[var(--icon-md)]" />
              </Link>
              {/* Active dot under FAB */}
              {isLearnActive && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-[var(--sp-1)] w-1 h-1 rounded-full bg-[var(--erp-primary)]" />
              )}
            </div>
          </nav>
        )}
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
}: {
  tab: { label: string; icon: React.ComponentType<{ className?: string }>; href: string };
  active: boolean;
}) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center h-full transition-colors",
        active ? "text-[var(--erp-primary)]" : "text-[var(--erp-text-muted)]",
      )}
    >
      <Icon
        className={cn(
          "transition-all w-[var(--icon-md)] h-[var(--icon-md)]",
          active && "scale-110",
        )}
      />
      {/* Active indicator dot */}
      {active && (
        <div className="w-1 h-1 rounded-full bg-[var(--erp-primary)] mt-1" />
      )}
    </Link>
  );
}
