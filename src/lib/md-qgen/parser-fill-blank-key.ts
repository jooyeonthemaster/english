// ============================================================================
// 핵심 표현 빈칸(FILL_BLANK_KEY) md 파서 · 0원 스냅. 게이트는 gate-fill-blank-key.ts.
// 견본: parser-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md
// 정본 규약 답습: **파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.**
//
// 이 유형은 지문을 재출력하지 않는다(passageWithBlank 는 후처리 processFillBlankKey
// 전담). 따라서 "지문 재구성 일치" 게이트의 대응물은 **프레임 복원 대조**다 — 빈칸에
// 정답을 되끼운 문장이 원 지문 안에 축자로 존재하는가(gate G6). 그 하나가 모델의
// 무단 편집·어형 손질·문장 이어붙이기를 한 번에 잡는 최강 게이트다.
// ============================================================================

import { normalizeText as normalizeGradeText } from "@/lib/exam-scoring/normalize";
import { cleanMdValue, keywordLineRe } from "./decoration";
import { normalizeWs } from "./parser";
import { FILL_BLANK_KEY_MD_BLANK, FILL_BLANK_KEY_MD_WORD_MIN } from "./prompts-fill-blank-key";

export interface MdFillBlankKeyQuestion {
  kind: "fill-blank-key";
  /** 원문 문장에서 정답 스팬만 _____ 로 바꾼 한 줄 */
  sentenceWithBlank: string;
  /** 빈칸에 들어갈 지문 축자 표현 — 정답의 유일한 진실원 */
  answer: string;
  /**
   * 표기 변형 허용답. **프롬프트는 이 칸을 요구하지 않는다**(어댑터가 결정론으로
   * 파생). 드리프트로 `허용답:` 이 오면 여기 담기고 autoSnapFillBlankKey 가 표기
   * 변형 아닌 원소를 절삭한다(조용히 버리지 않고 corrections 로 남김 — 철칙3).
   */
  acceptedAnswers: string[];
  explanation: string;
  /**
   * 라벨처럼 보이지만(`^짧은머리:`) 계약 라벨 넷 중 어느 것도 아닌 줄. **직전 버킷에
   * 이어붙이지 않는다** — 이어붙이면 값이 통째로 오염되고 게이트가 "정답 누락" 같은
   * 사실과 다른 원인을 지목한다(§1-B 철칙3·5). 보고는 모델이 쓴 원본 줄 그대로다.
   * ⚠ 파서는 항상 채우지만 타입은 선택이다 — 라우트에서 `unknown` 캐스트를 건너온다.
   */
  unknownLabelLines?: string[];
  /** 섹션 밖으로 흘려보낸 군더더기 줄(해설 꼬리의 지문 재출력 등). */
  droppedLines?: string[];
}

// ── 비교축 (§1[5] "비교는 반드시 normalizeWs 를 통과시켜라") ──────────────────
// 프레임 대조(G6)와 정답 축자성(G7)이 **서로 다른 접기 폭**을 쓰면 같은 입력에서
// G6 통과·G7 반려의 자기모순이 난다(실측: 지문 곱슬 `’` vs 모델 곧은 `'`).
/** 축자 대조용 단일 비교축 — normalizeWs(정본) + 대소문자 무시. */
export function fillBlankKeyComparable(value: string): string {
  return normalizeWs(value).toLowerCase();
}

// ── 라벨 라인 스캐너 — 장식 처리는 전량 공유 유틸(decoration.ts)에 위임 ───────
// 유형마다 stripDecoration/EMPHASIS/HEAD 상수를 재발명하고 각자 **다른 부분집합**만
// 처리한 것이 이번 웨이브 잔여 결함의 단일 근원이었다(값 선두·말미 오염 → 필드
// 소멸 → 게이트가 거짓 원인 지목 → 그 문구가 [반려 재생성] 피드백으로 출하).
// **이 파일은 자체 강조/따옴표 처리기를 한 개도 두지 않는다.**
//
// ⚠ 이 유형만의 제약 — 빈칸 마커 `_{3,}`:
//   공유 stripEmphasis 는 `_` 를 강조 표식으로 본다(낱말 **내부**만 보존). 그대로
//   통과시키면 `빈칸문장: _____ now …`(빈칸이 문장 맨 앞)에서 마커가 통째로
//   사라져 게이트가 "빈칸 마커가 없음"이라는 **거짓 원인**을 지목한다 — 모델은
//   마커를 썼는데. 그래서 줄을 읽기 전에 마커를 봉인하고 값을 낼 때 되돌린다.
//   폭(3·4·5·10)까지 보존하므로 스냅의 폭 정규화가 원래대로 동작한다.
const BLANK_SEAL = "\uE000";

