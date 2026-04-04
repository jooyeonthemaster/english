"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Calendar, BookOpen, Users, ChevronDown,
  ToggleLeft, ToggleRight, Trash2, Pencil, X,
  ArrowUp, ArrowDown, Search, GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getSeasons, createSeason, updateSeason, deleteSeason,
  getSeasonStudentProgress, getAvailablePassages,
  removeSeasonPassage, addSeasonPassage, reorderSeasonPassages,
} from "@/actions/learning-admin";
import { SEASON_TYPES, GRADE_LEVELS } from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Season {
  id: string; name: string; type: string; grade: number | null;
  startDate: string; endDate: string; isActive: boolean;
  passageCount: number; passages: { id: string; title: string; order: number }[];
  totalSessions: number; createdAt: string;
}

interface PassageDetail {
  passageId: string; passageTitle: string;
  vocabDone: number; interpDone: number; grammarDone: number; compDone: number;
  masteryPassed: boolean; masteryScore: number; totalDone: number;
}

interface StudentProgress {
  studentId: string; name: string; grade: number;
  completedLessons: number; totalLessons: number;
  totalSessionsDone: number; totalMaxSessions: number;
  progressPercent: number;
  passageDetails: PassageDetail[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function SeasonManager() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => { loadSeasons(); }, []);

