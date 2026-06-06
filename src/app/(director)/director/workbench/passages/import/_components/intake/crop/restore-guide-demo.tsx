"use client";

// ============================================================================
// RestoreGuideDemo — "AI로 원문 복원"이 무엇이고 어떻게 크롭해야 하는지 자동재생
// 애니메이션으로 보여주는 인라인 튜토리얼(예전엔 버튼→모달이었으나, 자료를 넣기 전
// 빈 영역에 바로 노출). 핵심 메시지: 불완전한 지문(빈칸·순서·삽입)도 "지문 + 문제 +
// 선지"를 함께 크롭하면, AI가 문제를 풀어 원문으로 복원한다.
// (요구: 매우 시각적·직관적으로. Sparkles/주황 금지 — blue/slate/emerald만.)
// ============================================================================

import { useEffect, useState } from "react";
import { ArrowRight, Bot, Check, Crop, FileText } from "lucide-react";

interface Step {
  title: string;
  desc: string;
  /** 크롭 박스가 덮는 높이(px, 목업 기준). 0이면 박스 없음. */
  boxHeight: number;
  /** 박스 톤. */
  tone: "none" | "bad" | "good" | "ai" | "done";
  badge: string | null;
}

// 목업 레이아웃 px: 지문 168 + gap8 + 문제 40 + gap8 + 선지 100 = 324 (컨테이너 inner)
const PASSAGE_H = 168;
const FULL_H = 324;

const STEPS: Step[] = [
  {
    title: "불완전한 지문",
    desc: "빈칸 ____·순서 뒤섞임·문장 삽입으로 변형된 지문은, 그대로 두면 원래 글을 알 수 없어요.",
    boxHeight: 0,
    tone: "none",
    badge: null,
  },
  {
    title: "지문만 크롭하면 — 안 돼요",
    desc: "지문만 잘라내면 AI가 정답의 근거가 없어, 빈칸을 채우거나 순서를 되돌리지 못합니다.",
    boxHeight: PASSAGE_H,
    tone: "bad",
    badge: "지문만",
  },
  {
    title: "문제·선지까지 함께 크롭 — 이게 핵심",
    desc: "지문 + 문제 + 선지를 하나의 영역으로 크롭하세요. 그래야 AI가 문제를 풀 수 있습니다.",
    boxHeight: FULL_H,
    tone: "good",
    badge: "지문 + 문제 + 선지",
  },
  {
    title: "AI가 문제를 풀어",
    desc: "AI가 문제와 선지를 읽고 정답을 추론해, 빈칸에 들어갈 말과 원래 순서를 결정합니다.",
    boxHeight: FULL_H,
    tone: "ai",
    badge: "AI 분석 중",
  },
  {
    title: "원문으로 완벽 복원",
    desc: "빈칸이 정답으로 채워지고, 섞인 순서가 원래대로 정렬된 완성된 지문이 됩니다.",
    boxHeight: FULL_H,
    tone: "done",
    badge: "복원 완료",
  },
];

const TONE_BOX: Record<Step["tone"], string> = {
  none: "border-transparent",
  bad: "border-2 border-dashed border-red-400 bg-red-400/5",
  good: "border-2 border-blue-500 bg-blue-500/5",
  ai: "border-2 border-blue-500 bg-blue-500/10",
  done: "border-2 border-emerald-500 bg-emerald-500/5",
};
const TONE_BADGE: Record<Step["tone"], string> = {
  none: "",
  bad: "bg-red-500 text-white",
  good: "bg-blue-600 text-white",
  ai: "bg-blue-600 text-white",
  done: "bg-emerald-600 text-white",
};

