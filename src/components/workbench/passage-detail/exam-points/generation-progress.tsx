"use client";

import { Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { EXAM_TYPE_GROUPS } from "../constants";

interface GenerationProgressProps {
  generating: boolean;
  activeTypes: string[];
  typeCounts: Record<string, number>;
  generationProgress: Record<string, "pending" | "done" | "error">;
}

export function GenerationProgress({
  generating,
  activeTypes,
  typeCounts,
  generationProgress,
}: GenerationProgressProps) {
  if (!(generating && activeTypes.length > 0)) return null;
  return (
    <div className="space-y-2 pt-2">
      <Separator />
      <span className="text-xs font-medium text-slate-500">생성 진행 상황</span>
      <div className="flex flex-wrap gap-2">
        {activeTypes.map((typeId) => {
          const label = EXAM_TYPE_GROUPS.flatMap((g) => g.items).find((i) => i.id === typeId)?.label || typeId;
          const status = generationProgress[typeId];
          return (
            <span key={typeId} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
              status === "done" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              status === "error" ? "bg-red-50 text-red-600 border-red-200" :
              "bg-blue-50 text-blue-600 border-blue-200 animate-pulse"
            }`}>
              {status === "done" ? "v " : status === "error" ? "x " : ""}
              {label} x{typeCounts[typeId]}
              {status === "pending" && <Loader2 className="w-3 h-3 ml-1 inline animate-spin" />}
            </span>
          );
        })}
      </div>
    </div>
  );
}
