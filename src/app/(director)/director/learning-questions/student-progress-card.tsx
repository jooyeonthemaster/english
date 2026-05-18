"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudentProgress } from "./season-manager-types";

// ---------------------------------------------------------------------------
// Student Progress Card (접기/펼침 — 지문별 카테고리 상세)
// ---------------------------------------------------------------------------

export function StudentProgressCard({ student }: { student: StudentProgress }) {
  const [expanded, setExpanded] = useState(false);
  const catLabels = { vocabDone: "어휘", interpDone: "해석", grammarDone: "문법", compDone: "이해" };

  return (
    <div className="bg-slate-50 rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        <span className="text-sm font-medium text-slate-700 w-20 truncate">{student.name}</span>
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full", student.progressPercent >= 80 ? "bg-emerald-500" : student.progressPercent >= 40 ? "bg-blue-500" : "bg-amber-500")} style={{ width: `${student.progressPercent}%` }} />
        </div>
        <span className="text-xs text-slate-500 w-20 text-right">{student.totalSessionsDone}/{student.totalMaxSessions}</span>
        <ChevronDown className={cn("size-3.5 text-slate-400 transition-transform flex-shrink-0", expanded && "rotate-180")} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 space-y-2">
              {student.passageDetails.map((pd) => (
                <div key={pd.passageId} className="bg-white rounded-lg p-2.5 border border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-700 truncate flex-1 mr-2">{pd.passageTitle}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {pd.masteryPassed && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded font-medium">마스터리</span>}
                      <span className="text-[10px] text-slate-400">{pd.totalDone}/21</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["vocabDone", "interpDone", "grammarDone", "compDone"] as const).map((key) => (
                      <div key={key} className="text-center">
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-0.5">
                          <div className={cn("h-full rounded-full", pd[key] >= 5 ? "bg-emerald-500" : pd[key] > 0 ? "bg-blue-500" : "bg-slate-100")} style={{ width: `${(pd[key] / 5) * 100}%` }} />
                        </div>
                        <span className="text-[9px] text-slate-400">{catLabels[key]} {pd[key]}/5</span>
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
