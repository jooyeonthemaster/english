"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";

import { QUESTION_TYPE_META } from "@/lib/question-schemas";

// 동형 문제 생성 '분석 정보' 모달 — 원본 문항 분석(QuestionAnalysis)을 강사 친화 블록으로.
// 동형 시험지 생성의 분석정보 모달과 동일 톤(헤더 + Block 섹션).

interface QAnalysis {
  source?: {
    direction?: string;
    passageBased?: boolean;
    options?: Array<{
      label?: string;
      text?: string;
      isCorrect?: boolean;
      rationale?: string;
    }>;
    optionCount?: number;
    correctAnswerLabels?: string[];
    multipleAnswers?: boolean;
    originalExplanation?: string;
  };
  classification?: {
    matchedType?: string | null;
    matchConfidence?: string;
    isNovelType?: boolean;
    noveltyNote?: string;
    difficulty?: string;
    difficultyRationale?: string;
    points?: number | null;
  };
  testingPoint?: { summary?: string; skills?: string[] };
  transformation?: {
    applied?: boolean;
    description?: string;
    rules?: string[];
    changedSpans?: Array<{ from?: string; to?: string; rule?: string }>;
  };
  reproductionSpec?: {
    stemFormat?: string;
    optionFormat?: string;
    answerFormat?: string;
    structureNotes?: string;
  };
  variationAxes?: string[];
  extractionNotes?: string[];
}

const DIFFICULTY_LABEL: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

function Block({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-slate-100 px-6 py-5 first:border-t-0">
      <h3 className="mb-3 text-[13px] font-bold text-slate-900">
        {title}
        {sub ? (
          <span className="ml-1.5 font-medium text-slate-400">· {sub}</span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span
          key={i}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-slate-600"
        >
          {it}
        </span>
      ))}
    </div>
  );
}

