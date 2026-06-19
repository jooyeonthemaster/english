"use client";

// ============================================================================
// AI 문제 수정 — 기본 편집 뷰 (단일 모달, 포털 없음)
// ============================================================================
// 좌측: 기존 문제(블럭 클릭 가능) · 우측: AI 수정본 · 하단: 유형 맞춤 패널 + 첨부 칩 +
// 자유 프롬프트 + 적용/새문제 저장. QuestionEditWorkspace 안에서 "AI 수정" 뷰로 렌더된다
// (직접 수정 뷰와 토글). EditQuestionDialog(Radix) 가 셸을 제공하므로 자체 백드롭/포털 없음.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CornerDownLeft,
  FilePlus2,
  Loader2,
  MousePointerClick,
  Pencil,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import {
  BlockSelectionContext,
  type BlockSelectionApi,
  type SelectedBlock,
} from "@/components/workbench/question-renderer-blocks";
import { getTypeEditConfig } from "@/lib/question-ai-edit/type-edit-config";
import { QUESTION_TYPE_META } from "@/lib/question-schemas";

import { ChangeLogPanel } from "./change-log-panel";
import { TypeEditPanel } from "./type-edit-panel";
import { useQuestionAiEdit, type EditChange } from "./use-question-ai-edit";

const CHANGE_STYLE: Record<EditChange["kind"], { cls: string; verb: string }> = {
  added: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", verb: "추가" },
  removed: { cls: "bg-rose-50 text-rose-700 border-rose-200", verb: "삭제" },
  changed: { cls: "bg-blue-50 text-blue-700 border-blue-200", verb: "수정" },
  reordered: { cls: "bg-violet-50 text-violet-700 border-violet-200", verb: "순서" },
};

interface Props {
  questionId: string;
  /** "직접 수정" 뷰로 전환. */
  onSwitchToManual: () => void;
  /** 모달 닫기. */
  onClose: () => void;
  /** 상세에서 진입한 경우만 — 헤더 '뒤로'. */
  onBack?: () => void;
  /** 적용(덮어쓰기) 성공 후 — 폼/목록 갱신. */
  onApplied?: () => void;
  /** 새 문제로 저장 성공 후 — 새 문제 id. */
  onSavedAsNew?: (newQuestionId: string) => void;
}

