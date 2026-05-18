"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Users, ChevronDown, Trash2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSeasonStudentProgress } from "@/actions/learning-admin";
import { GRADE_LEVELS } from "@/lib/learning-constants";
import type { Season, StudentProgress } from "./season-manager-types";
import { StudentProgressCard } from "./student-progress-card";

// ---------------------------------------------------------------------------
// Season Detail Modal (읽기 전용: 정보 확인 + 학생 진도)
// ---------------------------------------------------------------------------

export function SeasonDetailModal({ season, onClose, onEdit, onDelete }: {
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-6 rounded-full", season.type === "EXAM_PREP" ? "bg-rose-400" : "bg-emerald-400")} />
            <h3 className="text-base font-bold text-slate-900">{season.name}</h3>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", season.type === "EXAM_PREP" ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
              {season.type === "EXAM_PREP" ? "내신 집중" : "평상시"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-blue-500" title="수정"><Pencil className="size-4" /></button>
            <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-rose-500" title="삭제"><Trash2 className="size-4" /></button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="size-4" /></button>
          </div>
        </div>

        {/* Info */}
        <div className="px-4 py-3 border-b bg-slate-50/50">
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Calendar className="size-3" />{new Date(season.startDate).toLocaleDateString("ko-KR")} ~ {new Date(season.endDate).toLocaleDateString("ko-KR")}</span>
            {season.grade && <span>{GRADE_LEVELS.find((g) => g.value === season.grade)?.label}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Passages (읽기 전용) */}
          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">배정된 지문 ({season.passages.length})</p>
          <div className="space-y-1.5 mb-4">
            {season.passages.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="text-xs text-slate-400 w-5">{i + 1}.</span>
                <span className="flex-1 truncate">{p.title}</span>
              </div>
            ))}
            {season.passages.length === 0 && <p className="text-xs text-slate-400">배정된 지문이 없습니다</p>}
          </div>

          {/* Student Progress (collapsible) */}
          <button onClick={loadProgress} className="w-full flex items-center justify-between py-2 text-xs font-semibold text-slate-400 uppercase hover:text-slate-600">
            <span className="flex items-center gap-1"><Users className="size-3" />학생 진도</span>
            <ChevronDown className={cn("size-3.5 transition-transform", showProgress && "rotate-180")} />
          </button>
          <AnimatePresence>
            {showProgress && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                {!progress ? <p className="text-xs text-slate-400 py-2">불러오는 중...</p>
                  : progress.length === 0 ? <p className="text-xs text-slate-400 py-2">해당 학년 학생이 없습니다</p>
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
