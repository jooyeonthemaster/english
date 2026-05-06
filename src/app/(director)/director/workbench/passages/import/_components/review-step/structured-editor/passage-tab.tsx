"use client";

// ============================================================================
// PassageTab — structured editor tab for PASSAGE_BODY blocks.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { MIN_COMMIT_PASSAGE_LENGTH } from "@/lib/extraction/constants";
import type { BlockType } from "@/lib/extraction/block-types";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import { cn } from "@/lib/utils";
import type { M2PassageDraftSnapshot } from "../types";
import {
  BlockActions,
  BlockHeader,
  EmptyEditor,
  TypeSwitcher,
} from "./shared-pieces";

export function PassageTab({
  item,
  m2Draft,
  onChangeContent,
  onChangeTitle,
  onChangeType,
  onSplit,
  onMergeWithNext,
  onSkipToggle,
}: {
  item: ExtractionItemSnapshot | null;
  m2Draft?: M2PassageDraftSnapshot | null;
  onChangeContent: (id: string, content: string) => void;
  onChangeTitle: (id: string, title: string) => void;
  onChangeType: (id: string, type: BlockType) => void;
  onSplit: (id: string, caret: number) => void;
  onMergeWithNext: (id: string) => void;
  onSkipToggle: (id: string) => void;
}) {
  const [caret, setCaret] = useState(0);
  const [viewMode, setViewMode] = useState<"restored" | "block">("restored");

  if (!item) {
    return (
      <EmptyEditor hint="왼쪽 블록 트리에서 지문(PASSAGE_BODY)을 선택해 주세요." />
    );
  }

  const tooShort = item.content.trim().length < MIN_COMMIT_PASSAGE_LENGTH;
  const isSkipped = item.status === "SKIPPED";
  const restoredText = m2Draft?.teacherText || m2Draft?.restoredText || "";
  const hasRestoredText = restoredText.trim().length > 0;
  const displayedText =
    viewMode === "restored" && hasRestoredText ? restoredText : item.content;
  const bestMatch = m2Draft?.sourceMatches[0] ?? null;
  const verification = getVerificationTone(m2Draft?.verificationStatus ?? null);

  return (
    <>
      <BlockHeader
        item={item}
        onChangeTitle={(t) => onChangeTitle(item.id, t)}
      />
      <TypeSwitcher
        selected={item.blockType}
        onChange={(t) => onChangeType(item.id, t)}
      />
      {m2Draft ? (
        <div className="border-b border-sky-100 bg-sky-50/70 px-5 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {verification.tone === "danger" ? (
                <AlertTriangle
                  className="size-4 text-rose-600"
                  strokeWidth={1.8}
                />
              ) : (
                <CheckCircle2
                  className={cn(
                    "size-4",
                    verification.tone === "ok"
                      ? "text-emerald-600"
                      : "text-amber-600",
                  )}
                  strokeWidth={1.8}
                />
              )}
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-slate-800">
                  M2 원문 복원 Draft
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge label="복원 완료" tone="ok" />
                  <StatusBadge
                    label={verification.label}
                    tone={verification.tone}
                  />
                  {bestMatch ? (
                    <StatusBadge
                      label={`DB 매칭 ${formatConfidence(bestMatch.confidence)}`}
                      tone="ok"
                    />
                  ) : null}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={!hasRestoredText || isSkipped}
              onClick={() => onChangeContent(item.id, restoredText)}
              className="rounded-md bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              복원문 적용
            </button>
          </div>
          <div className="mb-2 flex rounded-md border border-sky-100 bg-white p-0.5">
            <ModeButton
              active={viewMode === "restored"}
              onClick={() => setViewMode("restored")}
            >
              복원문
            </ModeButton>
            <ModeButton
              active={viewMode === "block"}
              onClick={() => setViewMode("block")}
            >
              현재 블록
            </ModeButton>
          </div>
          {bestMatch ? (
            <div className="mb-2 rounded-md border border-sky-100 bg-white px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-slate-700">
                    출처 매칭: {bestMatch.title ?? "제목 없음"}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">
                    {[bestMatch.publisher, bestMatch.unit, bestMatch.year]
                      .filter(Boolean)
                      .join(" · ") ||
                      bestMatch.reason ||
                      bestMatch.method}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  {bestMatch.selected ? "선택됨" : "후보"}
                </span>
              </div>
            </div>
          ) : null}
          <div className="max-h-40 overflow-auto rounded-md border border-sky-100 bg-white px-3 py-2">
            {viewMode === "restored" && m2Draft.sentences.length > 0 ? (
              <ol className="space-y-1.5">
                {m2Draft.sentences.map((sentence) => (
                  <li
                    key={sentence.id}
                    className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 text-[12px] leading-5"
                  >
                    <span className="text-right font-semibold text-slate-400">
                      {sentence.order}.
                    </span>
                    <span className="text-slate-800">
                      {sentence.restoredText}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="whitespace-pre-wrap text-[12px] leading-5 text-slate-700">
                {displayedText || "표시할 지문이 없습니다."}
              </p>
            )}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        <textarea
          value={item.content}
          onChange={(e) => onChangeContent(item.id, e.target.value)}
          onSelect={(e) =>
            setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)
          }
          disabled={isSkipped}
          className="h-full w-full resize-none border-none bg-white px-5 py-4 text-[13px] leading-relaxed text-slate-800 outline-none focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          placeholder="추출된 원문을 확인하세요."
          spellCheck={false}
          aria-label="지문 본문 편집"
        />
      </div>
      {tooShort ? (
        <div className="flex items-center gap-2 border-t border-sky-200 bg-sky-50 px-5 py-2 text-[11px] text-sky-800">
          <FileText className="size-3.5" strokeWidth={1.8} />
          {MIN_COMMIT_PASSAGE_LENGTH}자 이상이어야 저장할 수 있습니다.
        </div>
      ) : null}
      <BlockActions
        onSplit={() => onSplit(item.id, caret)}
        canSplit={caret > 0 && caret < item.content.length}
        onMergeWithNext={() => onMergeWithNext(item.id)}
        onSkipToggle={() => onSkipToggle(item.id)}
        isSkipped={isSkipped}
      />
    </>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "danger";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold",
        tone === "ok"
          ? "bg-emerald-50 text-emerald-700"
          : tone === "warn"
            ? "bg-amber-50 text-amber-700"
            : "bg-rose-50 text-rose-700",
      )}
    >
      {label}
    </span>
  );
}

function getVerificationTone(status: string | null): {
  label: string;
  tone: "ok" | "warn" | "danger";
} {
  if (status === "PASS") return { label: "검증 통과", tone: "ok" };
  if (status === "WARN") return { label: "검증 경고", tone: "warn" };
  if (status === "FAIL") return { label: "검증 실패", tone: "danger" };
  return { label: status ?? "검증 대기", tone: "warn" };
}

function formatConfidence(value: number | null): string {
  if (typeof value !== "number") return "-";
  return `${Math.round(value * 100)}%`;
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded px-2 py-1 text-[11px] font-bold transition-colors",
        active
          ? "bg-sky-100 text-sky-700"
          : "text-slate-500 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}
