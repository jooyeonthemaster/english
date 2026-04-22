"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Annotation } from "@/components/workbench/editor";
import type { SavedPrompt } from "../types";
import {
  removeImage as removeImageFn,
  handlePaste as onPasteFn,
  handleDrop as onDropFn,
  handleFileSelect as onFileSelectFn,
} from "../image-handlers";
import {
  handleSavePrompt as savePrompt,
  handleDeletePrompt as deletePrompt,
} from "../saved-prompt-actions";
import {
  resetForm as resetFormFn,
  handleSave as handleSaveFn,
} from "../save-passage";
import { FormSection } from "./form-section";

interface FormSectionContainerProps {
  // View state
  formCollapsed: boolean;
  setFormCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  hasContent: boolean;
  wordCount: number;
  saving: boolean;
  setSaving: (v: boolean) => void;

  // Editor
  title: string;
  setTitle: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  annotations: Annotation[];
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>;
  imageFile: File | null;
  setImageFile: Dispatch<SetStateAction<File | null>>;
  imagePreview: string | null;
  setImagePreview: Dispatch<SetStateAction<string | null>>;
  fileInputRef: RefObject<HTMLInputElement | null>;

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
  savedPrompts: SavedPrompt[];
  setSavedPrompts: Dispatch<SetStateAction<SavedPrompt[]>>;
  showSavedPrompts: boolean;
  setShowSavedPrompts: (v: boolean | ((prev: boolean) => boolean)) => void;
  newPromptName: string;
  setNewPromptName: (v: string) => void;
  savingPrompt: boolean;
  setSavingPrompt: (v: boolean) => void;

  // Queue wiring
  addToQueue: Parameters<typeof handleSaveFn>[0]["addToQueue"];
}

export function FormSectionContainer(p: FormSectionContainerProps) {
  const imageSetters = { setImageFile: p.setImageFile, setImagePreview: p.setImagePreview };

  return (
    <FormSection
      formCollapsed={p.formCollapsed}
      setFormCollapsed={p.setFormCollapsed}
      hasContent={p.hasContent}
      wordCount={p.wordCount}
      saving={p.saving}
      onSave={(runAnalysis) =>
        handleSaveFn({
          runAnalysis,
          content: p.content,
          imageFile: p.imageFile,
          title: p.title,
          annotations: p.annotations,
          schoolId: p.schoolId,
          grade: p.grade,
          semester: p.semester,
          unit: p.unit,
          effectivePublisher: p.effectivePublisher,
          source: p.source,
          tags: p.tags,
          analysisPrompt: p.analysisPrompt,
          schools: p.schools,
          setSaving: p.setSaving,
          addToQueue: p.addToQueue,
          resetForm: () =>
            resetFormFn({
              setTitle: p.setTitle,
              setContent: p.setContent,
              setAnnotations: p.setAnnotations,
              setImageFile: p.setImageFile,
              setImagePreview: p.setImagePreview,
              setUnit: p.setUnit,
              setSource: p.setSource,
              setTagInput: p.setTagInput,
              setTags: p.setTags,
            }),
        })
      }
      title={p.title}
      setTitle={p.setTitle}
      content={p.content}
      setContent={p.setContent}
      annotations={p.annotations}
      setAnnotations={p.setAnnotations}
      imageFile={p.imageFile}
      imagePreview={p.imagePreview}
      fileInputRef={p.fileInputRef}
      onFileSelect={(e) => onFileSelectFn(e, { ...imageSetters, fileInputRef: p.fileInputRef })}
      onRemoveImage={() => removeImageFn(imageSetters)}
      onPaste={(e) => onPasteFn(e, imageSetters)}
      onDrop={(e) => onDropFn(e, imageSetters)}
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
    />
  );
}
