"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LogIn } from "lucide-react";
import { LoginModal } from "./login-modal";
import { BrandIcon } from "@/components/brand/brand-mark";

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
            <span className="text-[18px] font-black tracking-normal text-slate-950 transition-colors group-hover:text-blue-600">
              SMOAT
            </span>
          </Link>

          {showNav ? (
          <nav className="hidden items-center gap-0.5 rounded-full border border-white/80 bg-white/68 p-1 text-[12px] font-black text-slate-300 shadow-[0_18px_52px_-38px_rgba(15,23,42,0.7)] backdrop-blur-2xl lg:flex">
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
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-3 text-[13px] font-black text-slate-700 transition hover:border-slate-200 hover:bg-white/80 hover:text-slate-950 sm:px-4"
            >
              <LogIn className="size-4" />
              <span>로그인</span>
            </button>
            <Link
              href="/register"
              className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-slate-950 px-4 text-[13px] font-black text-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-blue-600"
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
