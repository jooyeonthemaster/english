// ============================================================================
// /t/[token] 응시면 — 시험지 텍스트 마크업 렌더(순수)
//
// student-safe 페이로드의 지문/발문 텍스트를 시험지 충실도로 그린다:
//  - "__text__"  → <u> 밑줄(어법·어휘·함축 등 밑줄 마크업 — 계약 §V2)
//  - "___" 연속  → 빈칸 밑줄 칸(passageWithBlank 의 빈칸선)
//  - 원형숫자 마커(①②…)·(A)(B) 라벨은 그대로 텍스트(변환 없음 — 계약 §V2)
// 색은 인쇄 시험지와 동일하게 본문색 유지(파랑 강조는 편집면 전용 관례).
// ============================================================================

import type { ReactNode } from "react";

/** 문항 본문·선지 전용 폰트 — answer-question-row.tsx:19 관례 미러 */
export const EXAM_FONT = '"Malgun Gothic Exam", "Malgun Gothic", sans-serif';

const MARKUP_PATTERN = /__([^_]+)__|_{3,}/g;

/** 시험지 마크업 텍스트 → ReactNode 배열(pre-wrap 컨테이너 안에서 사용) */
export function renderExamMarkup(text: string): ReactNode {
  if (!text) return text;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  MARKUP_PATTERN.lastIndex = 0;
  while ((match = MARKUP_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      parts.push(
        <u key={key++} className="underline decoration-[1.5px] underline-offset-4">
          {match[1]}
        </u>,
      );
    } else {
      parts.push(
        <span
          key={key++}
          aria-hidden
          className="mx-1 inline-block min-w-[72px] border-b-[1.5px] border-current align-baseline"
        >
          &nbsp;
        </span>,
      );
    }
    lastIndex = MARKUP_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? parts : text;
}
