"use client";

import { useEffect, useState } from "react";
import {
  Plus, X, ArrowUp, ArrowDown, Search, GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSeason, updateSeason,
  getAvailablePassages,
  removeSeasonPassage, addSeasonPassage, reorderSeasonPassages,
} from "@/actions/learning-admin";
import { SEASON_TYPES, GRADE_LEVELS } from "@/lib/learning-constants";
import type { Season } from "./season-manager-types";

// ---------------------------------------------------------------------------
// Season Form Modal (Create / Edit 통합, 학습지 관리 포함)
// ---------------------------------------------------------------------------

export function SeasonFormModal({ mode, season, onClose, onSaved }: {
  mode: "create" | "edit";
  season?: Season;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(season?.name ?? "");
  const [type, setType] = useState<"EXAM_PREP" | "REGULAR">((season?.type as "EXAM_PREP" | "REGULAR") ?? "EXAM_PREP");
  const [grade, setGrade] = useState<number | null>(season?.grade ?? null);
  const [startDate, setStartDate] = useState(season ? season.startDate.split("T")[0] : "");
  const [endDate, setEndDate] = useState(season ? season.endDate.split("T")[0] : "");
  const [available, setAvailable] = useState<{ id: string; title: string; questionCount: number }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(season?.passages.map((p) => p.id) ?? []));
  const [searchPassage, setSearchPassage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // 수정 모드 학습지 관리용
  const [editPassages, setEditPassages] = useState<{ id: string; title: string }[]>(
    season?.passages.map((p) => ({ id: p.id, title: p.title })) ?? []
  );
  const [showAddPassage, setShowAddPassage] = useState(false);

  useEffect(() => {
    getAvailablePassages(grade ?? undefined).then((data) => setAvailable(data.filter((p) => p.questionCount > 0)));
  }, [grade]);

  async function handleSubmit() {
    if (!name || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      if (mode === "create") {
        if (selectedIds.size === 0) { toast.error("지문을 1개 이상 선택하세요"); setSubmitting(false); return; }
        await createSeason({ name, type, grade, startDate, endDate, passageIds: Array.from(selectedIds) });
        toast.success("시즌 생성됨");
      } else if (season) {
        await updateSeason(season.id, { name, startDate, endDate, grade });
        toast.success("내신 시즌 수정됨");
      }
      onSaved();
    } catch { toast.error(mode === "create" ? "생성 실패" : "수정 실패"); }
    finally { setSubmitting(false); }
  }

  // 수정 모드: 지문 제거
  async function handleRemovePassage(pid: string) {
    if (!season) return;
    try {
      await removeSeasonPassage(season.id, pid);
      setEditPassages((prev) => prev.filter((p) => p.id !== pid));
      toast.success("지문 제거됨");
    } catch { toast.error("제거 실패"); }
  }

  // 수정 모드: 지문 순서 변경
  async function handleMovePassage(i: number, dir: "up" | "down") {
    if (!season) return;
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= editPassages.length) return;
    const newList = [...editPassages];
    [newList[i], newList[j]] = [newList[j], newList[i]];
    setEditPassages(newList);
    try { await reorderSeasonPassages(season.id, newList.map((p) => p.id)); }
    catch { toast.error("순서 변경 실패"); }
  }

  // 수정 모드: 지문 추가
  async function handleAddPassage(pid: string, title: string) {
    if (!season) return;
    try {
      await addSeasonPassage(season.id, pid);
      setEditPassages((prev) => [...prev, { id: pid, title }]);
      setShowAddPassage(false);
      toast.success("지문 추가됨");
    } catch { toast.error("추가 실패"); }
  }

  const filteredPassages = searchPassage
    ? available.filter((p) => p.title.toLowerCase().includes(searchPassage.toLowerCase()))
    : available;

  // 수정 모드 추가 가능한 지문 (이미 배정된 건 제외)
  const editExistingIds = new Set(editPassages.map((p) => p.id));
  const addablePassages = available.filter((p) => !editExistingIds.has(p.id));
  const filteredAddable = searchPassage
    ? addablePassages.filter((p) => p.title.toLowerCase().includes(searchPassage.toLowerCase()))
    : addablePassages;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-base font-bold">{mode === "create" ? "새 내신 시즌 생성" : "내신 시즌 수정"}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="size-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">시즌 이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="1학기 중간고사 대비" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            {mode === "create" && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">유형</label>
                <select value={type} onChange={(e) => setType(e.target.value as "EXAM_PREP" | "REGULAR")} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  {SEASON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 block mb-1">대상 학년</label>
              <select value={grade ?? ""} onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : null)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">전체</option>
                {GRADE_LEVELS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div />
            <div>
              <label className="text-xs text-slate-500 block mb-1">시작일</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">종료일</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* 생성 모드: 체크박스 지문 선택 */}
          {mode === "create" && (
            <div>
              <label className="text-xs text-slate-500 block mb-2">지문 선택 ({selectedIds.size}개)</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input value={searchPassage} onChange={(e) => setSearchPassage(e.target.value)} placeholder="지문 검색..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y">
                {filteredPassages.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={(e) => { const n = new Set(selectedIds); e.target.checked ? n.add(p.id) : n.delete(p.id); setSelectedIds(n); }} className="rounded" />
                    <span className="text-sm text-slate-700 flex-1 truncate">{p.title}</span>
                    <span className="text-xs text-slate-400">{p.questionCount}문제</span>
                  </label>
                ))}
                {filteredPassages.length === 0 && <p className="text-xs text-slate-400 p-3 text-center">{searchPassage ? "검색 결과 없음" : "문제가 생성된 지문이 없습니다"}</p>}
              </div>
            </div>
          )}

          {/* 수정 모드: 학습지 관리 (추가/제거/순서) */}
          {mode === "edit" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-400 uppercase">배정된 지문 ({editPassages.length})</label>
                <button onClick={() => { setShowAddPassage(true); setSearchPassage(""); }} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium">
                  <Plus className="size-3" />추가
                </button>
              </div>
              <div className="space-y-1.5">
                {editPassages.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 group">
                    <GripVertical className="size-3.5 text-slate-300 flex-shrink-0" />
                    <span className="text-xs text-slate-400 w-5 flex-shrink-0">{i + 1}.</span>
                    <span className="text-sm text-slate-700 flex-1 truncate">{p.title}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleMovePassage(i, "up")} disabled={i === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20"><ArrowUp className="size-3.5" /></button>
                      <button onClick={() => handleMovePassage(i, "down")} disabled={i === editPassages.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20"><ArrowDown className="size-3.5" /></button>
                      <button onClick={() => handleRemovePassage(p.id)} className="p-0.5 text-slate-400 hover:text-rose-500"><X className="size-3.5" /></button>
                    </div>
                  </div>
                ))}
                {editPassages.length === 0 && <p className="text-xs text-slate-400 text-center py-3">배정된 지문이 없습니다</p>}
              </div>

              {/* 지문 추가 인라인 검색 */}
              {showAddPassage && (
                <div className="mt-2 border border-blue-200 rounded-lg bg-blue-50/30">
                  <div className="p-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                      <input value={searchPassage} onChange={(e) => setSearchPassage(e.target.value)} placeholder="지문 검색..." className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white" autoFocus />
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {filteredAddable.length === 0 ? (
                      <p className="text-xs text-slate-400 p-3 text-center">{searchPassage ? "검색 결과 없음" : "추가 가능한 지문 없음"}</p>
                    ) : filteredAddable.map((p) => (
                      <button key={p.id} onClick={() => handleAddPassage(p.id, p.title)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-blue-100 text-left">
                        <Plus className="size-3 text-blue-400 flex-shrink-0" />
                        <span className="flex-1 truncate">{p.title}</span>
                        <span className="text-slate-400">{p.questionCount}문제</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowAddPassage(false)} className="w-full text-xs text-slate-400 py-1.5 hover:text-slate-600 border-t">닫기</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="h-8 px-4 text-xs text-slate-500 hover:text-slate-700 font-medium">취소</button>
          <button onClick={handleSubmit} disabled={submitting || !name || !startDate || !endDate || (mode === "create" && selectedIds.size === 0)} className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-blue-700">
            {submitting ? "저장 중..." : mode === "create" ? "시즌 생성" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
