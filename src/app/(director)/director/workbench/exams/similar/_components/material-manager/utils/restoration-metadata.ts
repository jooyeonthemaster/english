import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

import type { M1PassageDraftWithJob, RestorationDebugMetadata } from "../types";

export function readRestorationMetadata(
  draft: M1PassageDraftWithJob,
): RestorationDebugMetadata | null {
  const metadata = draft.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const restoration = (metadata as Record<string, unknown>).restoration;
  if (
    !restoration ||
    typeof restoration !== "object" ||
    Array.isArray(restoration)
  )
    return null;
  return restoration as RestorationDebugMetadata;
}

export function recommendationLabel(value: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (value) {
    case "BOTH_AGREE":
      return {
        label: "출처 = AI",
        className: "bg-slate-50 text-slate-700 ring-slate-200",
      };
    case "SOURCE_PRIMARY":
      return {
        label: "출처 우선",
        className: "bg-slate-50 text-slate-700 ring-slate-200",
      };
    case "AI_PRIMARY":
      return {
        label: "AI 복원 우선",
        className: "bg-slate-50 text-slate-700 ring-slate-200",
      };
    case "TEACHER_REVIEW_REQUIRED":
      return {
        label: "교사 검수 필요",
        className: "bg-slate-50 text-slate-700 ring-slate-200",
      };
    default:
      return {
        label: value ?? "정보 없음",
        className: "bg-slate-50 text-slate-700 ring-slate-200",
      };
  }
}

export function getRestorationMethod(
  draft: M1PassageDraftSnapshot,
): string | null {
  const metadata = draft.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const restoration = (metadata as { restoration?: unknown }).restoration;
  if (
    !restoration ||
    typeof restoration !== "object" ||
    Array.isArray(restoration)
  ) {
    return null;
  }
  const method = (restoration as { method?: unknown }).method;
  return typeof method === "string" ? method : null;
}
