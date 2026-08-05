"use client";

// ============================================================================
// 오답 원본 보기 — 「이 학생이 실제로 틀린 그 문항」을 문제 은행과 같은 UI 로.
//
// 변형 생성 워크스페이스에서 지문 행 옆의 버튼으로 연다. 여기서 확인하는 것은
// 딱 두 가지다: (1) 원본 문항이 실제로 어떻게 생겼는가, (2) 학생이 무엇을 골랐고
// 정답은 무엇이었는가. 그래서 카드 렌더러는 문제 은행 정본(QuestionCard)을 그대로
// 쓰고, 그 위에 학생 답 → 정답 대조 바를 얹는다.
//
// 시드(sessionStorage)에는 텍스트 요약만 있어 카드 렌더에는 부족하다 —
// questionId 로 원본을 되짚어 온다(getQuestionCardsByIds). 원본이 삭제됐거나
// 스코프 밖이면 조용히 비우지 않고 시드에 남은 텍스트로 강등 렌더한다.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Wand2 } from "lucide-react";

import { WideModal } from "@/components/layout/wide-modal";
import { QuestionCard, type QuestionCardItem } from "@/components/workbench/question-card";
import {
  getQuestionCardsByIds,
  type QuestionCardRow,
} from "@/actions/workbench/question-cards";
import { VARIANT_COPY } from "@/lib/wording/director-glossary";
import {
  parseChoiceOptions,
  resolveChoiceDisplay,
  type VariantChoiceOption,
  type VariantSeedQuestion,
} from "@/lib/question-variant";
import { cn } from "@/lib/utils";

/** 서버 행(createdAt: ISO) → 카드 계약(createdAt: Date) */
function toCardItem(row: QuestionCardRow): QuestionCardItem {
  return {
    id: row.id,
    type: row.type,
    subType: row.subType,
    questionText: row.questionText,
    options: row.options,
    correctAnswer: row.correctAnswer,
    difficulty: row.difficulty,
    tags: row.tags,
    aiGenerated: row.aiGenerated,
    approved: row.approved,
    createdAt: new Date(row.createdAt),
    passage: row.passage,
    explanation: row.explanation,
    structuredData: row.structuredData,
    setId: row.setId,
  };
}

/**
 * 학생 답 → 정답 대조 바. 카드 위에 항상 붙는다 — 이 모달을 여는 이유가
 * 「무엇을 틀렸는가」이므로 카드를 스크롤해 찾게 두지 않는다.
 *
 * 표기는 **원본 문항의 선지 목록으로 확정**한다. 시드에 실려 온 토큰은 저장소마다
 * 축이 달라("3" / "(D)" / "④") 그대로 쓰면 바로 아래 카드가 그리는 원형숫자와
 * 매칭되지 않는다(2026-07-26 실측). 옵션을 못 읽는 문항(서술형 등)만 원문 폴백.
 */
function VerdictBar({
  q,
  options,
}: {
  q: VariantSeedQuestion;
  options: VariantChoiceOption[];
}) {
  const studentText = resolveChoiceDisplay(q.studentText, options);
  const correctText = resolveChoiceDisplay(q.correctText, options);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-[13px] font-bold text-slate-800">{q.orderLabel}</span>
      <span className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-slate-600 ring-1 ring-slate-200">
        {q.typeLabel}
      </span>
      {studentText ? (
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <span className="text-[12px] text-slate-500">학생 답</span>
          <span className="font-bold text-rose-600" title={q.studentText ?? undefined}>
            {studentText}
          </span>
        </span>
      ) : null}
      {correctText ? (
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <span className="text-[12px] text-slate-500">정답</span>
          <span className="font-bold text-emerald-700" title={q.correctText ?? undefined}>
            {correctText}
          </span>
        </span>
      ) : null}
      {q.keyPoints && q.keyPoints.length > 0 ? (
        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
          출제 포인트 · {q.keyPoints.join(" / ")}
        </span>
      ) : null}
    </div>
  );
}

/** 원본을 못 불러왔을 때 — 시드에 남은 텍스트로 강등 렌더(빈 화면 금지) */
function FallbackCard({ q, reason }: { q: VariantSeedQuestion; reason: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500">
        <AlertTriangle className="size-3.5 text-slate-400" aria-hidden />
        {reason}
      </p>
      {q.questionText ? (
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700">
          {q.questionText}
        </p>
      ) : (
        <p className="text-[13px] text-slate-400">저장된 발문이 없습니다.</p>
      )}
    </div>
  );
}

export function VariantSourceModal({
  open,
  sources,
  studentName,
  examTitle,
  onClose,
}: {
  open: boolean;
  /** 이 지문에 걸린 오답 문항들(시드 기준, 표시 순서 보존) */
  sources: VariantSeedQuestion[];
  studentName?: string | null;
  examTitle?: string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<QuestionCardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ids = sources.map((q) => q.questionId).join(",");

  const load = useCallback(async () => {
    if (!ids) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getQuestionCardsByIds(ids.split(","));
    if (res.success) setRows(res.data);
    else {
      setRows([]);
      setError(res.error);
    }
    setLoading(false);
  }, [ids]);

  useEffect(() => {
    if (!open) return;
    // 모달을 열 때마다 새로 읽는다 — 원본이 그 사이 수정·삭제됐을 수 있다
    void load();
  }, [open, load]);

  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const subtitle = [studentName, examTitle].filter(Boolean).join(" · ");

  return (
    <WideModal
      open={open}
      onClose={onClose}
      icon={Wand2}
      title={VARIANT_COPY.SOURCE_MODAL_TITLE}
      description={subtitle || undefined}
      maxWidthClassName="max-w-[min(1280px,94vw)]"
      bodyClassName="p-0"
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-slate-400">{VARIANT_COPY.SOURCE_MODAL_HINT}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
      }
    >
      <div
        className={cn(
          "flex max-h-[min(78vh,880px)] min-h-[280px] flex-col gap-4 overflow-y-auto p-4 sm:p-5",
        )}
      >
        {loading && rows === null ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-400">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            원본 문항을 불러오는 중입니다
          </div>
        ) : null}

        {error ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 py-10">
            <p className="text-[13px] text-slate-500">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="h-8 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {rows !== null && sources.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-slate-400">
            이 지문에 연결된 오답 문항이 없습니다.
          </p>
        ) : null}

        {rows !== null
          ? sources.map((q, idx) => {
              const row = byId.get(q.questionId);
              return (
                <section key={q.questionId} className="flex flex-col gap-2">
                  <VerdictBar q={q} options={parseChoiceOptions(row?.options)} />
                  {row ? (
                    <QuestionCard
                      q={toCardItem(row)}
                      num={idx + 1}
                      readonly
                      hideReviewStatusStamp
                      suppressUnapprovedBorder
                      answerReveal="show-all"
                      passageDefaultOpen
                    />
                  ) : (
                    <FallbackCard
                      q={q}
                      reason="원본 문항이 삭제되었거나 열람 권한이 없어 저장된 요약만 표시합니다."
                    />
                  )}
                </section>
              );
            })
          : null}
      </div>
    </WideModal>
  );
}
