"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LogIn } from "lucide-react";
import { LoginModal } from "./login-modal";
import { BrandIcon } from "@/components/brand/brand-mark";

/** 네이버 카페 아이콘(공식 SVG에서 초록 배경만 제거, 투명 배경). */
function NaverCafeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 135.46666 135.46667"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="nc-f"
          x1="319.84"
          x2="437.01001"
          y1="269.20999"
          y2="269.20999"
          gradientTransform="matrix(.26458 0 0 .26458 0 0)"
          gradientUnits="userSpaceOnUse"
          href="#nc-a"
        />
        <linearGradient id="nc-a" x1="319.84" x2="437.01001" y1="269.20999" y2="269.20999" gradientUnits="userSpaceOnUse">
          <stop offset="0.43" stopColor="#ececec" />
          <stop offset="0.51" stopColor="#f6f6f6" />
          <stop offset="0.64" stopColor="#fdfdfd" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <linearGradient
          id="nc-g"
          x1="241"
          x2="241"
          y1="188"
          y2="252"
          gradientTransform="matrix(.26458 0 0 .26458 0 0)"
          gradientUnits="userSpaceOnUse"
          href="#nc-b"
        />
        <linearGradient id="nc-b" x1="241" x2="241" y1="188" y2="252" gradientUnits="userSpaceOnUse">
          <stop offset="0.33" stopColor="#9a5728" />
          <stop offset="0.54" stopColor="#944f2d" />
          <stop offset="1" stopColor="#8a4334" />
        </linearGradient>
        <linearGradient
          id="nc-h"
          x1="135.34"
          x2="337.98001"
          y1="209.73"
          y2="209.73"
          gradientTransform="matrix(.26458 0 0 .26458 0 0)"
          gradientUnits="userSpaceOnUse"
          href="#nc-c"
        />
        <linearGradient id="nc-c" x1="135.34" x2="337.98001" y1="209.73" y2="209.73" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#83452a" />
          <stop offset="0.27" stopColor="#83452a" stopOpacity="0.84" />
          <stop offset="0.74" stopColor="#83452a" stopOpacity="0.59" />
          <stop offset="1" stopColor="#83452a" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient
          id="nc-i"
          x1="222.00999"
          x2="297.88"
          y1="248.00999"
          y2="172.14999"
          gradientTransform="matrix(.26458 0 0 .26458 0 0)"
          gradientUnits="userSpaceOnUse"
          href="#nc-d"
        />
        <linearGradient id="nc-d" x1="222.00999" x2="297.88" y1="248.00999" y2="172.14999" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6d3821" />
          <stop offset="0.77" stopColor="#6d3821" stopOpacity="0" />
          <stop offset="1" stopColor="#6d3821" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="nc-j"
          x1="194"
          x2="334"
          y1="150"
          y2="150"
          gradientTransform="matrix(.26458 0 0 .26458 0 0)"
          gradientUnits="userSpaceOnUse"
          href="#nc-e"
        />
        <linearGradient id="nc-e" x1="194" x2="334" y1="150" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00a43c" />
          <stop offset="0.22" stopColor="#00aa3b" />
          <stop offset="0.52" stopColor="#00ba38" />
          <stop offset="0.85" stopColor="#00d534" />
          <stop offset="0.99" stopColor="#00e431" />
        </linearGradient>
      </defs>
      <path
        fill="url(#nc-f)"
        d="M91.599 52.962a15.346 15.346 0 0 0-3.969 21.333l5.89-4.04a8.202 8.202 0 1 1 11.403 2.116L84.633 86.29l4.04 5.89 20.29-13.918a15.346 15.346 0 1 0-17.356-25.31Z"
      />
      <path
        fill="#fff"
        d="M63.765 42.069c-19.289 0-34.925 6.927-34.925 14.816V73.29a34.925 34.925 0 0 0 69.85 0V56.885c0-7.89-15.637-14.816-34.925-14.816z"
      />
      <ellipse cx="63.764576" cy="56.356255" fill="#ccc" rx="29.104166" ry="10.318749" />
      <path
        fill="url(#nc-g)"
        d="M63.765 66.675c13.258 0 24.442-3.143 27.955-7.443-1.145-5.31-13.223-9.49-27.955-9.49-14.732 0-26.81 4.18-27.956 9.49 3.513 4.3 14.697 7.443 27.956 7.443z"
      />
      <path
        fill="url(#nc-h)"
        d="M66.146 51.33c9.694 0 18.243 1.809 23.283 4.56-4.358-3.622-14.208-6.148-25.664-6.148-14.732 0-26.81 4.18-27.956 9.49a10.268 10.268 0 0 0 2.315 2.006c.585-5.509 12.906-9.909 28.022-9.909z"
      />
      <path
        fill="url(#nc-i)"
        d="M51.33 58.208s7.937 3.97 18.52 3.97c10.583 0 18.52-3.97 18.52-3.97v-3.1c-4.762-3.2-13.996-5.366-24.605-5.366A70.009 70.009 0 0 0 51.329 50.8z"
      />
      <path
        fill="#26f749"
        d="M80.433 21.167A29.104 29.104 0 0 0 51.33 50.27v7.937h7.938A29.104 29.104 0 0 0 88.37 29.104v-7.937z"
      />
      <path fill="url(#nc-j)" d="M59.267 58.208A29.104 29.104 0 0 0 88.37 29.104v-7.937L51.329 58.208z" />
    </svg>
  );
}

