"use client";

import { Target, X } from "lucide-react";

interface KeyPointsListProps {
  keyPoints: string[];
  editingIdx: number | null;
  editValue: string;
  newPoint: string;
  setEditValue: (v: string) => void;
  setEditingIdx: (v: number | null) => void;
  setNewPoint: (v: string) => void;
  startEdit: (idx: number) => void;
  confirmEdit: () => void;
  removePoint: (idx: number) => void;
  addPoint: () => void;
}

export function KeyPointsList({
  keyPoints,
  editingIdx,
  editValue,
  newPoint,
  setEditValue,
  setEditingIdx,
  setNewPoint,
  startEdit,
  confirmEdit,
  removePoint,
  addPoint,
}: KeyPointsListProps) {
  return (
    <div className="space-y-2">
      {keyPoints.map((point, idx) => (
        <div
          key={idx}
          className="group flex items-start gap-3 p-3 rounded-lg bg-amber-50/80 border border-amber-100/80 hover:border-amber-200 transition-colors"
        >
          <Target className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          {editingIdx === idx ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={confirmEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmEdit();
                if (e.key === "Escape") setEditingIdx(null);
              }}
              className="flex-1 text-sm text-slate-700 bg-white px-2 py-0.5 rounded border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          ) : (
            <p
              className="flex-1 text-sm text-slate-700 cursor-pointer hover:text-slate-900"
              onClick={() => startEdit(idx)}
              title="클릭하여 편집"
            >
              {point}
            </p>
          )}
          <button
            onClick={() => removePoint(idx)}
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all shrink-0"
            title="삭제"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* Add new point */}
      <div className="flex items-center gap-2">
        <input
          placeholder="출제 포인트 추가..."
          value={newPoint}
          onChange={(e) => setNewPoint(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addPoint(); }
          }}
          className="flex-1 h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
        />
        <button
          onClick={addPoint}
          disabled={!newPoint.trim()}
          className="h-9 px-3 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-40 transition-colors"
        >
          추가
        </button>
      </div>
    </div>
  );
}
