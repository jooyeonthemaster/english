"use client";

import { X, Plus, Bookmark, ChevronDown, Trash2, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PUBLISHERS } from "../constants";
import type { SavedPrompt } from "../types";

interface CompactOptionsRowProps {
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
  savedPrompts: SavedPrompt[];
  showSavedPrompts: boolean;
  setShowSavedPrompts: (v: boolean | ((prev: boolean) => boolean)) => void;
  newPromptName: string;
  setNewPromptName: (v: string) => void;
  savingPrompt: boolean;
  onSavePrompt: () => void;
  onDeletePrompt: (id: string) => void;
}

export function CompactOptionsRow(props: CompactOptionsRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 shrink-0">
      {/* ─── 선생님의 노하우 (compact) ─── */}
      <div
        className="rounded-xl border border-blue-200/60 p-3 flex flex-col min-h-0"
        style={{ background: "linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)" }}
      >
        <div className="flex items-center justify-between mb-1.5 shrink-0">
          <h3 className="text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
            선생님의 노하우
            <span className="text-[9px] font-medium text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">
              AI 반영
            </span>
          </h3>
          <div className="relative">
            <button
              type="button"
              onClick={() => props.setShowSavedPrompts(!props.showSavedPrompts)}
              className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-semibold px-1.5 py-0.5 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <Bookmark className="w-2.5 h-2.5" />
              저장
              {props.savedPrompts.length > 0 && (
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none">
                  {props.savedPrompts.length}
                </span>
              )}
              <ChevronDown
                className={`w-2.5 h-2.5 transition-transform ${
                  props.showSavedPrompts ? "rotate-180" : ""
                }`}
              />
            </button>

            {props.showSavedPrompts && props.savedPrompts.length > 0 ? (
              <div className="absolute right-0 top-7 z-20 w-60 bg-white rounded-lg border border-slate-200 shadow-lg py-1 max-h-44 overflow-y-auto">
                {props.savedPrompts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 group"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        props.setAnalysisPrompt(p.content);
                        props.setShowSavedPrompts(false);
                      }}
                      className="text-[12px] text-slate-700 font-medium truncate flex-1 text-left"
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onDeletePrompt(p.id)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-3 h-3 text-slate-300 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <Textarea
          placeholder="예: 핵심 단어: contribute, responsible / 관계대명사, to부정사 / 3번째 문장 구문 분석"
          value={props.analysisPrompt}
          onChange={(e) => props.setAnalysisPrompt(e.target.value)}
          className="flex-1 min-h-[68px] text-[11px] leading-relaxed bg-white border-blue-200/60 placeholder:text-slate-300 resize-none focus:border-blue-300 py-2 px-2.5"
          spellCheck={false}
        />

        {props.analysisPrompt.trim() ? (
          <div className="flex items-center gap-1.5 mt-1.5 shrink-0">
            <Input
              placeholder="노트 이름"
              value={props.newPromptName}
              onChange={(e) => props.setNewPromptName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  props.onSavePrompt();
                }
              }}
              className="flex-1 h-7 text-[11px]"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={props.onSavePrompt}
              disabled={props.savingPrompt || !props.newPromptName.trim()}
              className="h-7 text-[10px] px-2 shrink-0"
            >
              {props.savingPrompt ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3 mr-0.5" />
              )}
              저장
            </Button>
          </div>
        ) : null}
      </div>

      {/* ─── 지문 정보 (compact, dense grid) ─── */}
      <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-3 flex flex-col min-h-0">
        <h3 className="text-[12px] font-bold text-slate-700 mb-2 shrink-0">지문 정보</h3>

        <div className="grid grid-cols-12 gap-2">
          {/* 학교 — full row */}
          <div className="col-span-12">
            <Select
              value={props.schoolId || "NONE"}
              onValueChange={(value) => props.setSchoolId(value === "NONE" ? "" : value)}
            >
              <SelectTrigger className="w-full h-8 text-[12px]">
                <SelectValue placeholder="학교 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">선택 안함</SelectItem>
                {props.schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 학년 | 학기 — 4 + 4 */}
          <div className="col-span-6">
            <Select value={props.grade} onValueChange={props.setGrade}>
              <SelectTrigger className="w-full h-8 text-[12px]">
                <SelectValue placeholder="학년" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1학년</SelectItem>
                <SelectItem value="2">2학년</SelectItem>
                <SelectItem value="3">3학년</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-6">
            <Select value={props.semester} onValueChange={props.setSemester}>
              <SelectTrigger className="w-full h-8 text-[12px]">
                <SelectValue placeholder="학기" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIRST">1학기</SelectItem>
                <SelectItem value="SECOND">2학기</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 단원 | 출처 */}
          <div className="col-span-6">
            <Input
              placeholder="단원 (Lesson 3)"
              value={props.unit}
              onChange={(e) => props.setUnit(e.target.value)}
              className="h-8 text-[12px]"
            />
          </div>
          <div className="col-span-6">
            <Input
              placeholder="출처 (2025 기말)"
              value={props.source}
              onChange={(e) => props.setSource(e.target.value)}
              className="h-8 text-[12px]"
            />
          </div>

          {/* 출판사 — full */}
          <div className="col-span-12">
            <Select value={props.publisher} onValueChange={props.setPublisher}>
              <SelectTrigger className="w-full h-8 text-[12px]">
                <SelectValue placeholder="출판사" />
              </SelectTrigger>
              <SelectContent>
                {PUBLISHERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
                <SelectItem value="__CUSTOM__">직접 입력</SelectItem>
              </SelectContent>
            </Select>
            {props.publisher === "__CUSTOM__" ? (
              <Input
                placeholder="출판사명 입력"
                value={props.publisherCustom}
                onChange={(e) => props.setPublisherCustom(e.target.value)}
                className="mt-1.5 h-8 text-[12px]"
              />
            ) : null}
          </div>

          {/* 태그 */}
          <div className="col-span-12">
            <div className="flex gap-1.5">
              <Input
                placeholder="태그 입력 후 Enter"
                value={props.tagInput}
                onChange={(e) => props.setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    props.addTag();
                  }
                }}
                className="flex-1 h-8 text-[12px]"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={props.addTag}
                className="shrink-0 h-8 w-8"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {props.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {props.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px] pr-1 flex items-center gap-0.5 h-5"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => props.removeTag(tag)}
                      className="ml-0.5 hover:text-red-500"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
