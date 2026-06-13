"use client";

import type { Dispatch, SetStateAction } from "react";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { AnalysisTone } from "@/lib/passage-analysis-options";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import type {
  IntakeView,
  IntakeTab,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";
import type { PendingExtraction } from "../use-create-extraction";
import type { DraftCollectionItem, SavedPrompt } from "../types";
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

  // 자료 관리 picker
  draftRefreshToken: number;
  onSelectDraft: (draft: M1PassageDraftWithJob) => void;
  onLoadSelectedDrafts: (drafts: M1PassageDraftWithJob[]) => void;
  /** 우측 워크스페이스에 이미 불러온 드래프트 id — 자료 카드 '불러옴' 표시. */
  loadedDraftIds?: string[];
  draftCollections: DraftCollectionItem[];
  draftMembership: Record<string, string[]>;

  // Intake (이미지·PDF)
  intakeView: IntakeView;
  setIntakeView: (v: IntakeView) => void;
  intakeTab: IntakeTab;
  setIntakeTab: (v: IntakeTab) => void;
  onExtractionBegin: (id: string, count: number) => void;
  onExtractionResult: (id: string, jobId: string | null) => void;
  extractionPending: PendingExtraction[];
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
    />
  );
}
