"use client";

// ============================================================================
// 채점 검토 드로어 — 지면 응시 강사 대리입력(전 문항 OMR 그리드) (V4 소유)
//
// AnswerUiSpec 축(inputKind/optionCount/optionLabels/selectCount/answerFields)
// 으로 문항별 컴팩트 입력 위젯을 렌더한다(고정 5지 가정 금지 — 5~12 가변):
//  - SINGLE_CHOICE: ①~⑫ 토글 버튼(재클릭 = 선택 해제)
//  - MULTI_CHOICE : 복수 토글 + "N개 선택" 카운터
//  - TEXT_*       : answerFields 라벨별 input
//  - MANUAL_ONLY  : 자유 서술 textarea(제출 후 NEEDS_REVIEW 로 수동확정)
// 저장 = saveTeacherEntry(전 문항 일괄 — 비운 문항은 null 로 UNKNOWN 유지) 후
// 서버가 즉시 전체 채점한다. 선지 글리프·학생 답 텍스트만 EXAM_FONT.
// ============================================================================

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StudentInput } from "@/lib/exam-scoring/types";
import {
  saveTeacherEntry,
  type SubmissionMutationResult,
  type SubmissionReviewDetail,
  type SubmissionReviewQuestion,
} from "@/actions/exams/submission-review";
import { choiceIndexOf, CIRCLED_LABELS, EXAM_FONT } from "./shared";

// ── 로컬 드래프트 모델 ───────────────────────────────────────────────────────

interface EntryDraft {
  choice: string | null;
  choices: string[];
  texts: Record<string, string>;
}

/** 기존 저장 입력 → 드래프트. 선지 토큰은 숫자 토큰("1"..)으로 정규화해 보관. */
function draftFrom(q: SubmissionReviewQuestion): EntryDraft {
  const normalizeToken = (raw: string): string | null => {
    const index = choiceIndexOf(raw);
    return index == null ? null : String(index + 1);
  };
  const input = q.input;
  return {
    choice: input?.choice ? normalizeToken(input.choice) : null,
    choices: (input?.choices ?? [])
      .map(normalizeToken)
      .filter((t): t is string => t != null),
    texts: input?.texts ? { ...input.texts } : {},
  };
}

/** 대리입력 필드 정의 — answerFields 결손(MANUAL_ONLY 등) 시 단일 자유 필드 */
function fieldsOf(q: SubmissionReviewQuestion): { key: string; label: string }[] {
  if (q.answerFields && q.answerFields.length > 0) {
    return q.answerFields.map((f) => ({ key: f.key, label: f.label }));
  }
  return [{ key: "answer", label: "답안" }];
}

/** 드래프트 → 저장 입력. 전부 비어 있으면 null(미입력 = UNKNOWN 유지). */
function buildInput(q: SubmissionReviewQuestion, draft: EntryDraft): StudentInput | null {
  if (q.inputKind === "SINGLE_CHOICE") {
    return draft.choice ? { choice: draft.choice } : null;
  }
  if (q.inputKind === "MULTI_CHOICE") {
    return draft.choices.length > 0 ? { choices: [...draft.choices] } : null;
  }
  const texts: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft.texts)) {
    if (value.trim()) texts[key] = value;
  }
  return Object.keys(texts).length > 0 ? { texts } : null;
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

interface TeacherEntryProps {
  detail: SubmissionReviewDetail;
  busy: boolean;
  onSaved: (result: SubmissionMutationResult) => void;
  onCancel: () => void;
}

