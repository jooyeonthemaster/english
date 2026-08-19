"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ClipboardPaste, FileDown, Sparkles } from "lucide-react";

/**
 * 학교 페이지 전용 레일 3종(클라이언트).
 *
 * 설계 의도 — 「가운데 한 줄」 레이아웃을 버리고 화면 폭을 세 갈래로 쓴다:
 *   좌: 섹션 목차(스크롤 추종)  ·  중앙: 본문  ·  우: 상시 전환 레일
 * 어느 스크롤 위치에서도 전환 동선이 시야 안에 있게 하는 것이 목적이다.
 *
 * 성능: 스크롤 핸들러는 전부 rAF 병합 + passive. 상태는 실제 변화 시에만 set 한다.
 */

/* ────────────────────────── 좌측 섹션 목차 ────────────────────────── */

export function SchoolToc({
  items,
}: {
  items: ReadonlyArray<{ id: string; label: string; full?: string }>;
}) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    let raf = 0;
    function pick() {
      raf = 0;
      const pivot = window.innerHeight * 0.3;
      let cur: string | null = items[0]?.id ?? null;
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= pivot) cur = it.id;
      }
      setActive((prev) => (prev === cur ? prev : cur));
    }
    function onScroll() {
      if (!raf) raf = window.requestAnimationFrame(pick);
    }
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="목차" className="sticky top-28">
      <p className="mb-3 text-[10.5px] font-black uppercase tracking-[0.18em] text-slate-400">목차</p>
      <ul className="flex flex-col gap-0.5 border-l border-slate-200">
        {items.map((it) => {
          const on = active === it.id;
          return (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                title={it.full ?? it.label}
                className={`-ml-px block truncate border-l-2 py-1.5 pl-3 text-[12.5px] leading-[1.6] transition ${
                  on
                    ? "border-blue-600 font-black text-blue-700"
                    : "border-transparent font-semibold text-slate-400 hover:text-slate-700"
                }`}
              >
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ────────────────────────── 우측 전환 레일 ────────────────────────── */

/**
 * 이 학교 데이터를 그대로 되읊어 주는 전환 카드.
 * 일반적인 「무료 체험」 버튼이 아니라, 그 학교의 실제 배점·교재를 근거로
 * 「그래서 당신에게 필요한 것」을 말한다.
 */
export function SchoolConversionRail({
  schoolShort,
  hook,
  publisher,
  textbookHref,
  nextExam,
}: {
  schoolShort: string;
  /**
   * 그 학교 데이터에서 뽑은 후킹. 문장 하나로 흘리지 않고 수치와 카피를 분리한다
   * — 좁은 레일에서 두 줄 이상으로 꺾이면 읽히지 않는다.
   */
  hook: { statLabel: string; stat: string; line: string } | null;
  publisher: string | null;
  textbookHref: string | null;
  /**
   * 가장 가까운 시험 일정.
   * label/detail 로 쪼개 넣는다 — 원문 한 문장을 그대로 흘리면 좁은 레일에서 두 줄로 꺾인다.
   */
  nextExam: { when: string; what: string; label: string; detail: string | null } | null;
}) {
  const STEPS = [
    { icon: ClipboardPaste, label: "교과서·부교재 지문 붙여넣기" },
    { icon: Sparkles, label: "빈칸·어법·순서·서술형 자동 생성" },
    { icon: FileDown, label: "Word·한글·PDF 즉시 출력" },
  ];

  return (
    <aside className="sticky top-28 flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-slate-900/10 bg-slate-950 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.9)]">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-blue-400">
            {schoolShort} 맞춤
          </p>
          <p className="mt-1.5 truncate text-[16.5px] font-black leading-none text-white">
            맞춤 문항 만들기
          </p>
        </div>

        {hook ? (
          <div className="border-b border-white/10 bg-blue-600/15 px-5 py-4">
            {hook.stat ? (
              <p className="flex items-baseline gap-1.5">
                <span className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-blue-300">
                  {hook.statLabel}
                </span>
                <span className="font-mono text-[20px] font-black tabular-nums leading-none text-white">
                  {hook.stat}
                </span>
              </p>
            ) : null}
            <p className="mt-1.5 break-keep text-[12.5px] font-bold leading-[1.6] text-blue-100">
              {hook.line}
            </p>
          </div>
        ) : null}

        <ol className="flex flex-col gap-3 px-5 py-4">
          {STEPS.map((s, i) => (
            <li key={s.label} className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <s.icon className="size-3.5 text-blue-400" aria-hidden />
              </span>
              <span className="break-keep text-[12.5px] font-semibold leading-relaxed text-slate-300">
                <span className="mr-1 font-mono text-[10.5px] font-black text-slate-500">0{i + 1}</span>
                {s.label}
              </span>
            </li>
          ))}
        </ol>

        <div className="px-5 pb-5">
          <Link
            href="/register"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[13.5px] font-black text-slate-950 transition hover:bg-blue-50"
          >
            무료로 시작하기
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <p className="mt-2.5 text-center text-[11px] font-semibold text-slate-500">
            카드 등록 없이 바로 사용
          </p>
        </div>
      </div>

      {nextExam ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-400">다음 시험</p>
          <p className="mt-1.5 truncate font-mono text-[17px] font-black tabular-nums text-slate-900">
            {nextExam.when}
          </p>
          {/* 한 줄에 안 들어가는 긴 설명은 접지 않고 잘라낸다 — 레일에서 문장이 두 줄로 꺾이면 지저분하다. */}
          <p className="mt-0.5 truncate text-[12.5px] font-bold text-slate-700" title={nextExam.what}>
            {nextExam.label}
          </p>
          {nextExam.detail ? (
            <p className="mt-0.5 truncate text-[12px] font-semibold text-slate-500" title={nextExam.what}>
              {nextExam.detail}
            </p>
          ) : null}
        </div>
      ) : null}

      {publisher && textbookHref ? (
        <Link
          href={textbookHref}
          className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-300"
        >
          <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-400">채택 교과서</p>
          <p className="mt-1.5 text-[15px] font-black text-slate-900">{publisher}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-bold text-blue-700">
            변형문제 제작 가이드
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
          </p>
        </Link>
      ) : null}
    </aside>
  );
}

/* ────────────────────────── 하단 고정 전환 바 ────────────────────────── */

export function SchoolStickyBar({ schoolShort }: { schoolShort: string }) {
  const [show, setShow] = useState(false);
  const [progress, setProgress] = useState(0);
  const [finalVisible, setFinalVisible] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    function measure() {
      raf.current = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
      setProgress((prev) => (Math.abs(prev - p) < 0.5 ? prev : p));
      const past = window.scrollY > 460;
      setShow((prev) => (prev === past ? prev : past));
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
    const el = document.getElementById("school-final-cta");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFinalVisible(e.isIntersecting), {
      rootMargin: "0px 0px -10% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const visible = show && !finalVisible;

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="h-0.5 w-full bg-slate-200">
        <div className="h-full bg-blue-600 transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>
      <div className="border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1560px] items-center gap-4 px-5 py-3 sm:px-8">
          <p className="hidden min-w-0 flex-1 truncate break-keep text-[13.5px] font-bold text-slate-700 sm:block">
            <Check className="mr-1.5 inline size-4 text-blue-600" aria-hidden />
            {schoolShort} 시험 범위 지문만 넣으면 변형문제·서술형까지 한 번에
          </p>
          <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-700 sm:hidden">
            {schoolShort} 대비 자료 만들기
          </p>
          <Link
            href="/register"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-2.5 text-[13px] font-black text-white transition hover:bg-slate-800"
          >
            무료로 시작
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
