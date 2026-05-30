// @ts-nocheck
"use client";

import React from "react";
import { Grid2X2, Grid3X3, List } from "lucide-react";

export type QuestionGridCols = 2 | 3 | "list";

interface Props {
  gridCols: QuestionGridCols;
  setGridCols: (cols: QuestionGridCols) => void;
}

function ViewToggleButton({
  active,
  middle,
  label,
  onClick,
  children,
}: {
  active: boolean;
  middle?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={
        "p-2 cursor-pointer transition-colors " +
        (middle ? "border-x border-slate-200 " : "") +
        (active
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-50 hover:text-slate-600")
      }
    >
      {children}
    </button>
  );
}

export function GridToggle({ gridCols, setGridCols }: Props) {
  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200 bg-white">
      <ViewToggleButton
        active={gridCols === 2}
        label="2열 보기"
        onClick={() => setGridCols(2)}
      >
        <Grid2X2 className="size-4" />
      </ViewToggleButton>
      <ViewToggleButton
        active={gridCols === 3}
        label="3열 보기"
        middle
        onClick={() => setGridCols(3)}
      >
        <Grid3X3 className="size-4" />
      </ViewToggleButton>
      <ViewToggleButton
        active={gridCols === "list"}
        label="목록 보기"
        onClick={() => setGridCols("list")}
      >
        <List className="size-4" />
      </ViewToggleButton>
    </div>
  );
}
