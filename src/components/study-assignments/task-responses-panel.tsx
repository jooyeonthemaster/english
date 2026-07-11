"use client";

// ============================================================================
// QUESTIONS 답안 대조 확장 패널 — 과제 상세 모달 DONE 행 클릭 시 로드
//
// getQuestionsAssignPreview(문항 원문·정답) × getStudyTaskResponses(학생 답)
// 조인으로 문항별 학생답 vs 정답 대조 목록을 그 자리에서 보여준다.
// 톤 계약: 정답 emerald · 오답 rose · 확인중/미입력 slate (부분 정답 blue).
// ============================================================================

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getQuestionsAssignPreview } from "@/actions/study-assignments";
import {
  getStudyTaskResponses,
  type StudyTaskResponseItem,
} from "@/actions/study-assignments/queries";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { cn } from "@/lib/utils";

const CIRCLED = ["①", "②", "③", "④", "⑤"];

/**
 * 선지 라벨 표기 정규화 — 저장 원문이 "5" / "(E)" / "E" / "⑤" 로 혼재해도
 * 학생 답과 정답이 같은 표기(①~⑤)로 대조되게 한다. 선지형이 아니면 원문 유지.
 */
function normalizeChoiceLabel(raw: string): string {
  const t = raw.trim();
  const circled = CIRCLED.indexOf(t);
  if (circled >= 0) return CIRCLED[circled];
  const num = /^[1-5]$/.exec(t);
  if (num) return CIRCLED[Number(t) - 1];
  const alpha = /^\(?([A-Ea-e])\)?$/.exec(t);
  if (alpha) return CIRCLED[alpha[1].toUpperCase().charCodeAt(0) - 65];
  return raw;
}

function formatStudentInput(input: StudentInput | null): string {
  if (!input) return "미입력";
  if (typeof input.choice === "string" && input.choice) {
    return normalizeChoiceLabel(input.choice);
  }
  if (Array.isArray(input.choices) && input.choices.length > 0) {
    return input.choices.map(normalizeChoiceLabel).join(" · ");
  }
  if (input.texts) {
    const vals = Object.values(input.texts)
      .map((t) => t?.trim())
      .filter(Boolean);
    if (vals.length > 0) return vals.join(" / ");
  }
  return "미입력";
}

function verdictChip(status: StudyTaskResponseItem["status"], hasInput: boolean) {
  if (!hasInput) return { cls: "border-slate-200 bg-slate-50 text-slate-500", label: "미입력" };
  if (status === "CORRECT")
    return { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "정답" };
  if (status === "WRONG")
    return { cls: "border-rose-200 bg-rose-50 text-rose-700", label: "오답" };
  if (status === "PARTIAL")
    return { cls: "border-blue-200 bg-blue-50 text-blue-700", label: "부분 정답" };
  return { cls: "border-slate-200 bg-slate-50 text-slate-600", label: "확인 중" };
}

interface CompareRow {
  key: string;
  orderNum: number;
  questionText: string;
  correctAnswer: string;
  studentAnswer: string;
  status: StudyTaskResponseItem["status"];
  hasInput: boolean;
}

/** 문항별 학생답 vs 정답 대조 — 과제 상세 QUESTIONS DONE 행 확장 시 로드 */
export function TaskResponsesPanel({
  taskId,
  questionIds,
}: {
  taskId: string;
  /** payload.questionIds 스냅샷 — 정답·문항 원문 조회용 */
  questionIds: string[];
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const idsKey = questionIds.join(",");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      const [preview, responses] = await Promise.all([
        getQuestionsAssignPreview(questionIds),
        getStudyTaskResponses(taskId),
      ]);
      if (!alive) return;
      if (!preview.success || !preview.data || !responses.success || !responses.data) {
        setError(
          (!preview.success ? preview.error : responses.error) ??
            "답안을 불러오지 못했습니다.",
        );
      } else {
        const qById = new Map(preview.data.map((q) => [q.id, q]));
        setRows(
          responses.data.map((r) => {
            const q = qById.get(r.questionId);
            return {
              key: `${r.orderNum}:${r.questionId}`,
              orderNum: r.orderNum,
              questionText: q?.questionText ?? "(삭제된 문항)",
              correctAnswer: q?.correctAnswer ? normalizeChoiceLabel(q.correctAnswer) : "—",
              studentAnswer: formatStudentInput(r.input),
              status: r.status,
              hasInput: r.input !== null,
            };
          }),
        );
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, idsKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-slate-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        답안을 불러오는 중입니다
      </div>
    );
  }
  if (error) {
    return <p className="py-4 text-center text-[12.5px] text-rose-600">{error}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-[12.5px] text-slate-400">
        저장된 답안이 없습니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold text-slate-400">
        문항별 답안 대조 — 학생 답 vs 정답
      </p>
      {rows.map((r) => {
        const chip = verdictChip(r.status, r.hasInput);
        return (
          <div
            key={r.key}
            className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-slate-800 text-[11px] font-bold text-white">
              {r.orderNum}
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-keep text-[12px] leading-relaxed text-slate-500">
                {r.questionText}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                <span className="text-slate-400">
                  학생 답{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      r.status === "CORRECT"
                        ? "text-emerald-700"
                        : r.status === "WRONG"
                          ? "text-rose-600"
                          : "text-slate-700",
                    )}
                  >
                    {r.studentAnswer}
                  </span>
                </span>
                <span className="text-slate-400">
                  정답 <span className="font-semibold text-slate-700">{r.correctAnswer}</span>
                </span>
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                chip.cls,
              )}
            >
              {chip.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
