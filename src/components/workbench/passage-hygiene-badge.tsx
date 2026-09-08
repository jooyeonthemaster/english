"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { analyzePassageHygiene } from "@/lib/passage-hygiene";

/**
 * 「지문 정리 필요」 배지 — 지문 카드·행·편집기 푸터·붙여넣기 보드 공용.
 *
 * content 에서 **안에서** 파생한다(passage-list-row 의 memo 계약: 파생 prop 을
 * 내려보내면 참조가 매번 바뀌어 마키 선택 회귀가 돌아온다). 깨끗하면 null.
 * 게이트가 아니다 — 누르는 것도 막는 것도 없다. 툴팁이 근거를 말한다.
 */
export function PassageHygieneBadge({
  content,
  className = "",
  variant = "badge",
}: {
  content: string | null | undefined;
  className?: string;
  /** badge = 카드/행 옆 작은 칩 · line = 편집기 아래 한 줄 문구 */
  variant?: "badge" | "line";
}) {
  const report = useMemo(() => analyzePassageHygiene(content), [content]);
  if (report.level === "clean") return null;
  const tone = report.dirty
    ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-slate-100 text-slate-600 ring-slate-200";
  if (variant === "line") {
    return (
      <span
        title={report.summary}
        className={
          "flex min-w-0 items-center gap-1 break-keep text-[10.5px] font-medium " +
          (report.dirty ? "text-amber-700 " : "text-slate-500 ") +
          className
        }
      >
        <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{report.summary}</span>
      </span>
    );
  }
  return (
    <span
      title={report.summary}
      className={
        "inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ring-1 " +
        tone +
        " " +
        className
      }
    >
      <AlertTriangle className="size-2.5" aria-hidden="true" />
      {report.dirty ? "지문 정리 필요" : "확인 필요"}
    </span>
  );
}
