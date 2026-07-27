// ============================================================================
// 문장 전환(SENTENCE_TRANSFORM) md 파서 · 0원 스냅 · 지문 위치 탐색 유틸.
// 견본: parser-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §1-B
//   파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게. 게이트는 gate-sentence-transform.ts.
//
// ⚠ 서술형이므로 선지·정답 라벨 축이 없다. `모범답안:` 줄이 정답의 유일 진실원이고
//   (철칙 1), 어댑터가 correctAnswer 로 복제한다. 줄마다 정답 여부를 다시 받는 칸을
//   만들지 않는다 — 반의어가 정확히 그 중복 계약 때문에 실사용에서 2연속 반려됐다.
//
// 이 유형의 최강 불변식은 **원문장이 지문 축자인가**이다. 학생 시험지에서 그 문장은
// 지문 안에 밑줄로 표시되고(paper-builder/source-passage-markers.ts:12-15,114-131),
// 지문을 동봉하면 [원문] 블록이 본문에서 제거된다(question-body-layout.ts:433-439).
// 즉 축자가 아니면 학생은 전환할 문장 자체를 못 본다. 그래서 위치 탐색은 정본
// normalizeWs 와 동일한 관용 폭(곱슬따옴표·대시·말줄임·공백)에 대소문자를 더해
// 접은 좌표계에서 수행하고, 지문 원문 슬라이스로 되돌려 스냅한다.
// ============================================================================

/** md 파싱 결과 — 프로덕션 AI 문항(sentenceTransformSchema)과 1:1 대응. */
export interface MdSentenceTransformQuestion {
  kind: "sentenceTransform";
  /** 지문 축자 문장(전환 대상) */
  originalSentence: string;
  /** 전환 조건(한국어) */
  conditions: string[];
  /** 조건을 전부 적용한 영어 문장 — 정답의 유일 진실원 */
  modelAnswer: string;
  /** 등급형 채점 기준(만점/부분점수/0점) */
  scoringCriteria: string[];
  explanation: string;
}

// ── 접기 좌표계 ─────────────────────────────────────────────────────────────
// normalizeWs(parser.ts:67-74) 와 같은 관용 폭 + 대소문자 접기. 접힌 문자열의
// 각 문자가 원문 어느 인덱스에서 왔는지 map 에 남겨 원문 슬라이스로 되돌린다.

interface FoldedText {
  text: string;
  map: number[];
}

function foldChar(ch: string): string {
  if (ch === "\u2018" || ch === "\u2019" || ch === "\u02BC") return "'";
  if (ch === "\u201C" || ch === "\u201D") return '"';
  if (ch === "\u2013" || ch === "\u2014") return "-";
  if (ch === "\u2026") return "...";
  return ch.toLowerCase();
}

function foldForLocate(raw: string): FoldedText {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace) {
      out.push(" ");
      map.push(i);
      pendingSpace = false;
    }
    for (const folded of foldChar(ch)) {
      out.push(folded);
      map.push(i);
    }
  }
  return { text: out.join(""), map };
}

/** 정본 normalizeWs 와 같은 관용 + 대소문자 접기 — 비교 전용. */
export function foldForTransformMatch(value: unknown): string {
  return foldForLocate(String(value ?? "")).text;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

const SENTENCE_END_RE = /[.!?]["'\u2019\u201D)\]]*$/;

export interface SentenceLocation {
  /** 지문 원문에서 잘라낸 축자 슬라이스 — 스냅의 진실원 */
  verbatim: string;
  /** 원문 기준 시작 인덱스 */
  index: number;
  /** 지문 내 등장 횟수(접기 좌표 기준) */
  count: number;
  /** 문장 시작 경계에서 시작하는가(앞이 없거나 문장부호로 끝남) */
  startsAtSentenceBoundary: boolean;
  /** 문장 끝 구두점으로 끝나는가 */
  endsAtSentenceBoundary: boolean;
}

/**
 * 지문에서 문장을 찾는다. 못 찾으면 null.
 * 반환 verbatim 은 **지문 원문 슬라이스**이므로 그대로 저장하면 밑줄 탐색
 * (findFlexibleOccurrence)이 exact indexOf 한 방에 성공한다.
 */
export function locateSentenceInPassage(
  passage: string,
  sentence: string,
): SentenceLocation | null {
  const hay = foldForLocate(passage);
  const needle = foldForLocate(sentence).text;
  if (!needle || !hay.text) return null;
  const at = hay.text.indexOf(needle);
  if (at < 0) return null;
  const start = hay.map[at];
  const end = hay.map[at + needle.length - 1] + 1;
  const before = hay.text.slice(0, at).trimEnd();
  return {
    verbatim: passage.slice(start, end),
    index: start,
    count: countOccurrences(hay.text, needle),
    startsAtSentenceBoundary: before.length === 0 || SENTENCE_END_RE.test(before),
    endsAtSentenceBoundary: SENTENCE_END_RE.test(needle),
  };
}

// ── 줄 단위 관대 파싱 ───────────────────────────────────────────────────────

type SectionKey = "original" | "conditions" | "modelAnswer" | "scoring" | "explanation";

/**
 * 마크다운 장식을 걷어낸다. 실측 드리프트: 불릿(`- ` `* ` `• `), 번호(`1. ` `1) `),
 * 원문자, 강조(`**` `*` `__`), 인용(`> `), 표 파이프, 헤딩(`## `).
 * 강조 표기는 값에서도 제거한다 — 영어 문장·한국어 조건 어디에도 `*`·`__` 는 데이터가 아니다.
 *
 * ⚠ 26-07-26 웨이브2: `**` 만 걷어내던 탓에 `*모범답안:*`·`__해설:__` 이 라벨로 안 읽혀
 *   그 필드가 통째로 사라졌다(게이트는 "모범답안 누락" 이라는 **사실과 다른 원인**을 지목).
 *   키워드 줄 관용은 전 라벨에 동일 폭으로 걸어야 한다.
 */
function stripMd(line: string): string {
  return line
    .replace(/\*{1,3}/g, "")
    .replace(/_{2,3}/g, "")
    .replace(/^[\s>]*/, "")
    .replace(/^\|\s*/, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:[-•\u2022\u00B7\u25CF\u25CB\u25AA\u25E6\u2023\u2043\u30FB]|\d{1,2}[.)]|[\u2460-\u2473])\s+/, "")
    .replace(/\s*\|+\s*$/, "")
    .trim();
}

