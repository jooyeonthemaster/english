"use client";

// ============================================================================
// 채점 검토 드로어 — 문항 상세 카드 1개 (V4 소유)
//
// 발문 요약(EXAM_FONT)·정답 표시·학생 입력·판정 + NEEDS_REVIEW/미입력 수동확정
// 세그먼트(정답/오답/부분점수 → resolveNeedsReview). 부분점수는 [0, 배점] 클램프
// input. manualStatus 가 이미 있는 문항도 재확정 가능(서버가 항상 우선 적용).
// ============================================================================

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  resolveNeedsReview,
  type SubmissionMutationResult,
  type SubmissionReviewQuestion,
} from "@/actions/exams/submission-review";
import {
  choiceLabelOf,
  EffectiveStatusChip,
  EXAM_FONT,
} from "./shared";

// ── 표시 헬퍼 ────────────────────────────────────────────────────────────────

/** 학생 입력 표시 줄 — null 은 호출부에서 "미입력" 처리 */
function describeInput(q: SubmissionReviewQuestion): string[] {
  const input = q.input;
  if (!input) return [];
  const lines: string[] = [];
  if (input.choice) lines.push(choiceLabelOf(q.optionLabels, input.choice));
  if (input.choices && input.choices.length > 0) {
    lines.push(input.choices.map((c) => choiceLabelOf(q.optionLabels, c)).join(", "));
  }
  if (input.texts) {
    const labelByKey = new Map(
      (q.answerFields ?? []).map((f) => [f.key, f.label] as const),
    );
    for (const [key, value] of Object.entries(input.texts)) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const label = labelByKey.get(key);
      lines.push(label ? `${label} ${trimmed}` : trimmed);
    }
  }
  return lines;
}

/** 정답 표시 줄 — 선지형은 라벨, 서답형은 필드별 모범답(+허용 변형 수) */
function describeAnswer(q: SubmissionReviewQuestion): string[] {
  if (q.correctChoiceLabels && q.correctChoiceLabels.length > 0) {
    return [q.correctChoiceLabels.join(", ")];
  }
  if (q.answerFields && q.answerFields.length > 0) {
    return q.answerFields.map((f) => {
      const head = f.answers[0] ?? "";
      const extra = f.answers.length > 1 ? ` (외 ${f.answers.length - 1}개 허용)` : "";
      const label = q.answerFields && q.answerFields.length > 1 ? `${f.label} ` : "";
      return `${label}${head}${extra}`;
    });
  }
  return [];
}

// ── 카드 본체 ────────────────────────────────────────────────────────────────

interface ReviewQuestionCardProps {
  submissionId: string;
  q: SubmissionReviewQuestion;
  /** 수동확정 가능 여부(제출 이후 상태 + 드로어 busy 아님) */
  reviewable: boolean;
  busy: boolean;
  onMutated: (result: SubmissionMutationResult) => void;
}

