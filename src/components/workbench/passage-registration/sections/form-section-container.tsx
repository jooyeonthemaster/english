"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { AnalysisTone } from "@/lib/passage-analysis-options";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import type {
  IntakeView,
  IntakeTab,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";
import type { PastedPassageInput } from "@/app/(director)/director/workbench/generate/intake/multi-passage-paste";
import type { PendingExtraction } from "../use-create-extraction";
import type { DraftCollectionItem, SavedPrompt } from "../types";
import type { LearningSheetVariant } from "../learning-sheet-preview-modal";
import type { PassageInputRow } from "../passage-input/types";
import {
  handleSavePrompt as savePrompt,
  handleDeletePrompt as deletePrompt,
} from "../saved-prompt-actions";
import { FormSection } from "./form-section";

interface FormSectionContainerProps {
  academyId: string;

  // View state
  formCollapsed: boolean;
  setFormCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Multi-passage stack
  rows: PassageInputRow[];
  setRows: Dispatch<SetStateAction<PassageInputRow[]>>;
  analyzing: boolean;
  onAnalyze: (plan: QuestionGenerationPlan) => void;
  onAddPassage?: () => void;
  onAddVariant?: (args: {
    sourcePassageId: string | null;
    title: string;
    content: string;
    mode: import("@/lib/passage-transform/schema").WholePassageTransformMode;
    direction?: import("@/lib/passage-transform/schema").VariantDirection;
  }) => Promise<boolean>;

