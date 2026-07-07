// ============================================================================
// 학생 시험 리포트 — 내러티브 렌더 (view 표시 전용)
//
// AI/강사 내러티브의 `**강조**` 만 파싱해 <strong class="rpt-em"> 로 렌더한다
// (테마 primary 틴트 언더라인 하이라이트 — 스타일은 report-document 의 베이스 CSS).
// 그 외 텍스트는 전부 평문 — 레거시 문서(마크업 없음)도 동일하게 렌더된다.
// 문단 분리: \n\n → <p class="rpt-para"> (줄바꿈 리듬은 셸이 flex gap 으로 제어).
// edit 모드의 EditableText 는 raw 문자열을 그대로 다룬다(파싱은 view 에만).
// ============================================================================

import type { ReactNode } from "react";

const EM_PATTERN = /\*\*([^*]+)\*\*/g;

/** 한 문단 안의 **강조** 를 <strong class="rpt-em"> 로 치환한다. */
function renderEmphasis(text: string, paraKey: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  EM_PATTERN.lastIndex = 0;
  while ((match = EM_PATTERN.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <strong key={`${paraKey}-${match.index}`} className="rpt-em">
        {match[1]}
      </strong>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * 내러티브 문자열 → 문단(<p>) 노드. 빈 내러티브는 null.
 * 모든 섹션의 view 본문은 이 함수를 통해서만 렌더한다(공유 API 2f).
 */
export function renderNarrative(text: string): ReactNode {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paras.length === 0) return null;
  return paras.map((para, i) => (
    <p key={i} className="rpt-para whitespace-pre-wrap">
      {renderEmphasis(para, i)}
    </p>
  ));
}
