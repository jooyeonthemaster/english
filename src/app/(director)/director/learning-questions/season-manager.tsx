"use client";

import { useEffect, useState } from "react";
import {
  Plus, Calendar, BookOpen,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getSeasons, updateSeason, deleteSeason,
} from "@/actions/learning-admin";
import { GRADE_LEVELS } from "@/lib/learning-constants";
import type { Season } from "./season-manager-types";
import { SeasonDetailModal } from "./season-detail-modal";
import { SeasonFormModal } from "./season-form-modal";

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
      {[1, 2].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl" />)}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{seasons.length}개 시즌</p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
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
          <div className="text-center py-12 text-slate-400">
            <BookOpen className="size-12 mx-auto mb-3 text-slate-300" />
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
                "rounded-lg border p-3.5 cursor-pointer hover:shadow-sm transition-all",
                s.isActive && isOngoing ? "border-blue-200 bg-blue-50/30" : "border-slate-200 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("w-1.5 h-10 rounded-full", s.type === "EXAM_PREP" ? "bg-rose-400" : "bg-emerald-400")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{s.name}</h3>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0", s.type === "EXAM_PREP" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
                      {s.type === "EXAM_PREP" ? "내신 집중" : "평상시"}
                    </span>
                    {isPast && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">종료</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
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
                    {s.isActive ? <ToggleRight className="size-6 text-blue-500" /> : <ToggleLeft className="size-6 text-slate-300" />}
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
