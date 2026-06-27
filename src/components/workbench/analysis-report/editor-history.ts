import type { SetStateAction } from "react";

import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

type ReportHistoryState = {
  present: AnalysisReport;
  past: AnalysisReport[];
  future: AnalysisReport[];
};

type ReportHistoryAction =
  | { type: "set"; updater: SetStateAction<AnalysisReport>; record?: boolean }
  | { type: "replace"; report: AnalysisReport; clearHistory?: boolean }
  | { type: "undo" }
  | { type: "redo" };

function resolveReportUpdate(
  current: AnalysisReport,
  updater: SetStateAction<AnalysisReport>,
): AnalysisReport {
  return typeof updater === "function"
    ? (updater as (current: AnalysisReport) => AnalysisReport)(current)
    : updater;
}

export function reportHistoryReducer(
  state: ReportHistoryState,
  action: ReportHistoryAction,
): ReportHistoryState {
  if (action.type === "undo") {
    const previous = state.past[state.past.length - 1];
    if (!previous) return state;
    return {
      present: previous,
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future],
    };
  }

  if (action.type === "redo") {
    const next = state.future[0];
    if (!next) return state;
    return {
      present: next,
      past: [...state.past, state.present].slice(-50),
      future: state.future.slice(1),
    };
  }

  if (action.type === "replace") {
    return {
      present: action.report,
      past: action.clearHistory ? [] : state.past,
      future: action.clearHistory ? [] : state.future,
    };
  }

  const next = resolveReportUpdate(state.present, action.updater);
  if (next === state.present) return state;
  if (action.record === false) return { ...state, present: next };
  return {
    present: next,
    past: [...state.past, state.present].slice(-50),
    future: [],
  };
}