export function SimilarQuestionAnalysisModal({
  analysis,
  onClose,
}: {
  analysis: QAnalysis | null;
  onClose: () => void;
}) {
  const src = analysis?.source ?? {};
  const cls = analysis?.classification ?? {};
  const tp = analysis?.testingPoint ?? {};
  const tr = analysis?.transformation ?? {};
  const rep = analysis?.reproductionSpec ?? {};

  const typeLabel = cls.isNovelType
    ? "신규 유형"
    : cls.matchedType
      ? (QUESTION_TYPE_META[cls.matchedType]?.label ?? cls.matchedType)
      : "미분류";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-950">분석 정보</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              원본 문항 분석 · {typeLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!analysis ? (
            <div className="px-6 py-20 text-center text-sm text-slate-500">
              저장된 분석 데이터가 없습니다.
            </div>
          ) : (
            <>
              {/* 1. 원본 문항 */}
              <Block title="원본 문항">
                {src.direction ? (
                  <p className="text-[13px] font-semibold leading-snug text-slate-900">
                    {src.direction}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
                  <span>
                    <span className="text-slate-400">유형 </span>
                    <span className="font-bold text-slate-800">
                      {typeLabel}
                    </span>
                    {cls.matchConfidence ? (
                      <span className="ml-1 text-slate-400">
                        ({cls.matchConfidence})
                      </span>
                    ) : null}
                  </span>
                  {cls.difficulty ? (
                    <span>
                      <span className="text-slate-400">난이도 </span>
                      <span className="font-bold text-slate-800">
                        {DIFFICULTY_LABEL[cls.difficulty] ?? cls.difficulty}
                      </span>
                    </span>
                  ) : null}
                  <span>
                    <span className="text-slate-400">보기 </span>
                    <span className="font-bold text-slate-800">
                      {src.optionCount ?? src.options?.length ?? 0}개
                    </span>
                  </span>
                  <span>
                    <span className="text-slate-400">정답 </span>
                    <span className="font-bold text-slate-800">
                      {(src.correctAnswerLabels ?? []).join(", ") || "-"}
                    </span>
                    {src.multipleAnswers ? (
                      <span className="ml-1 rounded bg-slate-100 px-1 text-[10.5px] font-bold text-slate-600">
                        복수정답
                      </span>
                    ) : null}
                  </span>
                  <span>
                    <span className="text-slate-400">지문 </span>
                    <span className="font-bold text-slate-800">
                      {src.passageBased === false ? "없음" : "있음"}
                    </span>
                  </span>
                </div>
                {cls.isNovelType && cls.noveltyNote ? (
                  <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11.5px] text-slate-600">
                    신규 유형: {cls.noveltyNote}
                  </p>
                ) : null}
              </Block>

              {/* 2. 출제 포인트 */}
              {(tp.summary || (tp.skills?.length ?? 0) > 0) && (
                <Block title="출제 포인트">
                  {tp.summary ? (
                    <p className="text-[12.5px] leading-relaxed text-slate-700">
                      {tp.summary}
                    </p>
                  ) : null}
                  {cls.difficultyRationale ? (
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">
                      난이도 근거: {cls.difficultyRationale}
                    </p>
                  ) : null}
                  {tp.skills && tp.skills.length > 0 ? (
                    <div className="mt-2">
                      <Chips items={tp.skills} />
                    </div>
                  ) : null}
                </Block>
              )}

              {/* 3. 변형 분석 */}
              {tr.applied &&
              (tr.description ||
                (tr.rules?.length ?? 0) > 0 ||
                (tr.changedSpans?.length ?? 0) > 0) ? (
                <Block title="변형 분석" sub="원본을 어떻게 바꿔 출제했나">
                  {tr.description ? (
                    <p className="text-[12.5px] leading-relaxed text-slate-700">
                      {tr.description}
                    </p>
                  ) : null}
                  {tr.rules && tr.rules.length > 0 ? (
                    <div className="mt-2">
                      <Chips items={tr.rules} />
                    </div>
                  ) : null}
                  {tr.changedSpans && tr.changedSpans.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {tr.changedSpans.map((s, i) => (
                        <li key={i} className="text-[11.5px] text-slate-600">
                          <span className="text-red-600 line-through">
                            {s.from}
                          </span>
                          <span className="mx-1 text-slate-400">→</span>
                          <span className="font-semibold text-slate-800">
                            {s.to}
                          </span>
                          {s.rule ? (
                            <span className="ml-1.5 text-slate-400">
                              ({s.rule})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Block>
              ) : null}

              {/* 4. 정답 논리 (보기별 근거) */}
              {(src.options?.length ?? 0) > 0 ? (
                <Block title="정답 논리" sub="보기별 근거">
                  <ul className="space-y-1.5">
                    {src.options!.map((o, i) => (
                      <li
                        key={i}
                        className={
                          "rounded-md px-2 py-1.5 text-[11.5px] leading-relaxed " +
                          (o.isCorrect
                            ? "bg-slate-100 text-slate-800"
                            : "bg-slate-50 text-slate-600")
                        }
                      >
                        <span className="font-bold">
                          {o.label}. {o.text}
                          {o.isCorrect ? " ✓" : ""}
                        </span>
                        {o.rationale ? (
                          <span className="ml-1 block text-slate-500">
                            {o.rationale}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {src.originalExplanation ? (
                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-slate-700">
                      <span className="font-bold">원본 해설: </span>
                      {src.originalExplanation}
                    </div>
                  ) : null}
                </Block>
              ) : null}

              {/* 5. 재현 스펙 / 변형 축 */}
              {(rep.stemFormat ||
                rep.optionFormat ||
                rep.answerFormat ||
                rep.structureNotes ||
                (analysis.variationAxes?.length ?? 0) > 0) && (
                <Block title="동형 재현 기준">
                  <div className="space-y-1 text-[11.5px] leading-relaxed text-slate-600">
                    {rep.stemFormat ? (
                      <p>
                        <span className="font-semibold text-slate-700">
                          발문 형식:{" "}
                        </span>
                        {rep.stemFormat}
                      </p>
                    ) : null}
                    {rep.optionFormat ? (
                      <p>
                        <span className="font-semibold text-slate-700">
                          보기 형식:{" "}
                        </span>
                        {rep.optionFormat}
                      </p>
                    ) : null}
                    {rep.answerFormat ? (
                      <p>
                        <span className="font-semibold text-slate-700">
                          정답 형식:{" "}
                        </span>
                        {rep.answerFormat}
                      </p>
                    ) : null}
                    {rep.structureNotes ? (
                      <p>
                        <span className="font-semibold text-slate-700">
                          구조:{" "}
                        </span>
                        {rep.structureNotes}
                      </p>
                    ) : null}
                  </div>
                  {analysis.variationAxes &&
                  analysis.variationAxes.length > 0 ? (
                    <div className="mt-2.5">
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-400">
                        바꿀 수 있는 축
                      </p>
                      <Chips items={analysis.variationAxes} />
                    </div>
                  ) : null}
                </Block>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export type { QAnalysis };
