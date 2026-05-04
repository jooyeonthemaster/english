"use client";

import { Save, Loader2, Bookmark, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SavedPrompt } from "../types";

interface FormPromptColumnProps {
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

export function FormPromptColumn({
  analysisPrompt,
  setAnalysisPrompt,
  savedPrompts,
  showSavedPrompts,
  setShowSavedPrompts,
  newPromptName,
  setNewPromptName,
  savingPrompt,
  onSavePrompt,
  onDeletePrompt,
}: FormPromptColumnProps) {
  return (
    <div
      className="rounded-xl border border-blue-200/60 p-5 flex flex-col min-h-0 overflow-y-auto"
      style={{ background: "linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)" }}
    >
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h3 className="text-[14px] font-bold text-slate-800">
          선생님의 노하우
          <span className="ml-1.5 text-[10px] font-medium text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">
            AI 반영
          </span>
        </h3>
        <div className="relative">
          <button
            onClick={() => setShowSavedPrompts(!showSavedPrompts)}
            className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <Bookmark className="w-3 h-3" />
            저장된 노트
            {savedPrompts.length > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none">
                {savedPrompts.length}
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showSavedPrompts ? "rotate-180" : ""}`} />
          </button>

          {showSavedPrompts && savedPrompts.length > 0 && (
            <div className="absolute right-0 top-7 z-20 w-64 bg-white rounded-lg border border-slate-200 shadow-lg py-1 max-h-48 overflow-y-auto">
              {savedPrompts.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 group">
                  <button
                    onClick={() => { setAnalysisPrompt(p.content); setShowSavedPrompts(false); }}
                    className="text-[12px] text-slate-700 font-medium truncate flex-1 text-left"
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => onDeletePrompt(p.id)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="w-3 h-3 text-slate-300 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed mb-2 shrink-0">
        수업에서 강조하는 <span className="text-slate-600 font-medium">핵심 단어, 주요 문법, 중요 문장</span>을
        적어주시면 선생님만의 관점이 반영된 분석이 만들어집니다.
      </p>

      <Textarea
        placeholder={"예시:\n• 핵심 단어: contribute, responsible\n• 문법 포인트: 관계대명사, to부정사\n• 주요 문장: 3번째 문장 구문 분석 집중"}
        value={analysisPrompt}
        onChange={(e) => setAnalysisPrompt(e.target.value)}
        className="flex-1 text-[12px] leading-relaxed bg-white border-blue-200/60 placeholder:text-slate-300 resize-none focus:border-blue-300"
        spellCheck={false}
      />

      {/* Save prompt */}
      {analysisPrompt.trim() && (
        <div className="flex items-center gap-2 mt-2 shrink-0">
          <Input
            placeholder="노트 이름"
            value={newPromptName}
            onChange={(e) => setNewPromptName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSavePrompt(); } }}
            className="flex-1 h-8 text-[11px]"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onSavePrompt}
            disabled={savingPrompt || !newPromptName.trim()}
            className="h-8 text-[10px] shrink-0"
          >
            {savingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            저장
          </Button>
        </div>
      )}
    </div>
  );
}