/** 런이 낱말에 붙어 있는가 — 붙어 있으면 빈칸 마커가 아니라 강조 표식이다. */
const WORDISH_RE = /[A-Za-z0-9가-힣]/;

/**
 * `_{3,}` 런이 **빈칸 마커**인지 **`___강조___` 표식**인지 가려, 마커만 봉인한다.
 *  · 낱말에 붙어 있으면 강조다 — `___빈칸문장___:` 의 앞뒤 런, `정답: ___값___`.
 *  · 앞에서 낱말에 붙어 열린 **같은 폭** 런이 있으면 그 닫는 짝이다 —
 *    `___빈칸문장:___ ___ now …` 의 가운데 런. 이 런은 콜론에 붙어 있어서 국소
 *    문맥만으로는 `빈칸문장:_____ now`(공백 없는 실측 드리프트)의 **진짜 마커**와
 *    구분되지 않는다. 짝 추적이 둘을 정확히 가른다.
 *  · 나머지는 전부 마커다 — 봉인해 공유 강조 제거기로부터 지킨다.
 */
function sealBlanks(text: string): string {
  const open: number[] = [];
  return text.replace(/_{3,}/g, (run: string, idx: number) => {
    const glued =
      WORDISH_RE.test(text[idx - 1] ?? "") || WORDISH_RE.test(text[idx + run.length] ?? "");
    const paired = open.indexOf(run.length);
    if (paired >= 0) open.splice(paired, 1);
    else if (glued) open.push(run.length);
    return glued || paired >= 0 ? run : BLANK_SEAL.repeat(run.length);
  });
}

function unsealBlanks(text: string): string {
  return text.replace(/\uE000+/g, (run) => "_".repeat(run.length));
}

/** 표 셀 잔재(앞뒤 파이프) — 표 **구조**이지 마크다운 강조가 아니다(유형 고유 정리). */
function stripCellPipes(raw: string): string {
  return raw.trim().replace(/^\|\s*/, "").replace(/\s*\|$/, "").trim();
}

/**
 * 불릿·번호목록 접두. 공유 머리표는 `-` `*` `•` 만 알아서, 실측 드리프트인
 * en/em 대시·중점·삼각·이중대시·번호목록(`1.` `1)`)을 여기서 먼저 벗겨 넘긴다.
 * 목록 **구조**이지 강조가 아니므로 유형 고유 정리로 남긴다.
 */
const LIST_PREFIX_RE = /^\s*(?:[-*•·‣▪▶►○●◦–—]{1,3}|\d+[.)])\s*/;

/**
 * 스캐너 내부용 — 버킷 내용은 **이미 봉인된 상태**다. 여기서 다시 봉인하면
 * 값에 남은 강조 잔재(`… claim.___` 의 닫는 런)를 마커로 오인해 봉인해 버리고,
 * 되돌린 뒤에는 빈칸이 2개가 되어 게이트가 오반려한다(실측).
 */
function cleanSealedValue(raw: string): string {
  return unsealBlanks(cleanMdValue(stripCellPipes(raw)));
}

/**
 * 저장·표시로 나가는 **모든 값**의 단일 정리 경로 — 선지 없는 유형이므로
 * 빈칸문장·정답·허용답·해설 넷이 전부다.
 * 공유 cleanMdValue(강조 전 계통 + 감싼 따옴표 한 겹 + 공백 정돈) + 마커 보존.
 */
export function cleanFillBlankKeyValue(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return cleanSealedValue(sealBlanks(raw));
}

/** 내용 없는 장식 줄(표 구분선·수평선). 버려도 정보 손실이 없다. */
const DECORATION_ONLY_RE = /^[\s|:=*+-]+$/;

