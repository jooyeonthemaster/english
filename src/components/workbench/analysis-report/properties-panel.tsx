import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eye,
  EyeOff,
  FileQuestion,
  FileText,
  Languages,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect } from "react";

import { REPORT_THEMES } from "@/lib/passage-report/analysis-report/design-tokens";
import {
  NUMBERED_SECTION_LABELS,
  reportThemeIdSchema,
  type ActivityBlock,
  type AnalysisReport,
  type AnalysisSection,
  type BlockMeta,
  type CustomBlock,
  type ReportCover,
  type ReportThemeId,
  type VocabTestLayout,
  type VocabTestMode,
  type VocabularyTier,
} from "@/lib/passage-report/analysis-report/schema";
import { worksheetAnswersAreHidden, worksheetClozeTranslationsAreHidden } from "@/lib/passage-report/analysis-report/worksheet-surface";
import { activityBlockLabel } from "@/lib/passage-report/analysis-report/study-activities";

import type { ItemDescriptor } from "./report-pages";
import { TABLE_COLUMNS } from "./report-sections";
import type { ActivityAction } from "./custom-activity-renders";
import { ActivityOptions } from "./activity-options";
import { VocabTestOptions } from "./vocab-test-options";
import { CoverPanel, LogoPanel } from "./cover-logo-panels";
import { PanelGroup, ToggleRow } from "./panel-primitives";
import { PanelSection, SortablePanelStack } from "./panel-section";
import {
  DESIGN_TEMPLATE_LABELS,
  SPACER_MIN_MM,
} from "./editor-storage";

const ADD_LABEL: Partial<Record<string, string>> = {
  passage: "문장",
  vocabulary: "단어",
  grammar: "문법 행",
  "exam-focus": "유형 행",
  summary: "요약문",
};

