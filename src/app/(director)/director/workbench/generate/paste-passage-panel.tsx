"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardPaste,
  Loader2,
  X,
  Info,
  AlertTriangle,
  RotateCcw,
  Undo2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { countWords } from "./generate-page-types";
import { detectProblemFormArtifacts } from "@/lib/passage-source";

/** Minimum characters before a pasted passage is considered usable. */
const MIN_CONTENT_CHARS = 20;

interface RestorationChange {
  before: string;
  after: string;
  type: string;
  reason: string;
}
interface RestorationResult {
  restoredText: string;
  status: "RESTORED" | "PARTIAL" | "NO_RESTORATION_NEEDED" | "FAILED";
  changes: RestorationChange[];
  warnings: string[];
}

const STATUS_META: Record<
  RestorationResult["status"],
  { label: string; className: string }
> = {
  RESTORED: { label: "복원 완료", className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  NO_RESTORATION_NEEDED: { label: "복원 불필요 (이미 깨끗함)", className: "text-slate-600 bg-slate-50 border-slate-200" },
  PARTIAL: { label: "부분 복원 · 검토 권장", className: "text-blue-700 bg-blue-50 border-blue-200" },
  FAILED: { label: "복원 실패 · 직접 정리 필요", className: "text-red-700 bg-red-50 border-red-200" },
};

interface PastePassagePanelProps {
  /** Submit the (possibly restored) passage. Parent persists + selects it. */
  onSubmit: (title: string, content: string) => void;
  /** Close the panel and return to the passage card list. */
  onCancel: () => void;
  /** True while the parent is persisting the passage / refreshing the list. */
  saving: boolean;
}

export function PastePassagePanel({
  onSubmit,
  onCancel,
  saving,
}: PastePassagePanelProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  // Restore flow
  const [restoring, setRestoring] = useState(false);
  const [restoration, setRestoration] = useState<RestorationResult | null>(null);
  // The pre-restore text, so the user can revert after reviewing.
  const [preRestoreContent, setPreRestoreContent] = useState<string | null>(null);

  const trimmed = content.trim();
  const wordCount = useMemo(() => (trimmed ? countWords(trimmed) : 0), [trimmed]);
  const charCount = trimmed.length;
  const tooShort = charCount > 0 && charCount < MIN_CONTENT_CHARS;
  const canProceed = charCount >= MIN_CONTENT_CHARS && !saving && !restoring;

  const detection = useMemo(() => detectProblemFormArtifacts(content), [content]);
  const inReview = restoration !== null;
  const busy = saving || restoring;

  const handleRestore = async () => {
    if (!canProceed) return;
    setRestoring(true);
    try {
      const res = await fetch("/api/workbench/restore-passage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          passageText: trimmed,
          answerKey: answerKey.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "복원에 실패했습니다.");
        return;
      }
      setPreRestoreContent(content);
      setContent(data.restoredText || trimmed);
      setRestoration({
        restoredText: data.restoredText || "",
        status: data.status || "PARTIAL",
        changes: Array.isArray(data.changes) ? data.changes : [],
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      });
      if (data.degraded) {
        toast.warning("AI 복원에 실패해 마커 제거만 적용했습니다.");
      } else {
        toast.success("복원본을 확인하고 필요하면 수정한 뒤 등록하세요.");
      }
    } catch {
      toast.error("복원 요청 중 오류가 발생했습니다.");
    } finally {
      setRestoring(false);
    }
  };

  const handleRevert = () => {
    if (preRestoreContent !== null) setContent(preRestoreContent);
    setRestoration(null);
    setPreRestoreContent(null);
  };

  const handleSubmit = () => {
    if (charCount < MIN_CONTENT_CHARS || busy) return;
    onSubmit(title.trim(), trimmed);
  };

  return (
    <div className="flex flex-col h-full min-h-0 px-5 py-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <ClipboardPaste className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-slate-800">지문 직접 붙여넣기</h3>
            <p className="text-[12px] text-slate-500 leading-relaxed mt-0.5">
              분석·추출 단계 없이 지문을 바로 붙여넣어 문제를 생성합니다.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 disabled:opacity-50 transition-colors shrink-0"
          title="목록으로 돌아가기"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Single-passage guidance */}
      <div className="mt-3 shrink-0 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
        <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span className="text-[12px] font-medium text-blue-700">
          지문은 한 번에 <b>하나만</b> 입력하세요. 여러 지문을 붙여넣으면 한 지문으로 합쳐집니다.
        </span>
      </div>

      {/* Title */}
      <div className="mt-3 shrink-0">
        <label htmlFor="paste-title" className="text-[12px] font-medium text-slate-600 mb-1.5 block">
          제목{" "}
          <span className="text-[11px] text-slate-400 font-normal">(비워두면 본문에서 자동 생성)</span>
        </label>
        <input
          id="paste-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          placeholder="예: Lesson 3 - The Power of Music"
          className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50/80 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 transition-all disabled:opacity-50"
        />
      </div>

      {/* Content */}
      <div className="mt-3 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-1.5 shrink-0">
          <label htmlFor="paste-content" className="text-[12px] font-medium text-slate-600">
            {inReview ? "복원된 지문 (수정 가능)" : "지문 내용"} <span className="text-red-500">*</span>
          </label>
          {wordCount > 0 && (
            <span className="text-[11px] text-slate-500 tabular-nums">
              {wordCount} words · {charCount.toLocaleString()}자
            </span>
          )}
        </div>
        <Textarea
          id="paste-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={busy}
          placeholder={"여기에 영어 지문을 붙여넣으세요...\n\n빈칸·어법 오류·선지 마커가 섞인 '문제 형태' 지문이면 'AI 복원'으로 원문을 복구할 수 있습니다."}
          className="flex-1 min-h-[160px] resize-none text-[13px] leading-relaxed border-slate-200 bg-white placeholder:text-slate-300"
        />

        {/* Problem-form detection banner (edit phase only) */}
        {!inReview && detection.hasArtifacts && charCount > 0 && (
          <div className="mt-2 shrink-0 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-[12px] text-blue-700 leading-relaxed">
              <b>문제 형태 흔적이 감지됐어요</b> ({detection.hints.join(", ")}). 분석·문제 생성은 완성된 원문을 전제로 하므로,
              <b> AI 복원</b>으로 원문을 복구한 뒤 진행하는 걸 권장합니다.
            </div>
          </div>
        )}
        {tooShort && (
          <p className="text-[11px] text-red-500 mt-2 shrink-0">
            지문이 너무 짧습니다. 최소 {MIN_CONTENT_CHARS}자 이상 입력해주세요.
          </p>
        )}
      </div>

      {/* Optional answer key / questions (edit phase) */}
      {!inReview && (
        <div className="mt-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowAnswerKey((v) => !v)}
            disabled={busy}
            aria-expanded={showAnswerKey}
            aria-controls="paste-answer-key"
            className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
          >
            {showAnswerKey ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            정답 · 문항 추가{" "}
            <span className="text-[11px] text-slate-400 font-normal">(선택 · 복원 정확도 향상)</span>
          </button>
          {showAnswerKey && (
            <Textarea
              id="paste-answer-key"
              value={answerKey}
              onChange={(e) => setAnswerKey(e.target.value)}
              disabled={busy}
              placeholder={"빈칸 정답, 어법 정답, 문항/선지 등을 붙여넣으면 빈칸·어법을 더 정확히 복원합니다.\n예: 1. ③  2. were → was  빈칸: protect"}
              className="mt-1.5 min-h-[64px] max-h-[120px] resize-none text-[12px] leading-relaxed border-slate-200 bg-white placeholder:text-slate-300"
            />
          )}
        </div>
      )}

      {/* Restoration review summary */}
      {inReview && restoration && (
        <div className="mt-3 shrink-0 rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200/70">
            {(() => {
              const meta = STATUS_META[restoration.status] ?? STATUS_META.PARTIAL;
              return (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${meta.className}`}>
                  {meta.label}
                </span>
              );
            })()}
            <span className="text-[11px] text-slate-500">복원 내역 {restoration.changes.length}건</span>
            <span className="text-[10px] text-slate-400 ml-auto">AI 복원 기준 · 이후 직접 수정분은 미반영</span>
          </div>
          <div className="max-h-[120px] overflow-y-auto px-3 py-2 space-y-1.5">
            {restoration.warnings.map((w, i) => (
              <p key={`w-${i}`} className="flex items-start gap-1.5 text-[11px] text-red-600">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                {w}
              </p>
            ))}
            {restoration.changes.length === 0 && restoration.warnings.length === 0 ? (
              <p className="text-[11px] text-slate-400">변경 내역이 없습니다.</p>
            ) : (
              restoration.changes.map((c, i) => {
                // The model reliably reports WHICH fragment changed (`before`) but doesn't
                // always emit the corrected text in `after`. So:
                //  • after present            → before → after
                //  • after empty + removal    → before (삭제)   (e.g. irrelevant sentence dropped)
                //  • after empty + correction → before "수정됨"  (the fixed word is in the restored
                //    text the user is reviewing; reason usually explains it)
                const isCorrection =
                  c.type === "GRAMMAR" || c.type === "VOCAB" || c.type === "BLANK" || c.type === "WORD_ORDER";
                return (
                  <div key={`c-${i}`} className="text-[11px] leading-relaxed">
                    <span className="inline-block text-[9px] font-semibold text-slate-500 bg-white border border-slate-200 rounded px-1 mr-1 align-middle">
                      {c.type}
                    </span>
                    <span className="text-slate-400 line-through">{c.before || "(없음)"}</span>
                    {c.after ? (
                      <>
                        <span className="text-slate-400 mx-1">→</span>
                        <span className="text-slate-700 font-medium">{c.after}</span>
                      </>
                    ) : isCorrection ? (
                      <span className="text-emerald-600 font-medium ml-1">수정됨</span>
                    ) : (
                      <span className="text-slate-400 ml-1">(삭제)</span>
                    )}
                    {c.reason && <span className="text-slate-400"> · {c.reason}</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 shrink-0 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          className="h-9 text-[13px] text-slate-500 hover:text-slate-700"
        >
          취소
        </Button>

        <div className="flex items-center gap-2">
          {inReview ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevert}
                disabled={busy}
                className="h-9 text-[13px] border-slate-200 text-slate-600"
              >
                <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                원본으로 되돌리기
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={charCount < MIN_CONTENT_CHARS || busy}
                className="h-9 text-[13px] bg-blue-600 hover:bg-blue-700 rounded-lg px-4"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    등록 중...
                  </>
                ) : (
                  <>
                    <ClipboardPaste className="w-4 h-4 mr-1.5" />
                    이 지문 등록하고 선택
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSubmit}
                disabled={!canProceed}
                title={
                  detection.hasArtifacts
                    ? "문제 형태가 감지됐습니다. 빈칸·마커가 그대로 저장돼 분석/생성 품질이 떨어질 수 있습니다."
                    : undefined
                }
                className={`h-9 text-[13px] rounded-lg ${
                  detection.hasArtifacts
                    ? "border-red-200 text-red-600 hover:bg-red-50"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                복원 없이 바로 등록
              </Button>
              <Button
                size="sm"
                onClick={handleRestore}
                disabled={!canProceed}
                className="h-9 text-[13px] bg-blue-600 hover:bg-blue-700 rounded-lg px-4"
              >
                {restoring ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    복원 중...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 mr-1.5" />
                    AI 복원
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* "복원 없이" consequence note (edit phase, artifacts present) */}
      {!inReview && detection.hasArtifacts && charCount >= MIN_CONTENT_CHARS && (
        <p className="mt-2 shrink-0 text-[11px] text-red-500 text-right">
          ‘복원 없이 바로 등록’ 시 빈칸·오류·마커가 그대로 저장돼 분석·문제 생성 결과가 어긋날 수 있습니다.
        </p>
      )}
    </div>
  );
}
