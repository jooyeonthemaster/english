import { cn } from "@/lib/utils";

import { buildExplanationRows } from "../explanation-content";
import type { PaperItem } from "../types";

/**
 * 문항 뒤에 붙는 인라인 "정답·해설" 블록(해설 포함 PDF). DOCX 해설
 * (build-builder-document/answer.ts)과 같은 구성: 정답 배지 → 해설 → 핵심 포인트 →
 * 오답 분석. 페이지네이션 높이 추정(estimateExplanationBlockHeight)과 같은 행 목록을
 * 쓴다 — 둘이 어긋나면 칸 경계에서 잘리므로 항상 buildExplanationRows 로 통일한다.
 */
export function ExamExplanationBlock({
  item,
  compact,
}: {
  item: PaperItem;
  compact: boolean;
}) {
  const rows = buildExplanationRows(item);

  return (
    <div
      className={cn(
        "mt-2 break-inside-avoid",
        compact ? "text-[9.5px] leading-[1.5]" : "text-[10px] leading-[1.5]",
      )}
    >
      {rows.map((row, index) => {
        if (row.type === "answer") {
          return (
            <div
              key={index}
              className="rounded-sm border border-slate-400 bg-slate-50 px-2 py-1"
            >
              <span className="font-bold text-slate-700">
                {row.hasOptions ? "정답" : "정답:"}
                {"  "}
              </span>
              <span className="font-bold text-slate-900">{row.text || " "}</span>
            </div>
          );
        }
        if (row.type === "label") {
          return (
            <p key={index} className="mt-1.5 font-bold text-slate-700">
              {row.text}
            </p>
          );
        }
        if (row.type === "text") {
          return (
            <p
              key={index}
              className="mt-0.5 whitespace-pre-line pl-2 text-justify text-slate-600"
            >
              {row.text}
            </p>
          );
        }
        if (row.type === "bullet") {
          return (
            <p key={index} className="mt-0.5 flex gap-1 pl-2 text-slate-600">
              <span className="shrink-0 text-slate-400">•</span>
              <span className="min-w-0 flex-1">{row.text}</span>
            </p>
          );
        }
        return (
          <p key={index} className="mt-0.5 pl-2 text-slate-500">
            <span className="font-bold text-slate-700">{row.label} </span>
            {row.text}
          </p>
        );
      })}
    </div>
  );
}