// ── 키워드 줄 관용 ──────────────────────────────────────────────────────────
// 전각/변형 콜론과 라벨을 감싸는 괄호까지 흡수한다. 라벨 하나라도 무관용이면
// 그 필드가 조용히 사라지고 게이트가 엉뚱한 원인을 지목한다(철칙 3·5).
/** `:` `：`(FF1A) `﹕`(FE55) `︓`(FE13) `∶`(2236) `ː`(02D0) */
const COLON_CLASS = "[:\\uFF1A\\uFE55\\uFE13\\u2236\\u02D0]";
const LABEL_OPEN = "[\\[({\\u3010\\u300C\\u3014<]?";
const LABEL_CLOSE = "[\\])}\\u3011\\u300D\\u3015>]?";

/** 라벨 대안 목록 → 관용 헤더 정규식. 값은 항상 캡처 1번. */
function headerRe(labelAlternatives: string): RegExp {
  return new RegExp(
    `^${LABEL_OPEN}\\s*(?:${labelAlternatives})\\s*${LABEL_CLOSE}\\s*${COLON_CLASS}\\s*(.*)$`,
  );
}

/** 라벨 정본과 별칭. 별칭은 별도 슬롯에 담아 정본이 이기게 한다(중복 출력 드리프트 흡수). */
const HEADERS: Array<{ key: SectionKey; alias: boolean; re: RegExp }> = [
  { key: "original", alias: false, re: headerRe("원\\s*문장|원래\\s*문장|대상\\s*문장|전환\\s*대상(?:\\s*문장)?|원문") },
  { key: "conditions", alias: false, re: headerRe("전환\\s*조건|작성\\s*조건|조건") },
  { key: "modelAnswer", alias: false, re: headerRe("모범\\s*답안(?:\\s*문장)?|모범답|모범\\s*답") },
  { key: "modelAnswer", alias: true, re: headerRe("정답(?:\\s*문장)?|답안|답") },
  { key: "scoring", alias: false, re: headerRe("채점\\s*기준|채점\\s*포인트|채점\\s*요소") },
  { key: "explanation", alias: false, re: headerRe("해\\s*설") },
];

const HANGUL_RE = /[\uAC00-\uD7A3]/;
/** 섹션 밖 라벨 줄(모델이 덧붙이는 "지문:" "출처:" 류) — 단일값/해설 누적을 끊는다. */
const UNKNOWN_LABEL_RE = /^[^\s:\uFF1A]{1,16}\s*[:\uFF1A]/;

/**
 * 해설이 인용한 영어 조각이 자기 줄로 밀려나는 실측 드리프트를 흡수하는 폭.
 * 이 줄들은 뒤에 한국어가 다시 오면 해설로 편입하고, 안 오면 형식 밖 꼬리로 버린다.
 * 2줄로 제한하는 이유: 모델이 형식 뒤에 지문을 통째로 재출력하는 드리프트를
 * 해설이 삼키지 않게 하기 위함(기존 과잉관용 방지 픽스처 계약).
 */
const MAX_PENDING_EXPLANATION_LINES = 2;

