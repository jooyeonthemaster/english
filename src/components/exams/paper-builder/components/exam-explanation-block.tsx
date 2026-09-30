import { Fragment } from "react";

import { cn } from "@/lib/utils";

import { buildExplanationRows } from "../explanation-content";
import {
  EXPLANATION_BULLET,
  type ExplanationSegment,
  type ExplanationSlice,
  wholeExplanationSlice,
} from "../explanation-layout";
import type { PaperItem } from "../types";

/**
 * 문항 뒤에 붙는 인라인 "정답·해설" 블록(해설 포함 PDF). DOCX 해설
 * (build-builder-document/answer.ts)과 같은 구성: 정답 배지 → 해설 → 핵심 포인트 →
 * 오답 분석.
 *
 * 조판기(pagination.ts)가 해설을 렌더 줄 단위로 나눠 칸 · 쪽 경계에서 가른다 — 이 컴포넌트는 그 조각
 * (`slice`, RenderItemPart.explanation)만 그린다. 여백 · 들여쓰기 · 글꼴은 explanation-layout.ts 의 추정
 * 상수와 1:1 이다(바꾸면 둘 다 바꾼다). 조각이 문항 조각의 맨 처음이면(「(N번 계속)」 아래) 첫 행의 위
 * 여백을 그리지 않는다. 문단이 갈라진 앞조각의 마지막 줄은 양쪽 맞춤을 유지한다.
 * 굵게(**…**)는 <strong> 으로 그린다(explanation-layout.parseExplanationInline).
 */
export function ExamExplanationBlock({
  item,
  compact,
  slice,
}: {
  item: PaperItem;
  compact: boolean;
  slice?: ExplanationSlice;
}) {
  const resolved = slice ?? wholeExplanationSlice(buildExplanationRows(item));

  return (
    <div
      data-explanation-slice={resolved.containerStart ? "start" : "continued"}
      data-est-h={process.env.NODE_ENV === "production" ? undefined : resolved.estHeight}
      className={cn(
        resolved.containerStart && !resolved.atPartStart ? "mt-2" : "mt-0",
        compact ? "text-[9.5px] leading-[1.5]" : "text-[10px] leading-[1.5]",
      )}
    >
      {resolved.pieces.map((piece, index) => {
        // 조각이 문항 조각의 첫 내용이면 첫 행의 위 여백은 추정에서도 빠진다(topGap).
        const flush = index === 0 && resolved.atPartStart;
        if (piece.kind === "answer") {
          return (
            <div key={index} className="rounded-sm border border-slate-400 bg-slate-50 px-2 py-1">
              <span className="font-bold text-slate-700">
                {piece.prefix}
                {"  "}
              </span>
              <span className="font-bold text-slate-900">{piece.text || " "}</span>
            </div>
          );
        }
        if (piece.kind === "label") {
          return (
            <p key={index} className={cn(flush ? "mt-0" : "mt-1.5", "font-bold text-slate-700")}>
              {piece.text}
            </p>
          );
        }
        const rowTop = flush || !piece.rowStart ? "mt-0" : "mt-0.5";
        if (piece.kind === "text") {
          return (
            <p
              key={index}
              className={cn(
                rowTop,
                "whitespace-pre-line pl-2 text-justify text-slate-600",
                // 다음 칸으로 이어지는 앞조각 — 마지막 줄도 본문 줄이라 양쪽 맞춤(끝줄 왼쪽 정렬 방지).
                !piece.rowEnd && "[text-align-last:justify]",
              )}
            >
              <ExplanationInline segments={piece.segments} />
            </p>
          );
        }
        if (piece.kind === "bullet") {
          return (
            <p key={index} className={cn(rowTop, "flex gap-1 pl-2 text-slate-600")}>
              {/* 이어지는 조각은 점 자리를 비워 들여쓰기만 유지한다. */}
              <span className={cn("shrink-0 text-slate-400", !piece.rowStart && "invisible")}>
                {EXPLANATION_BULLET}
              </span>
              <span className="min-w-0 flex-1">
                <ExplanationInline segments={piece.segments} />
              </span>
            </p>
          );
        }
        return (
          <p key={index} className={cn(rowTop, "pl-2 text-slate-500")}>
            <ExplanationInline segments={piece.segments} />
          </p>
        );
      })}
    </div>
  );
}

function ExplanationInline({ segments }: { segments: readonly ExplanationSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.bold ? (
          <strong key={index} className="font-bold text-slate-700">
            {segment.text}
          </strong>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
