"use client";

// 랜딩 Step3(문제생성) 모바일 시트 데모 — PC 는 씬이 유형 선택을 소유하지만,
// 모바일은 시트가 자체적으로 ①지문 → ②유형 → ③문제 스텝을 진행한다. 문제 렌더는
// PC 와 같은 워크벤치 실렌더러(StructuredQuestionRenderer). AI 호출·서버 액션 없음.
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Cpu, Loader2 } from "lucide-react";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import {
  MobileStepHeader,
  type MobileFlowStep,
} from "@/components/workbench/mobile-step-flow";
import { DemoShell } from "../demo-shell";
import { DEMO_PASSAGE } from "../fixtures/passage";
import { DEMO_QUESTIONS, type DemoQuestionTypeId } from "../fixtures/questions";
import { TypeChipSelector } from "./type-chip-selector";

const STEPS: MobileFlowStep[] = [
  { key: "passage", label: "지문" },
  { key: "types", label: "유형" },
  { key: "result", label: "문제" },
];
const GENERATE_DELAY_MS = 550;

export default function Step3GenerateMobileDemo() {
  const [stepKey, setStepKey] = useState("passage");
  const [selected, setSelected] = useState<DemoQuestionTypeId | null>(null);
  const [generating, setGenerating] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 유형을 고르면 짧은 생성 연출 후 문제 스텝으로.
  const pick = (id: DemoQuestionTypeId) => {
    setSelected(id);
    setGenerating(true);
    setStepKey("result");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => setGenerating(false),
      GENERATE_DELAY_MS,
    );
  };

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const selectedLabel = selected ? QUESTION_TYPE_UI[selected]?.label : null;

  const reset = () => {
    setSelected(null);
    setGenerating(false);
    setStepKey("passage");
  };

  return (
    <DemoShell
      label="지문 → 유형 → 문제 순서로 넘겨보세요"
      onReset={reset}
    >
      <div className="flex h-full min-h-0 flex-col bg-slate-50/60">
        {/* 스텝 헤더(탭해서 이동) */}
        <div className="shrink-0 px-3 pt-3">
          <MobileStepHeader
            steps={STEPS}
            currentKey={stepKey}
            onSelect={(k) => {
              // 문제 스텝은 유형을 골랐을 때만 진입 가능.
              if (k === "result" && !selected) {
                setStepKey("types");
                return;
              }
              setStepKey(k);
            }}
          />
        </div>

        {/* 스텝 본문 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {stepKey === "passage" ? (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <BookOpen className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">
                  원문 지문
                </span>
                <span className="truncate text-[11.5px] font-bold text-slate-500">
                  {DEMO_PASSAGE.title}
                </span>
              </div>
              <p className="font-serif text-[15px] leading-[1.9] text-slate-700">
                {DEMO_PASSAGE.text}
              </p>
            </div>
          ) : stepKey === "types" ? (
            <div>
              <p className="mb-3 text-[13.5px] font-bold text-slate-700">
                이 지문으로 만들 <span className="text-blue-600">문제 유형</span>을 골라보세요
              </p>
              <TypeChipSelector
                selected={selected}
                onSelect={pick}
                showHeader={false}
              />
            </div>
          ) : generating ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[13px] font-bold text-blue-600">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {selectedLabel} 문제 생성 중…
              </div>
              <div className="h-[240px] animate-pulse rounded-xl border border-slate-200 bg-white" />
            </div>
          ) : selected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[12px] font-black text-blue-600">
                <Cpu className="size-3.5" aria-hidden="true" />
                {selectedLabel} — 이 지문으로 생성된 예시 문제
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <StructuredQuestionRenderer
                  question={DEMO_QUESTIONS[selected]}
                  index={0}
                  hideHeader
                  sourcePassageContent={DEMO_PASSAGE.text}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* 하단 고정 이동 바 — 항상 파란 '다음으로' 계열 CTA가 오른쪽에 온다. */}
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
          {stepKey === "passage" ? (
            <button
              type="button"
              onClick={() => setStepKey("types")}
              className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 text-[13.5px] font-bold text-white transition active:scale-[0.99]"
            >
              다음으로
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </button>
          ) : stepKey === "types" ? (
            <>
              <button
                type="button"
                onClick={() => setStepKey("passage")}
                className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                이전
              </button>
              <button
                type="button"
                aria-disabled={!selected}
                onClick={() => {
                  if (selected) setStepKey("result");
                }}
                className={
                  "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-4 text-[13.5px] font-bold transition " +
                  (selected
                    ? "cursor-pointer bg-blue-600 text-white active:scale-[0.99]"
                    : "cursor-not-allowed bg-slate-200 text-slate-400")
                }
              >
                {selected ? "다음으로" : "유형을 골라주세요"}
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStepKey("passage")}
                className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                지문
              </button>
              <button
                type="button"
                onClick={() => setStepKey("types")}
                className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 text-[13.5px] font-bold text-white transition active:scale-[0.99]"
              >
                다른 유형으로 또 만들기
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </DemoShell>
  );
}
