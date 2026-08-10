"use client";

// ============================================================================
// /g 학생 앱 셸 — 상단 헤더(학원명+학생 이름, 햄버거) + 하단 탭바 4개.
//
// 탭 루트(/g/home · /g/track/* · /g/tasks · /g/me)만 이 셸로 감싼다 —
// 드릴 플레이어·유닛 허브·레슨·q·w 등 몰입 화면은 풀스크린 유지(셸 미적용).
// 활성 탭은 usePathname 판정. 햄버거는 우측 슬라이드 시트(gd 언어 자체 구현).
// 스타일은 gd.css 의 gd-shell-* / gd-tabbar / gd-tab / gd-side-sheet 참조.
//
// "학습" 탭은 트랙 허브(/g/track/grammar)로 간다 — 구 "훈련"(/g/train)은
// 트랙 허브로 서버 리다이렉트되므로, 활성 판정에는 레거시 경로도 함께 매칭한다.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookA,
  BookOpen,
  ClipboardList,
  GraduationCap,
  House,
  LogOut,
  Menu,
  MessageCircleQuestion,
  Shield,
  X,
} from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { StatusWindow } from "@/components/study-os/status-window";

/**
 * `match`: 활성 판정용 추가 경로 프리픽스.
 * 학습 탭은 트랙 4종(/g/track/*) 전체와 레거시 /g/train 에서 활성으로 본다.
 */
const TABS = [
  { href: "/g/home", label: "홈", icon: House, match: [] },
  {
    href: "/g/track/grammar",
    label: "학습",
    icon: BookOpen,
    match: ["/g/track", "/g/train"],
  },
  { href: "/g/tasks", label: "과제", icon: ClipboardList, match: [] },
  { href: "/g/me", label: "내 기록", icon: BarChart3, match: [] },
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
  const [statusOpen, setStatusOpen] = useState(false);

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

  const isActive = (tab: (typeof TABS)[number]) => {
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) return true;
    return tab.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  };

  // 홈 히어로에 학생 이름이 이미 크게 있으므로 /g/home 에서만 이름 행을 숨기고
  // 'SMOAT · {학원명}' 한 줄로 축약한다. 타 탭은 현행 2행 유지.
  const isHome = pathname === "/g/home";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── 상단 헤더 — 높이는 --gd-shell-h 고정(gd.css .gd-pin-banner 와 단일 원천,
          탭 전환 시 헤더 높이 점프 방지) ── */}
      <header className="gd-shell-header">
        <div
          className="gd-page flex items-center justify-between px-5 py-2.5"
          style={{ minHeight: "var(--gd-shell-h)" }}
        >
          <div className="min-w-0">
            <p className="gd-label truncate">SMOAT · {academyName}</p>
            {!isHome && (
              <p className="gd-t-md mt-0.5 truncate font-bold tracking-tight">
                {studentName}님
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => setStatusOpen(true)}
              className="gd-iconbtn"
              aria-label="상태창 열기"
              aria-haspopup="dialog"
              aria-expanded={statusOpen}
            >
              <Shield className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="gd-iconbtn -mr-2"
              aria-label="메뉴 열기"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      {/* ── 콘텐츠(하단 탭바 여백 확보) ── */}
      <main className="gd-shell-main min-w-0 flex-1">{children}</main>

      {/* ── 하단 탭바 ── */}
      <nav className="gd-tabbar gd-safe-b" aria-label="주 메뉴">
        <div className="gd-page grid grid-cols-4">
          {TABS.map((tab) => {
            const { href, label, icon: Icon } = tab;
            const active = isActive(tab);
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
                className="gd-iconbtn -mr-2"
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
              <button
                type="button"
                className="gd-menu-item w-full text-left"
                onClick={() => {
                  closeMenu();
                  setStatusOpen(true);
                }}
              >
                <Shield className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                상태창
              </button>
              {TABS.map((tab) => {
                const { href, label, icon: Icon } = tab;
                const active = isActive(tab);
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
              <Link
                href="/g/vocab"
                className="gd-menu-item"
                data-active={
                  pathname === "/g/vocab" || pathname.startsWith("/g/vocab/") ? "true" : undefined
                }
                aria-current={pathname === "/g/vocab" ? "page" : undefined}
                onClick={closeMenu}
              >
                <BookA className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                취약 단어장
              </Link>
              {FEATURE_FLAGS.ENABLE_VOCAB_DRILL && (
                <Link
                  href="/g/track/vocab"
                  className="gd-menu-item"
                  data-active={
                    pathname === "/g/track/vocab" ||
                    pathname.startsWith("/g/track/vocab/")
                      ? "true"
                      : undefined
                  }
                  aria-current={pathname === "/g/track/vocab" ? "page" : undefined}
                  onClick={closeMenu}
                >
                  <GraduationCap className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                  어휘 훈련
                </Link>
              )}
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

      {/* ── 상태창 — 어디서든 소환(§14) ── */}
      <StatusWindow open={statusOpen} onClose={() => setStatusOpen(false)} />
    </div>
  );
}
