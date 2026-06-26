"use client";

import type { DragEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileImage, Keyboard, X } from "lucide-react";
import { GENERATE_TOUR_SAMPLE_FILE_NAME } from "@/lib/generate-tour-demo";
import { GenerateTourPlayer } from "./tour-player-loader";
import { TOUR_ACTION_GLOW_CLASS } from "./tour-constants";
import { TOUR_LESSONS } from "./tour-steps";
import type { TourStep, TourMode } from "./tour-types";

export function TourCard({
  cardPosition,
  closeForSession,
  currentStep,
  currentStepComplete,
  currentStepStarted,
  fillSampleText,
  finalStep,
  handleSampleFileDragStart,
  hideForever,
  next,
  previous,
  showStepVideo,
  startLesson,
  stepIndex,
  steps,
  tourMode,
}: {
  cardPosition: { left: number; top: number; width: number };
  closeForSession: () => void;
  currentStep: TourStep;
  currentStepComplete: boolean;
  currentStepStarted: boolean;
  fillSampleText: () => void;
  finalStep: boolean;
  handleSampleFileDragStart: (event: DragEvent<HTMLDivElement>) => void;
  hideForever: () => void;
  next: () => void;
  previous: () => void;
  showStepVideo: boolean;
  startLesson: (mode: TourMode) => void;
  stepIndex: number;
  steps: TourStep[];
  tourMode: TourMode;
}) {
  return (
    <div
      className="pointer-events-auto absolute flex max-h-[calc(100vh-28px)] flex-col overflow-hidden rounded-xl border border-blue-200 bg-white shadow-2xl shadow-slate-950/20 ring-1 ring-blue-100"
      style={{
        left: cardPosition.left,
        top: cardPosition.top,
        width: cardPosition.width,
      }}
    >
      <div className="shrink-0 border-b border-slate-100 bg-slate-50/70 px-4 py-3 pr-11">
        <div className="-mx-1 mb-2 overflow-x-auto pr-8">
          <div className="flex min-w-max items-center gap-1 px-1">
            {TOUR_LESSONS.map((lesson, index) => {
              const active = lesson.mode === tourMode;

              return (
                <div key={lesson.mode} className="flex items-center gap-1">
                  {index > 0 ? (
                    <span
                      className="text-[10px] font-black text-slate-300"
                      aria-hidden="true"
                    >
                      &gt;
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => startLesson(lesson.mode)}
                    title={lesson.title}
                    aria-current={active ? "step" : undefined}
                    className={
                      "inline-flex h-6 items-center justify-center rounded-md px-2 text-[10.5px] font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                      (active
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:ring-blue-100")
                    }
                  >
                    {lesson.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="text-[10.5px] font-black uppercase tracking-wide text-blue-600">
          문제 생성 안내 {stepIndex + 1}/{steps.length}
        </div>
        <h2 className="mt-1 text-[15px] font-black leading-snug text-slate-950">
          {currentStep?.title}
        </h2>
        <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-slate-500">
          {currentStep?.body}
        </p>
        {currentStep?.examples?.length ? (
          <div className="mt-2 grid gap-1.5">
            {currentStep.examples.map((example) => (
              <div
                key={example.label}
                className="rounded-md border border-blue-100 bg-white/80 px-2.5 py-2"
              >
                <div className="text-[10.5px] font-black text-blue-600">
                  {example.label}
                </div>
                {example.inputText && example.outputText ? (
                  <div className="mt-1.5 grid gap-2 min-[420px]:grid-cols-2">
                    <div className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5 ring-1 ring-slate-100">
                      <div className="text-[9.5px] font-black text-slate-400">
                        {example.inputLabel ?? "원문 입력"}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[10.5px] font-semibold leading-relaxed text-slate-600">
                        {example.inputText}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-md bg-blue-50/70 px-2 py-1.5 ring-1 ring-blue-100">
                      <div className="text-[9.5px] font-black text-blue-500">
                        {example.outputLabel ?? "출력 결과"}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[10.5px] font-semibold leading-relaxed text-slate-700">
                        {example.outputText}
                      </p>
                    </div>
                  </div>
                ) : example.text ? (
                  <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-600">
                    {example.text}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={closeForSession}
          aria-label="튜토리얼 닫기"
          title="닫기"
          className="absolute right-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-md bg-white/95 text-blue-400 shadow-sm ring-1 ring-blue-100 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {showStepVideo ? (
        <div className="shrink-0 bg-slate-950 p-2">
          <GenerateTourPlayer variant={currentStep?.video ?? "overview"} />
        </div>
      ) : null}
      <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3">
        {currentStep?.demo?.type === "sample-text" ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
            <button
              type="button"
              data-generate-tour="tour-sample-text-button"
              onClick={fillSampleText}
              className={
                "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-white px-3 text-[12px] font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition-colors hover:bg-blue-50 " +
                (currentStepComplete ? "" : TOUR_ACTION_GLOW_CLASS)
              }
            >
              <Keyboard className="size-3.5" aria-hidden="true" />
              {currentStep.demo.label ?? "예문 자동 입력하기"}
            </button>
            <p className="mt-2 text-[11.5px] font-semibold leading-relaxed text-blue-700">
              {currentStep.demo.description}
            </p>
          </div>
        ) : null}

        {currentStep?.demo?.type === "sample-file" ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
            <p className="text-[11.5px] font-semibold leading-relaxed text-blue-700">
              {currentStep.demo.description}
            </p>
            <div
              draggable
              data-generate-tour="tour-sample-file-chip"
              onDragStart={handleSampleFileDragStart}
              title="이 예시 파일을 업로드 박스로 드래그하세요"
              className={
                "mt-2 flex h-10 cursor-grab select-none items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-[12px] font-black text-blue-700 shadow-sm active:cursor-grabbing " +
                (currentStepComplete ? "" : TOUR_ACTION_GLOW_CLASS)
              }
            >
              <FileImage className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {GENERATE_TOUR_SAMPLE_FILE_NAME}
              </span>
              <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-600">
                드래그
              </span>
            </div>
          </div>
        ) : null}

        {currentStep?.required ? (
          <div
            className={
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-bold leading-relaxed " +
              (currentStepComplete
                ? "border-blue-100 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-50 text-slate-500")
            }
          >
            <CheckCircle2
              className={
                "mt-0.5 size-3.5 shrink-0 " +
                (currentStepComplete ? "text-blue-600" : "text-slate-300")
              }
              aria-hidden="true"
            />
            <span>
              {currentStepComplete
                ? currentStep.required.doneLabel
                : currentStepStarted && currentStep.required.startedLabel
                  ? currentStep.required.startedLabel
                  : currentStep.required.waitingLabel}
            </span>
          </div>
        ) : null}

        {currentStep?.decision ? (
          <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
            <button
              type="button"
              onClick={() =>
                currentStep.decision?.nextMode
                  ? startLesson(currentStep.decision.nextMode)
                  : closeForSession()
              }
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12px] font-black text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {currentStep.decision.continueLabel}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={closeForSession}
              className="inline-flex h-9 items-center justify-center rounded-md bg-white px-3 text-[12px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {currentStep.decision.finishLabel}
            </button>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={previous}
            disabled={stepIndex === 0}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            이전
          </button>
          {!currentStep?.decision ? (
            <button
              type="button"
              onClick={next}
              disabled={!currentStepComplete}
              className={
                "inline-flex h-8 items-center gap-1 rounded-md px-3 text-[11.5px] font-black transition-colors " +
                (currentStepComplete
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-400")
              }
            >
              {finalStep
                ? "끝내기"
                : currentStepComplete
                  ? "다음"
                  : "완료 후 다음"}
              {!finalStep && currentStepComplete ? (
                <ArrowRight className="size-3.5" aria-hidden="true" />
              ) : null}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {steps.map((step, index) => (
            <span
              key={step.title}
              className={
                "h-1.5 flex-1 rounded-full transition-colors " +
                (index <= stepIndex ? "bg-blue-600" : "bg-slate-200")
              }
            />
          ))}
        </div>
      </div>
      <div className="flex shrink-0 justify-end border-t border-slate-100 bg-white px-4 py-2.5">
        <button
          type="button"
          onClick={hideForever}
          className="inline-flex h-7 items-center rounded-md px-2 text-[11.5px] font-bold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800"
        >
          다시는 보지 않기
        </button>
      </div>
    </div>
  );
}
