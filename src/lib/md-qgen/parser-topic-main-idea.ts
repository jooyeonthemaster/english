// ============================================================================
// 주제/요지(TOPIC_MAIN_IDEA) md 파서 · 0원 스냅 · 지문 정박 유틸.
// 견본: parser-antonym.ts / 정본 규약 답습: 파서는 관대하게 · 게이트는 엄격하게.
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 이 유형은 지문을 **변형하지 않는다.** 그래서 다른 유형의 최강 불변식인
// "지문 재구성 대조"가 존재하지 않고, 남는 것은 선지 형상 검사뿐이다. 그 공백을
// 메우는 것이 `근거문장:` 한 줄이다 — 정답 판단의 축이 된 지문 문장을 축자로
// 받아, 게이트가 지문과 대조할 수 있게 한다(학생 표면에는 나가지 않는다).
//
// ⚠ 게이트 본체는 gate-topic-main-idea.ts 로 분리했다(파일 500줄 규약).
//   의존 방향은 gate → parser 단방향이다(재수출로 순환을 만들지 마라).
// ⚠ 후처리가 사실상 없다(PASSTHROUGH_TYPES) — 게이트에서 못 잡으면 그대로 출하된다.
// ============================================================================

import { TOPIC_MAIN_IDEA_MD_LABELS } from "./prompts-topic-main-idea";

export interface MdGistOption {
  /** "①"~"⑧" */
  label: string;
  text: string;
}

export interface MdTopicMainIdeaQuestion {
  kind: "topicMainIdea";
  /** 정답 판단의 축이 된 지문 문장(축자) — 게이트 전용 정박점, 저장하지 않는다. */
  evidence: string;
  options: MdGistOption[];
  /** 정답 라벨들 — `정답:` 줄이 유일 진실원(선지 줄에 정답 표시를 받지 않는다). */
  answers: string[];
  /** 게이트 진단용 — `정답:` 줄에서 읽은 원문(라벨을 못 읽었을 때 자리를 지목). */
  answerRaw?: string;
  /** 게이트 진단용 — `오답:` 머리표를 인식했는가(개수 부족과 구분한다). */
  wrongSectionFound?: boolean;
  explanation: string;
  wrong: { label: string; text: string }[];
}

const CIRCLED = TOPIC_MAIN_IDEA_MD_LABELS.join(""); // "①②③④⑤⑥⑦⑧"

/** 숫자·괄호·원문자 어느 표기로 와도 원문자 라벨로 정규화한다(없으면 ""). */
export function normalizeGistLabel(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const circled = text.match(/[①-⑧]/)?.[0];
  if (circled && CIRCLED.includes(circled)) return circled;
  const digit = text.match(/^[(（[]?\s*([1-8])\s*[)）\].]?$/)?.[1];
  return digit ? TOPIC_MAIN_IDEA_MD_LABELS[Number(digit) - 1] : "";
}

function circledOfDigit(digit: string | undefined): string {
  const n = Number(digit);
  return n >= 1 && n <= TOPIC_MAIN_IDEA_MD_LABELS.length
    ? TOPIC_MAIN_IDEA_MD_LABELS[n - 1]
    : "";
}

// 라벨로 시작하는 줄만 선지 후보로 본다. 라벨 앞의 마크다운 장식(불릿·굵게)과 표
// 파이프는 흡수한다 — 모델이 목록을 꾸미는 실측 드리프트. 맨몸 숫자는 뒤에 마침표·
// 괄호가 따라올 때만 라벨로 인정한다("2026년에는 ..." 같은 본문 줄을 선지로
// 오인하면 개수 게이트가 엉뚱한 곳을 지목하게 된다).
const GIST_LINE_HEAD =
  /^\s*\|?\s*(?:[-*•]\s*)?(?:\*\*)?\s*(?:([①-⑧])|[(（[]\s*([1-8])\s*[)）\]]|([1-8])\s*[.)．、])\s*(?:\*\*)?\s*(.+)$/;

function stripTableCell(text: string): string {
  return text
    .replace(/^\s*\|\s*/, "")
    .replace(/\s*\|\s*$/, "")
    .trim();
}