  async function loadSeasons() {
    try { setSeasons(await getSeasons()); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleToggleActive(e: React.MouseEvent, id: string, current: boolean) {
    e.stopPropagation();
    await updateSeason(id, { isActive: !current });
    loadSeasons();
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("이 시즌을 삭제하시겠습니까?")) return;
    try { await deleteSeason(id); toast.success("삭제됨"); setSelectedSeason(null); loadSeasons(); }
    catch { toast.error("삭제 실패"); }
  }

  if (loading) return (
    <div className="animate-pulse space-y-4 py-4">
      {[1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{seasons.length}개 시즌</p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600">
          <Plus className="size-3.5" /> 새 시즌
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <SeasonFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); loadSeasons(); }}
        />
      )}

      {/* Season List */}
      <div className="space-y-2">
        {seasons.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="size-12 mx-auto mb-3 text-gray-300" />
            <p>아직 생성된 시즌이 없습니다</p>
          </div>
        ) : seasons.map((s) => {
          const now = new Date();
          const isPast = now > new Date(s.endDate);
          const isOngoing = now >= new Date(s.startDate) && !isPast;
          return (
            <div
              key={s.id}
              onClick={() => { setSelectedSeason(s); setEditMode(false); }}
              className={cn(
                "rounded-xl border p-4 cursor-pointer hover:shadow-sm transition-all",
                s.isActive && isOngoing ? "border-blue-200 bg-blue-50/30" : "border-gray-200 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("w-1.5 h-10 rounded-full", s.type === "EXAM_PREP" ? "bg-rose-400" : "bg-emerald-400")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{s.name}</h3>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0", s.type === "EXAM_PREP" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
                      {s.type === "EXAM_PREP" ? "내신 집중" : "평상시"}
                    </span>
                    {isPast && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">종료</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(s.startDate).toLocaleDateString("ko-KR")} ~ {new Date(s.endDate).toLocaleDateString("ko-KR")}
                    </span>
                    <span className="flex items-center gap-1"><BookOpen className="size-3" />지문 {s.passageCount}개</span>
                    {s.grade && <span>{GRADE_LEVELS.find((g) => g.value === s.grade)?.label}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={(e) => handleToggleActive(e, s.id, s.isActive)} className="p-1">
                    {s.isActive ? <ToggleRight className="size-6 text-blue-500" /> : <ToggleLeft className="size-6 text-gray-300" />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Season Detail Modal */}
      {selectedSeason && !editMode && (
        <SeasonDetailModal
          season={selectedSeason}
          onClose={() => setSelectedSeason(null)}
          onEdit={() => setEditMode(true)}
          onDelete={(e) => handleDelete(e, selectedSeason.id)}
        />
      )}

      {/* Edit Modal */}
      {selectedSeason && editMode && (
        <SeasonFormModal
          mode="edit"
          season={selectedSeason}
          onClose={() => setEditMode(false)}
          onSaved={() => {
            setEditMode(false);
            loadSeasons().then(() => {
              getSeasons().then((data) => {
                const updated = data.find((s) => s.id === selectedSeason.id);
                if (updated) setSelectedSeason(updated);
                else setSelectedSeason(null);
              });
            });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Season Detail Modal (읽기 전용: 정보 확인 + 학생 진도)
// ---------------------------------------------------------------------------

function SeasonDetailModal({ season, onClose, onEdit, onDelete }: {
  season: Season; onClose: () => void; onEdit: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState<StudentProgress[] | null>(null);

  async function loadProgress() {
    if (progress) { setShowProgress(!showProgress); return; }
    try {
      const data = await getSeasonStudentProgress(season.id);
      setProgress(data);
      setShowProgress(true);
    } catch { toast.error("진도 조회 실패"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-6 rounded-full", season.type === "EXAM_PREP" ? "bg-rose-400" : "bg-emerald-400")} />
            <h3 className="text-base font-bold text-gray-900">{season.name}</h3>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", season.type === "EXAM_PREP" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
              {season.type === "EXAM_PREP" ? "내신 집중" : "평상시"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-500" title="수정"><Pencil className="size-4" /></button>
            <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-rose-500" title="삭제"><Trash2 className="size-4" /></button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600"><X className="size-4" /></button>
          </div>
        </div>

        {/* Info */}
        <div className="px-4 py-3 border-b bg-gray-50/50">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Calendar className="size-3" />{new Date(season.startDate).toLocaleDateString("ko-KR")} ~ {new Date(season.endDate).toLocaleDateString("ko-KR")}</span>
            {season.grade && <span>{GRADE_LEVELS.find((g) => g.value === season.grade)?.label}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Passages (읽기 전용) */}
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">배정된 지문 ({season.passages.length})</p>
          <div className="space-y-1.5 mb-4">
            {season.passages.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                <span className="flex-1 truncate">{p.title}</span>
              </div>
            ))}
            {season.passages.length === 0 && <p className="text-xs text-gray-400">배정된 지문이 없습니다</p>}
          </div>

          {/* Student Progress (collapsible) */}
          <button onClick={loadProgress} className="w-full flex items-center justify-between py-2 text-xs font-semibold text-gray-400 uppercase hover:text-gray-600">
            <span className="flex items-center gap-1"><Users className="size-3" />학생 진도</span>
            <ChevronDown className={cn("size-3.5 transition-transform", showProgress && "rotate-180")} />
          </button>
          <AnimatePresence>
            {showProgress && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                {!progress ? <p className="text-xs text-gray-400 py-2">불러오는 중...</p>
                  : progress.length === 0 ? <p className="text-xs text-gray-400 py-2">해당 학년 학생이 없습니다</p>
                  : <div className="space-y-1.5">{progress.map((sp) => (
                    <StudentProgressCard key={sp.studentId} student={sp} />
                  ))}</div>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Passage Modal
// ---------------------------------------------------------------------------

function AddPassageModal({ seasonId, existingIds, grade, onAdded }: { seasonId: string; existingIds: string[]; grade: number | null; onAdded: () => void }) {
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-sm font-bold">지문 추가</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="size-4" /></button>
            </div>
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="지문 제목 검색..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" autoFocus />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">문제가 생성된 지문만 표시 ({filtered.length}개)</p>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {loading ? <div className="text-center py-8 text-xs text-gray-400">불러오는 중...</div>
                : filtered.length === 0 ? <div className="text-center py-8 text-xs text-gray-400">{search ? "검색 결과 없음" : "추가 가능한 지문 없음"}</div>
                : filtered.map((p) => (
                  <button key={p.id} onClick={() => handleAdd(p.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-blue-50 transition-colors">
                    <BookOpen className="size-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-800 flex-1 truncate">{p.title}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{p.questionCount}문제</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Season Form Modal (Create / Edit 통합, 지문 관리 포함)
// ---------------------------------------------------------------------------

function SeasonFormModal({ mode, season, onClose, onSaved }: { mode: "create" | "edit"; season?: Season; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(season?.name ?? "");
  const [type, setType] = useState<"EXAM_PREP" | "REGULAR">((season?.type as "EXAM_PREP" | "REGULAR") ?? "EXAM_PREP");
  const [grade, setGrade] = useState<number | null>(season?.grade ?? null);
  const [startDate, setStartDate] = useState(season ? season.startDate.split("T")[0] : "");
  const [endDate, setEndDate] = useState(season ? season.endDate.split("T")[0] : "");
  const [available, setAvailable] = useState<{ id: string; title: string; questionCount: number }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(season?.passages.map((p) => p.id) ?? []));
  const [searchPassage, setSearchPassage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // 수정 모드 지문 관리용
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-base font-bold">{mode === "create" ? "새 내신 시즌 생성" : "내신 시즌 수정"}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="size-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">시즌 이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="1학기 중간고사 대비" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            {mode === "create" && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">유형</label>
                <select value={type} onChange={(e) => setType(e.target.value as "EXAM_PREP" | "REGULAR")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {SEASON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 block mb-1">대상 학년</label>
              <select value={grade ?? ""} onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : null)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">전체</option>
                {GRADE_LEVELS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div />
            <div>
              <label className="text-xs text-gray-500 block mb-1">시작일</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">종료일</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* 생성 모드: 체크박스 지문 선택 */}
          {mode === "create" && (
            <div>
              <label className="text-xs text-gray-500 block mb-2">지문 선택 ({selectedIds.size}개)</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input value={searchPassage} onChange={(e) => setSearchPassage(e.target.value)} placeholder="지문 검색..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                {filteredPassages.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={(e) => { const n = new Set(selectedIds); e.target.checked ? n.add(p.id) : n.delete(p.id); setSelectedIds(n); }} className="rounded" />
                    <span className="text-sm text-gray-700 flex-1 truncate">{p.title}</span>
                    <span className="text-xs text-gray-400">{p.questionCount}문제</span>
                  </label>
                ))}
                {filteredPassages.length === 0 && <p className="text-xs text-gray-400 p-3 text-center">{searchPassage ? "검색 결과 없음" : "문제가 생성된 지문이 없습니다"}</p>}
              </div>
            </div>
          )}

          {/* 수정 모드: 지문 관리 (추가/제거/순서) */}
          {mode === "edit" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-400 uppercase">배정된 지문 ({editPassages.length})</label>
                <button onClick={() => { setShowAddPassage(true); setSearchPassage(""); }} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium">
                  <Plus className="size-3" />추가
                </button>
              </div>
              <div className="space-y-1.5">
                {editPassages.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 group">
                    <GripVertical className="size-3.5 text-gray-300 flex-shrink-0" />
                    <span className="text-xs text-gray-400 w-5 flex-shrink-0">{i + 1}.</span>
                    <span className="text-sm text-gray-700 flex-1 truncate">{p.title}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleMovePassage(i, "up")} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20"><ArrowUp className="size-3.5" /></button>
                      <button onClick={() => handleMovePassage(i, "down")} disabled={i === editPassages.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20"><ArrowDown className="size-3.5" /></button>
                      <button onClick={() => handleRemovePassage(p.id)} className="p-0.5 text-gray-400 hover:text-rose-500"><X className="size-3.5" /></button>
                    </div>
                  </div>
                ))}
                {editPassages.length === 0 && <p className="text-xs text-gray-400 text-center py-3">배정된 지문이 없습니다</p>}
              </div>

              {/* 지문 추가 인라인 검색 */}
              {showAddPassage && (
                <div className="mt-2 border border-blue-200 rounded-lg bg-blue-50/30">
                  <div className="p-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
                      <input value={searchPassage} onChange={(e) => setSearchPassage(e.target.value)} placeholder="지문 검색..." className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white" autoFocus />
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {filteredAddable.length === 0 ? (
                      <p className="text-xs text-gray-400 p-3 text-center">{searchPassage ? "검색 결과 없음" : "추가 가능한 지문 없음"}</p>
                    ) : filteredAddable.map((p) => (
                      <button key={p.id} onClick={() => handleAddPassage(p.id, p.title)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-blue-100 text-left">
                        <Plus className="size-3 text-blue-400 flex-shrink-0" />
                        <span className="flex-1 truncate">{p.title}</span>
                        <span className="text-gray-400">{p.questionCount}문제</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowAddPassage(false)} className="w-full text-xs text-gray-400 py-1.5 hover:text-gray-600 border-t">닫기</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">취소</button>
          <button onClick={handleSubmit} disabled={submitting || !name || !startDate || !endDate || (mode === "create" && selectedIds.size === 0)} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-blue-600">
            {submitting ? "저장 중..." : mode === "create" ? "시즌 생성" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student Progress Card (접기/펼침 — 지문별 카테고리 상세)
// ---------------------------------------------------------------------------

function StudentProgressCard({ student }: { student: StudentProgress }) {
  const [expanded, setExpanded] = useState(false);
  const catLabels = { vocabDone: "어휘", interpDone: "해석", grammarDone: "문법", compDone: "이해" };

  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        <span className="text-sm font-medium text-gray-700 w-20 truncate">{student.name}</span>
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full", student.progressPercent >= 80 ? "bg-emerald-500" : student.progressPercent >= 40 ? "bg-blue-500" : "bg-amber-500")} style={{ width: `${student.progressPercent}%` }} />
        </div>
        <span className="text-xs text-gray-500 w-20 text-right">{student.totalSessionsDone}/{student.totalMaxSessions}</span>
        <ChevronDown className={cn("size-3.5 text-gray-400 transition-transform flex-shrink-0", expanded && "rotate-180")} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2">
              {student.passageDetails.map((pd) => (
                <div key={pd.passageId} className="bg-white rounded-lg p-2.5 border border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-700 truncate flex-1 mr-2">{pd.passageTitle}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {pd.masteryPassed && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded font-medium">마스터리</span>}
                      <span className="text-[10px] text-gray-400">{pd.totalDone}/21</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["vocabDone", "interpDone", "grammarDone", "compDone"] as const).map((key) => (
                      <div key={key} className="text-center">
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-0.5">
                          <div className={cn("h-full rounded-full", pd[key] >= 5 ? "bg-emerald-500" : pd[key] > 0 ? "bg-blue-500" : "bg-gray-100")} style={{ width: `${(pd[key] / 5) * 100}%` }} />
                        </div>
                        <span className="text-[9px] text-gray-400">{catLabels[key]} {pd[key]}/5</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
