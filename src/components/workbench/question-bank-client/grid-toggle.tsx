// @ts-nocheck
"use client";

import React from "react";
import { Grid2X2, Grid3X3, LayoutGrid } from "lucide-react";

interface Props {
  gridCols: 2 | 3 | 4;
  setGridCols: (cols: 2 | 3 | 4) => void;
}

export function GridToggle({ gridCols, setGridCols }: Props) {
  return (
    <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white">
      <button
        onClick={() => setGridCols(2)}
        className={`p-1 transition-colors ${gridCols === 2 ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
        aria-label="2열 보기"
        aria-pressed={gridCols === 2}
      >
        <Grid2X2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setGridCols(3)}
        className={`p-1 transition-colors border-x border-slate-200 ${gridCols === 3 ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
        aria-label="3열 보기"
        aria-pressed={gridCols === 3}
      >
        <Grid3X3 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setGridCols(4)}
        className={`p-1 transition-colors ${gridCols === 4 ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
        aria-label="4열 보기"
        aria-pressed={gridCols === 4}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