/**
 * `정답:` 줄의 **선행 라벨 런**만 수집한다(정본 parseGrammarAnswerFix 계승).
 * "정답: ②, ④" 는 둘 다, "정답: ② — ④는 범위확대" 의 뒤쪽 언급은 무시한다.
 */
function parseGistAnswerRun(line: string): string[] {
  const out: string[] = [];
  let rest = line.trim();
  const token = /^(?:([①-⑧])|[(（[]\s*([1-8])\s*[)）\]]|([1-8])(?![0-9]))/;
  for (;;) {
    const m = rest.match(token);
    if (!m) break;
    const label = m[1] ?? circledOfDigit(m[2] ?? m[3]);
    if (!label) break;
    if (!out.includes(label)) out.push(label);
    rest = rest.slice(m[0].length);
    const sep = rest.match(/^\s*(?:[,·、]|과|와|and)\s*/i);
    if (!sep) break;
    rest = rest.slice(sep[0].length);
  }
  return out;
}

// ── 섹션 머리표 문법 ────────────────────────────────────────────────────────
// 이 계통이 md 레인 최대의 조용한 유실원이다: 선지·데이터 줄은 관대하게 파싱해
// 놓고 키워드 줄만 무관용 정규식으로 잡으면, 모델이 헤더를 마크다운 관습대로
// 꾸미는 순간(`**정답**` · `### 오답 해설` · `오답 해설:`) 그 필드가 통째로
// 사라진다. 그러면 게이트는 "정답 누락" · "오답해설 0개(4개 필요)" 처럼
// **사실과 다른 원인**을 지목하고, 그 문구가 그대로 [반려 재생성] 피드백으로
// 실려 모델을 엉뚱한 방향으로 몬다(§1-B 철칙 3·5). 그래서 세 갈래로 넓힌다 —
//   (a) 콜론이 있으면 불릿·해시·굵게 장식 자유
//   (b) 굵게로 **닫힌** 머리표는 콜론 생략 관용 (`**오답**` · `**정답** ③`)
//   (c) 불릿·해시 헤딩이 줄 전체를 차지하면 콜론 생략 관용 (`### 오답 해설`)
// (b)(c) 로만 콜론을 생략시키는 이유: 콜론을 무조건 선택으로 만들면
// `- 정답과 같은 핵심어를…` 같은 본문 줄이 머리표로 오인돼 섹션 경계가 앞으로
// 밀린다. 이름 뒤 경계 lookahead 도 같은 오인을 막는 장치다.
const HEAD_BULLET = String.raw`(?:[-*•#][ \t]*)`;
const HEAD_BOLD = String.raw`(?:\*\*|__)`;

/** 이름 뒤에 붙는 동의 수식어 — 유형별로 따로 준다(교차 오염 방지). */
const EVIDENCE_NAME = String.raw`근거(?:[ \t]*(?:문장|문))?`;
const ANSWER_NAME = String.raw`정답(?:[ \t]*(?:라벨|번호))?`;
const EXPLANATION_NAME = String.raw`해설(?:[ \t]*(?:요지|정리))?`;
const WRONG_NAME = String.raw`오답(?:[ \t]*(?:해설|풀이|선지|목록|리스트))?`;

