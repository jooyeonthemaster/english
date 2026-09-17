"use client";

// ============================================================================
// 지문 등록 데모 (U2) — 직접 입력(paste) · 기출 가져오기(exam) 2모드
//
// ch2-paste([S] 텍스트)·ch2-exam([S] 기출) 스텝이 쓰는 순수 목업이다.
// 실 화면 자구 미러 원장(드리프트 방지 — 아래 자구는 실 모듈이 정본):
// - CTA 「다음으로 (지문관리)」: library-pane.tsx(:2214·2231·2238)
//   pasteStartLabel·pickLabel 계약.
// - CTA 접미 「 · 지문 N개」: generate-upload-panel.tsx(:724) 자구 계약.
// - 힌트 「고른 지문이 지문관리에 담깁니다」: library-pane.tsx(:2239) headerHint.
// - 타이핑 캐럿: globals.css .line-gap-caret 재사용(queue-stream-line.tsx 관용구).
// 서버 액션 0 · 스토어 쓰기 0 — 로컬 useState 만. 이모지 금지(§10).
// prefers-reduced-motion 은 타이핑 없이 즉시 완료 상태로 렌더한다.
// ============================================================================

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  Info,
  Plus,
} from "lucide-react";
import { DemoBadge, DemoFrame } from "./demo-stage";
import {
  DEMO_EXAM_ROWS,
  DEMO_PASSAGE_SENTENCES,
  DEMO_PASSAGE_TITLE,
} from "./demo-data";

export function DemoRegister({ mode }: { mode: "paste" | "exam" }) {
  return (
    <div data-demo-register={mode}>
      {mode === "paste" ? <PasteDemo /> : <ExamDemo />}
    </div>
  );
}

/** 하단 CTA 목업 — 클릭 무동작·시각만. 자구는 파일 상단 미러 원장 참조. */
function NextCta({ count }: { count: number }) {
  const live = count > 0;
  return (
    <div
      className={`flex h-9 select-none items-center justify-center gap-1.5 rounded-lg text-[12px] font-bold transition-colors ${
        live ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-400"
      }`}
    >
      <span>
        다음으로 (지문관리)
        {live ? ` · 지문 ${count}개` : ""}
      </span>
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </div>
  );
}

// ── 직접 입력 모드 ──────────────────────────────────────────────────────────

function PasteDemo() {
  const total = DEMO_PASSAGE_SENTENCES.length;
  // reduced-motion 은 첫 렌더부터 전량 완료 상태(타이핑 생략).
  const [shown, setShown] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? total
      : 0,
  );
  const done = shown >= total;

  useEffect(() => {
    if (shown >= total) return;
    const t = window.setTimeout(() => setShown((v) => v + 1), 350);
    return () => window.clearTimeout(t);
  }, [shown, total]);

  return (
    <DemoFrame caption="예시 화면 — 본문을 붙여넣으면 이렇게 등록됩니다">
      <div className="space-y-2">
        {/* 붙여넣기 보드 목업 */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex h-8 items-center gap-1.5 border-b border-slate-100 px-3">
            <ClipboardPaste className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="text-[11px] font-semibold text-slate-500">본문 붙여넣기</span>
            {done ? (
              <span className="ml-auto inline-flex h-5 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[10.5px] font-bold text-emerald-600">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                지문 1개 인식됨
              </span>
            ) : (
              <span className="ml-auto text-[10.5px] font-medium text-slate-400">
                붙여넣는 중…
              </span>
            )}
          </div>
          <div className="min-h-[8.5rem] px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-700">
            {shown === 0 ? (
              <span className="text-slate-300">복사해 둔 본문이 이 자리에 붙습니다</span>
            ) : (
              DEMO_PASSAGE_SENTENCES.slice(0, shown).join(" ")
            )}
            {!done ? (
              <span className="line-gap-caret ml-px text-blue-500" aria-hidden="true">
                ▍
              </span>
            ) : null}
          </div>
        </div>

        {/* 제목 자동 인식 줄 — 전량 입력 완료 후 표시 */}
        {done ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="shrink-0 text-[11px] font-medium text-slate-400">
              제목 자동 인식
            </span>
            <span className="min-w-0 truncate text-[11.5px] font-bold text-slate-700">
              {DEMO_PASSAGE_TITLE}
            </span>
          </div>
        ) : null}

        <NextCta count={done ? 1 : 0} />
        {/* 보조 문장 삭제(적대검수): 스텝 본문(ch2-paste)과 축자 중복이었다. */}
      </div>
    </DemoFrame>
  );
}

// ── 기출 가져오기 모드 ──────────────────────────────────────────────────────

function ExamDemo() {
  const [picked, setPicked] = useState<readonly number[]>([]);
  const count = picked.reduce((sum, i) => sum + DEMO_EXAM_ROWS[i].passages, 0);

  const toggle = (i: number) =>
    setPicked((prev) =>
      prev.includes(i) ? prev.filter((v) => v !== i) : [...prev, i],
    );

  return (
    <DemoFrame caption="예시 화면 — 기출 시험지에서 지문을 골라 담습니다">
      <div className="space-y-2">
        {/* 상단 힌트 스트립 */}
        <div className="flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold text-blue-700">
            고른 지문이 지문관리에 담깁니다
          </span>
        </div>

        {/* 기출 시험지 행 */}
        {DEMO_EXAM_ROWS.map((row, i) => {
          const on = picked.includes(i);
          return (
            <div
              key={row.title}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                on ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
              }`}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-slate-800">{row.title}</p>
                <p className="truncate text-[10.5px] text-slate-400">{row.meta}</p>
              </div>
              <DemoBadge tone="slate">지문 {row.passages}개</DemoBadge>
              <button
                type="button"
                data-demo-exam-pick
                aria-pressed={on}
                className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition-colors ${
                  on
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                    : "border-blue-200 bg-white text-blue-600 hover:bg-blue-50"
                }`}
                onClick={() => toggle(i)}
              >
                {on ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Plus className="h-3 w-3" aria-hidden="true" />
                )}
                {on ? "담김" : "담기"}
              </button>
            </div>
          );
        })}

        {/* 하단 카운터 바 + CTA 목업 */}
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="px-1 text-[11.5px] font-semibold text-slate-600">
            담은 지문{" "}
            <span className="tabular-nums font-bold text-blue-700">{count}</span>개
          </p>
          <NextCta count={count} />
        </div>
      </div>
    </DemoFrame>
  );
}