export function AiEditView({
  questionId,
  onSwitchToManual,
  onClose,
  onBack,
  onApplied,
  onSavedAsNew,
}: Props) {
  const [freeText, setFreeText] = useState("");
  const [rightTab, setRightTab] = useState<"preview" | "changelog">("preview");
  const [attachedBlocks, setAttachedBlocks] = useState<SelectedBlock[]>([]);
  const [controlValues, setControlValues] = useState<Record<string, string>>({});
  const [quickChips, setQuickChips] = useState<{ label: string; instruction: string }[]>([]);
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
    onSavedAsNew: (newQuestionId) => {
      toast.success("수정본을 새 문제로 저장했습니다.");
      onSavedAsNew?.(newQuestionId);
    },
  });

  const subType = context?.subType;
  const typeLabel = (subType && QUESTION_TYPE_META[subType]?.label) || subType || "";
  const config = useMemo(() => (subType ? getTypeEditConfig(subType) : null), [subType]);

  // 활성 컨트롤 directive(비기본값만).
  const controlDirectives = useMemo(() => {
    if (!config) return [] as string[];
    const out: string[] = [];
    for (const c of config.controls) {
      const v = controlValues[c.id] ?? c.defaultValue;
      const opt = c.options.find((o) => o.value === v);
      if (opt?.directive) out.push(opt.directive);
    }
    return out;
  }, [config, controlValues]);

  const directiveCount = controlDirectives.length + quickChips.length;
  const canSend = !loading && !loadError && !sending && (freeText.trim().length > 0 || directiveCount > 0);

  // 로드 후 입력란 포커스.
  useEffect(() => {
    if (!loading && !loadError) {
      const t = setTimeout(() => textareaRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [loading, loadError]);

  const blockApi: BlockSelectionApi = useMemo(
    () => ({
      enabled: true,
      selectedIds: attachedBlocks.map((b) => b.id),
      onToggle: (block) =>
        setAttachedBlocks((prev) =>
          prev.some((b) => b.id === block.id)
            ? prev.filter((b) => b.id !== block.id)
            : [...prev, block],
        ),
    }),
    [attachedBlocks],
  );

  function addQuick(instruction: string, label: string) {
    setQuickChips((prev) => (prev.some((c) => c.label === label) ? prev : [...prev, { label, instruction }]));
    textareaRef.current?.focus();
  }

  function compose() {
    const blockLabels = attachedBlocks.map((b) => b.label);
    const directives = [...controlDirectives, ...quickChips.map((c) => c.instruction)];
    const free = freeText.trim();
    const headerLine = blockLabels.length
      ? `[수정 대상] ${blockLabels.join(", ")} — 이 부분을 중심으로 수정하고, 나머지는 최대한 유지해 줘.`
      : "";
    const instruction = [headerLine, [free, ...directives].filter(Boolean).join("\n")]
      .filter(Boolean)
      .join("\n");
    const targets = attachedBlocks.map((b) => ({ label: b.label, field: b.field }));
    const label =
      free || quickChips[0]?.label || (blockLabels.length ? `${blockLabels[0]} 외 수정` : "수정");
    return { instruction, targets, label };
  }

  async function handleSend() {
    if (!canSend) return;
    const { instruction, targets, label } = compose();
    // 다음 수정을 위해 자유 프롬프트·빠른지시·컨트롤은 초기화(조용한 재적용 방지).
    // 첨부 블럭은 유지(같은 블럭을 이어서 다듬을 수 있게).
    setFreeText("");
    setQuickChips([]);
    setControlValues({});
    await submit(instruction, { targets, label });
  }

  const headerToggle = (
    <div className="flex rounded-lg bg-slate-100 p-0.5 text-[12.5px] font-bold">
      <span className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-blue-700 shadow-sm">
        <Bot className="h-4 w-4" />
        AI 수정
      </span>
      <button
        type="button"
        onClick={onSwitchToManual}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-slate-500 transition-colors hover:text-slate-800"
      >
        <Pencil className="h-3.5 w-3.5" />
        직접 수정
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              title="상세로 돌아가기"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              뒤로
            </button>
          )}
          {headerToggle}
          {typeLabel && (
            <span className="inline-flex shrink-0 items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[12px] font-semibold text-blue-700">
              {typeLabel}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-medium text-slate-600 sm:inline-flex">
            수정 1회 = 1크레딧
            {creditsRemaining != null && (
              <span className="font-semibold text-slate-900">· 잔여 {creditsRemaining}</span>
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Before / After ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {loading ? (
          <div className="flex w-full items-center justify-center text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 문제를 불러오는 중…
          </div>
        ) : loadError ? (
          <div className="flex w-full flex-col items-center justify-center gap-3 px-6 text-center text-rose-600">
            <p>{loadError}</p>
            <Button variant="outline" onClick={onSwitchToManual}>
              직접 수정으로 전환
            </Button>
          </div>
        ) : (
          <>
            {/* LEFT — 기존 문제(클릭 가능) */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-2">
                <span className="text-[12.5px] font-bold text-slate-600">기존 문제</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600">
                  <MousePointerClick className="h-3 w-3" />
                  블럭을 클릭해 수정 대상으로 지정
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/30 px-5 py-4">
                {context?.before && (
                  <BlockSelectionContext.Provider value={blockApi}>
                    <StructuredQuestionRenderer
                      question={context.before}
                      index={0}
                      sourcePassageContent={context.passageContent}
                      answerRevealMode="show-all"
                    />
                  </BlockSelectionContext.Provider>
                )}
              </div>
            </div>

            {/* center arrow */}
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
                <div className="flex items-center gap-2">
                  {activeVersion && (
                    <div className="flex rounded-md bg-white p-0.5 text-[11px] font-semibold ring-1 ring-blue-200">
                      <button
                        onClick={() => setRightTab("preview")}
                        className={`rounded px-2 py-0.5 transition-colors ${
                          rightTab === "preview" ? "bg-blue-600 text-white" : "text-blue-600 hover:bg-blue-50"
                        }`}
                      >
                        미리보기
                      </button>
                      <button
                        onClick={() => setRightTab("changelog")}
                        className={`rounded px-2 py-0.5 transition-colors ${
                          rightTab === "changelog" ? "bg-blue-600 text-white" : "text-blue-600 hover:bg-blue-50"
                        }`}
                      >
                        수정 내역
                        {activeVersion.detailedChanges.length > 0 ? ` ${activeVersion.detailedChanges.length}` : ""}
                      </button>
                    </div>
                  )}
                  {versions.length > 1 && (
                    <div className="flex items-center gap-1">
                      {versions.map((v, i) => (
                        <button
                          key={v.id}
                          onClick={() => selectVersion(i)}
                          title={v.label}
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
                    {rightTab === "changelog" ? (
                      <ChangeLogPanel entries={activeVersion.detailedChanges} />
                    ) : (
                      <StructuredQuestionRenderer
                        question={activeVersion.after}
                        index={0}
                        sourcePassageContent={context?.passageContent}
                        answerRevealMode="show-all"
                      />
                    )}
                  </div>
                ) : (
                  <EmptyAfter />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Footer: 유형 패널 + 칩 + 프롬프트 + 액션 ── */}
      <div className="shrink-0 space-y-2.5 border-t border-slate-200 bg-white px-4 py-3">
        {config && (
          <TypeEditPanel
            config={config}
            controlValues={controlValues}
            onControlChange={(id, v) => setControlValues((prev) => ({ ...prev, [id]: v }))}
            onQuickAction={addQuick}
            activeQuickLabels={quickChips.map((c) => c.label)}
            disabled={loading || !!loadError}
          />
        )}

        {/* 첨부 블럭 + 적용 지시 칩 */}
        {(attachedBlocks.length > 0 || quickChips.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {attachedBlocks.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 py-1 pl-2.5 pr-1 text-[11.5px] font-semibold text-blue-700"
              >
                <MousePointerClick className="h-3 w-3" />
                {b.label}
                <button
                  type="button"
                  onClick={() => blockApi.onToggle(b)}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-700"
                  aria-label={`${b.label} 제거`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {quickChips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 py-1 pl-2.5 pr-1 text-[11.5px] font-medium text-slate-700"
              >
                {c.label}
                <button
                  type="button"
                  onClick={() => setQuickChips((prev) => prev.filter((x) => x.label !== c.label))}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label={`${c.label} 제거`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 지난 지시(버전) */}
        {versions.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto">
            <RotateCcw className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {versions.map((v, i) => (
              <button
                key={v.id}
                onClick={() => selectVersion(i)}
                className={`max-w-[240px] shrink-0 truncate rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                  i === activeIndex
                    ? "border-blue-300 bg-blue-50 font-medium text-blue-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
                title={v.instruction}
              >
                v{i + 1}. {v.label}
              </button>
            ))}
          </div>
        )}

        {sendError && <div className="text-[12px] font-medium text-rose-600">{sendError}</div>}

        {/* 프롬프트 + 액션 */}
        <div className="flex items-end gap-3">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              disabled={loading || !!loadError}
              placeholder={
                attachedBlocks.length
                  ? `선택한 블럭(${attachedBlocks.map((b) => b.label).join(", ")})을 어떻게 바꿀지 입력하세요.`
                  : activeVersion
                    ? "이어서 수정할 내용을 입력하세요. (예: 정답을 3번으로 바꾸고 해설도 맞춰줘)"
                    : "어떻게 수정할지 입력하거나, 위에서 블럭·빠른 지시를 선택하세요."
              }
              className="max-h-[140px] min-h-[56px] w-full resize-y rounded-xl border border-slate-300 px-4 py-3 pr-12 text-[14px] leading-relaxed text-slate-800 outline-none transition-[box-shadow,border-color] placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="수정 생성"
              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <Button
              onClick={apply}
              disabled={!activeVersion || applying || savingAsNew || sending}
              className="h-10 gap-1.5 bg-blue-600 px-4 text-[13px] font-semibold hover:bg-blue-700"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
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
  );
}

function EmptyAfter() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
        <Bot className="h-6 w-6" />
      </div>
      <p className="text-[14px] font-semibold text-slate-600">
        수정 지시를 입력하면 여기에 수정본이 나타납니다
      </p>
      <p className="mt-1 max-w-sm text-[12.5px] text-slate-400">
        왼쪽에서 바꾸고 싶은 블럭을 클릭하고, 아래 유형 맞춤 설정·빠른 지시를 활용해 보세요.
        유형은 그대로 유지되고 지시한 부분만 정합하게 다시 만들어 드립니다.
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
