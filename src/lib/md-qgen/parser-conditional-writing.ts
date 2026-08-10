// ============================================================================
// 조건부 영작(CONDITIONAL_WRITING) md 파서 · 0원 스냅.
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
// 게이트는 gate-conditional-writing.ts 로 분리(파일 500줄 규약 · 1차 승차분 선례).
//
// 이 유형은 **지문을 재출력하지 않는다**. 따라서 "지문 재구성 일치" 계열 불변식이
// 없고, 대신 **모범답안이 지문의 축자 복사가 아닐 것**이 최강 불변식이다
// (지문이 문항 안에 인라인 렌더되므로 verbatim 정답 = 학생 눈앞 정답 노출).
//
// 형식 계약(§1-B 철칙 1 준수):
//   우리말: <한국어 한 줄>            ← referenceSentence
//   조건:                              ← conditions[]
//   - <조건>
//   모범답안: <영어 한 줄>            ← modelAnswer = 정답의 유일 진실원
//   채점기준:                          ← scoringCriteria[]
//   - <항목>
//   해설: <2문장>
// `정답:` 줄은 없다 — 모범답안과 중복 계약이 되기 때문이다(반의어 2연속 반려의 교훈).
// 다만 구형 드리프트로 `정답:` 이 올 수는 있으므로 모범답안 부재 시에만 폴백으로 받는다.
// ============================================================================

export interface MdConditionalWritingQuestion {
  kind: "conditional-writing";
  /** 학생이 영작할 한국어 문장 → referenceSentence */
  korean: string;
  /** 작성 조건(한국어) → conditions[] */
  conditions: string[];
  /** 영어 완성 문장 → modelAnswer(= correctAnswer). 정답의 유일 진실원 */
  modelAnswer: string;
  /** 부분점수 채점 기준 → scoringCriteria[] (이 유형은 기계 채점 불가) */
  scoringCriteria: string[];
  explanation: string;
}

type CwField =
  | "korean"
  | "conditions"
  | "modelAnswer"
  | "criteria"
  | "explanation"
  | "answerAlias";

/**
 * 라벨 정규식 빌더.
 * - 양옆 각괄호/괄호 허용: 렌더·직렬화 관습이 `[영작할 우리말]`·`<조건>` 이라 그 표기가 새어 나온다.
 * - 콜론은 **값이 있을 때만** 필수다(`조건` 단독 줄 = 섹션 헤더). 콜론을 무조건 선택으로 두면
 *   "우리말은 …" 같은 산문이 라벨로 오인되므로 `(?:[:：]\s*(.*)|\s*)$` 로 못 박는다.
 * - indexed 는 `조건 1:` · `조건 3개:` · `채점기준 2번:` 형태의 번호 라벨을 흡수한다.
 * - **괄호 부연 접미 허용**(wave2): `모범답안(예시):` · `우리말 (영작 대상):` · `조건 (3개):` 가
 *   라벨로 안 잡히면 그 줄이 직전 열린 섹션으로 흘러들어 **영어 모범답안이 조건이 된다**
 *   (실측: conditions[3] = 영문 문장인데 게이트는 '모범답안 줄을 인식할 수 없음'만 말했다).
 */
function labelRe(core: string, indexed = false): RegExp {
  const index = indexed ? "\\s*\\d{0,2}\\s*(?:개|번|항)?" : "";
  const aside = "\\s*(?:[(（\\[][^)）\\]]{0,20}[)）\\]])?";
  return new RegExp(
    `^[<[(]?\\s*(?:${core})\\s*[>\\])]?${index}${aside}\\s*(?:[:：]\\s*(.*)|\\s*)$`,
  );
}

const LABEL_TABLE: Array<[RegExp, CwField]> = [
  [labelRe("(?:영작할\\s*)?우리말(?:\\s*문장)?"), "korean"],
  [labelRe("(?:작성\\s*)?조건", true), "conditions"],
  [labelRe("모범\\s*답안?"), "modelAnswer"],
  [labelRe("채점\\s*기준", true), "criteria"],
  [labelRe("해설"), "explanation"],
  [labelRe("정답"), "answerAlias"],
];

