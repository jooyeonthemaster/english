"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * 하단 고정 전환 바 — 히어로를 지나면 등장하고, 페이지 말미 CTA 밴드(#article-final-cta)가
 * 보이면 숨겨 이중 노출을 피한다. 상단에 읽기 진행률 바를 얹는다.
 */
export function ArticleStickyCta({ title }: { title: string }) {
  const [pastHero, setPastHero] = useState(false);
  const [finalCtaVisible, setFinalCtaVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    function measure() {
      raf.current = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
      setPastHero(window.scrollY > 420);
    }
    function onScroll() {
      if (!raf.current) raf.current = window.requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf.current) window.cancelAnimationFrame(raf.current);
    };
  }, []);

  useEffect(() => {
    const target = document.getElementById("article-final-cta");
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFinalCtaVisible(entry.isIntersecting),
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const show = pastHero && !finalCtaVisible;

  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="border-t border-slate-200 bg-white/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div aria-hidden className="h-[2.5px] w-full bg-slate-100">
          <div
            className="h-full bg-blue-600 transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-extrabold text-slate-950 sm:text-[13.5px]">
              <span className="hidden sm:inline">{title}</span>
              <span className="sm:hidden">스모트 AI로 바로 출제</span>
            </p>
            <p className="hidden truncate text-[12px] font-medium text-slate-500 sm:block">
              지문만 붙여넣으면 이 유형 문제가 1분 안에 나옵니다
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/features/ai-question-generation"
              className="hidden h-10 items-center whitespace-nowrap rounded-full border border-slate-300 px-4 text-[13px] font-extrabold text-slate-800 transition hover:border-blue-400 hover:text-blue-700 md:inline-flex"
            >
              AI 문제 생성 살펴보기
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950 px-4 text-[13px] font-extrabold text-white transition hover:bg-blue-600 sm:px-5"
            >
              무료로 시작하기
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
