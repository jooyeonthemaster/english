"use client";

// ============================================================================
// /g 학생 앱 셸 — 상단 헤더(학원명+학생 이름, 햄버거) + 하단 탭바 4개.
//
// 탭 루트(/g/home · /g/train · /g/tasks · /g/me)만 이 셸로 감싼다 —
// 드릴 플레이어·유닛 허브·learn·q·w 등 몰입 화면은 풀스크린 유지(셸 미적용).
// 활성 탭은 usePathname 판정. 햄버거는 우측 슬라이드 시트(gd 언어 자체 구현).
// 스타일은 gd.css 의 gd-shell-* / gd-tabbar / gd-tab / gd-side-sheet 참조.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Dumbbell,
  House,
  LogOut,
  Menu,
  MessageCircleQuestion,
  X,
} from "lucide-react";

const TABS = [
  { href: "/g/home", label: "홈", icon: House },
  { href: "/g/train", label: "훈련", icon: Dumbbell },
  { href: "/g/tasks", label: "과제", icon: ClipboardList },
  { href: "/g/me", label: "내 기록", icon: BarChart3 },
] as const;

export function GShell({
  studentName,
  academyName,
  tasksBadgeCount,
  chatRemainingToday,
  children,
}: {
  studentName: string;
  academyName: string;
  /** 과제 탭 미완료 배지 — 0 또는 undefined 면 표시하지 않음 */
  tasksBadgeCount?: number;
  /** 햄버거 시트의 오늘 질문 잔여 표시 — undefined 면 행 자체를 생략 */
  chatRemainingToday?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // 경로가 바뀌면(링크 이동) 시트를 닫는다
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ESC 로 시트 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  // 기존 home-client 와 동일한 로그아웃 경로
  async function logout() {
    await fetch("/api/grammar-drill/logout", { method: "POST" }).catch(() => {});
    router.replace("/g");
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // 홈 히어로에 학생 이름이 이미 크게 있으므로 /g/home 에서만 이름 행을 숨기고
  // 'SMOAT · {학원명}' 한 줄로 축약한다. 타 탭은 현행 2행 유지.
  const isHome = pathname === "/g/home";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── 상단 헤더 — minHeight 는 2행(gd-label 16.5 + mt-0.5 2 + gd-t-md 22.5 +
          py-2.5 20 = 61px) 기준 고정: 탭 전환 시 높이 점프 방지 ── */}
      <header className="gd-shell-header">
        <div
          className="mx-auto flex max-w-md items-center justify-between px-5 py-2.5"
          style={{ minHeight: "3.8125rem" }}
        >
          <div className="min-w-0">
            <p className="gd-label truncate">SMOAT · {academyName}</p>
            {!isHome && (
              <p className="gd-t-md mt-0.5 truncate font-bold tracking-tight">
                {studentName}님
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-2)" }}
            aria-label="메뉴 열기"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* ── 콘텐츠(하단 탭바 여백 확보) ── */}
      <main className="gd-shell-main min-w-0 flex-1">{children}</main>

      {/* ── 하단 탭바 ── */}
      <nav className="gd-tabbar gd-safe-b" aria-label="주 메뉴">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="gd-tab"
                data-active={active ? "true" : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5.5 w-5.5" strokeWidth={active ? 2 : 1.75} />
                {label}
                {href === "/g/tasks" && tasksBadgeCount ? (
                  <span className="gd-tab-badge" aria-label={`미완료 과제 ${tasksBadgeCount}건`}>
                    {tasksBadgeCount > 9 ? "9+" : tasksBadgeCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── 햄버거 → 우측 슬라이드 시트 ── */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="gd-sheet-backdrop"
            onClick={closeMenu}
          />
          <aside
            className="gd-side-sheet gd-app"
            role="dialog"
            aria-modal="true"
            aria-label="메뉴"
          >
            <div className="gd-hairline-b flex items-center justify-between px-5 pb-3.5 pt-4">
              <div className="min-w-0">
                <p className="gd-t-md truncate font-bold">{studentName}님</p>
                <p className="gd-t-2xs mt-0.5 truncate" style={{ color: "var(--gd-ink-3)" }}>
                  {academyName}
                </p>
              </div>
              <button
                type="button"
                onClick={closeMenu}
                className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ color: "var(--gd-ink-3)" }}
                aria-label="메뉴 닫기"
              >
                <X className="h-4.5 w-4.5" strokeWidth={2} />
              </button>
            </div>

            {chatRemainingToday !== undefined && (
              <div className="gd-hairline-b flex items-center gap-2 px-5 py-3">
                <MessageCircleQuestion
                  className="h-4 w-4 shrink-0"
                  style={{ color: "var(--gd-blue)" }}
                  strokeWidth={1.75}
                />
                <p className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
                  오늘 질문{" "}
                  <span className="gd-mono font-bold" style={{ color: "var(--gd-ink)" }}>
                    {chatRemainingToday}
                  </span>
                  회 남았습니다
                </p>
              </div>
            )}

            <nav className="gd-scroll flex min-h-0 flex-1 flex-col py-2" aria-label="메뉴 링크">
              {TABS.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className="gd-menu-item"
                    data-active={active ? "true" : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={closeMenu}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="gd-hairline-t gd-safe-b shrink-0 py-1">
              <button
                type="button"
                onClick={logout}
                className="gd-menu-item w-full text-left"
                style={{ color: "var(--gd-bad)" }}
              >
                <LogOut className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                로그아웃
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