export function ReviewQuestionCard({
  submissionId,
  q,
  reviewable,
  busy,
  onMutated,
}: ReviewQuestionCardProps) {
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialValue, setPartialValue] = useState("");
  const [saving, setSaving] = useState<"CORRECT" | "WRONG" | "PARTIAL" | null>(null);

  const inputLines = describeInput(q);
  const answerLines = describeAnswer(q);
  const showVerdictControls =
    reviewable &&
    (q.effectiveStatus === "NEEDS_REVIEW" ||
      q.effectiveStatus === "UNKNOWN" ||
      q.manualStatus != null);

  async function resolve(status: "CORRECT" | "WRONG" | "PARTIAL", earnedPoints?: number) {
    setSaving(status);
    try {
      const result = await resolveNeedsReview(submissionId, q.questionId, {
        status,
        ...(earnedPoints != null ? { earnedPoints } : {}),
      });
      if (!result.success) {
        toast.error(result.error ?? "수동 판정 저장에 실패했습니다.");
        return;
      }
      setPartialOpen(false);
      setPartialValue("");
      onMutated(result);
    } finally {
      setSaving(null);
    }
  }

  function submitPartial() {
    const value = Number(partialValue);
    if (!Number.isFinite(value)) {
      toast.error("부분점수를 숫자로 입력해 주세요.");
      return;
    }
    if (value < 0 || value > q.points) {
      toast.error(`부분점수는 0점부터 ${q.points}점 사이로 입력해 주세요.`);
      return;
    }
    void resolve("PARTIAL", value);
  }

  const disabled = busy || saving != null;

  return (
    <div
      data-review-q={q.orderNum}
      className="scroll-mt-4 rounded-xl border border-[#E5E8EB] bg-white p-4"
    >
      {/* 헤더: 번호·유형·배점·판정 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700">
          {q.orderNum}번
        </span>
        <span className="min-w-0 truncate text-xs font-medium text-[#8B95A1]">
          {q.typeLabel}
        </span>
        <span className="whitespace-nowrap text-xs tabular-nums text-[#B0B8C1]">
          {q.points}점
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {q.manualStatus && (
            <span className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
              수동확정
            </span>
          )}
          <EffectiveStatusChip status={q.effectiveStatus} />
        </div>
      </div>

      {/* 발문 요약 — 시험 본문 텍스트라 EXAM_FONT */}
      {q.brief && (
        <p
          className="mt-2 text-sm leading-relaxed text-[#4E5968]"
          style={{ fontFamily: EXAM_FONT }}
        >
          {q.brief}
        </p>
      )}

      {/* 정답 / 학생 입력 / 획득점수 */}
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-xs font-medium leading-5 text-[#8B95A1]">
            정답
          </dt>
          <dd className="min-w-0 text-[#191F28]">
            {answerLines.length > 0 ? (
              answerLines.map((line, i) => (
                <p key={i} style={{ fontFamily: EXAM_FONT }}>
                  {line}
                </p>
              ))
            ) : (
              <span className="text-xs text-[#8B95A1]">
                {q.manualReason
                  ? `수동 채점 문항 — ${q.manualReason}`
                  : "수동 채점 문항입니다."}
              </span>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-xs font-medium leading-5 text-[#8B95A1]">
            학생 입력
          </dt>
          <dd className="min-w-0 text-[#191F28]">
            {inputLines.length > 0 ? (
              inputLines.map((line, i) => (
                <p key={i} className="break-words" style={{ fontFamily: EXAM_FONT }}>
                  {line}
                </p>
              ))
            ) : (
              <span className="text-[#B0B8C1]">미입력</span>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-xs font-medium leading-5 text-[#8B95A1]">
            획득 점수
          </dt>
          <dd className="tabular-nums text-[#191F28]">
            {q.effectiveEarnedPoints != null ? (
              `${q.effectiveEarnedPoints} / ${q.points}점`
            ) : (
              <span className="text-[#B0B8C1]">확정 전</span>
            )}
          </dd>
        </div>
      </dl>

      {/* NEEDS_REVIEW / 미입력 수동확정 세그먼트 */}
      {showVerdictControls && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-[#F7F8FA] p-3">
          <p className="text-xs font-medium text-[#6B7684]">판정 확정</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => void resolve("CORRECT")}
              className={cn(
                "h-11 border-[#E5E8EB] bg-white px-4",
                q.manualStatus === "CORRECT"
                  ? "border-[#3182F6] text-[#3182F6]"
                  : "text-[#4E5968]",
              )}
            >
              {saving === "CORRECT" && <Loader2 className="size-3.5 animate-spin" />}
              정답
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => void resolve("WRONG")}
              className={cn(
                "h-11 border-[#E5E8EB] bg-white px-4",
                q.manualStatus === "WRONG"
                  ? "border-slate-500 text-slate-700"
                  : "text-[#4E5968]",
              )}
            >
              {saving === "WRONG" && <Loader2 className="size-3.5 animate-spin" />}
              오답
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setPartialOpen((v) => !v)}
              className={cn(
                "h-11 border-[#E5E8EB] bg-white px-4",
                q.manualStatus === "PARTIAL" || partialOpen
                  ? "border-[#3182F6] text-[#3182F6]"
                  : "text-[#4E5968]",
              )}
            >
              부분점수
            </Button>
          </div>
          {partialOpen && (
            <div className="mt-2 flex items-center gap-1.5">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={q.points}
                step={0.5}
                value={partialValue}
                onChange={(e) => setPartialValue(e.target.value)}
                placeholder={`0 ~ ${q.points}`}
                className="h-11 w-28 bg-white tabular-nums"
                disabled={disabled}
              />
              <span className="text-xs text-[#8B95A1]">/ {q.points}점</span>
              <Button
                size="sm"
                disabled={disabled || partialValue.trim() === ""}
                onClick={submitPartial}
                className="h-11 bg-[#3182F6] px-4 text-white hover:bg-[#1B64DA]"
              >
                {saving === "PARTIAL" && <Loader2 className="size-3.5 animate-spin" />}
                확정
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
