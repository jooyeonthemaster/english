"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * 스모트 소식 본문 렌더러 — 외부 마크다운 라이브러리 없이 자주 쓰는 문법만
 * 가볍게 처리한다. 지원: `## `/`### ` 소제목, `- `/`* `/`• ` 불릿, `1. ` 번호
 * 목록, `**굵게**` 인라인, 빈 줄 문단 구분. 그 외는 일반 문단으로 렌더.
 *
 * 공지 본문은 운영진이 직접 작성하므로 원시 HTML 은 다루지 않는다(XSS 안전).
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // **굵게** 만 처리. 나머지는 그대로.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-inherit">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={`${keyPrefix}-t${i}`}>{part}</React.Fragment>;
  });
}

interface Block {
  type: "h2" | "h3" | "ul" | "ol" | "p";
  lines: string[];
}

function parseBlocks(content: string): Block[] {
  const rawLines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let current: Block | null = null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const raw of rawLines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed === "") {
      flush();
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flush();
      blocks.push({ type: "h3", lines: [trimmed.slice(4)] });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flush();
      blocks.push({ type: "h2", lines: [trimmed.slice(3)] });
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flush();
      blocks.push({ type: "h2", lines: [trimmed.slice(2)] });
      continue;
    }
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (!current || current.type !== "ul") {
        flush();
        current = { type: "ul", lines: [] };
      }
      current.lines.push(bullet[1]);
      continue;
    }
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (!current || current.type !== "ol") {
        flush();
        current = { type: "ol", lines: [] };
      }
      current.lines.push(numbered[1]);
      continue;
    }
    // 일반 문단 — 연속 줄은 같은 문단으로 이어 붙인다(줄바꿈 <br/>).
    if (!current || current.type !== "p") {
      flush();
      current = { type: "p", lines: [] };
    }
    current.lines.push(trimmed);
  }
  flush();
  return blocks;
}

export function AnnouncementBody({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = parseBlocks(content);
  return (
    <div className={cn("space-y-3 leading-relaxed", className)}>
      {blocks.map((block, bi) => {
        if (block.type === "h2") {
          return (
            <h2 key={bi} className="text-[15px] font-bold text-slate-900 mt-1">
              {renderInline(block.lines[0], `h2-${bi}`)}
            </h2>
          );
        }
        if (block.type === "h3") {
          return (
            <h3 key={bi} className="text-[14px] font-semibold text-slate-800">
              {renderInline(block.lines[0], `h3-${bi}`)}
            </h3>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5 marker:text-slate-400">
              {block.lines.map((li, i) => (
                <li key={i}>{renderInline(li, `ul-${bi}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={bi} className="list-decimal space-y-1 pl-5 marker:text-slate-400">
              {block.lines.map((li, i) => (
                <li key={i}>{renderInline(li, `ol-${bi}-${i}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={bi}>
            {block.lines.map((ln, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                {renderInline(ln, `p-${bi}-${i}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
