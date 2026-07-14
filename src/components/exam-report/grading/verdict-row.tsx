"use client";

// ============================================================================
// 학생 시험 리포트 v3 — 정오표 테이블 행(문항 1개)
//
// 열: 번호 | 배점 | 학생답(MC=①~⑤ 선지 세그먼트 입력 / 서답=제출·판독 대조) |
//     정답 | 정오 4상태 토글 | 부분점수 | 신뢰도.
// MC 세그먼트를 누르면 onSetChoice → chosenChoice + 정답 대조 자동 정오 파생.
// 애매 행(신뢰도 LOW · 미상 · AI 확인 요청 · 학생 제출 미확인)은 blue ring 강조.
// 순수 표시 — 상태 변경은 콜백으로 위임(불변 업데이트는 grading-shared).
// ============================================================================

import { Eye, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  Confidence,
  ExamMapEntry,
  ResponseStatus,
  StudentResponse,
} from "@/lib/exam-report/types";
import {
  STATUS_STYLE,
  VERDICT_ORDER,
  choiceToCircled,
  isStudentSubmitted,
  numberKey,
} from "./grading-shared";

interface VerdictRowProps {
  entry: ExamMapEntry;
  response: StudentResponse;
  ambiguous: boolean;
  hasUncertainty: boolean;
  onSetStatus: (number: string, status: ResponseStatus) => void;
  onSetPartial: (number: string, pts: number | null) => void;
  onReset: (number: string) => void;
  /** MC 선지 직접 입력(①~⑤ 세그먼트) — 정오 자동 파생은 훅(markChoice)이 담당. */
  onSetChoice: (number: string, choice: string) => void;
  /** 문항 상세보기 열기 — 미지정 시 상세 버튼 숨김(사진 리포트 등). */
  onOpenDetail?: (number: string) => void;
}