/** 코드펜스 — 여기서부터는 계약 밖이므로 섹션을 닫는다. */
const FENCE_RE = /^\s*(?:```|~~~)/;

const HANGUL_RE = /[가-힣]/;

/** 해설 꼬리에 지문을 재출력하는 드리프트를 끊는 폭(한글 없는 장문 줄). */
const EXPLANATION_TAIL_MIN_CHARS = 40;

type SectionKey = "sentence" | "answer" | "accepted" | "explanation";

/**
 * 계약 라벨 = **서로의 정지 키워드**. 섹션 절단은 이 목록을 빠짐없이 훑어
 * 판정한다(일부 키워드만 아는 lookahead 로 블록이 붕괴하던 계통의 처방).
 * 키워드에 `\s*` 를 끼워 라벨 내부 공백 드리프트(`빈칸 문장:`)를 흡수한다.
 */
const SECTION_KEYWORDS: readonly { key: SectionKey; keyword: string }[] = [
  { key: "sentence", keyword: "빈\\s*칸\\s*문\\s*장" },
  { key: "accepted", keyword: "허\\s*용\\s*답" },
  { key: "answer", keyword: "정\\s*답" },
  { key: "explanation", keyword: "해\\s*설" },
];

/** 라벨처럼 보이는 짧은 머리(계약 라벨을 걸러낸 나머지를 잡는 그물). 캡처 금지. */
const UNKNOWN_LABEL_HEAD = "(?:[^\\s:：|][^:：|]{0,11})";

/**
 * 키워드 줄의 값 — 머리표 정규식은 공유 keywordLineRe 하나뿐이다(들여쓰기·인용·
 * 불릿·헤딩·표 파이프·콜론 **앞뒤** 장식·전각 콜론·꼬리 공백을 한 번에 흡수).
 * 머리표가 아니면 null.
 *
 * ⚠ 공유 정규식은 `## 정답`(콜론 없는 헤딩 관습)까지 관용한다. 그 관용을 그대로
 *   두면 한국어 산문 `정답은 ~입니다`가 라벨로 오인돼 값이 통째로 오염되므로,
 *   콜론도 표 파이프도 없는 머리표는 **값이 다음 줄에 있을 때만** 인정한다.
 */
function keywordValue(line: string, keyword: string): string | null {
  const m = line.match(keywordLineRe(keyword));
  if (!m) return null;
  const value = m[1] ?? "";
  const head = line.slice(0, line.length - value.length);
  if (!/[:：|]/.test(head) && value.trim()) return null;
  return value;
}

/** 계약 라벨 줄인가 — 맞으면 섹션 키와 그 줄에 실린 값. */
function sectionHeadOf(line: string): { key: SectionKey; value: string } | null {
  for (const { key, keyword } of SECTION_KEYWORDS) {
    const value = keywordValue(line, keyword);
    if (value !== null) return { key, value };
  }
  return null;
}

/** 계약 라벨이 아닌데 라벨처럼 보이는 줄인가(`http://` 스킴 콜론은 제외). */
function isUnknownLabelLine(line: string): boolean {
  const value = keywordValue(line, UNKNOWN_LABEL_HEAD);
  if (value === null || value.startsWith("//")) return false;
  return /[:：]/.test(line.slice(0, line.length - value.length));
}

/** 불릿 접두를 벗긴 목록 항목(입력은 봉인된 버킷 줄). 빈 줄·구분선은 버린다. */
function listItem(raw: string): string {
  const v = cleanSealedValue(raw.replace(LIST_PREFIX_RE, ""));
  return /^[-=_]{3,}$/.test(v) ? "" : v;
}

/**
 * 줄 단위 관대 파싱. 라벨 줄이 나오면 새 섹션을 열고, 라벨이 아닌 줄은 직전
 * 섹션에 이어 붙인다(모델이 문장을 두 줄로 접어 쓰는 실측 드리프트 흡수).
 * 라벨을 못 찾으면 그 섹션은 빈 값으로 남고 **게이트가 자리를 지목**한다 —
 * 단일 정규식으로 통째 매칭해 줄을 조용히 잃는 방식(철칙3 위반)을 쓰지 않는다.
 */
export function parseMdFillBlankKey(text: string): MdFillBlankKeyQuestion {
  const buckets: Record<SectionKey, string[]> = {
    sentence: [], answer: [], accepted: [], explanation: [],
  };
  const unknownLabelLines: string[] = [];
  const droppedLines: string[] = [];
  let current: SectionKey | null = null;

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    // 빈칸 마커를 **먼저** 봉인한다 — 공유 강조 제거기가 `_{3,}` 를 먹지 못하게.
    const line = sealBlanks(rawLine);
    // 목록 접두를 벗긴 사본으로는 **라벨 판정만** 한다(본문 줄은 원형을 유지).
    const listed = line.replace(LIST_PREFIX_RE, "");
    const head = sectionHeadOf(line) ?? sectionHeadOf(listed);
    if (head) {
      current = head.key;
      const inline = head.value.trim();
      if (inline) buckets[head.key].push(inline);
      continue;
    }
    // 마크다운 헤더(## 지문 등)는 섹션을 닫는다 — 지문 재출력이 해설에 딸려 드는
    // 오염 차단. (`### 정답:` 은 위에서 이미 라벨로 흡수돼 여기 오지 않는다.)
    if (/^\s*#{1,6}\s/.test(line)) {
      current = null;
      continue;
    }
    // 라벨처럼 보이는데 계약 라벨이 아닌 줄 — 직전 버킷에 이어붙이면 값이 통째로
    // 오염된다(`지문:` + 지문 전문이 해설로 실린 실측). 모아 두고 섹션을 닫는다.
    // 보고는 모델이 실제로 쓴 원본 줄(rawLine) 그대로다 — 자리 지목이 흐려진다.
    if (isUnknownLabelLine(line) || isUnknownLabelLine(listed)) {
      unknownLabelLines.push(rawLine.trim());
      current = null;
      continue;
    }
    if (!current) continue;
    const cont = line.trim();
    if (!cont) continue;
    if (DECORATION_ONLY_RE.test(cont)) continue;
    if (FENCE_RE.test(cont)) {
      current = null;
      continue;
    }
    // 정답은 한 줄짜리 어구다. 값이 들어온 뒤의 줄은 부연이므로 흡수하지 않는다
    // (흡수하면 answer 가 '… 이 표현은 4번째 문장에 있습니다.' 로 오염되고 게이트가
    // "지문에 축자로 없음"이라는 거짓 원인을 지목한다).
    if (current === "answer" && buckets.answer.length > 0) {
      droppedLines.push(unsealBlanks(cont));
      continue;
    }
    // 해설은 마지막 섹션이라 종결자가 없다. 한글 없는 장문 줄에서 닫는다 — 꼬리의
    // 지문 재출력이 해설로 저장돼 학생·강사 표면에 그대로 렌더되던 실측 구멍.
    if (current === "explanation" && cont.length > EXPLANATION_TAIL_MIN_CHARS && !HANGUL_RE.test(cont)) {
      droppedLines.push(unsealBlanks(cont));
      current = null;
      continue;
    }
    buckets[current].push(cont);
  }

  return {
    kind: "fill-blank-key",
    // 저장·표시로 나가는 값은 **예외 없이** 공유 정리 경로를 통과한다.
    sentenceWithBlank: cleanSealedValue(buckets.sentence.join(" ")),
    answer: cleanSealedValue(buckets.answer.join(" ")),
    acceptedAnswers: buckets.accepted.map((raw) => listItem(raw)).filter((v) => v.length > 0),
    explanation: cleanSealedValue(
      buckets.explanation.map((raw) => raw.replace(LIST_PREFIX_RE, "")).join(" "),
    ),
    unknownLabelLines,
    droppedLines,
  };
}