const BULLET_RE = /^(?:[-*•‣▪]\s+|[–—]\s+|\d{1,2}[.)]\s+|[①②③④⑤⑥⑦⑧⑨⑩]\s*)/;
const HORIZONTAL_RULE_RE = /^[-=_*]{3,}$/;
/** ```/~~~ 코드펜스 — 모델이 모범답안을 코드블록으로 감싸면 값이 통째로 유실됐다(wave2). */
const CODE_FENCE_RE = /^(?:```|~~~)/;
/** 표 구분행(`|---|---|`). 파이프를 벗기면 `---|---` 가 되어 조건 항목으로 둔갑했다. */
const TABLE_SEPARATOR_RE = /^\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?$/;
/** 표 첫 칸이 번호일 때만 버린다 — `2점` 같은 배점 칸은 정보라서 보존한다. */
const TABLE_INDEX_CELL_RE =
  /^(?:\d{1,2}[.)]?|[①②③④⑤⑥⑦⑧⑨⑩]|(?:조건|기준|항목)\s*\d{0,2}|no\.?\s*\d{1,2}|#\d{1,2})$/i;
const HANGUL_RE = /[가-힣]/;

interface CwLine {
  body: string;
  heading: boolean;
  listItem: boolean;
  /** 코드펜스 줄 — 값이 아니라 장식이므로 통째로 무시한다. */
  fence: boolean;
  /** 표 구분행 — 무시한다. */
  separator: boolean;
  /** 내부 파이프가 있던 표 행 — 다음 줄이 구분행이면 헤더로 보고 버린다. */
  tableRow: boolean;
}

/**
 * 줄 장식 제거 — 표 파이프·불릿·번호·헤딩·인용부호·코드펜스. **본문의 굵게(`**`)는 보존한다**:
 * 조건 줄의 `**Without**` 은 스냅이 작은따옴표 표기로 되살려야 하는 정보라서,
 * 여기서 전역으로 지워 버리면 기계 검증 가능성이 조용히 증발한다(철칙 3).
 * 라벨을 감싼 굵게만 정확히 흡수한다.
 *
 * wave2: 내부 파이프를 남겨 두면 `1 | 'Had it not been'으로 시작할 것` 이 그대로 학생
 * 표면에 인쇄됐다(게이트 CLEAN). 표 행이면 셀로 쪼개 번호 칸만 버리고 나머지를 이어 붙인다.
 */
function stripDecoration(line: string): CwLine {
  let s = line.replace(/\r$/, "").trim();
  // 인용부호(`> 해설: …`) — 모델이 블록 인용으로 꾸미는 드리프트.
  s = s.replace(/^>+\s*/, "").trim();
  if (CODE_FENCE_RE.test(s)) {
    return { body: "", heading: false, listItem: false, fence: true, separator: false, tableRow: false };
  }
  const separator = s.includes("|") && TABLE_SEPARATOR_RE.test(s);
  if (separator) {
    return { body: "", heading: false, listItem: false, fence: false, separator: true, tableRow: false };
  }
  // 표 행 잔재: 양끝 파이프 제거(모델이 목록을 표로 꾸미는 실측 드리프트)
  const outerPipe = /^\|/.test(s) || /\|$/.test(s);
  s = s.replace(/^\|/, "").replace(/\|$/, "").trim();
  let tableRow = false;
  if (outerPipe && s.includes("|")) {
    tableRow = true;
    const cells = s.split("|").map((cell) => cell.trim()).filter(Boolean);
    const kept = cells.filter((cell, i) => !(i === 0 && TABLE_INDEX_CELL_RE.test(cell)));
    s = (kept.length > 0 ? kept : cells).join(" — ").trim();
  }
  const heading = /^#{1,6}\s+/.test(s);
  if (heading) s = s.replace(/^#{1,6}\s+/, "").trim();
  const listItem = BULLET_RE.test(s);
  if (listItem) s = s.replace(BULLET_RE, "").trim();
  // 라벨 굵게만 흡수: `**우리말: 값**` / `**조건:**` / `**모범답안**: 값`
  s = s
    .replace(/^\*\*(.*?)\*\*\s*$/, "$1")
    .replace(/^\*\*([^*]{1,24}[:：])\*\*/, "$1")
    .replace(/^\*\*([^*]{1,24})\*\*(\s*[:：])/, "$1$2")
    .trim();
  return { body: s, heading, listItem, fence: false, separator: false, tableRow };
}

function matchLabel(body: string): { field: CwField; value: string } | null {
  for (const [re, field] of LABEL_TABLE) {
    const m = body.match(re);
    if (m) return { field, value: (m[1] ?? "").trim() };
  }
  return null;
}

/** `조건: - 'X'로 시작할 것` 처럼 라벨 줄에 인라인 불릿이 붙어 오면 그 문자가 학생 표면에 남는다. */
function stripInlineBullet(value: string): string {
  return value.replace(BULLET_RE, "").trim();
}

/**
 * 조건부 영작 md 파싱 — **줄 단위 상태기계**(§1-B 철칙 3).
 * 줄 전체를 단일 정규식으로 매칭하면 사소한 드리프트에 그 줄이 통째로 사라지고
 * 게이트에는 "개수 부족"으로만 보인다. 여기서는 라벨을 만나면 섹션을 전환하고,
 * 섹션 안의 줄은 장식 유무와 무관하게 항목으로 받는다.
 */
export function parseMdConditionalWriting(text: string): MdConditionalWritingQuestion {
  let korean = "";
  let modelAnswer = "";
  let answerAlias = "";
  const conditions: string[] = [];
  const scoringCriteria: string[] = [];
  const explanationLines: string[] = [];
  // wave2: `우리말:` / `모범답안:` 도 값이 비면 섹션을 연다(해설 라벨이 이미 그렇게 동작한다).
  // 예전에는 section 을 'none' 으로 되돌려 **다음 줄의 값이 통째로 증발**했고, 게이트는
  // "우리말 줄을 인식할 수 없음"이라는 **사실과 다른 원인**을 재생성 프롬프트에 실었다.
  let section:
    | "none"
    | "korean"
    | "modelAnswer"
    | "answerAlias"
    | "conditions"
    | "criteria"
    | "explanation" = "none";

  const lines = text.split(/\r?\n/).map(stripDecoration);
  for (let i = 0; i < lines.length; i += 1) {
    const { body, heading, fence, separator, tableRow } = lines[i];
    if (fence || separator) continue;
    if (!body) continue;
    // 표 헤더 행(`| 번호 | 내용 |` + 다음 줄이 `|---|---|`)은 데이터가 아니다.
    if (tableRow && lines[i + 1]?.separator) continue;
    if (HORIZONTAL_RULE_RE.test(body)) {
      section = "none";
      continue;
    }

    const matched = matchLabel(body);
    if (matched) {
      switch (matched.field) {
        case "korean":
          if (!korean) korean = matched.value;
          section = matched.value ? "none" : "korean";
          break;
        case "modelAnswer":
          if (!modelAnswer) modelAnswer = matched.value;
          section = matched.value ? "none" : "modelAnswer";
          break;
        case "answerAlias":
          if (!answerAlias) answerAlias = matched.value;
          section = matched.value ? "none" : "answerAlias";
          break;
        case "conditions": {
          const value = stripInlineBullet(matched.value);
          if (value) conditions.push(value);
          section = "conditions";
          break;
        }
        case "criteria": {
          const value = stripInlineBullet(matched.value);
          if (value) scoringCriteria.push(value);
          section = "criteria";
          break;
        }
        case "explanation":
          if (matched.value) explanationLines.push(matched.value);
          section = "explanation";
          break;
      }
      continue;
    }

    // 알 수 없는 헤딩(`## 지문` 등)은 섹션 종료 신호 — 지문 본문이 조건으로 빨려
    // 들어가는 사고를 막는다.
    if (heading) {
      section = "none";
      continue;
    }

    if (section === "korean") {
      korean = body;
      section = "none";
    } else if (section === "modelAnswer") {
      modelAnswer = body;
      section = "none";
    } else if (section === "answerAlias") {
      answerAlias = body;
      section = "none";
    } else if (section === "conditions") conditions.push(body);
    else if (section === "criteria") scoringCriteria.push(body);
    else if (section === "explanation") {
      // 보수 가드(wave2): 해설 섹션은 헤딩 없는 후행 텍스트를 무제한 흡수했다 —
      // 실측으로 지문 전문(568자)이 해설에 합쳐진 채 게이트 CLEAN 이었다. 이미 한국어
      // 해설을 받은 뒤에 오는 **한글 한 글자 없는 긴 줄**은 해설이 아니라 지문 에코다.
      if (explanationLines.length > 0 && body.length >= 30 && !HANGUL_RE.test(body)) {
        section = "none";
        continue;
      }
      explanationLines.push(body);
    }
  }

  return {
    kind: "conditional-writing",
    korean,
    conditions,
    // 구형 드리프트 폴백: `모범답안:` 대신 `정답:` 으로 낸 출력을 버리지 않는다.
    modelAnswer: modelAnswer || answerAlias,
    scoringCriteria,
    explanation: explanationLines.join(" ").trim(),
  };
}

