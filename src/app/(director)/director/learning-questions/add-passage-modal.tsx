"use client";

import { useState } from "react";
import { Plus, BookOpen, X, Search } from "lucide-react";
import { toast } from "sonner";
import { getAvailablePassages, addSeasonPassage } from "@/actions/learning-admin";

// ---------------------------------------------------------------------------
// Add Passage Modal
// (Currently unused by SeasonManager but preserved as a standalone widget.)
// ---------------------------------------------------------------------------

export function AddPassageModal({ seasonId, existingIds, grade, onAdded }: {
  seasonId: string;
  existingIds: string[];
  grade: number | null;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [passages, setPassages] = useState<{ id: string; title: string; questionCount: number }[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    setOpen(true); setLoading(true); setSearch("");
    try {
      const data = await getAvailablePassages(grade ?? undefined);
      setPassages(data.filter((p) => p.questionCount > 0 && !existingIds.includes(p.id)));
    } catch {} finally { setLoading(false); }
  }

  async function handleAdd(pid: string) {
    try { await addSeasonPassage(seasonId, pid); toast.success("추가됨"); setOpen(false); onAdded(); }
    catch { toast.error("추가 실패"); }
  }

  const filtered = search ? passages.filter((p) => p.title.toLowerCase().includes(search.toLowerCase())) : passages;

  return (
    <>
      <button onClick={handleOpen} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium">
        <Plus className="size-3" />추가
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-sm font-bold">지문 추가</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="size-4" /></button>
            </div>
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="지문 제목 검색..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" autoFocus />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">문제가 생성된 지문만 표시 ({filtered.length}개)</p>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {loading ? <div className="text-center py-8 text-xs text-slate-400">불러오는 중...</div>
                : filtered.length === 0 ? <div className="text-center py-8 text-xs text-slate-400">{search ? "검색 결과 없음" : "추가 가능한 지문 없음"}</div>
                : filtered.map((p) => (
                  <button key={p.id} onClick={() => handleAdd(p.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-blue-50 transition-colors">
                    <BookOpen className="size-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-800 flex-1 truncate">{p.title}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{p.questionCount}문제</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
