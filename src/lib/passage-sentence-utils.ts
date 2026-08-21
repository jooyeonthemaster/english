// Shared sentence splitting for passages. Used by IRRELEVANT post-processor
// and by API routes for slot-count validation.

// Match a sentence-ending run of . ! ? optionally followed by closing
// quotes/brackets (curly or straight), so quoted sentences are kept whole.
// A run counts as a boundary candidate only before whitespace/end — 소수점
// ("2.1")·약어 내부 점("U.S." 의 첫 점)은 후행 공백이 없어 후보조차 안 된다.
// 수리 전에는 후보 실패 구간의 본문이 통째로 유실됐다('The rate was 2.1
// percent.' → ['1 percent.']) — 지금은 경계 후보 사이를 잘라 쓰므로 무손실.
const SENTENCE_END_RE = /[.!?]+[”’'")\]]*(?=\s|$)/g;

// 종결부호 뒤 첫 글자가 소문자면 문장 끝이 아니다 — parser-content-match 의
// 검증된 규칙 이식. 26-08-22 기출 실측(gate-irrelevant slot-* 오반려 10건):
// 'In the U.S. and Canada'·'i.e. in wholemeal'·'"Behold!" and'·
// 'storage space... but' 가 전부 이 규칙 하나로 비경계가 된다.
// 대시 경유 소문자도 비경계 — E2E 실측(26-08-22, ebsi_go1_20260324-q22):
// '…out there! - but…' 의 문중 감탄부호가 대시 하나 때문에 소문자 규칙을
// 비켜가 2조각이 됐고, 피저빌리티는 통과하는데 게이트 피드백('다른 문장을
// 골라라')이 이행 불가능한 교착 문항을 만들었다.
const LOWERCASE_AHEAD_RE = /^\s*(?:[-–—]+\s*)?[a-z]/;

// 뒤가 대문자라도 문장 끝일 수 없는 호칭·라틴 약어(Dr. Smith / e.g. Apples).
// question-postprocess/sentence-splitter.ts 의 약어 집합과 맞춘다. 한 글자
// 이니셜("C.")과 일반 점 축약 패턴은 일부러 넣지 않는다 — '…10°C to 20°C.
// This constant…'(2011 평가원)·'they just aren't. In reality…'(2024 수능)처럼
// 진짜 문장 끝을 삼키는 오탐이 실측됐다(°·' 가 \b 를 만든다).
const NON_BOUNDARY_TAIL_RE =
  /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|Inc|Ltd|Co|Corp|approx|cf|al|e\.g|i\.e)\.$/i;

// 문말 etc. 는 양쪽이 다 실측이다 — 'items, etc. These were rated…' 는 경계,
// 'etc. and other snacks' 는 비경계. 뒤가 공백+(여는따옴표)?+대문자일 때만 경계.
const ETC_TAIL_RE = /\betc\.$/i;
const NEW_SENTENCE_AHEAD_RE = /^\s*[“‘"']?\s*[A-Z]/;

// 종결부호 뒤 닫는따옴표·괄호를 걷어낸 꼬리로 약어 여부를 판정한다.
const CLOSING_TRAIL_RE = /[”’'")\]]+$/;

export function splitPassageSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sentences: string[] = [];
  let start = 0;
  SENTENCE_END_RE.lastIndex = 0;
  for (let m = SENTENCE_END_RE.exec(cleaned); m; m = SENTENCE_END_RE.exec(cleaned)) {
    const end = m.index + m[0].length;
    const after = cleaned.slice(end);
    if (LOWERCASE_AHEAD_RE.test(after)) continue;
    const candidate = cleaned.slice(start, end).trim();
    const tail = candidate.replace(CLOSING_TRAIL_RE, "");
    if (ETC_TAIL_RE.test(tail)) {
      if (!NEW_SENTENCE_AHEAD_RE.test(after)) continue;
    } else if (NON_BOUNDARY_TAIL_RE.test(tail)) {
      continue;
    }
    if (candidate) sentences.push(candidate);
    start = end;
  }
  const rest = cleaned.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences.length > 0 ? sentences : [cleaned];
}

export function countPassageSentences(text: string): number {
  return splitPassageSentences(text).length;
}
