// @ts-nocheck
"use client";

import {
  Cpu,
  FileText,
  Minus,
  Plus,
  Target,
  Zap,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXAM_TYPE_GROUPS } from "./generate-page-types";
import { PromptSection } from "./prompt-section";

// ─── Props ───────────────────────────────────────────

interface GenerationConfigPanelProps {
  // Mode
  genMode: "auto" | "manual";
  setGenMode: (v: "auto" | "manual") => void;

  // Auto config
  autoCount: number;
  setAutoCount: (v: number) => void;

  // Manual config
  typeCounts: Record<string, number>;
  setTypeCount: (id: string, count: number) => void;
  setTypeCounts: (v: Record<string, number>) => void;
  totalQuestions: number;

  // Difficulty
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  setDifficulty: (v: "BASIC" | "INTERMEDIATE" | "KILLER") => void;

  // Prompt
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  savedPrompts: { id: string; name: string; content: string }[];
  showSavedPrompts: boolean;
  setShowSavedPrompts: (v: boolean) => void;
  showSaveInput: boolean;
  setShowSaveInput: (v: boolean) => void;
  savePromptName: string;
  setSavePromptName: (v: string) => void;
  savingPrompt: boolean;
  setSavingPrompt: (v: boolean) => void;
  editingPromptId: string | null;
  setEditingPromptId: (v: string | null) => void;
  editingName: string;
  setEditingName: (v: string) => void;
  loadSavedPrompts: () => void;

  // Generate
  canGenerate: boolean;
  selectedIds: Set<string>;
  handleBatchGenerate: () => void;
}

// ─── Component ───────────────────────────────────────

