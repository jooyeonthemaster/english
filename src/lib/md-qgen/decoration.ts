// ============================================================================
// md 장식(마크다운 강조) 흡수 공용 유틸 — 26-07-27 신설.
//
// 왜 만들었나: 20유형이 각자 stripDecoration 을 재발명했고, 각자 **다른 부분집합**
// 만 처리했다. 실측 잔여 결함이 전부 같은 계통이었다 —
//   · `**` 만 처리하고 `_` `*` 백틱 누락
//   · 한쪽만 벗겨 값 선두/말미가 오염된 채 저장
//   · 머리표만 관용하고 값은 그대로 (`정답: **③**`)
//   · 콜론 앞만 관용하고 뒤는 아님 (`**정답**: ③`)
// 이 계통의 피해는 두 갈래다: (a) 필드가 통째로 사라져 게이트가 **거짓 원인**을
// 지목하고 그 문구가 재생성 피드백으로 나간다 (b) 장식이 학생 표면까지 새어 나간다
// (PASSTHROUGH 유형은 후처리가 씻어 주지 않는다).
//
// 규범: docs/md-qgen-type-expansion-spec.md §1-B 철칙 3
// 이 파일은 순수 모듈이다(의존성 0). 신규 유형은 자기 파서에 복제하지 말고 여기서 가져다 쓴다.
// ============================================================================

/** 강조 표식 — 굵게·기울임·취소선·인라인 코드. 개수 제한 없이(***bold italic***) 흡수. */
const EMPHASIS_RUN = /(\*{1,3}|_{1,3}|~{1,2}|`{1,3})/g;

/**
 * 값 안팎의 마크다운 강조 표식을 제거한다(텍스트는 보존).
 *
 * `**정답**` → `정답` · `were *once* regarded` → `were once regarded`
 * `_해설:_` → `해설:` · ``` `③` ``` → `③`
 *
 * 언더스코어는 **낱말 내부**(snake_case·file_name)를 훼손하지 않도록,
 * 양옆이 모두 낱말 문자인 경우 보존한다.
 */
export function stripEmphasis(text: string): string {
  if (!text) return "";
  let out = "";
  let i = 0;
  EMPHASIS_RUN.lastIndex = 0;
  for (const m of text.matchAll(EMPHASIS_RUN)) {
    const idx = m.index ?? 0;
    const run = m[1];
    out += text.slice(i, idx);
    i = idx + run.length;
    if (run[0] !== "_") continue; // *, ~, ` 는 무조건 제거
    // 언더스코어: 양옆이 모두 낱말 문자면 식별자의 일부로 보고 살린다.
    const before = text[idx - 1] ?? "";
    const after = text[idx + run.length] ?? "";
    if (/\w/.test(before) && /\w/.test(after)) out += run;
  }
  out += text.slice(i);
  return out;
}

// 값 전체를 감싼 따옴표 — 곧은/곱슬/홑 모두. 강조와 달리 **본문 의미**일 수 있어
// (예: `"Green" corridors were once "decoration"`) 전체를 감싼 한 겹만 벗긴다.
const WRAPPING_QUOTES: readonly [string, string][] = [
  ['"', '"'],
  ["“", "”"],
  ["'", "'"],
  ["‘", "’"],
];

/** 값 전체를 감싼 따옴표 한 겹만 벗긴다. 안쪽에 같은 따옴표가 또 있으면 손대지 않는다. */
export function unwrapQuotes(text: string): string {
  const t = text.trim();
  for (const [open, close] of WRAPPING_QUOTES) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) {
      const inner = t.slice(open.length, t.length - close.length);
      if (!inner.includes(open) && !inner.includes(close)) return inner.trim();
    }
  }
  return t;
}

/**
 * md 값 표면 정리 — 강조 제거 + 감싼 따옴표 한 겹 제거 + 공백 정돈.
 * 저장·표시로 나가는 모든 값(선지 텍스트·해설·모범답안 등)에 통과시킨다.
 */
