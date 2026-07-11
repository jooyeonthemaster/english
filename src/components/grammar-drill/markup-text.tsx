"use client";

// 어법 드릴 — 콘텐츠 마크업 렌더러.
// {{blank}} / [[n:tok]] / [[u:tok]] / **강조** 를 React 엘리먼트로 조립한다.
// dangerouslySetInnerHTML 미사용(콘텐츠는 신뢰 자산이지만 원칙 유지).

import { Fragment } from "react";
import { parseMarkup } from "@/lib/grammar-drill/markup";

const CIRCLED = ["①", "②", "③", "④", "⑤"];

export type UnderlineState = "idle" | "selected" | "correct" | "wrong";

export function MarkupText({
  text,
  className,
  blankContent,
  underlineStateFor,
  onUnderlinePress,
  numbered = true,
}: {
  text: string;
  className?: string;
  /** {{blank}} 자리에 렌더할 내용(없으면 빈 슬롯) */
  blankContent?: React.ReactNode;
  /** 밑줄 상태 — 지정 시 밑줄이 버튼이 된다(onUnderlinePress 필요) */
  underlineStateFor?: (n: number | null) => UnderlineState;
  onUnderlinePress?: (n: number) => void;
  /** 번호 밑줄 앞에 ①~⑤ 표기 */
  numbered?: boolean;
}) {
  const segments = parseMarkup(text);
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        switch (seg.kind) {
          case "text":
            return <Fragment key={i}>{seg.value}</Fragment>;
          case "bold":
            return (
              <strong key={i} className="font-semibold">
                {seg.value}
              </strong>
            );
          case "blank":
            return (
              <span key={i} className="gd-blank">
                {blankContent ?? "   "}
              </span>
            );
          case "underline": {
            const state = underlineStateFor?.(seg.n) ?? "idle";
            const label = (
              <>
                {numbered && seg.n !== null && (
                  <span className="gd-u-num">{CIRCLED[seg.n - 1] ?? seg.n}</span>
                )}
                {seg.value}
              </>
            );
            if (seg.n !== null && onUnderlinePress) {
              return (
                <button
                  key={i}
                  type="button"
                  className="gd-u"
                  data-state={state === "idle" ? undefined : state}
                  onClick={() => onUnderlinePress(seg.n as number)}
                >
                  {label}
                </button>
              );
            }
            return (
              <span
                key={i}
                className="gd-u"
                data-state={state === "idle" ? undefined : state}
              >
                {label}
              </span>
            );
          }
        }
      })}
    </span>
  );
}
