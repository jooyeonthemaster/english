// ============================================================================
// 해설 원문의 마크다운 규칙 — 웹 「PDF 해설」 · DOCX · HWPX 가 같은 함수로 해설을 읽는다(26-09-30).
//
// 순수 모듈(JSX · DOM · 글꼴 표 의존 0) — 서버 내보내기(export-docx build-builder-document/answer.ts,
// export-hwpx render/answer.ts)와 웹 조판(explanation-content.ts · explanation-layout.ts)이 함께 쓴다.
// 종전에는 웹만 굵게 · 글머리를 처리해서 DOCX · HWPX 해설에 `**`·「- 」 가 날것으로 찍혔다(운영 시험지
// 해설 21건 · 13건).
//
// 규칙(웹이 정본이던 규칙 그대로):
//   · 해설 **본문** 한 줄의 줄머리 「- 」「* 」「• 」 → 글머리(•) 행. 핵심 포인트 · 오답 분석은 원래 글머리 ·
//     라벨 행이라 이 규칙을 쓰지 않는다(그 글의 「- 」 는 글자 그대로).
//   · `**굵게**` → 굵은 조각. 짝 없는 마지막 `**` 는 지운다(원문 일부가 닫는 표시만 가짐 — 실측).
//   · `` `코드` `` → 백틱만 뗀다(인쇄물에서 고정폭 글꼴을 쓰지 않는다).
//   · `__`·`[..](..)`·`<..>` 는 해설 원문에서 빈칸 · 문법 라벨 · 작품 제목이라 이 규칙은 건드리지 않는다.
//   · 소프트 하이픈(U+00AD) · 폭 없는 공백 · BOM 은 뗀다. 공백은 브라우저처럼 하나로 접는다.
// ============================================================================

export type ExplanationSegment = { text: string; bold?: boolean; tone?: "label" };

/** 조각을 붙인다 — 앞 조각과 스타일이 같으면 잇는다(빈 조각은 버린다). 제자리 수정 없이 새 객체로 바꾼다. */
export function pushExplanationSegment(out: ExplanationSegment[], segment: ExplanationSegment): void {
  if (!segment.text) return;
  const last = out[out.length - 1];
  if (last && Boolean(last.bold) === Boolean(segment.bold) && last.tone === segment.tone) {
    // 새 객체로 바꾼다 — 흐름 단위(ExplanationUnit)의 조각 객체를 공유하므로 제자리 수정 금지.
    out[out.length - 1] = { ...last, text: last.text + segment.text };
  } else {
    out.push({ ...segment });
  }
}

/** 해설 한 행의 인라인 마크다운 → 글자 조각(굵게 여부). 규칙은 파일 머리 주석. */
export function parseExplanationInline(raw: string): ExplanationSegment[] {
  // 보이지 않는 끊김 문자(소프트 하이픈 · 폭 없는 공백 · BOM)는 뗀다 — 렌더도 이 결과를 그리므로 추정과 같다.
  const text = raw
    .replace(/[­​﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/`([^`]+)`/g, "$1");
  const parts = text.split("**");
  if (parts.length % 2 === 0) {
    const tail = parts.pop() ?? "";
    parts[parts.length - 1] += tail;
  }
  const out: ExplanationSegment[] = [];
  parts.forEach((part, index) => pushExplanationSegment(out, { text: part, bold: index % 2 === 1 }));
  return out;
}

/** 조각에 보이는 글자가 하나라도 있는가(없으면 그 행은 그리지 않는다 — 웹 explanationFlowRow 와 같다). */
export function hasVisibleExplanationText(segments: readonly ExplanationSegment[]): boolean {
  return segments.some((segment) => segment.text.trim().length > 0);
}

/** 해설 본문 한 줄(trim 된 것)이 마크다운 글머리(「- 」「* 」「• 」)면 글머리 뒤 글, 아니면 null. */
export function explanationBulletText(trimmedLine: string): string | null {
  const match = /^[-*•]\s+(\S.*)$/.exec(trimmedLine);
  return match ? match[1] : null;
}

export type ExplanationContentLine = { bullet: boolean; text: string };

/** 해설 본문(content) → 그릴 줄 목록. 빈 줄은 건너뛰고, 글머리 줄은 기호를 떼고 bullet 로 표시한다. */
export function explanationContentLines(content: string): ExplanationContentLine[] {
  const lines: ExplanationContentLine[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = explanationBulletText(trimmed);
    lines.push(bullet !== null ? { bullet: true, text: bullet } : { bullet: false, text: trimmed });
  }
  return lines;
}
