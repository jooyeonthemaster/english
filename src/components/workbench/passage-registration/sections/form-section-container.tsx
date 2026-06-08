"use client";

import type { Dispatch, SetStateAction } from "react";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { AnalysisTone } from "@/lib/passage-analysis-options";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import type { DraftCollectionItem, SavedPrompt } from "../types";
import type { PassageBlock } from "../block-types";
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
  hasContent: boolean;
  saving: boolean;

  // Passage blocks (center editor)
  blocks: PassageBlock[];
  updateBlock: (id: string, patch: Partial<PassageBlock>) => void;
  addEmptyBlock: () => void;
  removeBlock: (id: string) => void;
  toggleCollapse: (id: string) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  onAnalyze: (
    plan: QuestionGenerationPlan,
    tone: AnalysisTone,
  ) => void | Promise<void>;

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
  effectivePublisher: string;
  tagInput: string;
  setTagInput: (v: string) => void;
  tags: string[];
  setTags: Dispatch<SetStateAction<string[]>>;
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

  // Draft selection (left grid)
  selectedDraftIds: Set<string>;
  draftRefreshToken: number;
  onSelectDraft: (draft: M1PassageDraftWithJob) => void;
  onSelectedDraftSaved: () => void;
  draftCollections: DraftCollectionItem[];
  draftMembership: Record<string, string[]>;
  onBulkAnalyze: (
    drafts: M1PassageDraftWithJob[],
    generationPlan: QuestionGenerationPlan,
  ) => Promise<void>;
  bulkAnalyzing: boolean;
}

export function FormSectionContainer(p: FormSectionContainerProps) {
  return (
    <FormSection
      academyId={p.academyId}
      formCollapsed={p.formCollapsed}
      setFormCollapsed={p.setFormCollapsed}
      hasContent={p.hasContent}
      saving={p.saving}
      onAnalyze={p.onAnalyze}
      blocks={p.blocks}
      updateBlock={p.updateBlock}
      addEmptyBlock={p.addEmptyBlock}
      removeBlock={p.removeBlock}
      toggleCollapse={p.toggleCollapse}
      setAllCollapsed={p.setAllCollapsed}
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
      selectedDraftIds={p.selectedDraftIds}
      onSelectDraft={p.onSelectDraft}
      draftCollections={p.draftCollections}
      draftMembership={p.draftMembership}
      onBulkAnalyze={p.onBulkAnalyze}
      bulkAnalyzing={p.bulkAnalyzing}
    />
  );
}