export function TeacherEntry({ detail, busy, onSaved, onCancel }: TeacherEntryProps) {
  const [drafts, setDrafts] = useState<Record<string, EntryDraft>>(() => {
    const initial: Record<string, EntryDraft> = {};
    for (const q of detail.questions) initial[q.questionId] = draftFrom(q);
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const enteredCount = useMemo(
    () =>
      detail.questions.filter((q) => {
        const draft = drafts[q.questionId];
        return draft ? buildInput(q, draft) != null : false;
      }).length,
    [detail.questions, drafts],
  );

  function patchDraft(questionId: string, patch: Partial<EntryDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? { choice: null, choices: [], texts: {} }), ...patch },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const entries: Record<string, StudentInput | null> = {};
      for (const q of detail.questions) {
        const draft = drafts[q.questionId];
        entries[q.questionId] = draft ? buildInput(q, draft) : null;
      }
      const result = await saveTeacherEntry(detail.submissionId, entries);
      if (!result.success) {
        toast.error(result.error ?? "답안 저장에 실패했습니다.");
        return;
      }
      onSaved(result);
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving;

  return (
    <div className="space-y-3">
      {detail.status === "IN_PROGRESS" && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          학생이 응시 중입니다. 대리입력을 저장하면 학생 화면의 답안을 덮어쓸 수
          있습니다.
        </p>
      )}

      <ul className="space-y-2">
        {detail.questions.map((q) => {
          const draft = drafts[q.questionId] ?? { choice: null, choices: [], texts: {} };
          return (
            <li
              key={q.questionId}
              className="rounded-xl border border-[#E5E8EB] bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700">
                  {q.orderNum}번
                </span>
                <span className="min-w-0 truncate text-xs font-medium text-[#8B95A1]">
                  {q.typeLabel}
                </span>
                <span className="whitespace-nowrap text-xs tabular-nums text-[#B0B8C1]">
                  {q.points}점
                </span>
                {q.inputKind === "MULTI_CHOICE" && (
                  <span className="ml-auto whitespace-nowrap text-xs font-medium text-[#3182F6] tabular-nums">
                    {draft.choices.length}/{q.selectCount ?? "?"}개 선택
                  </span>
                )}
              </div>

              {q.brief && (
                <p
                  className="mt-1.5 truncate text-xs text-[#8B95A1]"
                  title={q.brief}
                  style={{ fontFamily: EXAM_FONT }}
                >
                  {q.brief}
                </p>
              )}

              <div className="mt-2.5">
                <EntryWidget
                  q={q}
                  draft={draft}
                  disabled={disabled}
                  onPatch={(patch) => patchDraft(q.questionId, patch)}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* 저장 바 */}
      <div className="sticky bottom-0 -mx-1 flex items-center gap-2 border-t border-[#E5E8EB] bg-white px-1 py-3">
        <p className="text-sm tabular-nums text-[#6B7684]">
          입력 {enteredCount}/{detail.questions.length}문항
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            disabled={disabled}
            onClick={onCancel}
            className="h-11 border-[#E5E8EB] px-4 text-[#4E5968]"
          >
            취소
          </Button>
          <Button
            disabled={disabled}
            onClick={() => void handleSave()}
            className="h-11 bg-[#3182F6] px-5 text-white hover:bg-[#1B64DA]"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            저장 후 채점
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 입력 위젯(문항 1개) ──────────────────────────────────────────────────────

interface EntryWidgetProps {
  q: SubmissionReviewQuestion;
  draft: EntryDraft;
  disabled: boolean;
  onPatch: (patch: Partial<EntryDraft>) => void;
}

function EntryWidget({ q, draft, disabled, onPatch }: EntryWidgetProps) {
  if (q.inputKind === "SINGLE_CHOICE" || q.inputKind === "MULTI_CHOICE") {
    const count = q.optionCount ?? q.optionLabels?.length ?? 5;
    const labels =
      q.optionLabels && q.optionLabels.length >= count
        ? q.optionLabels
        : CIRCLED_LABELS.slice(0, count);
    const multi = q.inputKind === "MULTI_CHOICE";
    const selectedIndexes = new Set(
      (multi ? draft.choices : draft.choice ? [draft.choice] : [])
        .map(choiceIndexOf)
        .filter((i): i is number => i != null),
    );

    return (
      <div className="flex flex-wrap gap-1.5">
        {labels.slice(0, count).map((label, index) => {
          const token = String(index + 1);
          const selected = selectedIndexes.has(index);
          return (
            <button
              key={token}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`${q.orderNum}번 문항 ${index + 1}번 선지`}
              onClick={() => {
                if (multi) {
                  const next = new Set(selectedIndexes);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  onPatch({
                    choices: [...next].sort((a, b) => a - b).map((i) => String(i + 1)),
                  });
                } else {
                  onPatch({ choice: selected ? null : token });
                }
              }}
              className={cn(
                "h-11 min-w-11 rounded-md border px-2 text-lg font-medium transition-colors",
                selected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                disabled && "cursor-default opacity-60 hover:bg-white",
              )}
              style={{ fontFamily: EXAM_FONT }}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  const fields = fieldsOf(q);

  if (q.inputKind === "MANUAL_ONLY") {
    const key = fields[0].key;
    return (
      <div className="space-y-1.5">
        <Textarea
          value={draft.texts[key] ?? ""}
          disabled={disabled}
          rows={2}
          maxLength={4000}
          placeholder="학생 답안을 그대로 입력해 주세요"
          onChange={(e) => onPatch({ texts: { ...draft.texts, [key]: e.target.value } })}
          className="min-h-11 bg-white text-sm"
          style={{ fontFamily: EXAM_FONT }}
        />
        <p className="text-[11px] text-[#8B95A1]">
          {q.manualReason
            ? `수동 채점 문항(${q.manualReason}) — 저장 후 판정 확정이 필요합니다.`
            : "수동 채점 문항입니다. 저장 후 판정 확정이 필요합니다."}
        </p>
      </div>
    );
  }

  // TEXT_SINGLE / TEXT_MULTI — 필드 라벨별 input
  return (
    <div className="space-y-1.5">
      {fields.map((field) => (
        <div key={field.key} className="flex items-center gap-2">
          {fields.length > 1 && (
            <span className="w-10 shrink-0 text-xs font-medium text-[#6B7684]">
              {field.label}
            </span>
          )}
          <Input
            value={draft.texts[field.key] ?? ""}
            disabled={disabled}
            maxLength={4000}
            placeholder="학생 답안 입력"
            onChange={(e) =>
              onPatch({ texts: { ...draft.texts, [field.key]: e.target.value } })
            }
            className="h-11 bg-white text-sm"
            style={{ fontFamily: EXAM_FONT }}
          />
        </div>
      ))}
    </div>
  );
}
