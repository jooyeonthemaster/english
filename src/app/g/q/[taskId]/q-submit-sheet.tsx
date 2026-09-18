"use client";

// ============================================================================
// /g/q/[taskId] — 플레이어 하단 시트 2종 (gd-sheet 패턴, grammar-drill sheets 미러)
//
// QSubmitSheet: 제출 전 최종 확인. QUESTIONS 제출은 재응시 불가(서버 409
// 비가역)라 문항×내 선택 요약 그리드 + 다시 보기(플래그) 문항 강조 + 이중
// 확인 버튼으로 실수 제출을 막는다. 표시값은 내 입력 에코뿐 — 정답성 0(§6-1).
// QInstructionsSheet: 2번 문항부터 칩으로 축약되는 선생님 안내문의 전문 열람.
// 학생 노출 문구는 전부 합니다체.
// ============================================================================

import type { ReactNode } from "react";
import { Flag, X } from "lucide-react";
import { optionDisplayLabel } from "@/components/exams/paper-builder/option-display";
import type { StudentInput } from "@/lib/exam-scoring/types";
import type { QPlayerItem } from "./q-shared";

/** 선택 토큰("1".."N") → 시험지와 동일한 표시 라벨(①~, CUSTOM 만 저장 라벨) */
function choiceLabel(item: QPlayerItem, token: string): string {
  const index = Number(token) - 1;
  if (!Number.isInteger(index) || index < 0) return token;
  return optionDisplayLabel(item.question.subType, index, item.answerUi.optionLabels?.[index]);
}

/** 내 응답 요약 — 선택형은 선지 라벨, 서답형은 "입력함", 미응답 "—" */
function answerSummary(item: QPlayerItem, input: StudentInput | null | undefined): string {
  if (!input) return "—";
  if (typeof input.choice === "string" && input.choice) return choiceLabel(item, input.choice);
  if (Array.isArray(input.choices) && input.choices.length > 0) {
    return input.choices.map((token) => choiceLabel(item, token)).join(" ");
  }
  if (input.texts && Object.values(input.texts).some((t) => t?.trim())) return "입력함";
  return "—";
}

/** 하단 시트 공통 골격 — 백드롭 + 그립 + 타이틀/닫기 (sheets.tsx 패턴) */
function SheetShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <button type="button" aria-label="닫기" className="gd-sheet-backdrop" onClick={onClose} />
      <div className="gd-sheet gd-app" role="dialog" aria-modal="true" aria-label={title}>
        <div className="gd-sheet-grip" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <p className="gd-t-sm font-bold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-3)" }}
            aria-label="닫기"
          >
            <X className="h-4.5 w-4.5" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export function QSubmitSheet({
  open,
  items,
  inputs,
  flagged,
  submitting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  items: QPlayerItem[];
  inputs: Record<string, StudentInput | null>;
  flagged: ReadonlySet<string>;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  const summaries = items.map((it) => ({
    id: it.question.id,
    orderNum: it.orderNum,
    label: answerSummary(it, inputs[it.question.id]),
    isFlagged: flagged.has(it.question.id),
  }));
  const answeredCount = summaries.filter((s) => s.label !== "—").length;
  const flaggedCount = summaries.filter((s) => s.isFlagged).length;

  return (
    <SheetShell title="제출 전 마지막 확인" onClose={onClose}>
      <div className="gd-scroll min-h-0 flex-1 px-5 pb-3">
        <p className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
          총 {items.length}문항 중 <span className="gd-mono font-bold">{answeredCount}</span>
          문항에 답했습니다.
        </p>
        {flaggedCount > 0 && (
          <p
            className="gd-t-xs mt-1 flex items-center gap-1 font-semibold"
            style={{ color: "var(--gd-flag)" }}
          >
            <Flag
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              fill="var(--gd-flag)"
              aria-hidden
            />
            다시 보기로 표시한 문항 {flaggedCount}개가 있습니다.
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-1.5 md:grid-cols-4">
          {summaries.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-1 rounded-lg border px-2.5 py-1.5"
              style={
                s.isFlagged
                  ? { borderColor: "var(--gd-flag-line)", background: "var(--gd-flag-soft)" }
                  : { borderColor: "var(--gd-line)", background: "var(--gd-card)" }
              }
            >
              <span className="gd-mono gd-t-2xs font-semibold" style={{ color: "var(--gd-ink-3)" }}>
                {s.orderNum}
              </span>
              <span
                className="gd-t-xs min-w-0 truncate text-right font-bold"
                style={{ color: s.label === "—" ? "var(--gd-ink-3)" : "var(--gd-ink)" }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <p
          className="gd-t-xs mt-3 rounded-lg px-3 py-2 font-semibold leading-relaxed"
          style={{ background: "var(--gd-bad-soft)", color: "var(--gd-bad)" }}
        >
          제출하면 답을 수정할 수 없습니다.
        </p>
      </div>
      <div className="gd-hairline-t gd-safe-b flex shrink-0 gap-2 px-5 pt-3">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="gd-btn gd-btn-ghost flex-1 disabled:opacity-40"
        >
          다시 확인
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="gd-btn gd-btn-primary flex-[1.4]"
        >
          {submitting ? "제출 중…" : "최종 제출"}
        </button>
      </div>
    </SheetShell>
  );
}

/** 플레이어 안내문 블록 — 첫 문항은 전체 카드, 2번부터 12자 칩(탭 시 전문 시트) */
export function QInstructionsBlock({
  text,
  compact,
  onOpenSheet,
}: {
  text: string;
  compact: boolean;
  onOpenSheet: () => void;
}) {
  if (!compact) {
    return (
      <div
        className="mb-3 rounded-xl border px-3.5 py-2.5"
        style={{ borderColor: "var(--gd-blue-line)", background: "var(--gd-blue-soft)" }}
      >
        <p className="gd-label mb-0.5" style={{ color: "var(--gd-blue)" }}>
          선생님 안내
        </p>
        <p className="gd-t-sm whitespace-pre-wrap leading-relaxed">{text}</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpenSheet}
      aria-haspopup="dialog"
      className="mb-3 flex w-full items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-left"
      style={{ borderColor: "var(--gd-blue-line)", background: "var(--gd-blue-soft)" }}
    >
      <span className="gd-t-3xs shrink-0 font-semibold" style={{ color: "var(--gd-blue)" }}>
        선생님 안내
      </span>
      <span className="gd-t-2xs min-w-0 truncate" style={{ color: "var(--gd-ink-2)" }}>
        {text.length > 12 ? `${text.slice(0, 12)}…` : text}
      </span>
    </button>
  );
}

export function QInstructionsSheet({
  open,
  text,
  onClose,
}: {
  open: boolean;
  text: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <SheetShell title="선생님 안내" onClose={onClose}>
      <div className="gd-scroll gd-safe-b min-h-0 flex-1 px-5 pb-4">
        <p className="gd-t-sm whitespace-pre-wrap leading-relaxed">{text}</p>
      </div>
    </SheetShell>
  );
}