// 페이지 스크롤 순서(히어로 → 세미나 → Step 1~6 → 샘플)와 동일하게 유지한다.
const NAV_ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/seminar", label: "단체 세미나" },
  { href: "#section-question", label: "25유형 출제" },
  { href: "#section-annotation", label: "학습지 생성" },
  { href: "#section-exam", label: "시험지" },
  { href: "#section-intake", label: "자료 추출" },
  { href: "#section-report", label: "시험 리포트" },
  { href: "#section-webtoon", label: "지문 웹툰" },
  { href: "#section-folder", label: "아카이브" },
  { href: "#section-samples", label: "샘플" },
];

export function LandingHeader({
  offsetTop = false,
  showNav = true,
}: {
  offsetTop?: boolean;
  /** 가운데 섹션 내비(단체 세미나~샘플) 노출 여부 — 법적/상품 페이지에선 숨긴다. */
  showNav?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        // 모바일: 상단 배너 바로 아래(배너 없으면 최상단)에 흰 헤더가 그대로 붙게
        // 항상 불투명(뒤 섹션이 비쳐 떨어져 보이던 문제 제거). PC(lg↑)는 기존 반투명 유지.
        className={`fixed left-0 right-0 z-50 transition-all duration-300 ${
          offsetTop ? "top-11" : "top-0"
        } bg-white shadow-[0_1px_0_rgba(15,23,42,0.08)] ${
          scrolled
            ? "lg:bg-white/72 lg:backdrop-blur-2xl lg:shadow-[0_1px_0_rgba(15,23,42,0.06)]"
            : "lg:bg-transparent lg:shadow-none lg:backdrop-blur-none"
        }`}
      >
        <div
          className={`mx-auto flex max-w-[1240px] items-center justify-between gap-4 transition-[padding,height] duration-300 ${
            scrolled ? "h-16 px-4 sm:px-6" : "h-20 px-4 sm:px-6 lg:px-8"
          }`}
        >
          <Link href="/" className="group flex items-center gap-2.5">
            {/* shrink-0 + rounded-full — 플렉스 압축으로 찌그러지지 않는 완전한 원 */}
            <BrandIcon className="shrink-0 rounded-full group-hover:bg-blue-600" />
            <span
              className={`text-[18px] font-black tracking-normal transition-colors group-hover:text-blue-600 ${
                scrolled ? "text-slate-950" : "text-slate-950 lg:text-white"
              }`}
            >
              SMOAT
            </span>
          </Link>

          {showNav ? (
          <nav className="hidden items-center gap-0.5 rounded-full border border-white/80 bg-white/68 p-1 text-[12px] font-black text-slate-700 shadow-[0_18px_52px_-38px_rgba(15,23,42,0.7)] backdrop-blur-2xl lg:flex">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-full px-3 py-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                {item.label}
              </a>
            ))}
          </nav>
          ) : null}

          <div className="flex items-center gap-2">
            <a
              href="https://cafe.naver.com/smoat"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="네이버 카페 (새 창에서 열림)"
              className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-3 text-[13px] font-black transition sm:px-4 ${
                scrolled
                  ? "text-slate-700 hover:border-slate-200 hover:bg-white/80 hover:text-slate-950"
                  : "text-slate-700 hover:border-slate-200 hover:bg-white/80 hover:text-slate-950 lg:text-slate-200 lg:hover:border-white/30 lg:hover:bg-white/10 lg:hover:text-white"
              }`}
            >
              <NaverCafeIcon className="size-[18px]" />
              <span>카페</span>
            </a>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-3 text-[13px] font-black transition sm:px-4 ${
                scrolled
                  ? "text-slate-700 hover:border-slate-200 hover:bg-white/80 hover:text-slate-950"
                  : "text-slate-700 hover:border-slate-200 hover:bg-white/80 hover:text-slate-950 lg:text-slate-200 lg:hover:border-white/30 lg:hover:bg-white/10 lg:hover:text-white"
              }`}
            >
              <LogIn className="size-4" />
              <span>로그인</span>
            </button>
            <Link
              href="/register"
              className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[13px] font-black transition hover:-translate-y-0.5 ${
                scrolled
                  ? "bg-slate-950 text-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.8)] hover:bg-blue-600"
                  : "bg-slate-950 text-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.8)] hover:bg-blue-600 lg:bg-white lg:text-slate-950 lg:shadow-none lg:hover:bg-blue-50"
              }`}
            >
              <span>회원 가입</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </motion.header>

      <LoginModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