function sectionHead(name: string): string {
  // 이름 바로 뒤가 한글·영문·숫자면 머리표가 아니라 본문이다("정답률"·"해설이").
  const body = `${name}(?![가-힣A-Za-z0-9])`;
  const withColon = String.raw`${HEAD_BULLET}*(?:${HEAD_BOLD}[ \t]*)?${body}[ \t]*${HEAD_BOLD}?[ \t]*[:：][ \t]*${HEAD_BOLD}?[ \t]*`;
  const boldClosed = String.raw`${HEAD_BULLET}*${HEAD_BOLD}[ \t]*${body}[ \t]*(?:[:：][ \t]*)?${HEAD_BOLD}[ \t]*(?:[:：][ \t]*)?`;
  const headingLine = String.raw`${HEAD_BULLET}+${body}[ \t]*$`;
  return `^[ \\t]*(?:${withColon}|${boldClosed}|${headingLine})`;
}
const EVIDENCE_LINE_RE = new RegExp(`${sectionHead(EVIDENCE_NAME)}(.+)$`, "m");
const ANSWER_LINE_RE = new RegExp(`${sectionHead(ANSWER_NAME)}(.+)$`, "m");
const ANSWER_HEAD_RE = new RegExp(sectionHead(ANSWER_NAME), "m");
const EXPLANATION_HEAD_RE = new RegExp(sectionHead(EXPLANATION_NAME), "m");
const WRONG_HEAD_RE = new RegExp(sectionHead(WRONG_NAME), "m");
const EXPLANATION_BODY_RE = new RegExp(
  `${sectionHead(EXPLANATION_NAME)}([\\s\\S]*?)(?=${sectionHead(WRONG_NAME)})`,
  "m",
);
const EXPLANATION_TAIL_RE = new RegExp(
  `${sectionHead(EXPLANATION_NAME)}([\\s\\S]+)$`,
  "m",
);

// 이어짐-줄 병합을 멈추는 줄 — 다른 섹션의 머리표·마크다운 헤딩·표 구분선,
// 그리고 라벨 축 밖의 원문자 줄(병합으로 감추면 라벨 오류가 게이트에서 사라진다).
const CONTINUATION_STOP_RE = new RegExp(
  [
    sectionHead(EVIDENCE_NAME),
    sectionHead(ANSWER_NAME),
    sectionHead(EXPLANATION_NAME),
    sectionHead(WRONG_NAME),
    sectionHead(String.raw`발문`),
    sectionHead(String.raw`지문`),
    String.raw`^[ \t]*#{1,6}[ \t]`,
    String.raw`^[ \t]*[|:\-+= \t]+$`,
    String.raw`^[ \t]*[①-⑳]`,
  ].join("|"),
  "m",
);

/**
 * 라벨 줄을 관대하게 수집한다(줄당 칸은 텍스트 하나뿐 — 철칙 2).
 *
 * ⚠ 라벨 없는 줄을 버리면 안 된다. 프롬프트가 "개행 없이 한 줄"을 요구해도 긴
 *   한국어 진술문·오답 해설은 모델이 wrap 하는 실측 드리프트가 있고, 그때 뒷줄을
 *   버리면 **절단된 선지가 게이트 CLEAN 으로 출하된다**(개수·라벨은 멀쩡하므로
 *   0원 게이트가 볼 수 없다. 이 유형은 PASSTHROUGH 라 후처리 보정도 없다).
 *   그래서 라벨 매칭에 실패한 줄은 — 공백줄도, 다른 섹션 머리표도 아니라면 —
 *   직전 행의 text 에 공백으로 이어 붙인다.
 */
function parseLabeledLines(section: string): MdGistOption[] {
  const rows: MdGistOption[] = [];
  let open: MdGistOption | null = null;
  for (const rawLine of section.split(/\r?\n/)) {
    const head = rawLine.match(GIST_LINE_HEAD);
    if (head) {
      const label = head[1] ?? circledOfDigit(head[2] ?? head[3]);
      const text = stripTableCell(head[4]).replace(/\*\*/g, "").trim();
      if (!label || !text) {
        open = null;
        continue;
      }
      open = { label, text };
      rows.push(open);
      continue;
    }
    if (!rawLine.trim()) {
      open = null; // 빈 줄은 항목의 끝 — 뒤따르는 문단을 삼키지 않는다.
      continue;
    }
    if (!open || CONTINUATION_STOP_RE.test(rawLine)) {
      open = null;
      continue;
    }
    const tail = stripTableCell(rawLine).replace(/\*\*/g, "").trim();
    if (tail) open.text = `${open.text} ${tail}`;
  }
  return rows;
}

/** 머리표 장식으로 남은 굵게 표시를 걷어낸다(값 자체는 버리지 않는다). */
function undecorate(value: string | undefined): string {
  return (value ?? "").replace(/\*\*/g, "").trim();
}