  // Metadata
  schools: Array<{ id: string; name: string; type: string; publisher: string | null }>;
  schoolId: string;
  setSchoolId: (v: string) => void;
  grade: string;
  setGrade: (v: string) => void;
  semester: string;
  setSemester: (v: string) => void;
  unit: string;
  setUnit: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  publisher: string;
  setPublisher: (v: string) => void;
  publisherCustom: string;
  setPublisherCustom: (v: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  tags: string[];
  addTag: () => void;
  removeTag: (tag: string) => void;

  // Prompt
  analysisPrompt: string;
  setAnalysisPrompt: (v: string) => void;
  analysisTone: AnalysisTone;
  setAnalysisTone: (v: AnalysisTone) => void;
  savedPrompts: SavedPrompt[];
  setSavedPrompts: Dispatch<SetStateAction<SavedPrompt[]>>;
  showSavedPrompts: boolean;
  setShowSavedPrompts: (v: boolean | ((prev: boolean) => boolean)) => void;
  newPromptName: string;
  setNewPromptName: (v: string) => void;
  savingPrompt: boolean;
  setSavingPrompt: (v: boolean) => void;

  /** 라이브러리 탭 라벨. 기본 "자료 관리". 학습지는 "내 지문함". */
  libraryLabel?: string;
  /** 라이브러리(내 지문함) override. 없으면 추출 드래프트 그리드로 폴백. */
  library?: ReactNode;
  /** 기출 지문 브라우저 — 주어지면 "기출 지문" intake 탭 노출. */
  examBrowser?: ReactNode;

  // 자료 관리 picker (ExtractionManageEmbed 폴백 전용)
  draftRefreshToken?: number;
  onSelectDraft?: (draft: M1PassageDraftWithJob) => void;
  onLoadSelectedDrafts?: (drafts: M1PassageDraftWithJob[]) => void;
  /** 우측 워크스페이스에 이미 불러온 드래프트 id — 자료 카드 '불러옴' 표시. */
  loadedDraftIds?: string[];
  draftCollections?: DraftCollectionItem[];
  draftMembership?: Record<string, string[]>;

  // Intake (이미지·PDF)
  intakeView: IntakeView;
  setIntakeView: (v: IntakeView) => void;
  intakeTab: IntakeTab;
  setIntakeTab: (v: IntakeTab) => void;
  onExtractionBegin: (id: string, count: number) => void;
  onExtractionResult: (id: string, jobId: string | null) => void;
  extractionPending: PendingExtraction[];

  // 워크스페이스 (지문 입력 및 필기창) 오버레이 제어
  workspaceOpen: boolean;
  setWorkspaceOpen: (v: boolean) => void;
  workspaceActive: boolean;
  // 직접 입력 탭 제출 → 워크스페이스 스택에 적재
  onSubmitPastedRows: (
    rows: PastedPassageInput[],
  ) => boolean | void | Promise<boolean | void>;
  pasteSaving: boolean;
  /** 국어 라우트면 "KOREAN" — 영어 전용 직접입력 모드(AI 복원·AI 생성)를 막는다. */
  pasteSubjectScope?: "KOREAN";

  // ── 모바일 스텝 플로우(<lg 전용) — PC 무영향 ──
  mobileStepTabs?: "sources" | "hidden";
  pasteStartRef?: import("react").MutableRefObject<(() => void) | null>;
  onPasteStateChange?: (state: { count: number; busy: boolean }) => void;
  includeWorksheet?: boolean;
  setIncludeWorksheet?: (v: boolean) => void;
  /** 학습지 구성 3상품(기본/실전/파이널) 리프트 — includeWorksheet 확장(우선). */
  sheetVariant?: LearningSheetVariant;
  setSheetVariant?: (v: LearningSheetVariant) => void;
}

export function FormSectionContainer(p: FormSectionContainerProps) {
  return (
    <FormSection
      academyId={p.academyId}
      formCollapsed={p.formCollapsed}
      setFormCollapsed={p.setFormCollapsed}
      rows={p.rows}
      setRows={p.setRows}
      analyzing={p.analyzing}
      onAnalyze={p.onAnalyze}
      onAddPassage={p.onAddPassage}
      onAddVariant={p.onAddVariant}
      draftRefreshToken={p.draftRefreshToken}
      schools={p.schools}
      schoolId={p.schoolId}
      setSchoolId={p.setSchoolId}
      grade={p.grade}
      setGrade={p.setGrade}
      semester={p.semester}
      setSemester={p.setSemester}
      unit={p.unit}
      setUnit={p.setUnit}
      source={p.source}
      setSource={p.setSource}
      publisher={p.publisher}
      setPublisher={p.setPublisher}
      publisherCustom={p.publisherCustom}
      setPublisherCustom={p.setPublisherCustom}
      tagInput={p.tagInput}
      setTagInput={p.setTagInput}
      tags={p.tags}
      addTag={p.addTag}
      removeTag={p.removeTag}
      analysisPrompt={p.analysisPrompt}
      setAnalysisPrompt={p.setAnalysisPrompt}
      analysisTone={p.analysisTone}
      setAnalysisTone={p.setAnalysisTone}
      savedPrompts={p.savedPrompts}
      showSavedPrompts={p.showSavedPrompts}
      setShowSavedPrompts={p.setShowSavedPrompts}
      newPromptName={p.newPromptName}
      setNewPromptName={p.setNewPromptName}
      savingPrompt={p.savingPrompt}
      onSavePrompt={() =>
        savePrompt({
          newPromptName: p.newPromptName,
          analysisPrompt: p.analysisPrompt,
          setSavingPrompt: p.setSavingPrompt,
          setNewPromptName: p.setNewPromptName,
          setSavedPrompts: p.setSavedPrompts,
        })
      }
      onDeletePrompt={(id) => deletePrompt({ id, setSavedPrompts: p.setSavedPrompts })}
      libraryLabel={p.libraryLabel}
      library={p.library}
      examBrowser={p.examBrowser}
      onSelectDraft={p.onSelectDraft}
      onLoadSelectedDrafts={p.onLoadSelectedDrafts}
      loadedDraftIds={p.loadedDraftIds}
      draftCollections={p.draftCollections}
      draftMembership={p.draftMembership}
      intakeView={p.intakeView}
      setIntakeView={p.setIntakeView}
      intakeTab={p.intakeTab}
      setIntakeTab={p.setIntakeTab}
      onExtractionBegin={p.onExtractionBegin}
      onExtractionResult={p.onExtractionResult}
      extractionPending={p.extractionPending}
      workspaceOpen={p.workspaceOpen}
      setWorkspaceOpen={p.setWorkspaceOpen}
      workspaceActive={p.workspaceActive}
      onSubmitPastedRows={p.onSubmitPastedRows}
      pasteSaving={p.pasteSaving}
      pasteSubjectScope={p.pasteSubjectScope}
      mobileStepTabs={p.mobileStepTabs}
      pasteStartRef={p.pasteStartRef}
      onPasteStateChange={p.onPasteStateChange}
      includeWorksheet={p.includeWorksheet}
      setIncludeWorksheet={p.setIncludeWorksheet}
      sheetVariant={p.sheetVariant}
      setSheetVariant={p.setSheetVariant}
    />
  );
}
