// @ts-nocheck
"use client";

import { Grid2X2, Grid3X3, List } from "lucide-react";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";

export type QuestionGridCols = 2 | 3 | "list";

interface Props {
  gridCols: QuestionGridCols;
  setGridCols: (cols: QuestionGridCols) => void;
}

const GRID_TOGGLE_OPTIONS = [
  { value: 2, label: "2열 보기", Icon: Grid2X2 },
  { value: 3, label: "3열 보기", Icon: Grid3X3 },
  { value: "list", label: "목록 보기", Icon: List },
] satisfies ReadonlyArray<ViewModeCycleOption<QuestionGridCols>>;

export function GridToggle({ gridCols, setGridCols }: Props) {
  return (
    <ViewModeCycleButton
      value={gridCols}
      options={GRID_TOGGLE_OPTIONS}
      onChange={setGridCols}
    />
  );
}