export function cleanMdValue(text: unknown): string {
  if (typeof text !== "string") return "";
  return unwrapQuotes(stripEmphasis(text)).replace(/\s+/g, " ").trim();
}

// 머리표 앞에 올 수 있는 것: 들여쓰기 · 인용(>) · 불릿(-,*,•) · 헤딩(#) · 표 파이프
const HEAD_LEAD = String.raw`^[\s>|]*(?:#{1,6}\s*)?(?:[-*•]\s+)?[\s*_~\x60"'“‘]*`;
// 콜론 앞뒤로 붙는 장식과 전각 콜론
const HEAD_TAIL = String.raw`[\s*_~\x60"'”’]*\s*[:：]?[\s*_~\x60]*[ \t]*`;

/**
 * 키워드 줄 머리표 정규식을 만든다 — 장식 8계통을 한 번에 흡수한다.
 *
 *   `정답: ③` · `**정답:** ③` · `**정답**: ③` · `__정답:__ ③` · `_정답:_ ③`
 *   `## 정답: ③` · `> 정답: ③` · `- 정답: ③` · `정답： ③` · 꼬리 공백
 *   `## 정답`(콜론 없는 헤딩 관습)
 *
 * 값은 캡처 그룹 1. 값 쪽 장식은 호출자가 cleanMdValue 로 마저 벗긴다
 * (`정답: **③**` 처럼 값이 감싸인 경우).
 *
 * @param keyword 키워드 리터럴(정규식 특수문자 없는 한글/영문 가정)
 * @param multiline true 면 gm 플래그(전 줄 스캔용)
 */
export function keywordLineRe(keyword: string, multiline = false): RegExp {
  return new RegExp(`${HEAD_LEAD}${keyword}${HEAD_TAIL}(.*)$`, multiline ? "gm" : "m");
}

/** 그 줄이 해당 키워드의 머리표 줄인지(값이 다음 줄에 있어도 true). */
export function isKeywordHead(line: string, keyword: string): boolean {
  return new RegExp(`${HEAD_LEAD}${keyword}${HEAD_TAIL}$|${HEAD_LEAD}${keyword}${HEAD_TAIL}.+$`).test(line);
}

/**
 * 키워드 줄의 값을 읽는다. 머리표만 있고 값이 다음 줄에 있는 드리프트
 * (`정답:` 개행 `③`)까지 흡수한다. 다음 키워드 줄을 넘어가지는 않는다.
 *
 * @param stopKeywords 값 탐색을 멈출 다른 섹션 키워드들
 */
export function readKeywordValue(
  text: string,
  keyword: string,
  stopKeywords: readonly string[] = [],
): string {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(keywordLineRe(keyword));
    if (!m) continue;
    const inline = cleanMdValue(m[1] ?? "");
    if (inline) return inline;
    // 값이 다음 줄에 있는 경우 — 다음 키워드 머리표 전까지의 첫 비어있지 않은 줄.
    for (let k = i + 1; k < lines.length; k += 1) {
      const next = lines[k];
      if (!next.trim()) continue;
      if (stopKeywords.some((kw) => isKeywordHead(next, kw))) break;
      return cleanMdValue(next);
    }
    return "";
  }
  return "";
}

/**
 * 키워드로 시작하는 섹션 본문을 잘라낸다(다음 섹션 키워드 전까지).
 * 섹션 lookahead 를 유형마다 손으로 쓰다가 "일부 키워드만 알아서 블록이 붕괴"하는
 * 실측 결함이 반복됐다 — 정지 키워드를 빠짐없이 넘기면 이 함수가 처리한다.
 */
export function sliceKeywordSection(
  text: string,
  keyword: string,
  stopKeywords: readonly string[],
): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => isKeywordHead(l, keyword));
  if (start < 0) return "";
  const body: string[] = [];
  const head = lines[start].match(keywordLineRe(keyword));
  const inline = (head?.[1] ?? "").trim();
  if (inline) body.push(inline);
  for (let i = start + 1; i < lines.length; i += 1) {
    if (stopKeywords.some((kw) => isKeywordHead(lines[i], kw))) break;
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}