export function PropertiesPanel({
  report,
  active,
  activeMeta,
  activeCustom,
  activityBlock,
  activityActive,
  activityActivateNonce,
  onActivateActivity,
  activePos,
  total,
  fontScale,
  onTheme,
  onMetaPatch,
  onMove,
  onAddRow,
  onSetCustom,
  onActivity,
  onDeleteItem,
  onToggleCol,
  onToggleWorksheetAnswers,
  onToggleWorksheetClozeTranslations,
  onVocabTestMode,
  onVocabTestLayout,
  onVocabTestOnly,
  onRestoreVocabTestRows,
  onVocabTierFilter,
  vocabTestFocused,
  vocabTestActivateNonce,
  vocabSectionIndex,
  onScrollToBlock,
  onDeleteCustom,
  onDeleteSection,
  coverError,
  onCoverPatch,
  onLogoFile,
  onToggleEnglishPage,
  onBrand,
  settingsOpen,
}: {
  report: AnalysisReport;
  active: ItemDescriptor | null;
  activeMeta: BlockMeta;
  activeCustom: CustomBlock | null;
  activityBlock: ActivityBlock | null;
  activityActive: boolean;
  /** 팔레트에서 활동을 (재)활성화한 횟수 — 접힌 설정 섹션을 다시 펼치는 신호. */
  activityActivateNonce: number;
  onActivateActivity: () => void;
  activePos: number;
  total: number;
  fontScale: number;
  coverError: string | null;
  onCoverPatch: (patch: Partial<ReportCover>) => void;
  onLogoFile: (file?: File | null) => void;
  onToggleEnglishPage: () => void;
  onBrand: (value: string) => void;
  settingsOpen: boolean;
  onTheme: (t: ReportThemeId) => void;
  onMetaPatch: (patch: Partial<BlockMeta>) => void;
  onMove: (dir: -1 | 1) => void;
  onAddRow: (sectionIndex: number) => void;
  onSetCustom: (id: string, patch: Partial<CustomBlock>) => void;
  onActivity: (id: string, action: ActivityAction) => void;
  onDeleteItem: (id: string) => void;
  onToggleCol: (sectionIndex: number, key: string) => void;
  onToggleWorksheetAnswers: (sectionIndex: number) => void;
  onToggleWorksheetClozeTranslations: (sectionIndex: number) => void;
  onVocabTestMode: (sectionIndex: number, mode: VocabTestMode) => void;
  onVocabTestLayout: (sectionIndex: number, layout: VocabTestLayout) => void;
  onVocabTestOnly: (sectionIndex: number, enabled: boolean, mode?: Exclude<VocabTestMode, "study">) => void;
  onRestoreVocabTestRows: (sectionIndex: number) => void;
  onVocabTierFilter: (sectionIndex: number, tiers: VocabularyTier[]) => void;
  vocabTestFocused: boolean;
  /** '단어 시험지' 카드를 누른 횟수 — 접힌 설정 섹션 재펼침 + 섹션으로 스크롤 신호. */
  vocabTestActivateNonce: number;
  vocabSectionIndex: number;
  onScrollToBlock: (id: string) => void;
  onDeleteCustom: (id: string) => void;
  onDeleteSection: (sectionIndex: number) => void;
}) {
  // 블록을 선택하면 '블록 편집' 카드가 화면 위쪽으로 자연스레 스크롤되어 도구가 최대한 보이게.
  const activeId = active?.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    const el = document.getElementById("panel-block-edit");
    if (!el) return;
    const raf = requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: "smooth" }));
    return () => cancelAnimationFrame(raf);
  }, [activeId]);
  // '단어 시험지' 카드를 누르면(누를 때마다) 그 설정 섹션이 보이도록 패널을 스크롤.
  useEffect(() => {
    if (!vocabTestFocused) return;
    const el = document.getElementById("panel-vocab-test-edit");
    if (!el) return;
    const raf = requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: "smooth" }));
    return () => cancelAnimationFrame(raf);
  }, [vocabTestFocused, vocabTestActivateNonce]);
  const align = activeMeta.align ?? "left";
  const isCover = !!active && active.id === "cover";
  const isCustom = !!active && active.id.startsWith("c-");
  const isTitleMeta = !!active && (active.id === "title" || active.id === "meta");
  const isSectionItem = !!active && !isCustom && !isTitleMeta && !isCover;
  const cover = report.cover;
  const coverPanel = (
    <PanelSection sectionId="cover" title="표지 (Cover)">
      <CoverPanel
        report={report}
        cover={cover}
        onPatch={onCoverPatch}
      />
    </PanelSection>
  );
  const logoPanel = (
    <PanelSection sectionId="logo" title="학원 로고">
      <LogoPanel
        cover={cover}
        coverEnabled={!!cover?.enabled}
        error={coverError}
        onPatch={onCoverPatch}
        onLogoFile={onLogoFile}
        brand={report.brand}
        onBrand={onBrand}
      />
    </PanelSection>
  );
  const englishPagePanel = (
    <PanelSection sectionId="english-page" title="영어 원문 페이지">
      <ToggleRow
        label="표지 다음 영어 원문 페이지"
        on={!!report.englishOnlyPage}
        onClick={onToggleEnglishPage}
        icon={<FileText className="w-3.5 h-3.5" />}
      />
      <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
        켜면 표지 다음에 <b className="text-slate-500">제목 + 영어 원문</b>(해석·필기 없음)만 있는 페이지가 추가돼요.
      </p>
    </PanelSection>
  );
  const activeSection = active && active.sectionIndex >= 0 ? report.sections[active.sectionIndex] : null;
  const activeWorksheet = activeSection?.kind === "learning-worksheet" ? activeSection : null;
  const passageSentenceCount = (() => {
    const ps = report.sections.find((s) => s.kind === "passage");
    return ps?.kind === "passage" ? ps.sentences.length : 0;
  })();
  const tableGroup =
    activeSection?.kind === "vocabulary"
      ? "vocab"
      : activeSection?.kind === "grammar"
        ? "grammar"
        : activeSection?.kind === "exam-focus"
          ? "exam"
          : null;
  const hiddenCols = new Set(
    activeSection && "hiddenCols" in activeSection ? (activeSection.hiddenCols as string[] | undefined) ?? [] : [],
  );
  const blockLabel = !active
    ? ""
    : isCustom
      ? activeCustom?.kind === "spacer"
        ? "여백 블록"
        : activeCustom?.kind === "activity"
          ? activityBlockLabel(activeCustom)
          : activeCustom?.kind === "image"
            ? "웹툰 이미지"
            : "텍스트 블록"
      : isTitleMeta
        ? "표지 / 메타"
        : NUMBERED_SECTION_LABELS[active.kind as AnalysisSection["kind"]];
  const addLabel = isSectionItem ? ADD_LABEL[(active as ItemDescriptor).kind] : undefined;
  // 단어 시험지 설정은 활동 설정처럼 독립 섹션으로 — '단어 시험지' 카드를 누른 적이 있으면(focused) 패널에 떠 있는다.
  const vocabTestIndex = vocabSectionIndex;
  const vocabTestSec = vocabTestIndex >= 0 ? report.sections[vocabTestIndex] : null;
  const vocabTestBlock = vocabTestFocused && vocabTestSec?.kind === "vocabulary" ? vocabTestSec : null;
  // 카드를 눌러 focus 되면 항상 활성(펼침) — 활성화 즉시 자동으로 펼쳐지게 한다.
  const vocabTestActive = !!vocabTestBlock;

  if (settingsOpen) {
    return (
      <SortablePanelStack>
        {coverPanel}
        {englishPagePanel}
        {logoPanel}
        <PanelSection sectionId="theme" title="디자인 템플릿" summary={DESIGN_TEMPLATE_LABELS[report.themeId]}>
          <div className="flex flex-col gap-1.5">
            {reportThemeIdSchema.options.map((t) => {
              const theme = REPORT_THEMES[t];
              const selected = report.themeId === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTheme(t)}
                  className={`flex items-center gap-2 text-left text-[12px] px-2.5 py-1.5 rounded-md border transition-colors ${
                    selected ? "font-semibold" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  style={selected ? { borderColor: theme.ink, backgroundColor: theme.tint, color: theme.ink } : undefined}
                >
                  <span className="flex h-4 w-8 overflow-hidden rounded border border-white shadow-sm" aria-hidden>
                    <span className="flex-1" style={{ backgroundColor: theme.ink }} />
                    <span className="flex-1" style={{ backgroundColor: theme.gold }} />
                  </span>
                  <span className="min-w-0 flex-1">{DESIGN_TEMPLATE_LABELS[t]}</span>
                </button>
              );
            })}
          </div>
        </PanelSection>
      </SortablePanelStack>
    );
  }

  return (
    <SortablePanelStack
      blockSelected={!!active && !isCover}
      activityActive={activityActive}
      activityActivateNonce={activityActivateNonce}
      onActivateActivity={onActivateActivity}
      vocabTestActive={vocabTestActive}
      vocabTestActivateNonce={vocabTestActivateNonce}
    >
      {isCover ? (
        <PanelSection sectionId="cover-edit" title="표지 편집">
          <p className="text-[12px] text-slate-400 leading-relaxed">
            표지 텍스트(제목·부제·학원명 등)는 보고서에서 <b className="text-slate-500">직접 클릭</b>해 수정해요.
            <br />
            <span className="text-slate-300">표지 템플릿은 표지 패널에서, 로고는 학원 로고 패널에서 변경합니다.</span>
          </p>
        </PanelSection>
      ) : !active ? (
        <>
          <PanelSection sectionId="guide" title="블록 편집">
            <p className="text-[12px] text-slate-400 leading-relaxed">
              보고서에서 <b className="text-slate-500">블록을 클릭</b>하면 여기에서
              글자 크기·굵게·정렬·페이지 분할·순서·숨김을 조정할 수 있어요.
              <br />
              <span className="text-slate-300">⠿ 핸들 드래그로 순서 변경 · 블록 하단 드래그로 높이 조절.</span>
            </p>
          </PanelSection>
        </>
      ) : (
        <>
          <PanelSection sectionId="block-edit" title="블록 편집" anchorId="panel-block-edit">
          <PanelGroup label="선택한 블록">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-700">{blockLabel}</span>
              {isSectionItem && !active.isSectionStart ? (
                <span className="text-[10px] text-slate-400">이어지는 블록</span>
              ) : null}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              순서 {activePos + 1} / {total}
            </div>
            {addLabel ? (
              <button
                type="button"
                onClick={() => onAddRow(active.sectionIndex)}
                className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-1.5 rounded-md border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                <Plus className="w-3.5 h-3.5" /> {addLabel} 추가
              </button>
            ) : null}
          </PanelGroup>

          {activeCustom?.kind === "spacer" ? (
            <PanelGroup label="여백 높이">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={SPACER_MIN_MM}
                  max={120}
                  value={activeCustom.heightMm}
                  onChange={(e) => onSetCustom(activeCustom.id, { heightMm: Number(e.target.value) })}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-[11px] font-semibold text-slate-500 w-12 text-right">{Math.round(activeCustom.heightMm)}mm</span>
              </div>
            </PanelGroup>
          ) : null}

          {activeCustom?.kind === "image" ? (
            <PanelGroup label="웹툰 이미지">
              <div className="space-y-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeCustom.imageUrl}
                  alt=""
                  className="max-h-44 w-full rounded-md bg-slate-50 object-contain"
                />
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">폭</span>
                    <span className="w-12 text-right text-[11px] font-semibold tabular-nums text-slate-500">
                      {Math.round(activeCustom.widthPct ?? 70)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={activeCustom.widthPct ?? 70}
                    onChange={(e) => onSetCustom(activeCustom.id, { widthPct: Number(e.target.value) })}
                    className="w-full accent-blue-600"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">정렬</span>
                  <div className="flex gap-1">
                    {(
                      [
                        { v: "left" as const, label: "왼쪽" },
                        { v: "center" as const, label: "가운데" },
                        { v: "right" as const, label: "오른쪽" },
                      ]
                    ).map((opt) => {
                      const selected = (activeCustom.align ?? "center") === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => onSetCustom(activeCustom.id, { align: opt.v })}
                          className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                            selected
                              ? "border-blue-400 bg-blue-50 text-blue-700"
                              : "border-slate-200 text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  value={activeCustom.caption ?? ""}
                  onChange={(e) => onSetCustom(activeCustom.id, { caption: e.target.value })}
                  placeholder="캡션 (선택)"
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
            </PanelGroup>
          ) : null}

          {activeCustom?.kind !== "spacer" ? (
          <PanelGroup label="서식">
            {/* 글자 크기 */}
            <div className="mb-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] text-slate-600">글자 크기</span>
                <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{Math.round(fontScale * 10)}pt</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onMetaPatch({ fontScale: Math.max(0.7, Math.round((fontScale - 0.1) * 10) / 10) })}
                  className="flex-1 inline-flex justify-center items-center h-8 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMetaPatch({ fontScale: 1 })}
                  className="px-2.5 h-8 rounded-md border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-50 tabular-nums"
                >
                  10pt
                </button>
                <button
                  type="button"
                  onClick={() => onMetaPatch({ fontScale: Math.min(1.4, Math.round((fontScale + 0.1) * 10) / 10) })}
                  className="flex-1 inline-flex justify-center items-center h-8 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* 굵게 */}
            <div className="mb-2.5">
              <ToggleRow
                label="굵게"
                on={!!activeMeta.bold}
                onClick={() => onMetaPatch({ bold: !activeMeta.bold })}
                icon={<Bold className="w-3.5 h-3.5" />}
              />
            </div>
            {/* 정렬 */}
            <div className="flex items-center gap-1.5">
              {(["left", "center", "right"] as const).map((a) => {
                const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onMetaPatch({ align: a })}
                    className={`flex-1 inline-flex justify-center items-center h-8 rounded-md border ${
                      align === a ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>
          </PanelGroup>
          ) : null}

          {tableGroup ? (
            <PanelGroup label="표 열 표시">
              <div className="flex flex-col gap-1">
                {TABLE_COLUMNS[tableGroup].map((c) => {
                  const shown = !hiddenCols.has(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => active && onToggleCol(active.sectionIndex, c.key)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-[12px] ${
                        shown ? "border-slate-200 text-slate-600 hover:bg-slate-50" : "border-slate-200 bg-slate-50 text-slate-300 line-through"
                      }`}
                    >
                      <span>{c.label}</span>
                      {shown ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10.5px] text-slate-400">불필요한 열(예: 동의어·발음)을 표 전체에서 끌 수 있어요.</p>
            </PanelGroup>
          ) : null}

          {activeWorksheet ? (
            <PanelGroup label="학습지 출력">
              <ToggleRow
                label="정답·오답 분석 숨김"
                on={worksheetAnswersAreHidden(activeWorksheet)}
                onClick={() => onToggleWorksheetAnswers(active.sectionIndex)}
              />
              {activeWorksheet.cloze?.items?.length ? (
                <ToggleRow
                  label="핵심어구 한국어 해석 표시"
                  on={!worksheetClozeTranslationsAreHidden(activeWorksheet)}
                  onClick={() => onToggleWorksheetClozeTranslations(active.sectionIndex)}
                  icon={<Languages className="h-3.5 w-3.5" />}
                />
              ) : null}
              <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
                학생 배포용으로 쓸 때는 정답과 오답 분석을 숨기고, 해설지로 쓸 때는 다시 켜면 돼요.
              </p>
            </PanelGroup>
          ) : null}

          <PanelGroup label="페이지 조판">
            <div className="space-y-2">
              <ToggleRow
                label="앞 블록과 한 페이지에 (분리 금지)"
                on={!!activeMeta.keepWithPrev}
                onClick={() => {
                  onMetaPatch({ keepWithPrev: !activeMeta.keepWithPrev });
                  if (active) onScrollToBlock(active.id);
                }}
              />
              <ToggleRow
                label="새 페이지에서 시작"
                on={activeMeta.breakBefore ?? activeCustom?.kind === "activity"}
                onClick={() => {
                  const eff = activeMeta.breakBefore ?? (activeCustom?.kind === "activity");
                  onMetaPatch({ breakBefore: !eff });
                  if (active) onScrollToBlock(active.id);
                }}
              />
            </div>
            <p className="mt-2 text-[10.5px] text-slate-400 leading-relaxed">
              아래로 넘어간 블록은 <b className="text-slate-500">분리 금지</b>를 켜면 앞 블록과 함께 위로 끌어올려져요.
            </p>
            {activeMeta.minHeight ? (
              <button
                type="button"
                onClick={() => onMetaPatch({ minHeight: undefined })}
                className="mt-2 w-full text-[12px] px-2 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                높이 초기화 ({Math.round(activeMeta.minHeight)}mm)
              </button>
            ) : null}
          </PanelGroup>

          <PanelGroup label="순서 / 표시">
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={activePos <= 0}
                className="text-[12px] px-2 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ↑ 위로
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={activePos >= total - 1}
                className="text-[12px] px-2 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ↓ 아래로
              </button>
            </div>
            {!isTitleMeta ? (
              <ToggleRow
                label={activeMeta.hidden ? "숨김 (인쇄 제외)" : "표시 중"}
                on={!!activeMeta.hidden}
                onClick={() => onMetaPatch({ hidden: !activeMeta.hidden })}
                icon={activeMeta.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              />
            ) : null}
          </PanelGroup>

          {isSectionItem && active.isSectionStart ? (
            <PanelGroup label="섹션">
              <button
                type="button"
                onClick={() => onDeleteSection(active.sectionIndex)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 섹션 전체 삭제
              </button>
            </PanelGroup>
          ) : null}

          {isCustom ? (
            <PanelGroup label={activeCustom?.kind === "spacer" ? "여백 블록" : "텍스트 블록"}>
              <button
                type="button"
                onClick={() => onDeleteCustom(active.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 블록 삭제
              </button>
            </PanelGroup>
          ) : null}

          {isSectionItem && !active.isSectionStart ? (
            <PanelGroup label="이 블록">
              <button
                type="button"
                onClick={() => onDeleteItem(active.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] px-2 py-2 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제 <span className="text-[10px] text-red-300">(Del)</span>
              </button>
            </PanelGroup>
          ) : null}
          </PanelSection>
        </>
      )}

      {/* 활동/단어시험지 설정은 블록 선택 여부와 무관하게 렌더 — 팔레트 카드를 눌렀을 때
          (아무 블록도 선택 안 된 상태 포함) 설정 섹션이 곧바로 떠야 한다. 비활성일 땐
          SortablePanelStack 이 접힌 채 유지한다(사라지지 않음). */}
      {activityBlock ? (
        <PanelSection sectionId="activity-edit" title={`${activityBlockLabel(activityBlock)} 설정`}>
          <ActivityOptions
            block={activityBlock}
            sentenceCount={passageSentenceCount}
            answerKeyPageOn={report.activityAnswerKeyPage !== false}
            onActivity={onActivity}
          />
        </PanelSection>
      ) : null}

      {vocabTestBlock ? (
        <PanelSection sectionId="vocab-test-edit" title="단어 시험지 설정" anchorId="panel-vocab-test-edit">
          {(() => {
            const mode = vocabTestBlock.vocabTestMode ?? "study";
            const enabled = !!report.vocabTestOnly || mode !== "study";
            return (
              <>
                <ToggleRow
                  label="단어 시험지 포함"
                  on={enabled}
                  onClick={() => onVocabTestMode(vocabTestIndex, enabled ? "study" : "hide-meaning")}
                  icon={<FileQuestion className="h-3.5 w-3.5" />}
                />
                {enabled ? (
                  <div className="mt-2.5">
                    <VocabTestOptions
                      sectionIndex={vocabTestIndex}
                      vocabMode={mode}
                      vocabTestLayout={vocabTestBlock.vocabTestLayout ?? "table"}
                      vocabTestOnly={!!report.vocabTestOnly}
                      excludedVocabTestCount={vocabTestBlock.vocabTestExcludedKeys?.length ?? 0}
                      vocabTierFilter={vocabTestBlock.vocabTierFilter}
                      onVocabTestMode={onVocabTestMode}
                      onVocabTestLayout={onVocabTestLayout}
                      onVocabTestOnly={onVocabTestOnly}
                      onRestoreVocabTestRows={onRestoreVocabTestRows}
                      onVocabTierFilter={onVocabTierFilter}
                    />
                  </div>
                ) : (
                  <p className="mt-1.5 text-[10.5px] text-slate-400">켜면 지문 단어로 시험지 페이지가 생성돼요. 뜻·단어·동의어·반의어 + 난이도 단계.</p>
                )}
              </>
            );
          })()}
        </PanelSection>
      ) : null}

    </SortablePanelStack>
  );
}
