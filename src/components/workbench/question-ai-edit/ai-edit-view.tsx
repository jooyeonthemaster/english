"use client";

// ============================================================================
// AI 문제 수정 — 기본 편집 뷰 (단일 모달, 포털 없음)
// ============================================================================
// 좌측: 기존 문제(블럭 클릭 가능) · 우측: AI 수정본 · 하단: 유형 맞춤 패널 + 첨부 칩 +
// 자유 프롬프트 + 적용/새문제 저장. QuestionEditWorkspace 안에서 "AI 수정" 뷰로 렌더된다
// (직접 수정 뷰와 토글). EditQuestionDialog(Radix) 가 셸을 제공하므로 자체 백드롭/포털 없음.
//
// UI 틀(헤더 토글/저장 버튼·2분할 푸터·hint-glow·CreditCostChip)은 로컬판 유지,
// 미리보기 블럭별 변경마크(BlockChangeContext)·어법 원형숫자 표기(circleGrammarLabelMentions)·
// 잔여 크레딧 표시는 머지로 들어온 신기능을 그대로 얹는다.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CornerDownLeft,
  FileText,
  Gem,
  Loader2,
  MousePointerClick,
  Plus,
  RotateCcw,
  Save,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import { DIFFICULTY_CONFIG } from "@/components/workbench/question-card";
import { getQuestionGenerationPlanFromTags } from "@/lib/question-generation-plans";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  BlockChangeContext,
  BlockSelectionContext,
  type BlockChange,
  type BlockChangeApi,
  type BlockSelectionApi,
  type SelectedBlock,
} from "@/components/workbench/question-renderer-blocks";
import { EditViewToggle } from "@/components/workbench/question-edit-client/edit-view-toggle";
import { getTypeEditConfig } from "@/lib/question-ai-edit/type-edit-config";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { triggerHintGlow } from "@/lib/hint-glow";
import { circleGrammarLabelMentions } from "@/components/exams/paper-builder/option-display";

import { ChangeLogPanel } from "./change-log-panel";
import { TypeEditPanel } from "./type-edit-panel";
import {
  useQuestionAiEdit,
  type DetailedDiffEntry,
  type EditChange,
  type EditQualityWarning,
} from "./use-question-ai-edit";

const CHANGE_STYLE: Record<EditChange["kind"], { cls: string; verb: string }> = {
  added: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", verb: "추가" },
  removed: { cls: "bg-rose-50 text-rose-700 border-rose-200", verb: "삭제" },
  changed: { cls: "bg-blue-50 text-blue-700 border-blue-200", verb: "수정" },
  reordered: { cls: "bg-violet-50 text-violet-700 border-violet-200", verb: "순서" },
};

/** detailedChanges(blockId 부여됨)를 수정본 미리보기의 블럭별 변경 마크 맵으로 변환. */
function buildBlockChangeMap(detailed: DetailedDiffEntry[]): BlockChangeApi {
  const byId: Record<string, BlockChange> = {};
  for (const e of detailed) {
    if (!e.blockId) continue;
    const entry = { kind: e.kind, ref: e.ref, before: e.before, after: e.after, note: e.note };
    const existing = byId[e.blockId];
    if (existing) {
      existing.entries.push(entry);
      if (existing.kind !== e.kind) existing.kind = "changed"; // 혼합 → 수정
    } else {
      byId[e.blockId] = {
        kind: e.kind,
        // 단일 항목이면 항목 식별자까지(예: "선택지 ②"), 여러 항목이면 카테고리만.
        label: e.ref ? `${e.category} ${e.ref}` : e.category,
        entries: [entry],
      };
    }
  }
  // 여러 항목이 모인 블럭은 라벨에서 ref 제거(예: 오답 해설 여러 개 → "오답 해설").
  for (const [id, change] of Object.entries(byId)) {
    if (change.entries.length > 1) {
      const cat = detailed.find((e) => e.blockId === id)?.category;
      if (cat) change.label = cat;
    }
  }
  return { byId };
}