const CONFIDENCE_STYLE: Record<Confidence, { label: string; className: string }> = {
  HIGH: { label: "높음", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  MEDIUM: { label: "보통", className: "border-slate-200 bg-slate-50 text-slate-500" },
  LOW: { label: "낮음", className: "border-blue-200 bg-blue-50 text-blue-700" },
};

/** MC 선지 토큰 목록("1".."5") — 세그먼트 렌더 순서. */
const MC_CHOICES = ["1", "2", "3", "4", "5"] as const;

function correctAnswerText(entry: ExamMapEntry): string {
  if (entry.correctAnswer == null || entry.correctAnswer === "") return "—";
  return entry.kind === "MC" ? choiceToCircled(entry.correctAnswer) : entry.correctAnswer;
}

export function VerdictRow({
  entry,
  response,
  ambiguous,
  hasUncertainty,
  onSetStatus,
  onSetPartial,
  onReset,
  onSetChoice,
  onOpenDetail,
}: VerdictRowProps) {
  const confidence = response.aiRead?.confidence;
  const isPartial = response.status === "PARTIAL";
  const studentSubmitted = isStudentSubmitted(response);
  // 현재 선택된 선지 — 강사/학생 입력(chosenChoice) 우선, 없으면 AI 판독값 표시.
  const activeChoice = response.chosenChoice ?? response.aiRead?.chosenChoice ?? null;

  return (
    <tr
      id={`verdict-row-${numberKey(entry.number)}`}
      className={cn(
        "scroll-mt-24 border-b border-slate-100 align-top transition-colors",
        ambiguous ? "bg-blue-50/40 ring-1 ring-inset ring-blue-300" : "hover:bg-slate-50/60",
      )}
    >
      {/* 번호 + 유형 + 확인필요/학생제출 뱃지 */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="whitespace-nowrap text-[13px] font-bold text-slate-800">
            {entry.number}
          </span>
          <span className="whitespace-nowrap text-[10.5px] text-slate-400">
            {entry.typeLabel}
          </span>
          {studentSubmitted && (
            <span className="mt-0.5 inline-flex w-fit items-center whitespace-nowrap rounded-full border border-blue-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
              학생 제출
            </span>
          )}
          {ambiguous && !studentSubmitted && (
            <span className="mt-0.5 inline-flex w-fit items-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
              확인 필요
            </span>
          )}
        </div>
      </td>

      {/* 배점 */}
      <td className="px-2 py-2.5 text-center text-[12.5px] tabular-nums text-slate-500">
        {entry.points != null ? entry.points : "—"}
      </td>

      {/* 학생답: MC=선지 세그먼트 입력 / 서답=제출·판독 대조 표시 */}
      <td className="px-2 py-2.5">
        {entry.kind === "MC" ? (
          <div className="inline-flex items-center gap-1">
            {MC_CHOICES.map((choice) => {
              const active = activeChoice === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  title={`학생답 ${choiceToCircled(choice)}`}
                  aria-pressed={active}
                  onClick={() => onSetChoice(entry.number, choice)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md border text-[13px] font-bold transition-colors",
                    active
                      ? "border-transparent bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50",
                  )}
                >
                  {choiceToCircled(choice)}
                </button>
              );
            })}
          </div>
        ) : (
          <WrittenAnswerCell response={response} />
        )}
      </td>

      {/* 정답(모범답안) */}
      <td className="px-2 py-2.5">
        <span
          className="block max-w-[16rem] truncate text-[13px] font-semibold text-slate-900"
          title={entry.correctAnswer ?? undefined}
        >
          {correctAnswerText(entry)}
        </span>
      </td>

      {/* 정오 4상태 토글 */}
      <td className="px-2 py-2.5">
        <div className="inline-flex items-center gap-1">
          {VERDICT_ORDER.map((s) => {
            const style = STATUS_STYLE[s];
            const active = response.status === s;
            return (
              <button
                key={s}
                type="button"
                title={style.label}
                aria-pressed={active}
                onClick={() => onSetStatus(entry.number, s)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border text-[13px] font-bold transition-colors",
                  active
                    ? style.solid + " border-transparent"
                    : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50",
                )}
              >
                {style.symbol}
              </button>
            );
          })}
        </div>
      </td>

      {/* 부분점수 */}
      <td className="px-2 py-2.5">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={entry.points ?? undefined}
          disabled={!isPartial}
          value={isPartial && response.earnedPoints != null ? response.earnedPoints : ""}
          onChange={(e) => {
            if (e.target.value === "") return onSetPartial(entry.number, null);
            // [0, 배점] 클램프 — 직접 타이핑으로 만점 초과·음수가 들어가지 않게 한다.
            const raw = Number(e.target.value);
            if (!Number.isFinite(raw)) return onSetPartial(entry.number, null);
            const max = entry.points ?? Number.POSITIVE_INFINITY;
            onSetPartial(entry.number, Math.max(0, Math.min(max, raw)));
          }}
          placeholder={isPartial ? "점수" : "—"}
          className="h-7 w-16 rounded-md border border-slate-200 px-2 text-[12.5px] tabular-nums text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
        />
      </td>

      {/* 신뢰도 + 상세보기 + 초기화 */}
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {confidence ? (
            <span
              className={cn(
                "inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                CONFIDENCE_STYLE[confidence].className,
              )}
            >
              {CONFIDENCE_STYLE[confidence].label}
            </span>
          ) : (
            <span className="whitespace-nowrap text-[10px] text-slate-300">수동</span>
          )}
          {onOpenDetail && (
            <button
              type="button"
              title="문항 상세보기"
              aria-label={`${entry.number}번 문항 상세보기`}
              onClick={() => onOpenDetail(entry.number)}
              className="flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-[10.5px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            >
              <Eye className="h-3 w-3" />
              상세
            </button>
          )}
          <button
            type="button"
            title="미상으로 초기화"
            onClick={() => onReset(entry.number)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        {hasUncertainty && (
          <span className="mt-1 block text-right text-[10px] text-blue-500">AI 질문</span>
        )}
      </td>
    </tr>
  );
}

/** 서답형(SHORT/ESSAY) 학생답 셀 — 학생 제출 원문과 AI 판독 텍스트를 나란히 대조.
 *  둘 다 없으면 —. 자동 채점 금지 — 강사가 모범답안과 대조해 ○✕△ 판정하는 재료. */
function WrittenAnswerCell({ response }: { response: StudentResponse }) {
  const submitted = response.studentAnswer?.trim() || "";
  const aiWritten = response.aiRead?.writtenAnswer?.trim() || "";
  if (!submitted && !aiWritten) {
    return <span className="text-[13px] font-medium text-slate-400">—</span>;
  }
  const both = Boolean(submitted && aiWritten);
  return (
    <div className="flex max-w-[18rem] flex-col gap-0.5">
      {submitted && (
        <span className="flex items-baseline gap-1.5 text-[13px] font-medium text-slate-700">
          {both && (
            <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold text-blue-500">
              제출
            </span>
          )}
          <span className="truncate" title={submitted}>
            {submitted}
          </span>
        </span>
      )}
      {aiWritten && (
        <span className="flex items-baseline gap-1.5 text-[13px] font-medium text-slate-700">
          {both && (
            <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold text-slate-400">
              판독
            </span>
          )}
          <span className="truncate" title={aiWritten}>
            {aiWritten}
          </span>
        </span>
      )}
    </div>
  );
}
