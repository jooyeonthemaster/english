"use client";

// ============================================================================
// 문항 분석 카드 — 요약(번호+발문요약+유형칩+난이도) → 펼침 시 해설/의도/포인트/
// 전략/오답설계 표. FAILED 카드는 rose 테두리 + 무료 재분석. '검수 완료' 토글.
// 분석 필드 인라인 편집(EditableAnalysisField).
// ============================================================================

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  RefreshCw,
  Star,
} from "lucide-react";
import type { ExamMapEntry, QuestionAnalysis } from "@/lib/exam-report/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EditableAnalysisField } from "./analysis-edit-panel";

const EXAM_FONT = '"Malgun Gothic Exam", "Malgun Gothic", sans-serif';

interface QuestionAnalysisCardProps {
  /** 채점 지도 항목 — 발문 요약(brief)·유형 표시에 사용 */
  question?: ExamMapEntry;
  analysis: QuestionAnalysis;
  isConfirmed: boolean;
  /** 이 문항 재분석 진행 중 */
  busy: boolean;
  /** 편집 저장 잠금(다른 저장 in-flight) */
  saving: boolean;
  onToggleConfirm: () => void;
  onReanalyze: () => void;
  onEditField: (patch: Partial<QuestionAnalysis>) => void;
}

function DifficultyStars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`난이도 ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= value
              ? "h-3.5 w-3.5 fill-blue-500 text-blue-500"
              : "h-3.5 w-3.5 text-slate-300"
          }
        />
      ))}
    </span>
  );
}

function AttractivenessDots({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`매력도 ${value}/3`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i <= value ? "bg-rose-500" : "bg-slate-200"
          }`}
        />
      ))}
    </span>
  );
}

export function QuestionAnalysisCard({
  question,
  analysis,
  isConfirmed,
  busy,
  saving,
  onToggleConfirm,
  onReanalyze,
  onEditField,
}: QuestionAnalysisCardProps) {
  const [open, setOpen] = useState(false);
  const failed = analysis.analysisStatus === "FAILED";
  const questionText = question?.brief ?? "";

  const containerClass = failed
    ? "border-rose-300 bg-rose-50/40"
    : isConfirmed
      ? "border-emerald-200 bg-white ring-1 ring-emerald-100"
      : "border-slate-200 bg-white";

  return (
    <div className={`rounded-lg border transition-colors ${containerClass}`}>
      {/* ── 헤더 ── */}
      <button
        type="button"
        onClick={() => !failed && setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        {/* 번호 칩 nowrap — "서답형 3" 류 다글자 번호 줄바꿈 깨짐 방지(전역 원칙). */}
        <span className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-slate-100 px-1.5 text-xs font-semibold text-slate-600">
          {analysis.number}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-sm text-slate-800"
            style={{ fontFamily: EXAM_FONT }}
            title={questionText || undefined}
          >
            {questionText || <span className="text-slate-400">발문 없음</span>}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {failed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">
                <AlertTriangle className="h-3 w-3" />
                분석 실패
              </span>
            ) : (
              <>
                <span className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {analysis.typeLabel || "유형 미상"}
                </span>
                <DifficultyStars value={analysis.difficulty} />
              </>
            )}
            {isConfirmed && !failed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-600">
                <Check className="h-3 w-3" />
                검수 완료
              </span>
            )}
          </span>
        </span>
        {!failed && (
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        )}
      </button>

      {/* ── FAILED 카드: 무료 재분석 ── */}
      {failed && (
        <div className="flex items-center justify-between gap-3 border-t border-rose-200 bg-rose-50/60 px-4 py-3">
          <p className="text-xs text-rose-600">
            이 문항은 분석에 실패했습니다. 크레딧 차감 없이 다시 분석할 수 있어요.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onReanalyze}
            disabled={busy}
            className="shrink-0 border-rose-300 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            재분석 (무료)
          </Button>
        </div>
      )}

      {/* ── 펼침 상세 (OK) ── */}
      {open && !failed && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          <EditableAnalysisField
            label="상세 해설"
            value={analysis.explanation}
            onCommit={(next) => onEditField({ explanation: next })}
            disabled={saving}
            minRows={4}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <EditableAnalysisField
              label="출제 의도"
              value={analysis.intent}
              onCommit={(next) => onEditField({ intent: next })}
              disabled={saving}
            />
            <EditableAnalysisField
              label="출제 포인트"
              value={analysis.examPoint}
              onCommit={(next) => onEditField({ examPoint: next })}
              disabled={saving}
            />
          </div>

          <EditableAnalysisField
            label="접근 전략"
            value={analysis.solvingStrategy}
            onCommit={(next) => onEditField({ solvingStrategy: next })}
            disabled={saving}
            minRows={3}
          />

          <EditableAnalysisField
            label="난이도 판단 근거"
            value={analysis.difficultyRationale}
            onCommit={(next) => onEditField({ difficultyRationale: next })}
            disabled={saving}
          />

          {analysis.keyConcepts.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">핵심 개념</div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.keyConcepts.map((concept, i) => (
                  <span
                    key={`${concept}-${i}`}
                    className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.trapDesign && analysis.trapDesign.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">오답 설계</div>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="w-14 whitespace-nowrap px-3 py-1.5 font-medium">선지</th>
                      <th className="px-3 py-1.5 font-medium">매력적인 이유</th>
                      <th className="w-16 whitespace-nowrap px-3 py-1.5 font-medium">매력도</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.trapDesign.map((trap, i) => (
                      <tr key={`${trap.choice}-${i}`}>
                        <td className="px-3 py-2 align-top font-medium text-slate-600">
                          {trap.choice}번
                        </td>
                        <td className="px-3 py-2 align-top leading-relaxed text-slate-700">
                          {trap.why}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <AttractivenessDots value={trap.attractiveness} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 검수 완료 토글 ── */}
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
            <Checkbox
              id={`confirm-${analysis.number}`}
              checked={isConfirmed}
              onCheckedChange={onToggleConfirm}
              disabled={saving}
            />
            <label
              htmlFor={`confirm-${analysis.number}`}
              className="cursor-pointer text-sm text-slate-600"
            >
              이 문항 분석 검수 완료
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
