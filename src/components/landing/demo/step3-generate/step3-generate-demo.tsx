"use client";

// 랜딩 Step3 데모 — 유형 선택은 씬(왼쪽 카피 컬럼)의 TypeChipSelector 가 담당하는
// 컨트롤드 컴포넌트. 여기서는 좌 원문 지문 | 우 생성된 예시 문제만 렌더한다.
// 문제 렌더는 워크벤치의 실제 렌더러(StructuredQuestionRenderer). AI 호출·서버 액션 없음.
import { useEffect, useRef, useState } from "react";
import { BookOpen, Cpu, Loader2, MousePointerClick } from "lucide-react";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import { DemoShell } from "../demo-shell";
import { DEMO_PASSAGE } from "../fixtures/passage";
import { DEMO_QUESTIONS, type DemoQuestionTypeId } from "../fixtures/questions";

const GENERATE_DELAY_MS = 550;

export default function Step3GenerateDemo({
  selected,
  onReset,
}: {
  /** 씬(왼쪽 유형 칩)에서 고른 유형 — 바뀌면 생성 연출 후 예시 문제를 보여준다. */
  selected: DemoQuestionTypeId | null;
  onReset?: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 선택이 바뀔 때마다 짧은 생성 연출.
  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (selected === null) {
      setGenerating(false);
      return;
    }
    setGenerating(true);
    timerRef.current = window.setTimeout(
      () => setGenerating(false),
      GENERATE_DELAY_MS,
    );
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [selected]);

  const selectedLabel = selected ? QUESTION_TYPE_UI[selected]?.label : null;

  return (
    <DemoShell
      label="왼쪽에서 유형을 고르면 문제가 생성됩니다"
      onReset={onReset}
    >
      {/* @container 는 래퍼에, 쿼리 클래스는 자식 그리드에 — 컨테이너 쿼리는
          자기 자신에게 적용되지 않으므로 반드시 분리해야 좌우 분할이 동작한다.
          패널 폭이 36rem 이상이면 원문|문제 좌우, 좁으면 상하 스택(지문2:문제3).
          텍스트형 데모라 줌 컨트롤은 예외적으로 두지 않는다(항상 100%). */}
      <div
        className="@container min-h-0"
        style={{ height: "var(--demo-h, max(400px, calc(100svh - 260px)))" }}
      >
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] @[36rem]:grid-rows-1 @[36rem]:grid-cols-2">
        {/* 좌: 원문 지문 */}
        <div className="min-h-0 overflow-y-auto border-b border-blue-50 bg-white px-4 py-3 @[36rem]:border-b-0 @[36rem]:border-r">
          <div className="mb-1.5 flex items-center gap-1.5">
            <BookOpen className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">
              원문 지문
            </span>
            <span className="truncate text-[11.5px] font-bold text-slate-500">
              {DEMO_PASSAGE.title}
            </span>
          </div>
          <p className="font-serif text-[13px] leading-[1.85] text-slate-700">
            {DEMO_PASSAGE.text}
          </p>
        </div>

        {/* 우: 생성된 예시 문제 */}
        <div className="min-h-0 overflow-y-auto bg-slate-50/60 p-4">
          {selected === null ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center">
              <MousePointerClick className="size-8 text-blue-300" aria-hidden="true" />
              <p className="text-[13.5px] font-bold text-slate-600">
                왼쪽에서 유형을 눌러보세요
              </p>
              <p className="text-[12px] text-slate-400">
                이 지문이 그 유형의 문제로 즉시 바뀝니다
              </p>
            </div>
          ) : generating ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[12px] font-bold text-blue-600">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {selectedLabel} 문제 생성 중…
              </div>
              <div className="h-[220px] animate-pulse rounded-xl border border-slate-200 bg-white" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11.5px] font-black text-blue-600">
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
          )}
        </div>
      </div>
      </div>
    </DemoShell>
  );
}