// ── 0원 자동 보정 ───────────────────────────────────────────────────────────

/** 값 전체를 감싼 굵게/따옴표를 벗긴다. 내부 아포스트로피(makers')는 건드리지 않는다. */
function unwrapValue(value: string): string {
  let s = value.trim();
  const before = s;
  s = s.replace(/^\*\*([\s\S]+?)\*\*$/, "$1").trim();
  s = s.replace(/^`([\s\S]+?)`$/, "$1").trim();
  // 큰따옴표는 값 전체를 감쌀 정당한 이유가 없다 — 무조건 벗긴다.
  s = s.replace(/^["“]([\s\S]+?)["”]$/, "$1").trim();
  // 작은따옴표는 내부에 아포스트로피가 없을 때만(보수 가드 — makers' 를 깨지 않는다).
  const single = s.match(/^['‘]([\s\S]+?)['’]$/);
  if (single && !/['‘’]/.test(single[1])) s = single[1].trim();
  return s || before;
}

/**
 * 승격 제외 문법 용어 — 작은따옴표는 "이 문자열이 모범답안에 그대로 있어야 한다"는
 * 기계 검증 명령이다. 문법 용어를 승격하면 **없던 조건 위반을 스냅이 제조한다**
 * (실측: `**passive voice**로 쓸 것` → `'passive voice'로 쓸 것` → 게이트 #9 반려).
 */
const CW_GRAMMAR_TERMS = new Set([
  "passive", "active", "passive voice", "active voice", "voice",
  "participle", "participial", "participle phrase", "participial phrase",
  "inversion", "inverted", "subjunctive", "gerund", "infinitive", "to-infinitive",
  "cleft", "cleft sentence", "relative clause", "relative pronoun",
  "noun clause", "adverbial clause", "adjective clause", "clause", "phrase",
  "comparative", "superlative", "tense", "past perfect", "present perfect",
  "past participle", "present participle", "conditional", "appositive",
  "parallel structure", "reported speech", "indirect speech", "word order",
]);
/** 다어절 문법 용어의 머리 단어 — 위 집합이 못 담은 변형("the passive voice" 등)을 흡수. */
const CW_GRAMMAR_HEAD_RE =
  /\b(?:voice|clause|participle|participial|inversion|subjunctive|gerund|infinitive|cleft|tense|comparative|superlative)\b/i;
/** validators/conditional-writing.ts:25-26 의 동형 복제(FROZEN 이라 import 불가). */
const CW_SNAP_FORBIDDEN_RE = /(?:사용하지|쓰지|포함하지|넣지|포함시키지)\s*(?:말|마|않)|금지/;
const CW_SINGLE_TOKEN_RE = /^[A-Za-z][A-Za-z'-]*$/;

function looseIncludes(haystack: string, needle: string): boolean {
  const fold = (s: string) =>
    s.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  return fold(haystack).includes(fold(needle));
}

/**
 * 굵게·백틱 표기 토큰을 작은따옴표(= 기계 검증 대상)로 **승격해도 되는가**.
 * 규범 §1 [6] 보수 가드 — 애매하면 표기만 벗기고 게이트가 판단하게 둔다.
 */
function shouldPromoteToken(token: string, condition: string, modelAnswer: string): boolean {
  const norm = token.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm) return false;
  if (CW_GRAMMAR_TERMS.has(norm) || CW_GRAMMAR_HEAD_RE.test(norm)) return false;
  // 금지 조건은 토큰이 모범답안에 **없는 것이 정상**이므로 부재를 근거로 막을 수 없다.
  if (CW_SNAP_FORBIDDEN_RE.test(condition)) return true;
  // 모범답안에 실제로 있으면 리터럴 요구가 확실하다.
  if (modelAnswer && looseIncludes(modelAnswer, norm)) return true;
  // 단일 어휘 지정(`**exhibits**를 사용할 것`)은 분류학 #1·#2 의 표준 형태다.
  return CW_SINGLE_TOKEN_RE.test(norm);
}

/**
 * 조건·채점기준 항목 표기 정리.
 * 모델이 영어 토큰을 굵게(`**Without**`)나 백틱(`` `Without` ``)으로 표기하면
 * 조건이 기계 검증 대상에서 **조용히 빠진다**(검증기는 따옴표 인용만 인식한다).
 * 다만 승격은 **기계 의미를 바꾸는 행위**라 무조건 하면 안 된다 — shouldPromoteToken 이
 * 통과시킨 토큰만 작은따옴표로 갈아 끼우고, 나머지는 표기만 벗긴다.
 */
function tidyConditionText(
  value: string,
  modelAnswer: string,
  onPromote?: (token: string) => void,
): string {
  const rewrite = (_match: string, raw: string): string => {
    const token = raw.trim();
    if (shouldPromoteToken(token, value, modelAnswer)) {
      onPromote?.(token);
      return `'${token}'`;
    }
    return token;
  };
  return value
    .replace(/\*\*\s*([A-Za-z][A-Za-z' -]{0,40}?)\s*\*\*/g, rewrite)
    .replace(/`\s*([A-Za-z][A-Za-z' -]{0,40}?)\s*`/g, rewrite)
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 0원 자동 보정. 보수 가드 — 확실한 표기 드리프트만 교정하고, 의미가 걸린 값
 * (조건의 숫자 ↔ 모범답안의 단어 수 불일치 등)은 **절대 손대지 않는다**.
 * 어느 쪽이 진실인지 코드가 알 수 없으므로 게이트가 반려해 재생성에 맡긴다.
 */
export function autoSnapConditionalWriting(q: MdConditionalWritingQuestion): {
  question: MdConditionalWritingQuestion;
  corrections: string[];
} {
  const corrections: string[] = [];

  const korean = unwrapValue(q.korean);
  if (korean !== q.korean.trim() && korean) corrections.push("우리말을 감싼 따옴표·굵게 표기 제거");

  const modelAnswer = unwrapValue(q.modelAnswer);
  if (modelAnswer !== q.modelAnswer.trim() && modelAnswer) {
    corrections.push("모범답안을 감싼 따옴표·굵게 표기 제거");
  }

  const conditions = q.conditions.map((c) => {
    const promoted: string[] = [];
    const tidy = tidyConditionText(c, modelAnswer, (token) => promoted.push(token));
    if (tidy !== c && tidy) {
      // 포렌식: 승격은 조건의 **기계 의미를 바꾸는** 보정이라 반드시 명시한다.
      const note =
        promoted.length > 0
          ? `조건 표기 정규화(${promoted.map((t) => `'${t}'`).join(", ")} 를 기계 검증 대상으로 승격)`
          : "조건 표기 정규화";
      corrections.push(`${note}: '${c.slice(0, 40)}' → '${tidy.slice(0, 40)}'`);
    }
    return tidy || c;
  });

  const scoringCriteria = q.scoringCriteria.map(
    (c) => tidyConditionText(c, modelAnswer) || c,
  );

  return {
    question: {
      ...q,
      korean: korean || q.korean,
      modelAnswer: modelAnswer || q.modelAnswer,
      conditions,
      scoringCriteria,
      // 해설은 공백만 다듬는다 — normalizeWs 는 대시(—)·말줄임을 갈아 끼우므로
      // 한국어 산문의 구두점을 임의로 바꾸게 된다(저장 텍스트 무단 변경 금지).
      explanation: q.explanation.replace(/\s+/g, " ").trim(),
    },
    corrections,
  };
}