// ── 0원 스냅 ────────────────────────────────────────────────────────────────

/**
 * 빈칸에 정답을 되끼운 복원문. 검증기 fill-key.ts:123-128 과 동형이되 비교축은
 * 정본 normalizeWs 계열(fillBlankKeyComparable)이다 — G6 와 G7 이 같은 폭으로
 * 접어야 "G6 통과·G7 반려"의 자기모순이 나지 않는다.
 */
export function restoreFillBlankKeySentence(
  sentenceWithBlank: string,
  answer: string,
): string {
  return fillBlankKeyComparable(sentenceWithBlank.replace(/\s*_{3,}\s*/g, () => ` ${answer} `))
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/^[."'“”‘’…]+|[."'“”‘’…]+$/g, "")
    .replace(/^\.{2,}\s*|\s*\.{2,}$/g, "")
    .trim();
}

/** 복원문이 지문 안에 축자로 존재하는가(프레임 무결). */
export function fillBlankKeyFrameMatches(
  passage: string,
  sentenceWithBlank: string,
  answer: string,
): boolean {
  const restored = restoreFillBlankKeySentence(sentenceWithBlank, answer);
  if (!restored) return false;
  return fillBlankKeyComparable(passage).includes(restored);
}

/**
 * 축약형 전개 — 허용답이 "표기 변형인가"를 판정하는 결정형 기준.
 * ⚠ 소유격 `'s` 를 "is" 로 펴면 nature's course ≡ nature is course 가 되어
 * **오답을 흡수**한다. 그래서 대명사·지시사 뒤의 `'s` 만 전개한다(보수 원칙).
 */
export function expandFillBlankKeyContractions(value: string): string {
  return value
    .replace(/[’ʼ‛]/g, "'")
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bcannot\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/n't\b/g, " not")
    .replace(/'re\b/g, " are")
    .replace(/'ve\b/g, " have")
    .replace(/'ll\b/g, " will")
    .replace(/'m\b/g, " am")
    .replace(/'d\b/g, " would")
    .replace(/\b(it|he|she|that|this|there|here|what|who|one)'s\b/g, "$1 is")
    .replace(/\s+/g, " ")
    .trim();
}

/** 채점기(normalizeText) 통과 후 축약형까지 편 비교 키. */
export function orthographicKey(value: string): string {
  return expandFillBlankKeyContractions(normalizeGradeText(value));
}

const ARTICLE_HEAD_RE = /^(a|an|the)\s+(.+)$/i;

function wordCount(value: string): number {
  return value.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t)).length;
}

/**
 * 0원 자동 보정. 게이트 반려 주계통을 먼저 흡수한다.
 * 보수 가드: 확실할 때만 교정하고, 애매하면 그대로 두어 게이트가 반려하게 한다.
 */
export function autoSnapFillBlankKey(
  q: MdFillBlankKeyQuestion,
  passage: string,
): { question: MdFillBlankKeyQuestion; corrections: string[] } {
  const corrections: string[] = [];
  let sentence = q.sentenceWithBlank;
  let answer = q.answer;

  // (0) 파서가 어느 필드에도 싣지 않은 줄을 **전부 기록**한다(§1-B 철칙3 —
  //     조용히 버리지 않는다). 게이트 반려로 승격하지는 않는다: 세 필드가 정상인데
  //     군더더기 한 줄 때문에 재생성을 태우면(크레딧 환불 + 사용자에겐 원인 불명
  //     실패) 얻는 것보다 잃는 것이 크다. 필드가 비었을 때만 게이트가 지목한다.
  for (const line of q.unknownLabelLines ?? []) {
    corrections.push(`계약 라벨이 아닌 줄을 어느 필드에도 싣지 않음: "${line.slice(0, 60)}"`);
  }
  for (const line of q.droppedLines ?? []) {
    corrections.push(`섹션 밖 군더더기 줄을 버림(정답·해설 오염 방지): "${line.slice(0, 60)}"`);
  }

  // (1) 빈칸 마커 폭 정규화 — ____ / __________ → _____ (후처리 BLANK 와 동일 표면).
  if (sentence) {
    const normalized = sentence.replace(/_{3,}/g, FILL_BLANK_KEY_MD_BLANK);
    if (normalized !== sentence) {
      corrections.push(`빈칸 마커 폭을 ${FILL_BLANK_KEY_MD_BLANK} 로 정규화`);
      sentence = normalized;
    }
  }

  // (2) 빈칸을 안 뚫고 원문 문장을 그대로 낸 드리프트 — 정답이 문장에 정확히
  //     1회 있을 때만 _____ 로 바꾼다(2회 이상이면 자리가 모호하므로 반려에 맡김).
  if (sentence && answer && !/_{3,}/.test(sentence)) {
    const hits = [...sentence.matchAll(answerBoundaryRegex(answer))];
    if (hits.length === 1) {
      sentence = sentence.replace(answerBoundaryRegex(answer), FILL_BLANK_KEY_MD_BLANK);
      corrections.push(`빈칸 미표기 문장에서 정답 스팬을 ${FILL_BLANK_KEY_MD_BLANK} 로 치환`);
    }
  }

  // (3) 정답 꼬리 구두점 절삭 — 절삭본이 프레임을 복원할 때만 채택(검증 후 채택).
  if (answer && /[.,;:!?]+$/.test(answer)) {
    const stripped = answer.replace(/[.,;:!?]+$/, "").trim();
    if (
      stripped &&
      wordCount(stripped) >= 1 &&
      fillBlankKeyFrameMatches(passage, sentence, stripped)
    ) {
      corrections.push(`정답 꼬리 구두점 절삭: '${answer}' → '${stripped}'`);
      answer = stripped;
    }
  }

  // (4) 관사 외출 — 정답이 관사로 시작하면 학생이 관사를 쓸지 말지로 채점이 갈린다.
  //     관사를 빈칸 밖(문장 쪽)으로 옮긴다. 복원문은 불변이므로 프레임은 안전하다.
  //     프레임이 이미 성립할 때만 손댄다(깨진 프레임을 그럴듯하게 덮지 않기 위함).
  const article = answer.match(ARTICLE_HEAD_RE);
  if (
    article &&
    wordCount(article[2]) >= FILL_BLANK_KEY_MD_WORD_MIN &&
    (sentence.match(/_{3,}/g) ?? []).length === 1 &&
    fillBlankKeyFrameMatches(passage, sentence, answer)
  ) {
    const moved = sentence.replace(/_{3,}/, `${article[1]} ${FILL_BLANK_KEY_MD_BLANK}`);
    if (fillBlankKeyFrameMatches(passage, moved, article[2])) {
      corrections.push(`관사 '${article[1]}' 를 빈칸 밖으로 이동 — 정답 '${article[2]}'`);
      sentence = moved;
      answer = article[2];
    }
  }

  // (5) 허용답 절삭 — 이 유형의 허용답 계약은 **표기 변형만**이다(스키마 :96-98).
  //     동의어·패러프레이즈가 한 줄 섞이면 지문에 없는 표현을 쓴 학생이 만점을
  //     받는다(되돌릴 수 없는 채점 사고). 결정형으로 걸러내고 전부 기록한다.
  const answerKey = orthographicKey(answer);
  const answerPlain = normalizeGradeText(answer);
  const kept: string[] = [];
  const seen = new Set<string>([answerPlain]);
  for (const raw of q.acceptedAnswers) {
    const plain = normalizeGradeText(raw);
    if (!plain || seen.has(plain)) continue;
    if (orthographicKey(raw) !== answerKey) {
      corrections.push(
        `허용답 '${raw.slice(0, 60)}' 폐기 — 정답 '${answer.slice(0, 60)}' 의 표기 변형이 아님(동의어·패러프레이즈는 오답을 흡수합니다)`,
      );
      continue;
    }
    seen.add(plain);
    kept.push(raw.trim());
  }

  return {
    question: {
      ...q,
      sentenceWithBlank: sentence,
      answer,
      acceptedAnswers: kept,
    },
    corrections,
  };
}

/**
 * 대소문자 무시 단어경계 정규식 — 검증기 fbk-answer-residual-leak(:42-43)와 동형.
 *
 * 본문은 **정본 normalizeWs 폭으로 접은 뒤 변종 문자군으로 되펼친다**. 지문은
 * 웹·워드 붙여넣기라 곱슬 아포스트로피(’)·en 대시(–)를 쓰는데 모델은 곧은
 * 표기(' / -)로 받아쓰는 실측 드리프트가 있고, 원문 그대로 대조하면 정상 문항이
 * "정답이 지문에 축자로 없음"으로 하드 반려된다(재생성 1회 소진 + 거짓 피드백).
 * 접기만 하면 반대 방향(지문 곧은 / 모델 곱슬)이 깨지므로 **양방향**으로 받는다.
 *
 * 빈 표현이면 **아무것도 매칭하지 않는** 정규식을 준다(빈 본문 + 룩어라운드만
 * 남으면 모든 위치에서 매칭돼 전 문항이 오반려된다).
 */
export function answerBoundaryRegex(answer: string): RegExp {
  const body = normalizeWs(answer)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+")
    .replace(/'/g, "['’ʼ‛]")
    .replace(/"/g, '["“”]')
    .replace(/-/g, "[-–—]")
    .replace(/\\\.\\\.\\\./g, "(?:\\.\\.\\.|…)");
  if (!body) return /(?!)/g;
  return new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`, "gi");
}

/** 지문 내 정답 등장 횟수(대소문자 무시 · 단어 경계). */
export function countFillBlankKeyAnswerOccurrences(
  passage: string,
  answer: string,
): number {
  if (!answer.trim() || !passage) return 0;
  return [...passage.matchAll(answerBoundaryRegex(answer))].length;
}