/** 주어진 머리표들 중 가장 먼저 나오는 자리까지 잘라낸다(없으면 전체). */
function sliceBeforeFirst(text: string, markers: RegExp[]): string {
  let cut = text.length;
  for (const marker of markers) {
    const at = text.match(marker)?.index;
    if (at !== undefined && at < cut) cut = at;
  }
  return text.slice(0, cut);
}

/**
 * 주제/요지 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(원문자·숫자·괄호), 불릿·굵게·표 행 장식, 전각 콜론,
 * 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdTopicMainIdea(text: string): MdTopicMainIdeaQuestion {
  const evidence = undecorate(text.match(EVIDENCE_LINE_RE)?.[1]);
  const answerRaw = undecorate(text.match(ANSWER_LINE_RE)?.[1]);
  const answers = parseGistAnswerRun(answerRaw);

  // 선지는 해설 블록(정답·해설·오답) 앞에만 있다(형식 계약). 그 구간에서 2개
  // 미만이 잡히면 순서 드리프트로 보고 `오답:` 앞 전체로 넓힌다 — 폴백을 먼저
  // 돌리면 정상 출력에서 해설 문단의 번호 줄까지 선지로 삼킬 수 있다.
  // ⚠ 경계를 `정답:` 하나로만 잡으면, 정답 줄이 통째로 빠진 출력에서 오답 목록이
  //   선지로 딸려 들어가 게이트가 "선지 9개"라는 엉뚱한 자리를 지목한다(철칙 3·5).
  const beforeWrong = sliceBeforeFirst(text, [WRONG_HEAD_RE]);
  const primary = parseLabeledLines(
    sliceBeforeFirst(text, [ANSWER_HEAD_RE, EXPLANATION_HEAD_RE, WRONG_HEAD_RE]),
  );
  const options = primary.length >= 2 ? primary : parseLabeledLines(beforeWrong);

  const wrongSection = text.split(WRONG_HEAD_RE)[1] ?? "";
  // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
  // 조용한 데이터 버림이 아니다: 게이트가 남은 라벨 **집합**을 비정답 라벨 집합과
  // 대조하므로(gate-topic-main-idea.ts), 필터로 생긴 결손은 전부 게이트에 드러난다.
  const wrong = parseLabeledLines(wrongSection).filter(
    (w) => !answers.includes(w.label),
  );

  return {
    kind: "topicMainIdea",
    evidence,
    options,
    answers,
    answerRaw,
    // 머리표를 못 찾은 것과 머리표 아래가 비어 있는 것은 재생성 처방이 정반대다.
    // 이 한 비트가 없으면 게이트가 둘 다 "오답해설 0개"로 뭉뚱그려 모델을 오도한다.
    wrongSectionFound: WRONG_HEAD_RE.test(text),
    explanation: undecorate(
      text.match(EXPLANATION_BODY_RE)?.[1] ?? text.match(EXPLANATION_TAIL_RE)?.[1],
    ),
    wrong,
  };
}

// ── 지문 정박(근거문장 축자 대조) ────────────────────────────────────────────
// 구두점 무관 대조(alnum + 단일 공백)는 fast 검증기의 실측 교훈이다: 모델이
// 곱슬따옴표·em-dash·말줄임을 정규화해 옮겨 적으면 축자 대조가 깨져 정상 문항이
// 전멸했다. 단어 수준 재작성은 이 fold 로도 여전히 잡힌다.

function foldWithMap(source: string): { folded: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < source.length; i += 1) {
    const lower = source[i].toLowerCase();
    const c = lower.length === 1 ? lower : " ";
    if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9"))) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && chars.length > 0) {
      chars.push(" ");
      map.push(i);
    }
    pendingSpace = false;
    chars.push(c);
    map.push(i);
  }
  return { folded: chars.join(""), map };
}

/** 구두점 무관 비교용 정규화(alnum + 단일 공백). */
export function foldForGistMatch(source: string): string {
  return foldWithMap(source).folded;
}