export function GenerationConfigPanel({
  genMode,
  setGenMode,
  autoCount,
  setAutoCount,
  typeCounts,
  setTypeCount,
  setTypeCounts,
  totalQuestions,
  difficulty,
  setDifficulty,
  customPrompt,
  setCustomPrompt,
  savedPrompts,
  showSavedPrompts,
  setShowSavedPrompts,
  showSaveInput,
  setShowSaveInput,
  savePromptName,
  setSavePromptName,
  savingPrompt,
  setSavingPrompt,
  editingPromptId,
  setEditingPromptId,
  editingName,
  setEditingName,
  loadSavedPrompts,
  canGenerate,
  selectedIds,
  handleBatchGenerate,
}: GenerationConfigPanelProps) {
  return (
    <div className="flex flex-col bg-white overflow-hidden">
      <div className="flex-1 overflow-y-auto">

        {/* Mode Toggle */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex bg-slate-100/80 rounded-xl p-1">
            <button
              onClick={() => setGenMode("auto")}
              className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                genMode === "auto"
                  ? "bg-white text-teal-700 shadow-sm border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Zap className="w-4 h-4" />
              자동 생성
            </button>
            <button
              onClick={() => setGenMode("manual")}
              className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                genMode === "manual"
                  ? "bg-white text-teal-700 shadow-sm border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Settings2 className="w-4 h-4" />
              유형 지정
            </button>
          </div>
        </div>

        {/* Auto Mode Config */}
        {genMode === "auto" && (
          <div className="px-5 py-3 space-y-4">
            <div className="rounded-xl bg-gradient-to-br from-teal-50/80 to-teal-50/30 border border-teal-200/50 p-4 space-y-4">
              <div className="flex items-start gap-2.5">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-100/80 shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-teal-800">AI 자동 출제</p>
                  <p className="text-[11px] text-teal-600/80 mt-1 leading-relaxed">
                    지문 분석 데이터를 기반으로 최적의 유형과 난이도를 자동 선택합니다.
                  </p>
                </div>
              </div>

              {/* Question count */}
              <div>
                <span className="text-[11px] font-semibold text-teal-700 block mb-2">문제 수</span>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden w-fit">
                  <button onClick={() => setAutoCount(Math.max(1, autoCount - 1))} className="w-8 h-9 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-9 h-9 flex items-center justify-center text-[13px] font-bold text-slate-700 border-x border-slate-200 bg-slate-50/50">{autoCount}</span>
                  <button onClick={() => setAutoCount(Math.min(20, autoCount + 1))} className="w-8 h-9 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">난이도</span>
              <div className="flex gap-2">
                {([{ value: "BASIC", label: "기본", desc: "기초 수준" }, { value: "INTERMEDIATE", label: "중급", desc: "내신 대비" }, { value: "KILLER", label: "킬러", desc: "상위권" }] as const).map((d) => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-all duration-150 border ${
                      difficulty === d.value
                        ? "bg-teal-50 text-teal-700 border-teal-300 shadow-sm shadow-teal-50"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-600"
                    }`}>{d.label}</button>
                ))}
              </div>
            </div>

            {/* Custom prompt */}
            <PromptSection
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
              savedPrompts={savedPrompts}
              showSavedPrompts={showSavedPrompts}
              setShowSavedPrompts={setShowSavedPrompts}
              showSaveInput={showSaveInput}
              setShowSaveInput={setShowSaveInput}
              savePromptName={savePromptName}
              setSavePromptName={setSavePromptName}
              savingPrompt={savingPrompt}
              setSavingPrompt={setSavingPrompt}
              editingPromptId={editingPromptId}
              setEditingPromptId={setEditingPromptId}
              editingName={editingName}
              setEditingName={setEditingName}
              loadSavedPrompts={loadSavedPrompts}
            />
          </div>
        )}

        {/* Manual Mode Config */}
        {genMode === "manual" && (
          <div className="px-5 py-3 space-y-4">
            {/* Type selection groups */}
            <div className="space-y-3">
              {EXAM_TYPE_GROUPS.map((group) => (
                <div key={group.group}>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">{group.group}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => {
                      const count = typeCounts[item.id] || 0;
                      const active = count > 0;
                      return (
                        <div key={item.id}
                          className={`inline-flex items-center h-8 rounded-lg border transition-all duration-150 ${
                            active
                              ? "bg-teal-50 border-teal-300 shadow-sm shadow-teal-50"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}>
                          <button type="button" onClick={() => setTypeCount(item.id, count + 1)}
                            className={`h-full px-2.5 text-[11px] font-semibold transition-colors ${
                              active ? "text-teal-700" : "text-slate-500 hover:text-teal-600"
                            }`}>
                            {item.label}
                          </button>
                          {active && (
                            <div className="flex items-center gap-0 pr-0.5 border-l border-teal-200/80">
                              <button onClick={() => setTypeCount(item.id, count - 1)} className="w-6 h-6 flex items-center justify-center text-teal-400 hover:text-teal-600 transition-colors">
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-4 text-center text-[12px] font-bold text-teal-700 tabular-nums">{count}</span>
                              <button onClick={() => setTypeCount(item.id, count + 1)} className="w-6 h-6 flex items-center justify-center text-teal-400 hover:text-teal-600 transition-colors">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {totalQuestions > 0 && (
                <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-teal-50 border border-teal-200/60">
                  <div className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-teal-600" />
                    <span className="text-[12px] font-semibold text-teal-800">총 <strong className="text-teal-700">{totalQuestions}</strong>문제</span>
                  </div>
                  <button onClick={() => setTypeCounts({})} className="text-[11px] text-teal-500 hover:text-teal-700 font-medium transition-colors">초기화</button>
                </div>
              )}
            </div>

            {/* Difficulty */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">난이도</span>
              <div className="flex gap-2">
                {([{ value: "BASIC", label: "기본" }, { value: "INTERMEDIATE", label: "중급" }, { value: "KILLER", label: "킬러" }] as const).map((d) => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-all duration-150 border ${
                      difficulty === d.value
                        ? "bg-teal-50 text-teal-700 border-teal-300 shadow-sm shadow-teal-50"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-600"
                    }`}>{d.label}</button>
                ))}
              </div>
            </div>

            {/* Custom prompt */}
            <PromptSection
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
              savedPrompts={savedPrompts}
              showSavedPrompts={showSavedPrompts}
              setShowSavedPrompts={setShowSavedPrompts}
              showSaveInput={showSaveInput}
              setShowSaveInput={setShowSaveInput}
              savePromptName={savePromptName}
              setSavePromptName={setSavePromptName}
              savingPrompt={savingPrompt}
              setSavingPrompt={setSavingPrompt}
              editingPromptId={editingPromptId}
              setEditingPromptId={setEditingPromptId}
              editingName={editingName}
              setEditingName={setEditingName}
              loadSavedPrompts={loadSavedPrompts}
            />
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="px-5 py-4 border-t border-slate-100 bg-white shrink-0">
        <Button
          className={`w-full h-12 rounded-xl text-[14px] font-bold transition-all duration-200 ${
            canGenerate
              ? "bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-200/50 hover:shadow-lg hover:shadow-teal-200/60"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
          onClick={handleBatchGenerate}
          disabled={!canGenerate}
        >
          {selectedIds.size === 0 ? (
            <span className="flex items-center gap-2">
              <FileText className="w-4.5 h-4.5" />
              지문을 선택하세요
            </span>
          ) : genMode === "auto" ? (
            <span className="flex items-center gap-2">
              <Zap className="w-4.5 h-4.5" />
              {selectedIds.size === 1 ? `${autoCount}문제 자동 생성` : `${selectedIds.size}개 지문 × ${autoCount}문제 생성`}
            </span>
          ) : totalQuestions > 0 ? (
            <span className="flex items-center gap-2">
              <Cpu className="w-4.5 h-4.5" />
              {selectedIds.size === 1 ? `${totalQuestions}문제 생성` : `${selectedIds.size}개 지문 × ${totalQuestions}문제 생성`}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Target className="w-4.5 h-4.5" />
              유형을 선택하세요
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
