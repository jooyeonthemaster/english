// @ts-nocheck
"use client";

import { toast } from "sonner";
import {
  Save,
  Bookmark,
  ChevronDown,
  Trash2,
  Pencil,
  X,
  Check,
  Loader2,
} from "lucide-react";
import {
  createCustomPrompt,
  updateCustomPrompt,
  deleteCustomPrompt,
} from "@/actions/custom-prompts";

// ─── Prompt Section (shared between auto/manual) ─────────

export function PromptSection({
  customPrompt, setCustomPrompt,
  savedPrompts, showSavedPrompts, setShowSavedPrompts,
  showSaveInput, setShowSaveInput,
  savePromptName, setSavePromptName,
  savingPrompt, setSavingPrompt,
  editingPromptId, setEditingPromptId,
  editingName, setEditingName,
  loadSavedPrompts,
}: {
  customPrompt: string; setCustomPrompt: (v: string) => void;
  savedPrompts: { id: string; name: string; content: string }[];
  showSavedPrompts: boolean; setShowSavedPrompts: (v: boolean) => void;
  showSaveInput: boolean; setShowSaveInput: (v: boolean) => void;
  savePromptName: string; setSavePromptName: (v: string) => void;
  savingPrompt: boolean; setSavingPrompt: (v: boolean) => void;
  editingPromptId: string | null; setEditingPromptId: (v: string | null) => void;
  editingName: string; setEditingName: (v: string) => void;
  loadSavedPrompts: () => Promise<void>;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">추가 지시사항</span>
        <div className="flex items-center gap-1.5">
          {customPrompt.trim() && !showSaveInput && (
            <button onClick={() => setShowSaveInput(true)}
              className="text-[11px] text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1 px-2 py-1 rounded-md hover:bg-teal-50 transition-colors">
              <Save className="w-3 h-3" /> 저장
            </button>
          )}
          <button onClick={() => setShowSavedPrompts(!showSavedPrompts)}
            className={`text-[11px] font-semibold flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
              showSavedPrompts ? "text-teal-700 bg-teal-50 border border-teal-200" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            }`}>
            <Bookmark className="w-3 h-3" /> {savedPrompts.length}
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showSavedPrompts ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {showSaveInput && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-teal-50/80 border border-teal-200/60">
          <input placeholder="지시사항 이름" value={savePromptName} onChange={(e) => setSavePromptName(e.target.value)}
            className="flex-1 h-8 px-2.5 text-[12px] rounded-lg border border-teal-200 bg-white outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/10" autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && savePromptName.trim()) {
                setSavingPrompt(true);
                createCustomPrompt({ name: savePromptName.trim(), content: customPrompt }).then(() => {
                  toast.success("저장됨"); setSavePromptName(""); setShowSaveInput(false); setSavingPrompt(false); loadSavedPrompts();
                });
              }
              if (e.key === "Escape") setShowSaveInput(false);
            }}
          />
          <button onClick={() => {
            if (!savePromptName.trim()) return; setSavingPrompt(true);
            createCustomPrompt({ name: savePromptName.trim(), content: customPrompt }).then(() => {
              toast.success("저장됨"); setSavePromptName(""); setShowSaveInput(false); setSavingPrompt(false); loadSavedPrompts();
            });
          }} disabled={!savePromptName.trim() || savingPrompt} className="h-8 px-3 text-[11px] font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {savingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "저장"}
          </button>
          <button onClick={() => setShowSaveInput(false)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showSavedPrompts && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          {savedPrompts.length === 0 ? (
            <div className="px-4 py-5 text-center text-[12px] text-slate-400 font-medium">저장된 지시사항이 없습니다</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[160px] overflow-y-auto">
              {savedPrompts.map((sp) => (
                <div key={sp.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 group transition-colors">
                  {editingPromptId === sp.id ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input value={editingName} onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 h-7 px-2 text-[12px] rounded-md border border-slate-200 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/10" autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { updateCustomPrompt(sp.id, { name: editingName }).then(() => { setEditingPromptId(null); loadSavedPrompts(); }); }
                          if (e.key === "Escape") setEditingPromptId(null);
                        }}
                      />
                      <button onClick={() => { updateCustomPrompt(sp.id, { name: editingName }).then(() => { setEditingPromptId(null); loadSavedPrompts(); }); }}
                        className="w-6 h-6 flex items-center justify-center text-emerald-500 hover:bg-emerald-50 rounded transition-colors"><Check className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => { setCustomPrompt(sp.content); setShowSavedPrompts(false); toast.success(`"${sp.name}" 불러옴`); }}
                        className="flex-1 text-left min-w-0">
                        <span className="text-[12px] font-medium text-slate-700 block truncate">{sp.name || "이름 없음"}</span>
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => { setEditingPromptId(sp.id); setEditingName(sp.name); }}
                          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded transition-colors"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => { if (confirm(`"${sp.name}" 삭제?`)) deleteCustomPrompt(sp.id).then(() => { toast.success("삭제됨"); loadSavedPrompts(); }); }}
                          className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 rounded transition-colors"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <textarea placeholder="예: 킬러 문항은 빈칸 추론으로, 서술형은 조건부 영작 위주로..." value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
        className="w-full min-h-[72px] px-3.5 py-2.5 text-[12px] leading-relaxed rounded-xl border border-slate-200 bg-slate-50/60 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 placeholder:text-slate-400 resize-none transition-all"
      />
    </div>
  );
}
