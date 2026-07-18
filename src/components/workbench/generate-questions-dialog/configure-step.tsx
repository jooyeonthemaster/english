// @ts-nocheck
"use client";

import React from "react";
import { Bookmark, FileText, Loader2, Save, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QUESTION_TYPE_GROUPS as EXAM_TYPE_GROUPS } from "@/lib/question-type-ui";
import { createCustomPrompt, deleteCustomPrompt } from "@/actions/custom-prompts";
import type { PassageItem, SavedPrompt } from "./types";

interface Props {
  selectedPassage: PassageItem;
  onPickAnotherPassage: () => void;
  typeCounts: Record<string, number>;
  setTypeCount: (id: string, count: number) => void;
  setTypeCounts: (counts: Record<string, number>) => void;
  totalQuestions: number;
  prompt: string;
  setPrompt: (v: string) => void;
  savedPrompts: SavedPrompt[];
  showSavedPrompts: boolean;
  setShowSavedPrompts: (v: boolean) => void;
  showSaveInput: boolean;
  setShowSaveInput: (v: boolean) => void;
  savePromptName: string;
  setSavePromptName: (v: string) => void;
  savingPrompt: boolean;
  setSavingPrompt: (v: boolean) => void;
  loadSavedPrompts: () => void;
  onGenerate: () => void;
}

export function ConfigureStep({
  selectedPassage,
  onPickAnotherPassage,
  typeCounts,
  setTypeCount,
  setTypeCounts,
  totalQuestions,
  prompt,
  setPrompt,
  savedPrompts,
  showSavedPrompts,
  setShowSavedPrompts,
  showSaveInput,
  setShowSaveInput,
  savePromptName,
  setSavePromptName,
  savingPrompt,
  setSavingPrompt,
  loadSavedPrompts,
  onGenerate,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Selected passage summary */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-[13px] font-medium text-slate-700 truncate">
            {selectedPassage.title}
          </span>
        </div>
        <button
          onClick={onPickAnotherPassage}
          className="text-[11px] text-blue-500 hover:text-blue-700 font-medium shrink-0 ml-2"
        >
          변경
        </button>
      </div>

      {/* Type groups */}
      {EXAM_TYPE_GROUPS.map((group) => (
        <div key={group.group}>
          <span className="text-[11px] font-semibold text-slate-400 tracking-wider">
            {group.group}
          </span>
          <div className="flex flex-wrap gap-2 mt-2">
            {group.items.map((item) => {
              const count = typeCounts[item.id] || 0;
              const active = count > 0;
              return (
                <div
                  key={item.id}
                  className={`inline-flex items-center h-8 rounded-lg border transition-all duration-150 ${
                    active
                      ? "bg-blue-50 border-blue-300"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setTypeCount(item.id, count + 1)}
                    className={`h-full px-2.5 text-[12px] font-medium transition-colors ${
                      active ? "text-blue-700" : "text-slate-500 hover:text-blue-600"
                    }`}
                  >
                    {item.label}
                  </button>
                  {active && (
                    <div className="flex items-center gap-0.5 pr-1 border-l border-blue-200">
                      <button onClick={() => setTypeCount(item.id, count - 1)} className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold">-</button>
                      <span className="w-4 text-center text-[12px] font-bold text-blue-700">{count}</span>
                      <button onClick={() => setTypeCount(item.id, count + 1)} className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold">+</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {totalQuestions > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
          <span className="text-[13px] font-medium text-blue-800">
            총 <strong>{totalQuestions}</strong>문제
          </span>
          <button onClick={() => setTypeCounts({})} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium">
            초기화
          </button>
        </div>
      )}

      {/* Prompt with saved presets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 tracking-wider">추가 지시사항</span>
          <div className="flex items-center gap-1">
            {prompt.trim() && !showSaveInput && (
              <button
                onClick={() => setShowSaveInput(true)}
                className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50"
              >
                <Save className="w-2.5 h-2.5" />저장
              </button>
            )}
            <button
              onClick={() => setShowSavedPrompts(!showSavedPrompts)}
              className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                showSavedPrompts ? "text-blue-700 bg-blue-50" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Bookmark className="w-2.5 h-2.5" />
              불러오기 ({savedPrompts.length})
            </button>
          </div>
        </div>

        {showSaveInput && (
          <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-blue-50 border border-blue-200">
            <input
              placeholder="지시사항 이름"
              value={savePromptName}
              onChange={(e) => setSavePromptName(e.target.value)}
              className="flex-1 h-7 px-2 text-[11px] rounded border border-blue-200 bg-white outline-none focus:border-blue-400"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && savePromptName.trim()) {
                  setSavingPrompt(true);
                  createCustomPrompt({ name: savePromptName.trim(), content: prompt }).then(() => {
                    toast.success("저장됨");
                    setSavePromptName("");
                    setShowSaveInput(false);
                    setSavingPrompt(false);
                    loadSavedPrompts();
                  });
                }
                if (e.key === "Escape") setShowSaveInput(false);
              }}
            />
            <button
              onClick={() => {
                if (!savePromptName.trim()) return;
                setSavingPrompt(true);
                createCustomPrompt({ name: savePromptName.trim(), content: prompt }).then(() => {
                  toast.success("저장됨");
                  setSavePromptName("");
                  setShowSaveInput(false);
                  setSavingPrompt(false);
                  loadSavedPrompts();
                });
              }}
              disabled={!savePromptName.trim() || savingPrompt}
              className="h-7 px-2 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {savingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : "저장"}
            </button>
            <button onClick={() => setShowSaveInput(false)} className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {showSavedPrompts && savedPrompts.length > 0 && (
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-[150px] overflow-y-auto">
            {savedPrompts.map((sp) => (
              <div key={sp.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 group">
                <button
                  onClick={() => {
                    setPrompt(sp.content);
                    setShowSavedPrompts(false);
                    toast.success(`"${sp.name}" 불러옴`);
                  }}
                  className="flex-1 text-left min-w-0"
                >
                  <span className="text-[11px] font-medium text-slate-700 block truncate">{sp.name || "이름 없음"}</span>
                  <span className="text-[10px] text-slate-400 block truncate">{sp.content.slice(0, 60)}</span>
                </button>
                <button
                  onClick={() => {
                    deleteCustomPrompt(sp.id).then(() => {
                      toast.success("삭제됨");
                      loadSavedPrompts();
                    });
                  }}
                  className="w-5 h-5 flex items-center justify-center text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          placeholder="예: 킬러 문항은 빈칸 추론으로, 서술형은 조건부 영작 위주로..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full min-h-[56px] px-3 py-2 text-[13px] leading-relaxed rounded-lg border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onPickAnotherPassage} className="flex-1">
          이전
        </Button>
        <Button
          className="flex-1 bg-blue-600 hover:bg-blue-700"
          onClick={onGenerate}
          disabled={totalQuestions === 0}
        >
          <Sparkles className="w-4 h-4 mr-1.5" />
          {totalQuestions > 0 ? `${totalQuestions}문제 생성` : "유형을 선택하세요"}
        </Button>
      </div>
    </div>
  );
}
