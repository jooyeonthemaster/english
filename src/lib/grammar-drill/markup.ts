// ============================================================================
// 어법 드릴 — 텍스트 마크업 파서 (클라이언트 안전, 의존성 0)
//
// 콘텐츠 마크업 규약(types.ts 헤더 참조)을 렌더 세그먼트 배열로 변환한다.
// dangerouslySetInnerHTML 을 쓰지 않기 위한 구조 — 렌더러는 세그먼트를
// React 엘리먼트로 조립한다.
// ============================================================================

export type MarkupSegment =
  | { kind: "text"; value: string }
  | { kind: "blank" }
  | { kind: "underline"; n: number | null; value: string }
  | { kind: "bold"; value: string };

const TOKEN_RE =
  /\{\{blank\}\}|\[\[([1-9]|u):((?:(?!\]\]).)+)\]\]|\*\*((?:(?!\*\*).)+)\*\*/g;

export function parseMarkup(text: string): MarkupSegment[] {
  const segments: MarkupSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ kind: "text", value: text.slice(last, idx) });
    if (m[0] === "{{blank}}") {
      segments.push({ kind: "blank" });
    } else if (m[1] !== undefined) {
      segments.push({
        kind: "underline",
        n: m[1] === "u" ? null : Number(m[1]),
        value: m[2],
      });
    } else if (m[3] !== undefined) {
      segments.push({ kind: "bold", value: m[3] });
    }
    last = idx + m[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", value: text.slice(last) });
  return segments;
}

/** 마크업 제거 순수 텍스트 (AI 질문 컨텍스트·검증용) */
export function stripMarkup(text: string): string {
  return text
    .replace(/\{\{blank\}\}/g, "____")
    .replace(/\[\[(?:[1-9]|u):((?:(?!\]\]).)+)\]\]/g, "$1")
    .replace(/\*\*((?:(?!\*\*).)+)\*\*/g, "$1");
}

/** 밑줄에 번호 원문자를 붙인 텍스트 (AI 질문 컨텍스트용) */
export function renderMarkupForAi(text: string): string {
  const CIRCLED = ["①", "②", "③", "④", "⑤"];
  return text
    .replace(/\{\{blank\}\}/g, "____")
    .replace(/\[\[([1-9]):((?:(?!\]\]).)+)\]\]/g, (_s, n: string, tok: string) => {
      return `${CIRCLED[Number(n) - 1] ?? `(${n})`}<${tok}>`;
    })
    .replace(/\[\[u:((?:(?!\]\]).)+)\]\]/g, "<$1>")
    .replace(/\*\*((?:(?!\*\*).)+)\*\*/g, "$1");
}

/** 서술형 답안 정규화 비교 */
export function normalizeWrittenAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

export function isWrittenAnswerAccepted(
  given: string,
  accepted: string[],
): boolean {
  const norm = normalizeWrittenAnswer(given);
  if (!norm) return false;
  return accepted.some((a) => normalizeWrittenAnswer(a) === norm);
}