/** 근거문장이 지문에서 차지하는 구간(문장성 검사에 앞뒤 문맥이 필요하다). */
function locateGistEvidenceSpan(
  passage: string,
  evidence: string,
): { start: number; end: number; text: string } | null {
  const needle = foldForGistMatch(evidence);
  if (needle.length < 12) return null; // 너무 짧은 인용은 정박 기능을 못 한다
  const { folded, map } = foldWithMap(passage);
  const at = folded.indexOf(needle);
  if (at < 0) return null;
  let start = map[at] ?? 0;
  let end = (map[at + needle.length - 1] ?? passage.length - 1) + 1;
  // 앞뒤 인용부호·종결 구두점까지 보수적으로 복원(문장으로 읽히게).
  for (let i = 0; i < 2 && start > 0 && /["'“‘([]/.test(passage[start - 1]); i += 1) start -= 1;
  for (let i = 0; i < 4 && end < passage.length && /[^\sA-Za-z0-9]/.test(passage[end]); i += 1) end += 1;
  return { start, end, text: passage.slice(start, end).trim() };
}

/**
 * 근거문장을 지문에서 찾아 **원문 문자 그대로** 되돌려 준다(없으면 null).
 * 스냅이 반환값으로 구두점 드리프트를 교정한다.
 * ⚠ 정박 **판정**은 이 함수가 아니라 verifyGistEvidenceSentence 가 한다 —
 *   여기 성패만 보면 지문의 임의 조각 12자로 게이트가 충족된다.
 */
export function locateGistEvidence(passage: string, evidence: string): string | null {
  return locateGistEvidenceSpan(passage, evidence)?.text ?? null;
}

/** 근거문장 정박 판정 결과. `ok` 외에는 전부 게이트 반려 사유다. */
export type GistEvidenceVerdict = "ok" | "not-found" | "too-short" | "not-a-sentence";

/** 문장성 하한 — 지문의 짧은 단언(예: "Context matters.")을 죽이지 않는 보수값. */
const GIST_EVIDENCE_MIN_WORDS = 5;

/**
 * 근거문장이 지문의 **완결된 한 문장**인지 판정한다.
 *
 * 이 유형은 지문을 변형하지 않아 "지문 재구성 대조"라는 최강 게이트가 없고,
 * `근거문장:` 줄 하나가 형식 리터럴 이탈의 유일한 근거(지문 정박)다. 그런데
 * "지문에 substring 으로 존재" 만 보면 문장 중간에서 잘라낸 12자 조각으로도
 * 충족돼(`근거문장: The claim is`) 정박이 공회전한다 — 게이트는 "모델이 지문에서
 * 12자를 복사했다"만 증명할 뿐, 그 문장이 정답 판단의 축인지는커녕 문장이긴
 * 한지도 보지 못한다. 그래서 지문에서의 **문장 경계**를 요구한다.
 */
export function verifyGistEvidenceSentence(
  passage: string,
  evidence: string,
): GistEvidenceVerdict {
  const span = locateGistEvidenceSpan(passage, evidence);
  if (!span) return "not-found";
  if (foldForGistMatch(span.text).split(" ").filter(Boolean).length < GIST_EVIDENCE_MIN_WORDS) {
    return "too-short";
  }
  // 문장 시작: 지문의 처음이거나, 공백·인용부호·괄호를 건너뛴 앞자리가 종결 구두점.
  let before = span.start - 1;
  while (before >= 0 && /[\s"'“”‘’()[\]]/.test(passage[before])) before -= 1;
  const startsSentence = before < 0 || /[.!?]/.test(passage[before]);
  // 문장 끝: 종결 구두점으로 끝난다(닫는 인용부호·괄호는 허용).
  const endsSentence = /[.!?]["'”’)\]]*$/.test(span.text);
  return startsSentence && endsSentence ? "ok" : "not-a-sentence";
}

/** 지문에서 찾아지는 **가장 긴 접두 문장**(문장 경계 후보를 앞에서부터 시도). */
function longestLocatablePrefix(passage: string, evidence: string): string | null {
  const cuts: number[] = [];
  for (let i = 0; i < evidence.length; i += 1) {
    if (!".!?".includes(evidence[i])) continue;
    let end = i + 1;
    while (end < evidence.length && /["'”’)\]]/.test(evidence[end])) end += 1;
    if (end >= evidence.length || /\s/.test(evidence[end])) cuts.push(end);
  }
  for (const cut of cuts.reverse()) {
    const candidate = evidence.slice(0, cut).trim();
    const exact = locateGistEvidence(passage, candidate);
    if (exact) return exact;
  }
  return null;
}

// 선지 안에 남은 정답 표시 — 학생 표면으로 새면 문항이 통째로 무효가 되므로
// 스냅이 걷어낸다(정답의 진실원은 `정답:` 줄 하나다).
const ANSWER_MARK_TAIL = /\s*[(（[]\s*(?:정답|답|정답임|O|o|✓|✔)\s*[)）\]]\s*$/;
// 선지 텍스트 앞에 라벨이 한 번 더 적힌 드리프트("① ① 내용" · "① 1. 내용").
const DUP_LABEL_HEAD = /^(?:[①-⑧]|[(（[]\s*[1-8]\s*[)）\]]|[1-8]\s*[.)．、])\s*/;

/**
 * 0원 자동 보정. 반려 주계통 세 가지를 흡수한다 —
 *  (1) 선지 제시 순서 뒤바뀜 → 라벨 기준 정렬(위치의 진실원은 라벨이다),
 *  (2) 선지 텍스트에 남은 중복 라벨·정답 표시 제거,
 *  (3) 근거문장의 인용부호·구두점 드리프트를 지문 축자로 되돌리고, 두 문장을 붙여
 *      쓴 경우 지문에서 찾아지는 가장 긴 한 문장으로 축약.
 * 보수 가드: 지문에서 자리를 못 찾으면 손대지 않고 게이트가 반려하게 둔다.
 */
export function autoSnapTopicMainIdea(
  q: MdTopicMainIdeaQuestion,
  passage: string,
): { question: MdTopicMainIdeaQuestion; corrections: string[] } {
  const corrections: string[] = [];

  let options = q.options;
  const rank = (l: string) => CIRCLED.indexOf(l);
  const labelRun = options.map((o) => o.label).join("");
  if (
    options.length >= 2 &&
    new Set(options.map((o) => o.label)).size === options.length &&
    options.every((o) => rank(o.label) >= 0)
  ) {
    const sorted = [...options].sort((a, b) => rank(a.label) - rank(b.label));
    if (sorted.map((o) => o.label).join("") !== labelRun) {
      options = sorted;
      corrections.push("선지 제시 순서를 라벨 순으로 정렬");
    }
  }

  options = options.map((o) => {
    let text = o.text;
    if (ANSWER_MARK_TAIL.test(text)) {
      text = text.replace(ANSWER_MARK_TAIL, "").trim();
      corrections.push(`${o.label} 선지 끝의 정답 표시 제거(학생 표면 누출 차단)`);
    }
    if (DUP_LABEL_HEAD.test(text)) {
      const stripped = text.replace(DUP_LABEL_HEAD, "").trim();
      if (stripped) {
        text = stripped;
        corrections.push(`${o.label} 선지 앞의 중복 번호 제거`);
      }
    }
    return text === o.text ? o : { ...o, text };
  });

  let evidence = q.evidence
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^["'“‘]+/, "")
    .replace(/["'”’]+$/, "")
    .trim();
  if (evidence) {
    const exact = locateGistEvidence(passage, evidence);
    if (exact && exact !== evidence) {
      evidence = exact;
      corrections.push("근거문장을 지문 축자로 보정(구두점 드리프트)");
    } else if (!exact) {
      const prefix = longestLocatablePrefix(passage, evidence);
      if (prefix) {
        evidence = prefix;
        corrections.push("근거문장을 지문 축자 한 문장으로 축약");
      }
    }
  }

  // ⚠ "보정 기록이 없으면 원본을 그대로 돌려준다"는 최적화를 쓰지 마라 — 기록을
  //   남기지 않는 무해한 정규화(감싼 따옴표 제거 등)가 통째로 버려져, 게이트에는
  //   "근거문장이 지문에 축자로 없음"으로만 보이는 유령 반려가 난다(실측 봉합).
  return { question: { ...q, options, evidence }, corrections };
}
