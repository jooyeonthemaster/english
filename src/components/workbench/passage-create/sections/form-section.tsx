"use client";

import type { RefObject } from "react";
import {
  Save,
  Loader2,
  Wand2,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Annotation } from "@/components/workbench/editor";
import type { SavedPrompt } from "../types";
import { FormEditorColumn } from "./form-editor-column";
import { FormMetadataColumn } from "./form-metadata-column";
import { FormPromptColumn } from "./form-prompt-column";

interface FormSectionProps {
  formCollapsed: boolean;
  setFormCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  hasContent: boolean;
  wordCount: number;
  saving: boolean;
  onSave: (runAnalysis: boolean) => void;

  // Editor column
  title: string;
  setTitle: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  annotations: Annotation[];
  setAnnotations: (v: Annotation[]) => void;
  imageFile: File | null;
  imagePreview: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDrop: (e: React.DragEvent) => void;

  // Metadata column
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

  // Prompt column
  analysisPrompt: string;
  setAnalysisPrompt: (v: string) => void;
  savedPrompts: SavedPrompt[];
  showSavedPrompts: boolean;
  setShowSavedPrompts: (v: boolean | ((prev: boolean) => boolean)) => void;
  newPromptName: string;
  setNewPromptName: (v: string) => void;
  savingPrompt: boolean;
  onSavePrompt: () => void;
  onDeletePrompt: (id: string) => void;
}

export function FormSection(props: FormSectionProps) {
  const {
    formCollapsed,
    setFormCollapsed,
    hasContent,
    wordCount,
    saving,
    onSave,
    imageFile,
    content,
  } = props;

  return (
    <div className="border-b border-slate-200 bg-white">
      {/* Collapse toggle */}
      <button
        onClick={() => setFormCollapsed(!formCollapsed)}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-700">
            {formCollapsed ? "새 지문 등록하기" : "지문 입력"}
          </span>
          {hasContent && !formCollapsed && (
            <span className="text-[11px] text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">
              {wordCount} words
            </span>
          )}
        </div>
        {formCollapsed ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {!formCollapsed && (
        <div className="px-6 pb-5">
          {/* ─── 3-Column Layout: Editor | Metadata | Prompt ─── */}
          <div className="grid grid-cols-[1fr_320px_320px] gap-5 h-[520px]">
            <FormEditorColumn
              title={props.title}
              setTitle={props.setTitle}
              content={props.content}
              setContent={props.setContent}
              annotations={props.annotations}
              setAnnotations={props.setAnnotations}
              imageFile={props.imageFile}
              imagePreview={props.imagePreview}
              wordCount={props.wordCount}
              fileInputRef={props.fileInputRef}
              onFileSelect={props.onFileSelect}
              onRemoveImage={props.onRemoveImage}
              onPaste={props.onPaste}
              onDrop={props.onDrop}
            />

            <FormMetadataColumn
              schools={props.schools}
              schoolId={props.schoolId}
              setSchoolId={props.setSchoolId}
              grade={props.grade}
              setGrade={props.setGrade}
              semester={props.semester}
              setSemester={props.setSemester}
              unit={props.unit}
              setUnit={props.setUnit}
              source={props.source}
              setSource={props.setSource}
              publisher={props.publisher}
              setPublisher={props.setPublisher}
              publisherCustom={props.publisherCustom}
              setPublisherCustom={props.setPublisherCustom}
              tagInput={props.tagInput}
              setTagInput={props.setTagInput}
              tags={props.tags}
              addTag={props.addTag}
              removeTag={props.removeTag}
            />

            <FormPromptColumn
              analysisPrompt={props.analysisPrompt}
              setAnalysisPrompt={props.setAnalysisPrompt}
              savedPrompts={props.savedPrompts}
              showSavedPrompts={props.showSavedPrompts}
              setShowSavedPrompts={props.setShowSavedPrompts}
              newPromptName={props.newPromptName}
              setNewPromptName={props.setNewPromptName}
              savingPrompt={props.savingPrompt}
              onSavePrompt={props.onSavePrompt}
              onDeletePrompt={props.onDeletePrompt}
            />
          </div>

          {/* ─── Action buttons ─── */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
            <p className="text-[12px] text-slate-400">
              {hasContent ? (
                <>
                  <Check className="w-3 h-3 inline text-green-500 mr-0.5" />
                  {imageFile && !content.trim()
                    ? "이미지 첨부됨 · 등록 시 텍스트 자동 추출"
                    : `지문 입력 완료 · ${wordCount} words`}
                </>
              ) : (
                "지문 내용을 입력하거나 이미지를 붙여넣으세요"
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => onSave(false)}
                disabled={saving || !hasContent}
                className="h-9"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                저장만 하기
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 h-9"
                onClick={() => onSave(true)}
                disabled={saving || !hasContent}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
                등록 + AI 분석 실행
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold bg-white/20 px-1.5 py-0.5 rounded">5 크레딧</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
