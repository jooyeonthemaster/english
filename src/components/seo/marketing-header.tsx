"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, LogIn, Menu, X } from "lucide-react";
import { LoginModal } from "@/components/landing/login-modal";
import { BrandIcon } from "@/components/brand/brand-mark";

/**
 * 기능/콘텐츠 랜딩 공통 헤더.
 * - 모든 라벨은 whitespace-nowrap (한국어 라벨이 좁은 폭·고배율 줌에서 두 줄로 꺾이는 사고 방지).
 * - 데스크톱 nav 는 lg(1024px)부터만 노출 — md 폭에서 브랜드/CTA 와 밀려 찌그러지는 것을 차단.
 * - lg 미만은 전체 메뉴 시트(기능·콘텐츠 전 링크) — 콘텐츠 허브로의 내부링크가 모바일에서도 살아있게.
 */
const NAV_ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/features/ai-question-generation", label: "AI 문제 생성" },
  { href: "/features/exam-builder", label: "Word·한글 시험지" },
  { href: "/features/exam-report", label: "시험 리포트" },
  { href: "/types", label: "유형백과" },
  { href: "/exam-prep", label: "시험 대비" },
  { href: "/guides", label: "가이드" },
  { href: "/resources", label: "자료실" },
];

const SHEET_GROUPS: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ href: string; label: string; description?: string }>;
}> = [
  {
    label: "핵심 기능",
    items: [
      { href: "/features/ai-question-generation", label: "AI 문제 생성", description: "지문만 넣으면 수능·내신 전 유형 출제" },
      { href: "/features/exam-builder", label: "Word·한글 시험지 제작", description: "실전 시험지 조판을 클릭 몇 번으로" },
      { href: "/features/passage-analysis", label: "지문 분석", description: "구문·해석·어휘 분석 자료 자동 생성" },
      { href: "/features/exam-report", label: "시험 리포트", description: "학생별 성적·오답 분석 리포트 자동 생성" },
      { href: "/features/academy-erp", label: "학원 올인원", description: "출결·성적·리포트까지 한 곳에서" },
    ],
  },
  {
    label: "콘텐츠 라이브러리",
    items: [
      { href: "/types", label: "유형백과", description: "수능·내신 전 유형 출제 원리 해부" },
      { href: "/exam-prep", label: "시험 대비", description: "모의고사·수능·내신 대비 전략" },
      { href: "/textbooks", label: "교과서별 가이드", description: "출판사별 내신 변형문제 제작법" },
      { href: "/guides", label: "제작 가이드", description: "문제·시험지 제작 실전 노하우" },
      { href: "/resources", label: "무료 자료실", description: "시험지 양식·채점기준표 다운로드" },
      { href: "/faq", label: "자주 묻는 질문" },
      { href: "/glossary", label: "용어사전" },
    ],
  },
];

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
          menuOpen
            ? "bg-white shadow-[0_1px_0_rgba(15,23,42,0.08)]"
            : scrolled
              ? "bg-white/85 backdrop-blur-2xl shadow-[0_1px_0_rgba(15,23,42,0.06)]"
              : "bg-white/40 backdrop-blur-sm"
        }`}
      >
        <div
          className={`mx-auto flex max-w-[1480px] items-center justify-between gap-3 px-4 transition-[height] duration-300 sm:px-6 lg:px-8 ${
            scrolled ? "h-16" : "h-20"
          }`}
        >
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <BrandIcon className="group-hover:bg-blue-600" />
            <span className="flex flex-col leading-none">
              <span className="whitespace-nowrap text-[18px] font-black tracking-normal text-slate-950 transition-colors group-hover:text-blue-600">
                SMOAT
              </span>
              {/* lg~xl 사이(고배율 줌 데스크톱 포함)에서 nav·CTA 와 폭 경합 → 잘림. min-[400px]~lg 미만(모바일·태블릿)과 xl 이상에서만 노출. */}
              <span className="hidden whitespace-nowrap text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 min-[400px]:block lg:hidden xl:block">
                스모트 · English AI Workbench
              </span>
            </span>
          </Link>

          <nav
            aria-label="주 메뉴"
            className="hidden items-center gap-0.5 rounded-full border border-slate-200/70 bg-white/75 p-1 text-[13px] font-bold text-slate-600 shadow-[0_18px_52px_-38px_rgba(15,23,42,0.7)] backdrop-blur-2xl lg:flex"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-full px-3 py-2 transition-colors hover:bg-blue-50 hover:text-blue-700 xl:px-3.5"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-3 text-[13px] font-extrabold text-slate-700 transition hover:border-slate-200 hover:bg-white/80 hover:text-slate-950 sm:px-4"
            >
              <LogIn className="size-4 shrink-0" />
              <span className="hidden whitespace-nowrap sm:inline">로그인</span>
            </button>
            <Link
              href="/register"
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-slate-950 px-4 text-[13px] font-extrabold text-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-blue-600 sm:px-5"
            >
              <span className="hidden whitespace-nowrap sm:inline">학원 가입 신청</span>
              <span className="whitespace-nowrap sm:hidden">가입 신청</span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? "메뉴 닫기" : "전체 메뉴 열기"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 transition hover:border-blue-300 hover:text-blue-700 lg:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* 전체 메뉴 시트 (lg 미만) */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white lg:hidden">
          <div className={scrolled ? "h-16 shrink-0" : "h-20 shrink-0"} />
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-6 sm:px-8">
            <div className="mx-auto max-w-[640px]">
              {SHEET_GROUPS.map((group) => (
                <div key={group.label} className="mt-8 first:mt-0">
                  <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-600">
                    <span aria-hidden className="size-1.5 bg-blue-600" />
                    {group.label}
                  </p>
                  <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          className="group flex items-center justify-between gap-3 py-3.5"
                        >
                          <span className="min-w-0">
                            <span className="block text-[16px] font-extrabold text-slate-950 transition-colors group-hover:text-blue-700">
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="mt-0.5 block truncate text-[12.5px] font-medium text-slate-500">
                                {item.description}
                              </span>
                            )}
                          </span>
                          <ArrowUpRight className="size-4 shrink-0 text-slate-300 transition group-hover:text-blue-600" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="mt-10 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Link
                  href="/register"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-slate-950 text-[14.5px] font-extrabold text-white transition hover:bg-blue-600"
                >
                  학원 가입 신청
                  <ArrowRight className="size-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setLoginOpen(true);
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-slate-300 text-[14.5px] font-extrabold text-slate-900 transition hover:border-blue-400 hover:text-blue-700"
                >
                  <LogIn className="size-4" />
                  로그인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
