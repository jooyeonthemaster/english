import type { GenerateTourMilestone } from "@/lib/generate-tour-demo";
import type { GenerateTourVariant } from "./generate-tour-video";

export type TourMode =
  | "direct"
  | "file"
  | "generation-details"
  | "review-files"
  | "learning-materials"
  | "workspace-edit";

export interface TourStep {
  title: string;
  body: string;
  video: GenerateTourVariant;
  targets?: string[];
  glowTargets?: string[];
  cursorPath?: {
    from: string;
    to: string;
    kind: "drag";
  };
  cropDemo?:
    | "single"
    | "first-column"
    | "second-column"
    | "workspace-selection";
  activateOutputMode?: "verbatim" | "restored";
  activateGenerationMode?: "manual" | "set";
  required?: {
    milestone: GenerateTourMilestone;
    startedMilestone?: GenerateTourMilestone;
    waitingLabel: string;
    startedLabel?: string;
    doneLabel: string;
  };
  demo?: {
    type: "sample-text" | "sample-file";
    label?: string;
    description: string;
    sampleIndex?: number;
  };
  examples?: Array<{
    label: string;
    text?: string;
    inputLabel?: string;
    inputText?: string;
    outputLabel?: string;
    outputText?: string;
  }>;
  resultHighlightCount?: number;
  decision?: {
    continueLabel: string;
    finishLabel: string;
    nextMode?: TourMode;
  };
}

export interface TargetRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface VirtualCursorState {
  left: number;
  top: number;
  visible: boolean;
  pressed: boolean;
}

export interface VirtualDragGhostState {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
  lifted: boolean;
  dropping: boolean;
}

export interface VirtualCropSelectionState {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
  active: boolean;
}

export interface PointerPoint {
  left: number;
  top: number;
}