export function RestoreGuideDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setStep((s) => (s + 1) % STEPS.length),
      2000,
    );
    return () => window.clearInterval(id);
  }, []);

  const cur = STEPS[step];
  const solved = step >= 3; // AI가 정답 선택 표시
  const filled = step >= 4; // 빈칸 채움/순서 정렬 완료

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* 헤더 — 배너 설명문을 여기에 통합(지문+문제+선지 함께 크롭 → 원문 복원) */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
          <Bot className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-extrabold leading-snug text-slate-950">
            지문 + <span className="text-blue-700">문제 + 선지</span>를 함께
            크롭하면, AI가 풀어서 원문으로 복원해요
          </h3>
          <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">
            빈칸 ____·뒤섞인 순서·삽입 문장 같은 불완전한 지문을 원래 글로
            되살립니다. (지문만 잘라내면 복원되지 않아요 · 지문당 ◈2)
          </p>
        </div>
      </div>

      {/* 본문: 목업 데모 + 단계 설명 */}
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── 목업 시험지 + 크롭 박스 애니메이션 ── */}
        <div className="mx-auto w-full max-w-[300px]">
          <div className="relative h-[340px] rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex h-full flex-col gap-2">
              {/* 지문 */}
              <div
                className="rounded bg-slate-50 p-2 text-[10px] leading-[1.7] text-slate-700"
                style={{ height: PASSAGE_H }}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[8.5px] font-bold text-slate-400">
                    지문
                  </span>
                  <span
                    className={
                      "rounded px-1 py-0.5 text-[8px] font-bold transition-colors " +
                      (filled
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-600")
                    }
                  >
                    {filled ? "순서 (A)(B)(C) 정렬됨" : "순서 (B)(A)(C) 섞임"}
                  </span>
                </div>
                Language learning is a path of{" "}
                <span
                  className={
                    "rounded px-1 font-bold transition-colors " +
                    (filled
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-400 line-through decoration-slate-300")
                  }
                >
                  {filled ? "discovery" : "(X)______"}
                </span>{" "}
                through the landscapes of history and culture, science and
                technology, politics and economics.
              </div>

              {/* 문제 */}
              <div
                className="flex items-center rounded bg-slate-50 px-2 text-[9.5px] font-semibold text-slate-700"
                style={{ height: 40 }}
              >
                <FileText
                  className="mr-1 size-3 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                18. Which word best completes (X)?
              </div>

              {/* 선지 */}
              <div
                className="grid grid-cols-1 content-start gap-0.5 rounded bg-slate-50 p-2 text-[9.5px] text-slate-600"
                style={{ height: 100 }}
              >
                {[
                  { n: "①", t: "failure" },
                  { n: "②", t: "discovery" },
                  { n: "③", t: "league tables" },
                  { n: "④", t: "silence" },
                  { n: "⑤", t: "memory" },
                ].map((c, i) => {
                  const isAnswer = i === 1;
                  return (
                    <div
                      key={c.n}
                      className={
                        "inline-flex items-center gap-1 rounded px-1 transition-colors " +
                        (solved && isAnswer
                          ? "bg-blue-100 font-bold text-blue-700 ring-1 ring-blue-300"
                          : "")
                      }
                    >
                      <span>{c.n}</span>
                      <span>{c.t}</span>
                      {solved && isAnswer ? (
                        <Check
                          className="size-3 text-blue-600"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 크롭 박스 오버레이 */}
            <div
              className={
                "pointer-events-none absolute left-2 right-2 top-2 rounded-md transition-all duration-500 ease-out " +
                TONE_BOX[cur.tone]
              }
              style={{ height: cur.boxHeight, opacity: cur.tone === "none" ? 0 : 1 }}
              aria-hidden="true"
            >
              {cur.badge ? (
                <span
                  className={
                    "absolute -top-2.5 left-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8.5px] font-bold shadow-sm " +
                    TONE_BADGE[cur.tone]
                  }
                >
                  {cur.tone === "ai" ? (
                    <Bot className="size-2.5" aria-hidden="true" />
                  ) : cur.tone === "done" ? (
                    <Check className="size-2.5" aria-hidden="true" />
                  ) : (
                    <Crop className="size-2.5" aria-hidden="true" />
                  )}
                  {cur.badge}
                </span>
              ) : null}
              {/* AI 분석 펄스 */}
              {cur.tone === "ai" ? (
                <div className="absolute inset-0 animate-pulse rounded-md bg-blue-400/15" />
              ) : null}
            </div>
          </div>
        </div>

        {/* ── 단계 설명 ── */}
        <div className="flex min-w-0 flex-col">
          {/* 현재 단계 강조 카드 */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="text-[10px] font-bold text-blue-600">
              STEP {step + 1} / {STEPS.length}
            </div>
            <div className="mt-1 text-[15px] font-bold text-slate-900">
              {cur.title}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
              {cur.desc}
            </p>
          </div>

          {/* 전체 흐름 미니맵 */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {[
              { icon: Crop, label: "함께 크롭" },
              { icon: Bot, label: "문제 풀이" },
              { icon: FileText, label: "원문 복원" },
            ].map((s, idx) => (
              <div key={s.label} className="flex items-center gap-1.5">
                {idx > 0 ? (
                  <ArrowRight
                    className="size-3.5 text-slate-300"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10.5px] font-bold text-slate-600">
                  <s.icon className="size-3.5 text-blue-600" aria-hidden="true" />
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* 단계 목록 */}
          <ol className="mt-3 space-y-1.5">
            {STEPS.map((s, i) => {
              const active = i === step;
              const passed = i < step;
              return (
                <li
                  key={s.title}
                  className={
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors " +
                    (active
                      ? "bg-blue-600 font-bold text-white"
                      : passed
                        ? "text-slate-400"
                        : "text-slate-500")
                  }
                >
                  <span
                    className={
                      "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold " +
                      (active
                        ? "bg-white text-blue-700"
                        : passed
                          ? "bg-slate-200 text-slate-500"
                          : "bg-slate-100 text-slate-400")
                    }
                  >
                    {passed ? "✓" : i + 1}
                  </span>
                  <span className="truncate">{s.title}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* 핵심 메시지 */}
      <div className="flex shrink-0 items-center gap-2.5 border-t border-blue-100 bg-blue-50/60 px-5 py-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
          <Crop className="size-4" aria-hidden="true" />
        </span>
        <p className="text-[12px] leading-relaxed text-slate-700">
          <b className="font-bold text-blue-700">반드시 문제와 선지를 함께 크롭</b>
          하세요. AI가 문제를 풀어 빈칸·순서를{" "}
          <b className="font-bold text-blue-700">원래 지문으로 복원</b>합니다. (지문당
          ◈2)
        </p>
      </div>
    </div>
  );
}
