"use client";

import type { ReactNode } from "react";
import { Crosshair } from "lucide-react";

// ============================================================================
// "포인트 짚어주기"로 생성된 문항의 지문 재현 — 문제 상세 모달들(생성 페이지·
// 문제은행 question-detail-dialog·시험지 빌더)이 공유하는 단일 표시 컴포넌트.
// - 포인트 출처: structuredData._teacherPoints (저장본 — 객체/JSON 문자열 모두),
//   또는 최상위 _teacherPoints (방금 생성된 세션 문항 — structuredData 래핑 전).
// - 표시: 지문 상단 칩 레일 + 본문 ①② 하이라이트. 앵커링은 서버 재앵커링과
//   동일한 indexOf(첫 일치·비중첩) 규칙 — 프롬프트에 실제 반영된 위치와 일치.
// - 포인트가 없으면(대부분의 문항) 지문만 렌더 — 기존과 픽셀 동일.
// ============================================================================

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫"] as const;

export interface TeacherPointLike {
  text: string;
  tag?: string;
}

/** 문항 객체(카드 아이템·저장본·세션 신선분)에서 교사 지정 포인트를 읽는다. */
export function readTeacherPointsFromQuestion(question: unknown): TeacherPointLike[] {
  const q =
    question && typeof question === "object"
      ? (question as Record<string, unknown>)
      : null;
  if (!q) return [];
  let sd: unknown = q.structuredData;
  if (typeof sd === "string") {
    try {
      sd = JSON.parse(sd);
    } catch {
      sd = null;
    }
  }
  const sdRec = sd && typeof sd === "object" ? (sd as Record<string, unknown>) : null;
  const raw = sdRec?._teacherPoints ?? q._teacherPoints;
  if (!Array.isArray(raw)) return [];
  const points: TeacherPointLike[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { text, tag } = item as { text?: unknown; tag?: unknown };
    if (typeof text !== "string" || text.trim().length === 0) continue;
    points.push({
      text,
      ...(typeof tag === "string" && tag.trim() ? { tag } : {}),
    });
  }
  return points;
}

export function TeacherPointsPassage({
  content,
  question,
  bodyClassName,
}: {
  content: string;
  /** 포인트를 읽을 문항 객체 — readTeacherPointsFromQuestion 규칙으로 해석. */
  question: unknown;
  /** 지문 본문 래퍼 클래스 — 호출부 기존 스타일을 그대로 넘긴다. */
  bodyClassName: string;
}) {
  const points = readTeacherPointsFromQuestion(question);
  const body = (children: ReactNode) => (
    <div className={bodyClassName}>{children}</div>
  );
  if (points.length === 0) return body(content);

  // 서버 재앵커링과 동일한 indexOf(첫 일치·비중첩) — 본문에 없는 포인트
  // (변형본 재바인딩 등)는 하이라이트 없이 칩으로만 남는다.
  const ranges: { start: number; end: number; idx: number }[] = [];
  points.forEach((point, idx) => {
    const at = content.indexOf(point.text);
    if (at < 0) return;
    const end = at + point.text.length;
    if (ranges.some((r) => r.start < end && at < r.end)) return;
    ranges.push({ start: at, end, idx });
  });
  ranges.sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) {
      nodes.push(<span key={`t${pos}`}>{content.slice(pos, r.start)}</span>);
    }
    nodes.push(
      <mark
        key={`m${r.start}`}
        className="rounded-[3px] bg-blue-100 px-0.5 text-blue-900 [box-decoration-break:clone]"
        style={{ boxShadow: "inset 0 -2px 0 0 #3b82f6" }}
      >
        <span className="mr-0.5 font-bold text-blue-600">
          {CIRCLED[r.idx] ?? String(r.idx + 1)}
        </span>
        {content.slice(r.start, r.end)}
      </mark>,
    );
    pos = r.end;
  }
  if (pos < content.length) {
    nodes.push(<span key={`t${pos}`}>{content.slice(pos)}</span>);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-1.5 py-0.5 text-[10.5px] font-bold text-white">
          <Crosshair className="size-3" aria-hidden="true" />
          포인트 짚어주기 {points.length}
        </span>
        {points.map((point, i) => (
          <span
            key={`${point.text}-${i}`}
            className="inline-flex max-w-[240px] items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-medium text-blue-900"
          >
            <span className="font-bold text-blue-600">
              {CIRCLED[i] ?? String(i + 1)}
            </span>
            <span className="truncate" title={point.text}>
              {point.text}
            </span>
            {point.tag ? (
              <span className="shrink-0 rounded bg-blue-600 px-1 text-[9.5px] font-bold text-white">
                {point.tag}
              </span>
            ) : null}
          </span>
        ))}
      </div>
      {body(nodes)}
    </>
  );
}
