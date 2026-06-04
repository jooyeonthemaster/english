"use client";

import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

import { getRestorationMethod } from "../utils/restoration-metadata";

export function RestorationMethodBadge({ draft }: { draft: M1PassageDraftSnapshot }) {
  const method = getRestorationMethod(draft);
  if (!method) return null;

  const label =
    method === "LOCAL_DB"
      ? "DB 원문"
      : method === "WEB_SEARCH"
        ? "웹 원문"
        : method.includes("WEB")
          ? "웹 후보"
          : method.includes("AI")
            ? "AI 복원"
            : method === "CODE_FALLBACK"
              ? "형식 보정"
              : method === "FAILED"
                ? "수동 필요"
                : "후보 검토";

  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
      {label}
    </span>
  );
}
