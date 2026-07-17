"use client";

// 판별 도구함 — 상단은 스크롤 없이 5개가 한눈에 들어오는 치트 시트,
// 하단은 단일 개방 아코디언(언제 쓰는가 · 절차 3단계 · 훈련 유닛 · CTA).

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  Target,
} from "lucide-react";

export interface LensUnitView {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  basic: boolean;
  unlocked: boolean;
  hubHref: string | null;
  trainHref: string | null;
}

export interface LensView {
  id: string;
  name: string;
  oneLiner: string;
  when: string;
  steps: string[];
  units: LensUnitView[];
  cta: { href: string; label: string; sub: string; why: string };
}

export function ToolsClient({ lenses }: { lenses: LensView[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const reveal = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
    requestAnimationFrame(() => {
      const el = cardRefs.current[id];
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  }, []);

  const openFrom = useCallback(
    (id: string) => {
      setOpenId(id);
      requestAnimationFrame(() => {
        const el = cardRefs.current[id];
        if (!el) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        el.querySelector<HTMLButtonElement>("button[data-lens-head]")?.focus();
      });
    },
    [],
  );

  return (
    <div className="gd-page mx-auto min-h-dvh px-5 pb-14">
      <header className="flex items-center gap-1 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.push("/g/track/grammar")}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--gd-ink-2)" }}
          aria-label="어법 트랙으로"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <p className="gd-label">어법 트랙 · 판별 도구</p>
      </header>

      <h1 className="gd-t-xl mt-2 font-bold tracking-tight">판별 5도구</h1>
      <p className="gd-prose-2 mt-1">
        어법 문제는 문법 이름을 외워서 푸는 것이 아니라, 이 다섯 개의 판단 절차 중 하나를
        꺼내 쓰는 일입니다. 밑줄을 보면 어떤 도구를 꺼낼지부터 정합니다.
      </p>

      {/* ── 치트 시트: 스크롤 없이 5개가 한눈에 ── */}
      <section className="mt-5" aria-labelledby="gd-tools-sheet">
        <p id="gd-tools-sheet" className="gd-label mb-2">
          한눈에 보기
        </p>
        <div className="gd-card overflow-hidden">
          {lenses.map((lens, i) => (
            <button
              key={lens.id}
              type="button"
              onClick={() => openFrom(lens.id)}
              className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${
                i > 0 ? "gd-hairline-t" : ""
              }`}
              style={{ minHeight: "3rem" }}
            >
              <span
                className="gd-mono gd-t-2xs flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-bold"
                style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
              >
                {lens.id}
              </span>
              <span className="min-w-0 flex-1">
                <span className="gd-t-base block font-semibold">{lens.name}</span>
                <span
                  className="gd-t-xs mt-0.5 block leading-snug"
                  style={{ color: "var(--gd-ink-3)" }}
                >
                  {lens.oneLiner}
                </span>
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0"
                strokeWidth={1.75}
                style={{ color: "var(--gd-ink-3)" }}
              />
            </button>
          ))}
        </div>
        <p className="gd-t-xs mt-2" style={{ color: "var(--gd-ink-3)" }}>
          문제를 풀다 막히면 이 다섯 줄만 다시 읽습니다. 자세한 절차는 아래에서 펼칩니다.
        </p>
      </section>

      {/* ── 도구 상세(단일 개방 아코디언) ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">도구 상세</p>
        <div className="flex flex-col gap-2">
          {lenses.map((lens) => (
            <LensCard
              key={lens.id}
              lens={lens}
              open={openId === lens.id}
              onToggle={() => reveal(lens.id)}
              cardRef={(el) => {
                cardRefs.current[lens.id] = el;
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ── 렌즈 카드 ───────────────────────────────────────────────────────────────

function LensCard({
  lens,
  open,
  onToggle,
  cardRef,
}: {
  lens: LensView;
  open: boolean;
  onToggle: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const panelId = `gd-lens-panel-${lens.id}`;
  const headId = `gd-lens-head-${lens.id}`;

  return (
    <div ref={cardRef} className="gd-card overflow-hidden scroll-mt-4">
      <button
        type="button"
        id={headId}
        data-lens-head
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
        style={{ minHeight: "3.25rem" }}
      >
        <span
          className="gd-mono gd-t-2xs flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold"
          style={
            open
              ? { background: "var(--gd-blue)", color: "#fff" }
              : { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
          }
        >
          {lens.id}
        </span>
        <span className="min-w-0 flex-1">
          <span className="gd-t-md block font-semibold">{lens.name}</span>
          <span
            className="gd-t-xs mt-0.5 block leading-snug"
            style={{ color: "var(--gd-ink-3)" }}
          >
            {lens.oneLiner}
          </span>
        </span>
        <ChevronDown
          className="gd-chev h-4 w-4 shrink-0"
          strokeWidth={1.75}
          style={{
            color: "var(--gd-ink-3)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div id={panelId} role="region" aria-labelledby={headId} className="px-3.5 pb-3.5">
          {/* 언제 쓰는가 */}
          <div className="gd-block" data-tone="accent">
            <span className="gd-block-head" data-tone="accent">
              <Target className="h-3.5 w-3.5" strokeWidth={1.75} />
              언제 씁니까
            </span>
            <p className="gd-prose mt-2">{lens.when}</p>
          </div>

          {/* 절차 */}
          <div className="mt-3">
            <p className="gd-label mb-1">절차</p>
            <ol className="flex flex-col">
              {lens.steps.map((s, i) => (
                <li key={i} className="gd-step">
                  <span className="gd-step-n gd-mono">{i + 1}</span>
                  <span className="gd-prose flex-1">{s}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* 훈련 유닛 */}
          <div className="mt-3">
            <p className="gd-label mb-1.5">이 도구를 훈련하는 유닛</p>
            <div className="flex flex-col gap-1.5">
              {lens.units.map((u) => (
                <UnitRow key={u.id} unit={u} />
              ))}
            </div>
          </div>

          {/* CTA — 항상 다음 행동이 있다 */}
          <Link href={lens.cta.href} className="gd-btn gd-btn-primary mt-4 w-full">
            {lens.cta.label}
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
          <p className="gd-t-xs mt-1.5 text-center" style={{ color: "var(--gd-ink-3)" }}>
            {lens.cta.sub} — {lens.cta.why}
          </p>
        </div>
      )}
    </div>
  );
}

// ── 유닛 행 ─────────────────────────────────────────────────────────────────

function UnitRow({ unit }: { unit: LensUnitView }) {
  const inner = (
    <div
      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2"
      style={{
        background: "var(--gd-paper)",
        border: "1px solid var(--gd-line)",
        minHeight: "2.75rem",
        opacity: unit.unlocked ? 1 : 0.62,
      }}
    >
      <span
        className="gd-mono gd-t-3xs flex h-6 shrink-0 items-center justify-center rounded-md px-1.5 font-bold"
        style={
          unit.basic
            ? { background: "var(--gd-card)", color: "var(--gd-ink-2)", border: "1px solid var(--gd-line-strong)" }
            : { background: "var(--gd-card)", color: "var(--gd-blue)", border: "1px solid var(--gd-blue-line)" }
        }
      >
        {unit.label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="gd-t-sm block truncate font-semibold">{unit.title}</span>
        <span
          className="gd-t-2xs block truncate"
          style={{ color: "var(--gd-ink-3)" }}
        >
          {unit.unlocked ? unit.subtitle : "앞 유닛의 드릴을 마치면 열립니다"}
        </span>
      </span>
      {unit.unlocked ? (
        <ChevronRight
          className="h-4 w-4 shrink-0"
          strokeWidth={1.75}
          style={{ color: "var(--gd-ink-3)" }}
        />
      ) : (
        <Lock
          className="h-3.5 w-3.5 shrink-0"
          strokeWidth={1.75}
          style={{ color: "var(--gd-ink-3)" }}
          aria-label="잠김"
        />
      )}
    </div>
  );

  return unit.unlocked && unit.hubHref ? (
    <Link href={unit.hubHref}>{inner}</Link>
  ) : (
    inner
  );
}
