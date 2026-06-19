"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CornerDownLeft,
  FilePlus2,
  Loader2,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import { getEditFocusPresets } from "@/lib/question-ai-edit/focus-presets";
import { QUESTION_TYPE_META } from "@/lib/question-schemas";

import { useQuestionAiEdit, type EditChange } from "./use-question-ai-edit";

const CHANGE_STYLE: Record<EditChange["kind"], { cls: string; verb: string }> = {
  added: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", verb: "추가" },
  removed: { cls: "bg-rose-50 text-rose-700 border-rose-200", verb: "삭제" },
  changed: { cls: "bg-blue-50 text-blue-700 border-blue-200", verb: "수정" },
  reordered: { cls: "bg-violet-50 text-violet-700 border-violet-200", verb: "순서" },
};

interface Props {
  questionId: string;
  open: boolean;
  onClose: () => void;
  /** 적용(덮어쓰기) 성공 후 — 편집 폼 새로고침. */
  onApplied?: () => void;
}

export function AiEditOverlay({ questionId, open, onClose, onApplied }: Props) {
  if (!open) return null;
  return (
    <AiEditOverlayInner
      questionId={questionId}
      onClose={onClose}
      onApplied={onApplied}
    />
  );
}

function AiEditOverlayInner({ questionId, onClose, onApplied }: Omit<Props, "open">) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    loading,
    context,
    loadError,
    versions,
    activeIndex,
    selectVersion,
    activeVersion,
    sending,
    sendError,
    creditsRemaining,
    applying,
    savingAsNew,
    activeVersionSaved,
    submit,
    apply,
    saveAsNew,
  } = useQuestionAiEdit({
    questionId,
    onApplied: () => {
      toast.success("수정본을 현재 문제에 적용했습니다.");
      onApplied?.();
      onClose();
    },
    onSavedAsNew: () => {
      toast.success("수정본을 새 문제로 저장했습니다.");
    },
  });

  // ESC 로 닫기.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending && !applying && !savingAsNew) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending, applying, savingAsNew]);

  // 모달 동안 배경 스크롤 잠금(프로젝트의 다른 모달과 동일 패턴).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 로드 완료 후 입력란에 초기 포커스 — 채팅형 즉시 타이핑.
  useEffect(() => {
    if (!loading && !loadError) {
      const t = setTimeout(() => textareaRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [loading, loadError]);

  const subType = context?.subType;
  const typeLabel =
    (subType && QUESTION_TYPE_META[subType]?.label) || subType || "";
  const presets = subType ? getEditFocusPresets(subType) : [];

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await submit(text);
  }

  function applyPreset(instruction: string) {
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${instruction}` : instruction));
    textareaRef.current?.focus();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5">
      <div
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        onClick={() => !sending && !applying && !savingAsNew && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-edit-title"
        className="relative flex h-[94vh] w-[97vw] max-w-[1480px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span
                id="ai-edit-title"
                className="text-[16px] font-bold leading-tight tracking-tight text-slate-900"
              >
                AI 문제 수정
              </span>
              <span className="text-[11.5px] font-medium text-slate-500">
                자연어로 지시하면 선지·정답·해설까지 유형에 맞춰 다시 만들어 드립니다
              </span>
            </div>
            {typeLabel && (
              <span className="ml-1 inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[12px] font-semibold text-blue-700">
                {typeLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-medium text-slate-600">
              수정 1회 = 1크레딧
              {creditsRemaining != null && (
                <span className="font-semibold text-slate-900">· 잔여 {creditsRemaining}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => !sending && !applying && !savingAsNew && onClose()}
              aria-label="닫기"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Before / After (좁은 화면: 세로 스택, lg↑: 좌우) ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {loading ? (
            <div className="flex w-full items-center justify-center text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 문제를 불러오는 중…
            </div>
          ) : loadError ? (
            <div className="flex w-full items-center justify-center px-6 text-center text-rose-600">
              {loadError}
            </div>
          ) : (
            <>
              {/* LEFT — 기존 문제 */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
                <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-2">
                  <span className="text-[12.5px] font-bold text-slate-600">기존 문제</span>
                  <span className="text-[11px] text-slate-400">원본 — 변경되지 않습니다</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/30 px-5 py-4">
                  {context?.before && (
                    <StructuredQuestionRenderer
                      question={context.before}
                      index={0}
                      sourcePassageContent={context.passageContent}
                      answerRevealMode="show-all"
                    />
                  )}
                </div>
              </div>

              {/* center arrow (lg↑ 가로, 좁은 화면 숨김) */}
              <div className="relative hidden w-0 items-center justify-center lg:flex">
                <div className="absolute flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-blue-600 shadow-sm">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>

              {/* RIGHT — AI 수정본 */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-blue-50/60 px-5 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-bold text-blue-700">AI 수정본</span>
                    {activeVersion && (
                      <span className="text-[11px] text-blue-500">
                        v{activeIndex + 1} / {versions.length}
                      </span>
                    )}
                  </div>
                  {versions.length > 1 && (
                    <div className="flex items-center gap-1">
                      {versions.map((v, i) => (
                        <button
                          key={v.id}
                          onClick={() => selectVersion(i)}
                          title={v.instruction}
                          className={`h-6 min-w-6 rounded-md px-1.5 text-[11px] font-semibold transition-colors ${
                            i === activeIndex
                              ? "bg-blue-600 text-white"
                              : "bg-white text-blue-600 ring-1 ring-blue-200 hover:bg-blue-50"
                          }`}
                        >
                          v{i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {sending && !activeVersion ? (
                    <SkeletonAfter />
                  ) : activeVersion ? (
                    <div className="space-y-3">
                      {sending && (
                        <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[12px] font-medium text-blue-600">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 다음 수정본 생성 중…
                        </div>
                      )}
                      {/* 변경 요약 칩 */}
                      {activeVersion.changes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-500">변경:</span>
                          {activeVersion.changes.map((c, i) => {
                            const s = CHANGE_STYLE[c.kind];
                            return (
                              <span
                                key={`${c.field}-${i}`}
                                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${s.cls}`}
                              >
                                {c.label}
                                <span className="opacity-70">{s.verb}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {/* 품질 점검(경고) — 회사 디자인 가드: 주황/앰버 금지 → slate/blue */}
                      {activeVersion.warnings.length > 0 && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-700">
                            <TriangleAlert className="h-3.5 w-3.5 text-blue-600" />
                            품질 점검 {activeVersion.acceptedWithWarnings ? "(경고와 함께 수락됨 — 검토 권장)" : ""}
                          </div>
                          <ul className="list-disc pl-5 text-[11px] text-slate-600">
                            {activeVersion.warnings.slice(0, 4).map((w, i) => (
                              <li key={i}>{w.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <StructuredQuestionRenderer
                        question={activeVersion.after}
                        index={0}
                        sourcePassageContent={context?.passageContent}
                        answerRevealMode="show-all"
                      />
                    </div>
                  ) : (
                    <EmptyAfter />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer: chat history + presets + prompt + actions ── */}
        <div className="shrink-0 border-t border-slate-200 bg-white">
          {/* 지난 지시(버전) */}
          {versions.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-100 px-5 py-2">
              <RotateCcw className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {versions.map((v, i) => (
                <button
                  key={v.id}
                  onClick={() => selectVersion(i)}
                  className={`max-w-[260px] shrink-0 truncate rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                    i === activeIndex
                      ? "border-blue-300 bg-blue-50 font-medium text-blue-700"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                  title={v.instruction}
                >
                  v{i + 1}. {v.instruction}
                </button>
              ))}
            </div>
          )}

          {/* 빠른 포커스 프리셋 */}
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-5 pt-3">
              {presets.map((p, i) => (
                <button
                  key={i}
                  onClick={() => applyPreset(p.instruction)}
                  disabled={sending}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11.5px] font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                  title={p.instruction}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {sendError && (
            <div className="px-5 pt-2 text-[12px] font-medium text-rose-600">{sendError}</div>
          )}

          {/* 프롬프트 입력 + 액션 */}
          <div className="flex items-end gap-3 px-5 py-3">
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                disabled={loading || !!loadError}
                placeholder={
                  activeVersion
                    ? "이어서 수정할 내용을 입력하세요. (예: 정답을 3번으로 바꾸고 해설도 맞춰줘)"
                    : "어떻게 수정할지 자연어로 입력하세요. (예: 어법 포인트를 조동사·시제 중심으로 다시 구성해줘)"
                }
                className="max-h-[140px] min-h-[56px] w-full resize-y rounded-xl border border-slate-300 px-4 py-3 pr-12 text-[14px] leading-relaxed text-slate-800 outline-none transition-[box-shadow,border-color] placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || sending || loading}
                aria-label="수정 생성"
                className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CornerDownLeft className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <Button
                onClick={apply}
                disabled={!activeVersion || applying || savingAsNew || sending}
                className="h-10 gap-1.5 bg-blue-600 px-4 text-[13px] font-semibold hover:bg-blue-700"
              >
                {applying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                현재 문제에 적용
              </Button>
              <Button
                variant="outline"
                onClick={() => void saveAsNew()}
                disabled={!activeVersion || applying || savingAsNew || sending || activeVersionSaved}
                className="h-10 gap-1.5 border-slate-300 px-4 text-[13px] font-semibold text-slate-700"
              >
                {savingAsNew ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : activeVersionSaved ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <FilePlus2 className="h-4 w-4" />
                )}
                {activeVersionSaved ? "저장됨" : "새 문제로 저장"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyAfter() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
        <Bot className="h-6 w-6" />
      </div>
      <p className="text-[14px] font-semibold text-slate-600">
        아래에 수정 지시를 입력하면 여기에 수정본이 나타납니다
      </p>
      <p className="mt-1 max-w-sm text-[12.5px] text-slate-400">
        유형은 그대로 유지되고, 지시한 부분만 반영해 선지·정답·해설까지 정합하게 다시
        만들어 드립니다. 아래 빠른 버튼을 눌러 시작할 수도 있어요.
      </p>
    </div>
  );
}

function SkeletonAfter() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px] font-medium text-blue-600">
        <Loader2 className="h-4 w-4 animate-spin" /> AI가 수정본을 만들고 있어요…
      </div>
      <div className="h-5 w-2/3 animate-pulse rounded bg-slate-100" />
      <div className="h-24 w-full animate-pulse rounded bg-slate-100" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-full animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