function unwrapQuotes(value: string): string {
  const t = value.trim();
  const m = t.match(/^["'`\u2018\u2019\u201C\u201D]([\s\S]+)["'`\u2018\u2019\u201C\u201D]$/);
  return m ? m[1].trim() : t;
}

function matchHeader(line: string): { key: SectionKey; alias: boolean; value: string } | null {
  for (const h of HEADERS) {
    const m = line.match(h.re);
    if (m) return { key: h.key, alias: h.alias, value: m[1] ?? "" };
  }
  return null;
}

/**
 * 문장 전환 md 파싱.
 *
 * 드리프트 관용(정본 parseMdBlank 규약): 라벨 표기 흔들림(`원문:`·`정답:`),
 * 불릿·번호·굵게·표 파이프 장식, 값 감싼 따옴표, 줄바꿈된 긴 문장.
 * 단일값 섹션은 빈 줄·미지의 라벨 줄·헤딩에서 끊고, 해설은 한국어가 이어질 때만
 * 누적한다 — 모델이 형식 뒤에 지문을 재출력하는 실측 드리프트가 해설에 섞이지 않게.
 */
export function parseMdSentenceTransform(text: string): MdSentenceTransformQuestion {
  let original = "";
  let modelAnswer = "";
  let modelAnswerAlias = "";
  const conditions: string[] = [];
  const scoringCriteria: string[] = [];
  const explanationParts: string[] = [];
  /** 해설 상태에서 만난 비한국어 줄 — 뒤에 한국어가 다시 오면 편입, 아니면 폐기. */
  const pendingExplanation: string[] = [];
  let state: SectionKey | null = null;
  let aliasState = false;

  const appendSingle = (key: SectionKey, alias: boolean, value: string) => {
    if (!value) return;
    if (key === "original") original = original ? `${original} ${value}` : value;
    else if (alias) modelAnswerAlias = modelAnswerAlias ? `${modelAnswerAlias} ${value}` : value;
    else modelAnswer = modelAnswer ? `${modelAnswer} ${value}` : value;
  };
  const currentSingle = (key: SectionKey, alias: boolean): string =>
    key === "original" ? original : alias ? modelAnswerAlias : modelAnswer;

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(rawLine)) continue; // 코드펜스 드리프트
    const isHeading = /^\s*#{1,6}\s/.test(rawLine);
    const line = stripMd(rawLine);

    const header = matchHeader(line);
    if (header) {
      pendingExplanation.length = 0;
      state = header.key;
      aliasState = header.alias;
      if (header.key === "conditions") {
        if (header.value.trim()) conditions.push(header.value.trim());
      } else if (header.key === "scoring") {
        if (header.value.trim()) scoringCriteria.push(header.value.trim());
      } else if (header.key === "explanation") {
        if (header.value.trim()) explanationParts.push(header.value.trim());
      } else {
        appendSingle(header.key, header.alias, header.value.trim());
      }
      continue;
    }

    if (isHeading) {
      pendingExplanation.length = 0;
      state = null;
      continue;
    }

    if (state === "conditions" || state === "scoring") {
      if (!line) continue; // 목록 사이 빈 줄은 섹션을 끊지 않는다
      (state === "conditions" ? conditions : scoringCriteria).push(line);
      continue;
    }

    if (state === "explanation") {
      // 해설은 한국어다. 빈 줄은 형식 밖으로 보고 끊는다.
      if (!line) {
        pendingExplanation.length = 0;
        state = null;
        continue;
      }
      // ⚠ 26-07-26 웨이브2 silent-drop: 종전에는 한국어 없는 줄에서 즉시 섹션을 끊고
      //   그 줄을 버렸다. 프롬프트가 "지문·모범답안 표현 인용" 을 권장하므로 모델이 긴
      //   인용 조각을 자기 줄로 밀어내는 드리프트가 실측되는데, 그때 **뒤따르는 한국어가
      //   통째로 사라져** 조사에서 끊긴 비문이 저장됐다(게이트도 길이 20자만 봐서 CLEAN).
      //   이제 보류했다가 한국어가 다시 오면 이어 붙이고, 안 오면(형식 밖 꼬리) 버린다.
      if (!HANGUL_RE.test(line)) {
        if (pendingExplanation.length >= MAX_PENDING_EXPLANATION_LINES) {
          pendingExplanation.length = 0;
          state = null;
          continue;
        }
        pendingExplanation.push(line);
        continue;
      }
      if (pendingExplanation.length > 0) {
        explanationParts.push(...pendingExplanation);
        pendingExplanation.length = 0;
      }
      explanationParts.push(line);
      continue;
    }

    if (state === "original" || state === "modelAnswer") {
      if (!line || UNKNOWN_LABEL_RE.test(line)) {
        state = null;
        continue;
      }
      // ⚠ 26-07-26 웨이브2 silent-drop: 이 이어붙이기의 **유일한 목적은 줄바꿈된 한
      //   문장을 잇는 것**이다. 직전까지 모은 값이 이미 문장 종결부호로 끝났다면 이 줄은
      //   다른 정보(대안 답안·부연·꼬리말)이므로 흡수하면 안 된다 — 흡수하면 modelAnswer
      //   와 correctAnswer 에 두 문장이 실려 강사가 오염된 채점 기준을 읽게 된다.
      if (SENTENCE_END_RE.test(currentSingle(state, aliasState))) {
        state = null;
        continue;
      }
      appendSingle(state, aliasState, line);
      continue;
    }
  }

  return {
    kind: "sentenceTransform",
    originalSentence: unwrapQuotes(original),
    conditions: conditions.map((c) => unwrapQuotes(c)).filter(Boolean),
    modelAnswer: unwrapQuotes(modelAnswer || modelAnswerAlias),
    scoringCriteria: scoringCriteria.map((s) => s.trim()).filter(Boolean),
    explanation: explanationParts.join(" ").trim(),
  };
}