interface Props {
  questionId: string;
  /** AI(일반) 생성 문제 여부 — 좌측 상단 '일반 생성' 뱃지 표시. */
  aiGenerated?: boolean;
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

/** "기존 문제" 위에 띄울 카드 헤더 — 지문명 칩 + 난이도 배지 + 생성 플랜 배지.
 *  (문제카드 헤더와 동일 디자인) */
function ExistingQuestionHeader({
  difficulty,
  passageTitle,
  passageContent,
  before,
}: {
  difficulty?: string;
  passageTitle?: string | null;
  passageContent?: string;
  before?: Record<string, unknown>;
}) {
  const diffConfig = difficulty ? DIFFICULTY_CONFIG[difficulty] : null;

  // 생성 플랜(일반/프리미엄) — 태그 우선, 없으면 구조화 데이터(_generationPlan) 폴백.
  const tags = Array.isArray(before?.tags)
    ? (before!.tags as string[])
    : typeof before?.tags === "string"
      ? (() => {
          try {
            const v = JSON.parse(before!.tags as string);
            return Array.isArray(v) ? (v as string[]) : [];
          } catch {
            return [];
          }
        })()
      : [];
  const structured =
    before?.structuredData && typeof before.structuredData === "object"
      ? (before.structuredData as { _generationPlan?: unknown })
      : null;
  const structuredPlan =
    structured?._generationPlan === "PREMIUM" ||
    structured?._generationPlan === "STANDARD"
      ? (structured._generationPlan as "PREMIUM" | "STANDARD")
      : null;
  const generationPlan =
    getQuestionGenerationPlanFromTags(tags) ?? structuredPlan;
  const isPremium = generationPlan === "PREMIUM";
  const showPlan =
    generationPlan && (isPremium || FEATURE_FLAGS.SHOW_MODEL_SELECTOR);

  if (!passageTitle && !diffConfig && !showPlan) return null;

  return (
    <div className="mb-3 flex items-center gap-1.5">
      {passageTitle && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={passageContent ? "지문 보기" : passageTitle}
              disabled={!passageContent}
              className="inline-flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-slate-50"
            >
              <FileText className="h-3 w-3 shrink-0 text-blue-400" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold">
                {passageTitle}
              </span>
              {passageContent && (
                <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
              )}
            </button>
          </PopoverTrigger>
          {passageContent && (
            <PopoverContent
              align="start"
              collisionPadding={12}
              className="max-h-[60vh] w-[min(34rem,85vw)] overflow-y-auto p-0"
            >
              <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-700">
                  {passageTitle}
                </span>
              </div>
              <p className="whitespace-pre-wrap px-3 py-2.5 font-mono text-[12px] leading-[1.8] text-slate-700">
                {passageContent}
              </p>
            </PopoverContent>
          )}
        </Popover>
      )}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {diffConfig && (
          <Badge
            variant="outline"
            className={`shrink-0 text-[10px] font-bold ${diffConfig.className}`}
          >
            {diffConfig.label}
          </Badge>
        )}
        {showPlan && (
          <Badge
            variant="outline"
            className={`shrink-0 gap-1 text-[10px] font-bold ${
              isPremium
                ? "border-violet-200 bg-violet-50 text-violet-700"
                : "border-slate-200 bg-slate-50 text-slate-500"
            }`}
          >
            {isPremium ? (
              <Gem className="h-3 w-3" />
            ) : (
              <PearlIcon className="h-3 w-3" />
            )}
            {isPremium ? "프리미엄" : "일반"}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function AiEditView({
  questionId,
  aiGenerated,
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
  // 비활('다음으로 (AI 수정본 생성)') 클릭 시 글로우할 대상: 프롬프트 입력 박스.
  const inputBoxRef = useRef<HTMLDivElement>(null);

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
      // 적용 후 닫기/유지는 워크스페이스(onApplied)가 모드별로 결정한다
      // (모달=닫고 목록 갱신, 페이지=머무르며 갱신). 여기서 onClose 호출 금지.
      onApplied?.();
    },
    onSavedAsNew: (newQuestionId) => {
      toast.success("수정본을 새 문제로 저장했습니다.");
      onSavedAsNew?.(newQuestionId);
    },
  });

  const subType = context?.subType;
  const config = useMemo(() => (subType ? getTypeEditConfig(subType) : null), [subType]);

  // 활성 컨트롤 directive(비기본값만).
  const controlDirectives = useMemo(() => {
    if (!config) return [] as string[];
    const out: string[] = [];
    for (const c of config.controls) {
      const v = controlValues[c.id] ?? c.defaultValue;
      // 기본값(미선택)은 무지시 — directive 를 수집하지 않는다(빈 입력으로 전송 활성화·
      // 조용한 자동 적용 방지).
      if (v === c.defaultValue) continue;
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

  // 어법 판단(GRAMMAR_ERROR)은 미리보기·변경내역의 before→after 텍스트도 라벨을
  // 원형숫자(①)로 표시한다(시험지/생성 카드와 통일). 저장 데이터는 (A) 유지 — 표시만 변환.
  // 다른 유형은 isGrammarError=false 라 원문 그대로.
  const detailedChanges = useMemo<DetailedDiffEntry[]>(() => {
    const raw = activeVersion?.detailedChanges ?? [];
    if (subType !== "GRAMMAR_ERROR") return raw;
    return raw.map((e) => ({
      ...e,
      ref: typeof e.ref === "string" ? circleGrammarLabelMentions(e.ref) : e.ref,
      before: typeof e.before === "string" ? circleGrammarLabelMentions(e.before) : e.before,
      after: typeof e.after === "string" ? circleGrammarLabelMentions(e.after) : e.after,
      note: typeof e.note === "string" ? circleGrammarLabelMentions(e.note) : e.note,
    }));
  }, [activeVersion?.detailedChanges, subType]);

  // 요약 서술·핵심 변경 칩도 어법이면 라벨을 ①로 표시(저장값은 (A) 유지).
  const editSummaryDisplay =
    subType === "GRAMMAR_ERROR" && typeof activeVersion?.editSummary === "string"
      ? circleGrammarLabelMentions(activeVersion.editSummary)
      : activeVersion?.editSummary;
  const changesDisplay = useMemo<EditChange[]>(() => {
    const raw = activeVersion?.changes ?? [];
    if (subType !== "GRAMMAR_ERROR") return raw;
    return raw.map((c) => ({
      ...c,
      label: typeof c.label === "string" ? circleGrammarLabelMentions(c.label) : c.label,
    }));
  }, [activeVersion?.changes, subType]);

  // 수정본 미리보기의 블럭별 변경 마크 맵(활성 버전 기준).
  const changeMap = useMemo<BlockChangeApi>(
    () => buildBlockChangeMap(detailedChanges),
    [detailedChanges],
  );
  const changedBlockCount = Object.keys(changeMap.byId).length;
  const [expandAllChanges, setExpandAllChanges] = useState(false);

  // 우측(AI 수정본)의 "변경된 블럭" 안내 배너. 좌측(기존 문제)에는 보이지 않는
  // 복제본을 같은 자리에 깔아 좌우 시작 높이를 맞춘다(줄바꿈까지 동일하게 반영).
  const changedBlocksBanner =
    changedBlockCount > 0 ? (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50/70 px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-blue-700">
          <MousePointerClick className="h-3.5 w-3.5" />
          색칠된 {changedBlockCount}개 블럭이 변경됐어요. 좌측 색 막대 블럭의
          배지를 눌러 바뀐 내용을 확인하세요.
        </span>
        <button
          type="button"
          onClick={() => setExpandAllChanges((v) => !v)}
          className="shrink-0 rounded-md border border-blue-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-50"
        >
          {expandAllChanges ? "모두 접기" : "모두 펼치기"}
        </button>
      </div>
    ) : null;

  function addQuick(instruction: string, label: string) {
    setQuickChips((prev) => (prev.some((c) => c.label === label) ? prev : [...prev, { label, instruction }]));
    textareaRef.current?.focus();
  }

  function compose() {
    const blockLabels = attachedBlocks.map((b) => b.label);
    const directives = [...controlDirectives, ...quickChips.map((c) => c.instruction)];
    const free = freeText.trim();
    // 첨부 블럭은 targets 로 구조화 전송되어 서버 프롬프트의 "수정 대상" 섹션으로 주입되므로
    // instruction 본문에 라벨을 중복 주입하지 않는다.
    const instruction = [free, ...directives].filter(Boolean).join("\n");
    const targets = attachedBlocks.map((b) => ({ label: b.label, field: b.field }));
    const label =
      free || quickChips[0]?.label || (blockLabels.length ? `${blockLabels[0]} 외 수정` : "수정");
    return { instruction, targets, label };
  }

  async function handleSend() {
    if (!canSend) return;
    const { instruction, targets, label } = compose();
    const ok = await submit(instruction, { targets, label });
    // 성공했을 때만 입력 초기화 — 실패(크레딧부족·게이트실패·네트워크) 시 입력을 보존한다.
    // 첨부 블럭은 성공 후에도 유지(같은 블럭을 이어서 다듬을 수 있게).
    if (ok) {
      setFreeText("");
      setQuickChips([]);
      setControlValues({});
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* ── Header (직접 수정 헤더와 동일 chrome: 흰 배경·px-6 py-3·ArrowLeft 뒤로·w-7 닫기) ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="상세로 돌아가기"
              title="상세로 돌아가기"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              뒤로
            </button>
          )}
          <span className="text-[17px] font-bold tracking-tight text-slate-900">문제 수정</span>
          <EditViewToggle active="ai" onAi={() => {}} onManual={onSwitchToManual} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SaveButton
            onClick={apply}
            saving={applying}
            disabled={!activeVersion || applying || savingAsNew || sending}
            className="h-7"
            secondaryActions={[
              {
                label: activeVersionSaved ? "저장됨" : "새 문제로 저장",
                icon: activeVersionSaved ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <SaveAsNewIcon />
                ),
                onClick: () => void saveAsNew(),
                disabled:
                  !activeVersion ||
                  applying ||
                  savingAsNew ||
                  sending ||
                  activeVersionSaved,
              },
            ]}
          />
          <div className="h-5 w-px bg-slate-200" />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            title="닫기"
            className="ml-2 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
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
                    {/* 우측 "변경 블럭" 배너와 동일한 높이를 보이지 않게 확보해
                        좌우 문제 시작 위치를 맞춘다. */}
                    {changedBlocksBanner && (
                      <div aria-hidden="true" className="invisible mb-3">
                        {changedBlocksBanner}
                      </div>
                    )}
                    <ExistingQuestionHeader
                      difficulty={context.difficulty}
                      passageTitle={context.passageTitle}
                      passageContent={context.passageContent}
                      before={context.before}
                    />
                    <StructuredQuestionRenderer
                      question={context.before}
                      index={0}
                      hideHeader
                      showTypeLabel
                      sourcePassageContent={context.passageContent}
                      answerRevealMode="show-all"
                      hideAnswerLine
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
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-blue-50/60 px-5 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 text-[12.5px] font-bold text-blue-700">AI 수정본</span>
                  {activeVersion && (
                    <span className="shrink-0 text-[11px] text-blue-500">
                      v{activeIndex + 1} / {versions.length}
                    </span>
                  )}
                  {/* 버전(지난 지시) 칩 — 버전 표시이므로 제목 오른쪽에 둔다.
                      좌측 입력 영역에서 이동. */}
                  {versions.length > 0 && (
                    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
                      <RotateCcw className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                      {versions.map((v, i) => (
                        <button
                          key={v.id}
                          onClick={() => selectVersion(i)}
                          title={v.instruction}
                          className={`max-w-[200px] shrink-0 truncate rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                            i === activeIndex
                              ? "border-blue-300 bg-blue-100 font-semibold text-blue-700"
                              : "border-blue-200 bg-white text-blue-500 hover:bg-blue-50"
                          }`}
                        >
                          v{i + 1}. {v.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                    {rightTab === "changelog" ? (
                      <>
                        {activeVersion.warnings.length > 0 && (
                          <QualityCheck
                            warnings={activeVersion.warnings}
                            accepted={activeVersion.acceptedWithWarnings}
                          />
                        )}
                        <ChangeLogPanel
                          entries={detailedChanges}
                          editSummary={editSummaryDisplay}
                          instruction={activeVersion.instruction}
                          changes={changesDisplay}
                        />
                      </>
                    ) : (
                      <>
                        {/* 블럭별 변경 안내 — 미리보기 위(좌측 색 막대 블럭을 보라는 안내) */}
                        {changedBlocksBanner}
                        {/* 문제를 먼저 — 좌측 '기존 문제'와 같은 높이에서 시작해 섹션이 위에서부터 정렬.
                            BlockChangeContext 로 변경 블럭에 색 막대·배지를 마크한다. */}
                        <ExistingQuestionHeader
                          difficulty={
                            (activeVersion.after?.difficulty as string) ??
                            context?.difficulty
                          }
                          passageTitle={context?.passageTitle}
                          passageContent={context?.passageContent}
                          before={activeVersion.after}
                        />
                        <BlockChangeContext.Provider
                          value={{ byId: changeMap.byId, expandAll: expandAllChanges }}
                        >
                          <StructuredQuestionRenderer
                            question={activeVersion.after}
                            index={0}
                            hideHeader
                            showTypeLabel
                            sourcePassageContent={context?.passageContent}
                            answerRevealMode="show-all"
                            hideAnswerLine
                          />
                        </BlockChangeContext.Provider>
                        {/* 변경 요약·품질 점검은 문제 아래로 (좌측엔 없는 메타라 위에 두면 비대칭) */}
                        {changesDisplay.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                            <span className="text-[11px] font-semibold text-slate-500">변경:</span>
                            {changesDisplay.map((c, i) => {
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
                          <QualityCheck
                            warnings={activeVersion.warnings}
                            accepted={activeVersion.acceptedWithWarnings}
                          />
                        )}
                      </>
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

      {/* ── Footer: 좌=입력 / 우=유형 맞춤 · 하단 전체폭 액션 ── */}
      <div className="shrink-0 space-y-3 border-t border-slate-200 bg-white px-4 py-3">
        {/* 2분할 — 좌측 입력 / 우측 유형 맞춤 설정 */}
        <div className="flex max-h-[44vh] min-h-[180px] items-stretch gap-3">
          {/* LEFT — 입력(칩·버전·프롬프트) */}
          <div className={`flex min-h-0 min-w-0 flex-col gap-2 ${config ? "w-1/2" : "flex-1"}`}>

        {/* 지난 지시(버전) 칩은 우측 'AI 수정본' 헤더(제목 오른쪽)로 이동. */}

        {sendError && <div className="text-[12px] font-medium text-rose-600">{sendError}</div>}

        {/* 프롬프트 입력 — 빠른지시 뱃지만 입력창 '안' 상단에 표시(수정 대상 블럭은 좌측 문제에만 표시) */}
        <div
          ref={inputBoxRef}
          className="relative flex min-h-0 flex-1 flex-col rounded-xl border border-slate-300 bg-white transition-[box-shadow,border-color] focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/15"
        >
          {quickChips.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pt-3">
              {quickChips.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 py-1 pl-2.5 pr-1 text-[11.5px] font-medium text-blue-700"
                >
                  {c.label}
                  <button
                    type="button"
                    onClick={() => setQuickChips((prev) => prev.filter((x) => x.label !== c.label))}
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-700"
                    aria-label={`${c.label} 제거`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
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
            disabled={loading || !!loadError}
            placeholder={
              attachedBlocks.length
                ? `선택한 블럭(${attachedBlocks.map((b) => b.label).join(", ")})을 어떻게 바꿀지 입력하세요.`
                : activeVersion
                  ? "이어서 수정할 내용을 입력하세요. (예: 정답을 3번으로 바꾸고 해설도 맞춰줘)"
                  : "어떻게 수정할지 입력하거나, 오른쪽 유형 맞춤 설정·블럭을 선택하세요."
            }
            className="min-h-[96px] w-full flex-1 resize-none bg-transparent px-4 py-3 pr-12 text-[14px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
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

        {/* 빠른 지시 — 입력창 아래 */}
        {config && config.quickActions.length > 0 && (
          <div className="shrink-0">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <Zap className="h-3 w-3 text-blue-500" />
              빠른 지시
            </div>
            <div className="flex flex-wrap gap-1.5">
              {config.quickActions.map((p, i) => {
                const active = quickChips.some((c) => c.label === p.label);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => addQuick(p.instruction, p.label)}
                    disabled={loading || !!loadError || active}
                    title={p.instruction}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed ${
                      active
                        ? "border-blue-300 bg-blue-100 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                    }`}
                  >
                    {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
          </div>
          {/* /LEFT */}

          {/* RIGHT — 유형 맞춤 설정 (블럭 카드 + 토글) */}
          {config && (
            <div className="w-1/2 min-w-0">
              <TypeEditPanel
                config={config}
                controlValues={controlValues}
                onControlChange={(id, v) => setControlValues((prev) => ({ ...prev, [id]: v }))}
                disabled={loading || !!loadError}
              />
            </div>
          )}
        </div>

        {/* 하단 — AI 수정본 생성 (저장/새 문제로 저장은 우측 상단 헤더로 이동) */}
        <Button
          type="button"
          // 네이티브 disabled 대신 aria-disabled — 비활처럼 보이되 클릭은 살려,
          // 입력이 비어 막혔을 때 누르면 프롬프트 입력 박스를 글로우해 "여기에
          // 수정 내용을 입력하세요"를 유도한다(loading/sending 중엔 무시).
          aria-disabled={!canSend}
          onClick={() => {
            if (sending || loading || !!loadError) return;
            if (canSend) {
              void handleSend();
              return;
            }
            triggerHintGlow(inputBoxRef.current);
            textareaRef.current?.focus();
          }}
          className={
            "h-10 w-full gap-1.5 px-4 text-[13px] font-semibold text-white " +
            (canSend
              ? "bg-blue-600 hover:bg-blue-700"
              : "cursor-not-allowed bg-blue-300 hover:bg-blue-300")
          }
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          다음으로 (AI 수정본 생성)
          <CreditCostChip
            amount={CREDIT_COSTS.QUESTION_MODIFY}
            className="rounded bg-white/20 px-1.5 py-0.5 text-[11px]"
          />
          {creditsRemaining != null && (
            <span className="text-[11px] font-medium text-white/80">잔여 {creditsRemaining}</span>
          )}
        </Button>
      </div>
    </div>
  );
}

// 품질 점검 박스 — 미리보기·수정내역 양쪽에서 동일하게 사용.
function QualityCheck({
  warnings,
  accepted,
}: {
  warnings: EditQualityWarning[];
  accepted: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-700">
        <TriangleAlert className="h-3.5 w-3.5 text-blue-600" />
        품질 점검 {accepted ? "(경고와 함께 수락됨 — 검토 권장)" : ""}
      </div>
      <ul className="list-disc pl-5 text-[11px] text-slate-600">
        {warnings.slice(0, 4).map((w, i) => (
          <li key={i}>{w.message}</li>
        ))}
      </ul>
    </div>
  );
}

// 플로피 디스크 + 우하단 '+' — "새 문제로 저장" 아이콘.
function SaveAsNewIcon() {
  return (
    <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
      <Save className="h-3.5 w-3.5" />
      {/* 우하단 '+' 배지 — 현재색 원 + 흰 플러스로 작게·또렷하게. 흰 링으로
          본체와 분리한다. */}
      <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2 items-center justify-center rounded-full bg-current ring-1 ring-white">
        <Plus className="h-1.5 w-1.5 text-white" strokeWidth={4} />
      </span>
    </span>
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
