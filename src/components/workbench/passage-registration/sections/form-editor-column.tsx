"use client";

import type { RefObject } from "react";
import { X, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PassageAnnotationEditor, type Annotation } from "@/components/workbench/editor";
import { TEST_PASSAGES } from "../constants";

interface FormEditorColumnProps {
  title: string;
  setTitle: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  annotations: Annotation[];
  setAnnotations: (v: Annotation[]) => void;
  imageFile: File | null;
  imagePreview: string | null;
  wordCount: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function FormEditorColumn({
  title,
  setTitle,
  content,
  setContent,
  annotations,
  setAnnotations,
  imageFile,
  imagePreview,
  wordCount,
  fileInputRef,
  onFileSelect,
  onRemoveImage,
  onPaste,
  onDrop,
}: FormEditorColumnProps) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="mb-2">
        <Label htmlFor="title" className="text-sm font-medium text-slate-700 mb-1.5 block">
          제목 <span className="text-[11px] text-slate-400 font-normal">(비워두면 자동 생성)</span>
        </Label>
        <Input
          id="title"
          placeholder="예: Lesson 3 - The Power of Music"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-base border-slate-200"
        />
      </div>

      {/* 테스트 지문 불러오기 */}
      <div className="mb-2">
        <Select
          value=""
          onValueChange={(val) => {
            const tp = TEST_PASSAGES[Number(val)];
            if (tp) {
              setTitle(tp.title);
              setContent(tp.content);
              setAnnotations([]);
            }
          }}
        >
          <SelectTrigger className="h-8 w-[220px] text-[11px] text-slate-400 border-dashed border-slate-300 bg-transparent hover:bg-slate-50">
            <SelectValue placeholder="테스트 지문 불러오기..." />
          </SelectTrigger>
          <SelectContent>
            {TEST_PASSAGES.map((tp, idx) => (
              <SelectItem key={idx} value={String(idx)} className="text-[12px]">
                {tp.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1.5 shrink-0">
          <Label className="text-sm font-medium text-slate-700">
            지문 내용 {!imageFile && <span className="text-red-500">*</span>}
          </Label>
          <div className="flex items-center gap-3">
            {wordCount > 0 && <span className="text-xs text-slate-500">{wordCount} words</span>}
            {annotations.length > 0 && (
              <span className="text-[11px] text-blue-600 font-medium">마킹 {annotations.length}개</span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              이미지
            </button>
          </div>
        </div>

        {imagePreview && (
          <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
            <img src={imagePreview} alt="원본" className="h-10 rounded object-contain" />
            <p className="text-[12px] text-slate-500 flex-1">이미지 첨부됨 · 등록 시 AI가 텍스트를 자동 추출합니다</p>
            <button onClick={onRemoveImage} className="p-1 rounded hover:bg-slate-200 transition-colors">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        )}

        {/* Annotation-enabled passage editor */}
        <div
          className="flex-1 min-h-0 border border-slate-200 rounded-lg overflow-hidden"
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <PassageAnnotationEditor
            content={content}
            onContentChange={setContent}
            annotations={annotations}
            onAnnotationsChange={setAnnotations}
            placeholder={"영어 지문을 붙여넣으세요...\n\n텍스트를 드래그하여 핵심 단어, 주요 문법, 중요 문장을 마킹할 수 있습니다."}
          />
        </div>

        {!content && annotations.length === 0 && (
          <p className="text-[11px] text-slate-400 mt-2 shrink-0">
            텍스트를 입력한 후, 드래그로 선택하면 핵심 단어 · 주요 문법 · 중요 문장을 마킹할 수 있습니다
          </p>
        )}
      </div>
    </div>
  );
}