/** 문단 경계(빈 줄) — 조판 계약 stripOriginalBlock 의 분할 축과 동일하다. */
export const PARAGRAPH_BREAK_RE = /\n[ \t]*\n/;

/**
 * 0원 자동 보정.
 *
 * 이 유형의 진실원은 **지문**이다. 원문장이 지문 축자와 표기만 다르면(곱슬따옴표·
 * 대소문자·공백·대시·말줄임·문말 구두점 누락) 지문 원문 슬라이스로 갈아 끼운다 —
 * 저장되는 값이 축자여야 시험지 밑줄이 붙기 때문이다(source-passage-markers).
 *
 * 보수 가드: 접기 좌표에서 **정확히 1회** 매칭될 때만 채택한다. 여러 번 나오면
 * 어느 자리인지 확정할 수 없으므로 손대지 않고 게이트가 반려하게 둔다.
 *
 * ⚠ 26-07-26 웨이브2: 접기 좌표는 `\n\n` 을 공백 하나로 접으므로 **문단을 넘는 여러
 *   문장**도 매칭에 성공한다. 그 슬라이스를 채택하면 빈 줄이 박힌 원문장이 저장되고,
 *   시험지 조판의 stripOriginalBlock(question-body-layout.ts:346-353)이 `\n{2,}` 로 쪼갠
 *   뒤 `[원문]` 블록만 버리기 때문에 원문 뒷부분이 학생 지면에 고아 텍스트로 인쇄된다.
 *   그래서 문단 경계를 포함한 슬라이스는 채택하지 않고 게이트가 반려하게 둔다.
 */
export function autoSnapSentenceTransform(
  q: MdSentenceTransformQuestion,
  passage: string,
): { question: MdSentenceTransformQuestion; corrections: string[] } {
  const corrections: string[] = [];
  let originalSentence = q.originalSentence;

  if (originalSentence && passage) {
    const direct = locateSentenceInPassage(passage, originalSentence);
    // 문말 구두점을 떨어뜨린 실측 드리프트. 이때 접기 좌표에서는 **매칭이 성공한다**
    // (마침표 앞까지가 부분열이므로) — 그래서 "못 찾았을 때"가 아니라 "찾았는데 문장
    // 끝이 아닐 때"까지 복원을 시도해야 한다. 문장부호를 붙였을 때 지문에서 정확히
    // 1회이고 그 자리가 진짜 문장 끝일 때만 채택한다(절을 문장으로 늘리지 않는다).
    if (!direct || !direct.endsAtSentenceBoundary) {
      const stripped = originalSentence.replace(/[.!?]["'\u2019\u201D)\]]*$/, "").trim();
      for (const suffix of [".", "!", "?"]) {
        if (!stripped) break;
        const retry = locateSentenceInPassage(passage, `${stripped}${suffix}`);
        if (
          retry &&
          retry.count === 1 &&
          retry.endsAtSentenceBoundary &&
          !PARAGRAPH_BREAK_RE.test(retry.verbatim)
        ) {
          corrections.push("원문장에 누락된 문말 구두점을 지문 축자로 복원");
          originalSentence = retry.verbatim;
          break;
        }
      }
    }
    // 구두점 복원이 일어나지 않았을 때만 표기 보정을 적용한다(이중 보정 방지).
    if (
      originalSentence === q.originalSentence &&
      direct &&
      direct.count === 1 &&
      direct.verbatim !== originalSentence &&
      !PARAGRAPH_BREAK_RE.test(direct.verbatim)
    ) {
      corrections.push("원문장을 지문 축자로 보정(표기 차이 흡수)");
      originalSentence = direct.verbatim;
    }
  }

  return { question: { ...q, originalSentence }, corrections };
}
