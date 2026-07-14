/**
 * 어법(GRAMMAR_ERROR) 확정 비문 오형 + 필러 미끼 스팬 결정론 검출
 * — round-1 감독관 판정(26-07-14) ①② 구현.
 *
 * 1) findGrammarAnswerForcedNonword → 코드 "grammar-answer-nonword-forced"
 *    정답(isError) 오형이 **학생이 보자마자 비문임을 아는 확정 오형**인 세 패턴만
 *    좁게 잡는다 (round-1 실측: q13 "did be" · q23 "understoodly" · q05 명사 뒤
 *    what 삽입 — 기준서 §1 명시 금지).
 *    (a) 조동사 do/does/did 직후 be 원형 연쇄 — "its leaves did be colorless".
 *        명령문 강조 "Do be careful"(문두 do)은 정문이므로 제외.
 *    (b) 불규칙 과거분사 + -ly 비단어 — 소형 불규칙 PP 내장 리스트 × "ly" 정확
 *        일치만 (understoodly / feltly / brokenly류 아님 — 전부 사전 비단어 검증).
 *    (c) 명사(구 꼬리) 직후 what 삽입형 — errorExpression 이 "what (+be)" 를 원형
 *        앞에 끼워 넣은 순수 삽입이고, 밑줄 직전 토큰이 what 을 정당화하는 닫힌
 *        목록(계사·수동조동사·전치사·접속/보문·인지동사)에 없는 경우.
 *    검출 메시지는 재시도 프롬프트로 들어가므로 "무엇이 거절됐고 무엇으로 재선정
 *    할지"까지 지시한다.
 *
 * 2) findGrammarDecoyFillerSpan → 코드 "grammar-decoy-filler-span"
 *    미끼(비정답) 밑줄이 **지우고 읽어도 아무 문법 판단이 없는 장식 필러**인 네
 *    패턴만 잡는다 (round-1 실측: q17 (D) "without" · q19 (B) "when to plant").
 *    (a) 단독 전치사 1토큰 (during/without/despite/among/between 등 닫힌 목록 —
 *        전치사·접속사 겸용(as/since/before/after 등)은 l 판단이 성립할 수 있어 제외)
 *    (b) 조동사·to 직후 동사원형 1토큰 — 그 자리는 원형만 가능해 대안 형태 판단이
 *        없다. (-ing 는 to-전치사 대비 k 판단이 성립하므로 제외, 대명사·부사 제외)
 *    (b') 의문사(when/where/how/what/whether) 직후 "to + 원형" 통짜 스팬 — 대안
 *        형태가 없는 고정 프레임.
 *    (c) 관사+형용사+명사 통짜 명사구 — 내부에 판단 토큰(분사·비교급·수량사)이
 *        전혀 없는 3토큰 NP.
 *    (d) 문두 등위접속사 1토큰 (But/And/So/Or/Yet/Nor) — 종속접속사는 전치사 대비
 *        l 판단이 성립할 수 있어 제외.
 *    소비처: 기존 decoy-only 부분수리(repairQuestionCandidate) — 해당 미끼 1개만
 *    교체하면 해소되므로 문항 전체 재생성을 유발하지 않는다.
 *
 * 두 검출기 모두 markedExpressions 의 expression/errorExpression/surroundingText
 * 문자열만 받는 순수 함수로, 유닛테스트 가능하다. 하드 실패 유발 금지 계약:
 * 등급 상수(RELAXED_BLOCKING 등)에는 등재하지 않아 strict 재시도에서만 차단되고
 * relaxed 폴백에서는 경고로 강등된다(등급 배선은 이 모듈 밖의 몫).
 */

import { normalizeText } from "../../core";
import { ZERO_OR_IRREGULAR_PARTICIPLE } from "./shared";

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 단어 경계 안전 탐색 — 'are'가 'aware' 내부에 매칭되는 오탐을 막는다. */
function findBoundarySafeIndex(haystack: string, needle: string, fromIndex = 0): number {
  if (!needle) return -1;
  const re = new RegExp(
    `(?<![A-Za-z'-])${escapeRegExpLiteral(needle)}(?![A-Za-z'-])`,
    "ig",
  );
  re.lastIndex = fromIndex;
  const match = re.exec(haystack);
  return match ? match.index : -1;
}

/** 소문자 단어 토큰화 — 양끝 구두점 제거, 내부 어퍼스트로피/하이픈 유지. */
function tokenizeWords(value: string): string[] {
  return normalizeText(value)
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z'-]+|[^a-z'-]+$/g, ""))
    .filter(Boolean);
}

// ════════════════════════════════════════════════════════════════════════════
// 1. 확정 비문 오형 — grammar-answer-nonword-forced
// ════════════════════════════════════════════════════════════════════════════

// (b) 소형 불규칙 과거분사 리스트(감독관 지정) — 전부 +ly 시 사전 비단어가 되는
// 형태만. 정확 일치 전용이라 real word(-ly 형용사/부사)와 충돌하지 않는다.
const IRREGULAR_PP_STEMS = [
  "understood", "known", "seen", "given", "taken", "made", "found", "held",
  "kept", "left", "lost", "paid", "told", "thought", "brought", "built",
  "caught", "chosen", "drawn", "driven", "eaten", "fallen", "felt", "fought",
  "forgotten", "gotten", "gone", "grown", "heard", "hidden", "hit", "hurt",
  "laid", "led", "lent", "let", "lit", "meant", "met", "put", "read", "ridden",
  "risen", "run", "said", "sat", "shaken", "shown", "shut", "sold", "sent",
  "set", "spoken", "spent", "stood", "stolen", "swum", "taught", "torn",
  "thrown", "won", "worn", "written",
] as const;

export const IRREGULAR_PP_LY_NONWORDS: ReadonlySet<string> = new Set(
  IRREGULAR_PP_STEMS.map((pp) => `${pp}ly`),
);

// (a) do/does/did + be 원형 연쇄 — 마커 밑줄(_)이 붙어도 잡히도록 경계는
// 알파벳/어퍼스트로피/하이픈만 배제한다.
const DO_BE_CHAIN_RE = /(?<![A-Za-z'-])(do|does|did)\s+be(?![A-Za-z'-])/gi;

/** 문두 강조 명령문 "Do be ..." 정문 가드 — do 가 문장 첫 토큰이면 제외. */
function isImperativeDoPosition(window: string, matchIndex: number, aux: string): boolean {
  if (aux.toLowerCase() !== "do") return false;
  const before = window.slice(0, matchIndex);
  return /^\s*$/.test(before) || /[.!?]["')\]]*\s*$/.test(before);
}

/** [start,end) 스팬과 매치 구간이 겹치는 do/does/did+be 연쇄가 있는가. */
function hasDoBeChainOverlapping(
  window: string,
  spanStart: number,
  spanEnd: number,
): boolean {
  DO_BE_CHAIN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DO_BE_CHAIN_RE.exec(window))) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    if (
      matchStart <= spanEnd &&
      matchEnd >= spanStart &&
      !isImperativeDoPosition(window, matchStart, match[1])
    ) {
      return true;
    }
    if (match[0].length === 0) DO_BE_CHAIN_RE.lastIndex += 1;
  }
  return false;
}

/**
 * (a) 오형 치환이 do/does/did + be 연쇄를 만드는가 — surroundingText 의 각 원형
 * 출현을 하나씩 오형으로 치환해 보고, 연쇄가 치환 스팬과 겹칠 때만 발화한다
 * (문맥 다른 곳의 기존 연쇄로는 발화하지 않음 — 오탐 0 지향).
 */
function mutationForcesDoBeChain(
  source: string,
  mutated: string,
  surrounding: string,
): boolean {
  // 오형 자체가 연쇄를 포함 — does/did 는 무조건, do 는 첫 토큰이 아닐 때만
  // (고립 문자열은 명령문 여부를 판정할 수 없어 보수적으로 제외).
  DO_BE_CHAIN_RE.lastIndex = 0;
  let selfMatch: RegExpExecArray | null;
  while ((selfMatch = DO_BE_CHAIN_RE.exec(mutated))) {
    if (selfMatch[1].toLowerCase() !== "do" || selfMatch.index > 0) return true;
    if (selfMatch[0].length === 0) DO_BE_CHAIN_RE.lastIndex += 1;
  }
  if (!surrounding) return false;
  // 모델이 surroundingText 에 오형을 이미 인용한 경우 — 그 자리 기준으로 판정.
  const mutatedIdx = findBoundarySafeIndex(surrounding, mutated);
  if (
    mutatedIdx >= 0 &&
    hasDoBeChainOverlapping(surrounding, mutatedIdx, mutatedIdx + mutated.length)
  ) {
    return true;
  }
  // 원형 출현을 하나씩 오형으로 치환한 가상 창에서 판정.
  if (!source || source.toLowerCase() === mutated.toLowerCase()) return false;
  let from = 0;
  for (;;) {
    const idx = findBoundarySafeIndex(surrounding, source, from);
    if (idx < 0) break;
    const window =
      surrounding.slice(0, idx) + mutated + surrounding.slice(idx + source.length);
    if (hasDoBeChainOverlapping(window, idx, idx + mutated.length)) return true;
    from = idx + Math.max(source.length, 1);
  }
  return false;
}

// (c) what 삽입 뒤에 낄 수 있는 be 계열(순수 삽입 판정용).
const WHAT_INSERTION_BE_FORMS = new Set(["is", "are", "was", "were"]);

// (c) 직전 토큰이 이 닫힌 목록이면 what 이 정당화될 수 있어(의사분열문·자유
// 관계절·명사절 자리) 발화하지 않는다. 원문(what 없는 문장)이 정문이어야 하므로
// 일반 타동사 뒤 분사 같은 조합은 실데이터에 없다 — 계사/수동·소유 조동사,
// 전치사, 접속·보문·wh, 빈출 인지동사만 막으면 충분하다.
const WHAT_LICENSING_PRECEDERS = new Set([
  // 계사·수동/소유 조동사 — "That is what is produced"(의사분열문) 정문 가능
  "is", "are", "was", "were", "am", "be", "been", "being",
  "become", "becomes", "became", "becoming",
  "get", "gets", "got", "gotten", "getting",
  "seem", "seems", "seemed", "appear", "appears", "appeared",
  "remain", "remains", "remained",
  "have", "has", "had", "having",
  "do", "does", "did", "doing", "done",
  // 전치사 — "of what is produced" 정문
  "of", "in", "on", "at", "by", "with", "from", "about", "for", "to", "into",
  "onto", "upon", "over", "under", "through", "after", "before", "between",
  "during", "than", "as", "like", "toward", "towards", "without", "despite",
  "beyond", "within", "against",
  // 접속·보문·의문/관계 — "and what ...", "know exactly what ..." 계열
  "and", "or", "but", "nor", "so", "yet", "that", "whether", "if", "because",
  "although", "though", "while", "since", "when", "where", "why", "how",
  "unless", "until", "whereas", "not", "only", "exactly", "precisely", "just",
  // 빈출 인지·전달 동사(닫힌 목록) — "know what is produced" 정문
  "know", "knows", "knew", "known", "knowing",
  "wonder", "wonders", "wondered", "wondering",
  "ask", "asks", "asked", "asking",
  "see", "sees", "saw", "seen", "understand", "understands", "understood",
  "explain", "explains", "explained", "show", "shows", "showed", "shown",
  "reveal", "reveals", "revealed", "determine", "determines", "determined",
  "decide", "decides", "decided", "discover", "discovers", "discovered",
  "learn", "learns", "learned", "learnt", "realize", "realizes", "realized",
  "imagine", "imagines", "imagined", "predict", "predicts", "predicted",
  "tell", "tells", "told", "mean", "means", "meant",
  "define", "defines", "defined", "describe", "describes", "described",
  "consider", "considers", "considered", "matter", "matters", "mattered",
]);

/**
 * (c) errorExpression 이 원형 앞에 "what (+ is/are/was/were)" 를 끼워 넣은 순수
 * 삽입이고, 밑줄 직전 토큰이 what 정당화 목록 밖(= 명사구 꼬리)이면 그 직전
 * 토큰을 반환한다. 아니면 null.
 */
function findNounAdjacentWhatInsertion(
  source: string,
  mutated: string,
  surrounding: string,
): string | null {
  if (!source || !surrounding) return null;
  const mutatedTokens = tokenizeWords(mutated);
  if (mutatedTokens.length < 2 || mutatedTokens[0] !== "what") return null;
  const sourceTokens = tokenizeWords(source);
  if (sourceTokens.length === 0 || sourceTokens[0] === "what") return null;
  const sameTokens = (a: string[], b: string[]) =>
    a.length === b.length && a.every((token, i) => token === b[i]);
  const restPlain = mutatedTokens.slice(1);
  const restAfterBe = WHAT_INSERTION_BE_FORMS.has(mutatedTokens[1] ?? "")
    ? mutatedTokens.slice(2)
    : null;
  const isPureInsertion =
    sameTokens(restPlain, sourceTokens) ||
    (restAfterBe !== null && sameTokens(restAfterBe, sourceTokens));
  if (!isPureInsertion) return null;
  const idx = findBoundarySafeIndex(surrounding, source);
  if (idx <= 0) return null;
  // 직전 토큰과 밑줄 사이는 공백만 허용(쉼표/대시 뒤 자유관계절은 판정 불가 → 미발화).
  const precederMatch = /([A-Za-z][A-Za-z'-]*)\s+$/.exec(surrounding.slice(0, idx));
  if (!precederMatch) return null;
  const preceder = precederMatch[1];
  const lowered = preceder.toLowerCase();
  // 어퍼스트로피 축약("that's" 등)은 계사 포함 가능성 — 보수적으로 미발화.
  if (lowered.includes("'")) return null;
  if (WHAT_LICENSING_PRECEDERS.has(lowered)) return null;
  return preceder;
}

/**
 * 정답(isError) 오형이 확정 비문 오형(즉답 비단어/연쇄/삽입)이면 재시도 지시형
 * 메시지를, 아니면 null 을 반환한다. 순수 함수 — markedExpression 의
 * expression / errorExpression / surroundingText 만 사용.
 */
export function findGrammarAnswerForcedNonword(
  expression: unknown,
  errorExpression: unknown,
  surroundingText: unknown,
): string | null {
  const source = normalizeText(expression);
  const mutated = normalizeText(errorExpression);
  if (!mutated) return null;
  if (source.toLowerCase() === mutated.toLowerCase()) return null;
  const surrounding = normalizeText(surroundingText);

  // (b) 불규칙 과거분사 + -ly 비단어 (실측 q23 "understoodly").
  const sourceTokenSet = new Set(tokenizeWords(source));
  for (const token of tokenizeWords(mutated)) {
    if (IRREGULAR_PP_LY_NONWORDS.has(token) && !sourceTokenSet.has(token)) {
      return `GRAMMAR_ERROR answer error form "${mutated}" contains the non-word "${token}" (irregular past participle + -ly). Students spot a dictionary non-word instantly, so the item tests nothing. Re-select the error form: mutate within real inflectional paradigms only (e.g. participle voice -ing↔-ed, finite↔nonfinite, agreement), never by attaching -ly to a past participle.`;
    }
  }

  // (a) do/does/did + be 원형 연쇄 (실측 q13 "did be").
  if (mutationForcesDoBeChain(source, mutated, surrounding)) {
    return `GRAMMAR_ERROR answer error form "${mutated}" creates the impossible auxiliary chain "do/does/did + be" in its sentence — a glaring non-sentence every student rejects at a glance. Re-select the error form: use a plausible finite/nonfinite, agreement, voice, or parallel-structure mutation that yields real-looking English.`;
  }

  // (c) 명사 직후 what 삽입 (실측 q05 "what is produced" ← "produced") — 기준서 §1 명시 금지.
  const whatPreceder = findNounAdjacentWhatInsertion(source, mutated, surrounding);
  if (whatPreceder) {
    return `GRAMMAR_ERROR answer error form "${mutated}" inserts "what" directly after a noun-phrase tail ("... ${whatPreceder} ${source} ..."), producing a glaring non-sentence (rubric-banned noun + what insertion). Re-select the answer: test that/what in a genuine nominal-clause slot (after a verb, preposition, or copula), or use a different error type at this site.`;
  }

  // (d) was→were 심기 금지 (round-2 F 실측 q12) — 심긴 were는 가정법 과거로 항상
  // 정문 방어가 가능해 '오류'가 성립하지 않는다(답 없음 문항 생산). 역방향
  // (were→was, 복수 주어 수일치 오류)는 정당하므로 이 방향만 금지.
  if (source.toLowerCase() === "was" && mutated.toLowerCase() === "were") {
    return `GRAMMAR_ERROR answer mutation was→were is banned: planted "were" is always defensible as a subjunctive (if/wish contexts), so no genuine error exists and the item has no answer. Re-select the error at a different site (e.g. agreement with a plural subject, voice, or participle).`;
  }

  // (e) 직접의문문 의문사↔의문사 치환 금지 (round-2 F 실측 q13 "Who are you?"→"Where are you?")
  // — 치환 결과가 문법적으로 완전한 정문이고 오류가 의미 차원이라 어법 발문과 불일치.
  // 관계사 최소대립쌍(where→which 등)은 정당하므로 직접의문문 문맥(같은 인용/문장에
  // 물음표가 뒤따르는 경우)으로만 좁힌다.
  const WH_WORDS = new Set(["who", "whom", "whose", "where", "when", "why", "what", "which", "how"]);
  if (WH_WORDS.has(source.toLowerCase()) && WH_WORDS.has(mutated.toLowerCase())) {
    const afterIdx = surrounding.toLowerCase().indexOf(mutated.toLowerCase());
    const tail = afterIdx >= 0 ? surrounding.slice(afterIdx) : "";
    const qMark = tail.indexOf("?");
    if (qMark >= 0 && qMark <= 60) {
      return `GRAMMAR_ERROR answer mutation "${source}"→"${mutated}" swaps one interrogative wh-word for another inside a direct question ("...${tail.slice(0, 40)}..."): the result is still perfectly grammatical — the defect is semantic, not grammatical, so the item has no grammar answer. Re-select the error at a different site.`;
    }
  }

  // (f) 부정대명사 선행 + they/their/them 심기 금지 (round-4 F 실측 q03 anyone→their)
  // — singular they 가 현대 표준(주요 사전·스타일가이드 용인)이라 정문 방어가 성립해
  // '오류'가 아니며, 해설이 규범문법에 기대도 이의신청 방어가 불가하다.
  const SINGULAR_THEY_FORMS = new Set(["they", "their", "them", "theirs", "themselves"]);
  if (SINGULAR_THEY_FORMS.has(mutated.toLowerCase()) && !SINGULAR_THEY_FORMS.has(source.toLowerCase())) {
    const INDEFINITE_ANTECEDENTS =
      /\b(anyone|anybody|everyone|everybody|someone|somebody|no one|nobody|each|either|neither|whoever|a person|a student|a child)\b/i;
    if (INDEFINITE_ANTECEDENTS.test(surrounding)) {
      return `GRAMMAR_ERROR answer mutation "${source}"→"${mutated}" plants a singular-they form after an indefinite antecedent: modern standard English accepts singular they, so the planted form is defensible and the item has no answer. Re-select the answer at a site with a genuinely ungrammatical form (e.g. agreement, voice, participle).`;
    }
  }

  // (g) 규칙 과거분사 + -ly 비단어 확장 (round-4 실측 q02 "focusedly") — 실존하는
  // -edly 부사는 닫힌 화이트리스트로 보호하고, 그 밖의 -edly 형태는 비단어로 본다.
  const REAL_EDLY_ADVERBS = new Set([
    "supposedly", "allegedly", "reportedly", "admittedly", "undoubtedly", "repeatedly",
    "markedly", "deservedly", "assuredly", "advisedly", "belatedly", "decidedly",
    "determinedly", "excitedly", "fixedly", "heatedly", "hurriedly", "pointedly",
    "relatedly", "reputedly", "unexpectedly", "wickedly", "wholeheartedly", "confusedly",
    "contentedly", "dejectedly", "delightedly", "distractedly", "exaggeratedly",
    "guardedly", "unabashedly", "unashamedly", "undividedly", "wretchedly", "agitatedly",
    "animatedly", "collectedly", "committedly", "concernedly", "dedicatedly",
  ]);
  for (const token of tokenizeWords(mutated)) {
    const lower = token.toLowerCase();
    if (lower.length > 5 && lower.endsWith("edly") && !REAL_EDLY_ADVERBS.has(lower) && !sourceTokenSet.has(token)) {
      return `GRAMMAR_ERROR answer error form "${mutated}" contains "${token}", a non-word built by attaching -ly to a past participle. Students reject dictionary non-words at a glance, so the item tests nothing. Re-select the error form using real English word forms only.`;
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// 2. 필러 미끼 스팬 — grammar-decoy-filler-span
// ════════════════════════════════════════════════════════════════════════════

// (a) 단독 전치사 필러 — 닫힌 목록. 전치사·접속사 겸용(as/since/before/after/
// until/for/like/than 등)은 l(전치사 vs 접속사) 판단이 성립할 수 있어 제외한다.
const FILLER_STANDALONE_PREPOSITIONS = new Set([
  "about", "above", "across", "against", "along", "among", "amongst", "around",
  "at", "behind", "below", "beneath", "beside", "besides", "between", "beyond",
  "by", "despite", "during", "except", "from", "in", "inside", "into", "near",
  "of", "off", "on", "onto", "out", "outside", "over", "through", "throughout",
  "toward", "towards", "under", "underneath", "unlike", "upon", "with",
  "within", "without",
]);

// (b) 원형 앞 조동사·to — 이 뒤 자리는 원형만 가능해 대안 형태 판단이 없다.
const BARE_FORM_GOVERNORS = new Set([
  "can", "could", "may", "might", "must", "shall", "should", "will", "would",
  "to", "do", "does", "did", "don't", "doesn't", "didn't", "cannot", "can't",
  "couldn't", "won't", "wouldn't", "shouldn't", "mustn't",
]);

// (b) 오탐 방어 — 조동사/to 뒤에 올 수 있으나 동사원형이 아닌 토큰(부사·부정·
// 대명사·한정사). 대명사는 재귀형 대비(g) 판단이 성립할 수 있어 반드시 제외.
const BARE_FORM_TOKEN_STOPLIST = new Set([
  "not", "no", "also", "always", "never", "ever", "just", "still", "even",
  "often", "rarely", "seldom", "sometimes", "soon", "then", "thus",
  "therefore", "now", "well", "better", "best", "further", "longer", "rather",
  "quite", "indeed", "once", "twice", "almost", "already", "perhaps", "first",
  "later", "again", "too",
  "a", "an", "the", "this", "that", "these", "those",
  // 소유한정사 — "to their needs" 처럼 전치사 to 뒤에 오며 대명사(g) 판단이
  // 성립한다 (round-1 q23 (B) "their" 오탐 실측).
  "my", "your", "its", "our", "their",
  "it", "them", "him", "her", "us", "me", "you", "one", "ones", "some", "any",
  "all", "both", "each", "either", "neither", "none", "other", "others",
  "another", "itself", "themselves", "himself", "herself", "ourselves",
  "myself", "yourself", "yourselves", "oneself", "mine", "yours", "his",
  "hers", "ours", "theirs", "who", "whom", "whose", "which", "what",
  // "be": modal 뒤 단독 be 밑줄도 판단 부재이나, 수동/진행 조합(would be p.p.)
  // 논쟁을 피해 보수적으로 미발화한다(오탐 0 지향).
  "be",
]);

// (b') 의문사 + to-V 고정 프레임.
const WH_TO_INFINITIVE_PRECEDERS = new Set([
  "when", "where", "how", "what", "whether", "whom", "which",
]);

// (c) NP 내부 판단 토큰 신호 — 수량/비교(m)·한정 판단이 성립할 수 있는 형용사
// 자리. 이런 토큰이 끼면 통짜 NP 라도 판단이 있을 수 있어 미발화.
const NP_INTERNAL_JUDGMENT_ADJ = new Set([
  "many", "much", "few", "little", "more", "most", "less", "least", "fewer",
  "fewest", "several", "enough", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "half", "double", "such",
]);

// (d) 문두 등위접속사 — 종속접속사(although/while/because 등)는 전치사 대비
// l 판단이 성립할 수 있어 목록에서 제외한다.
const SENTENCE_INITIAL_COORDINATORS = new Set(["but", "and", "or", "so", "yet", "nor"]);

/** 토큰이 -ing/-ed/불규칙 과거분사 등 "형태 판단이 성립하는" 모양인가. */
function looksLikeParticipleForm(token: string): boolean {
  if (/(?:ing|ed)$/.test(token)) return true;
  ZERO_OR_IRREGULAR_PARTICIPLE.lastIndex = 0;
  return ZERO_OR_IRREGULAR_PARTICIPLE.test(token);
}

/** surroundingText 에서 expression 직전 토큰(공백만 사이)을 반환 — 없으면 "". */
function precedingToken(surrounding: string, expressionRaw: string): string {
  if (!surrounding || !expressionRaw) return "";
  const idx = findBoundarySafeIndex(surrounding, expressionRaw);
  if (idx <= 0) return "";
  const match = /([A-Za-z][A-Za-z'-]*)\s+$/.exec(surrounding.slice(0, idx));
  return match ? match[1].toLowerCase() : "";
}

/**
 * 미끼(비정답) 밑줄 스팬이 장식 필러(판단 부재)면 사유 문자열을, 아니면 null 을
 * 반환한다. 순수 함수 — expression / surroundingText 만 사용(미끼 표면 = expression).
 */
export function findGrammarDecoyFillerSpan(
  expression: unknown,
  surroundingText: unknown,
): string | null {
  const surfaceRaw = normalizeText(expression);
  if (!surfaceRaw) return null;
  const surrounding = normalizeText(surroundingText);
  const tokens = tokenizeWords(surfaceRaw);

  if (tokens.length === 1) {
    const token = tokens[0];

    // (a) 단독 전치사.
    if (FILLER_STANDALONE_PREPOSITIONS.has(token)) {
      return `a standalone preposition ("${surfaceRaw}") offers no grammatical form for students to judge.`;
    }

    // (d) 문두 등위접속사 — 모든 출현이 문두(대문자 + 문장 경계)일 때만 발화.
    if (SENTENCE_INITIAL_COORDINATORS.has(token) && surrounding) {
      const occurrenceRe = new RegExp(
        `(?<![A-Za-z'-])${escapeRegExpLiteral(token)}(?![A-Za-z'-])`,
        "ig",
      );
      let all = 0;
      let sentenceInitial = 0;
      let match: RegExpExecArray | null;
      while ((match = occurrenceRe.exec(surrounding))) {
        all += 1;
        const before = surrounding.slice(0, match.index);
        const capitalized = /^[A-Z]/.test(surrounding.slice(match.index));
        if (capitalized && (/^\s*$/.test(before) || /[.!?]["')\]]*\s*$/.test(before))) {
          sentenceInitial += 1;
        }
        if (match[0].length === 0) occurrenceRe.lastIndex += 1;
      }
      if (all > 0 && all === sentenceInitial) {
        return `a sentence-initial coordinating conjunction ("${surfaceRaw}") carries no grammar judgment at all.`;
      }
    }

    // (b) 조동사·to 직후 동사원형 1토큰 — 그 자리는 원형만 가능(판단 부재).
    if (
      !BARE_FORM_TOKEN_STOPLIST.has(token) &&
      !/ly$/.test(token) &&
      !/ing$/.test(token) &&
      /^[a-z][a-z'-]*$/.test(token)
    ) {
      const preceder = precedingToken(surrounding, surfaceRaw);
      if (preceder && BARE_FORM_GOVERNORS.has(preceder)) {
        return `a bare verb ("${surfaceRaw}") directly after "${preceder}" leaves no alternative form to weigh — only the base form is possible there.`;
      }
    }
    return null;
  }

  // (b') 의문사 직후 "to + 원형" 통짜 스팬.
  if (
    tokens.length === 2 &&
    tokens[0] === "to" &&
    /^[a-z][a-z'-]*$/.test(tokens[1]) &&
    !/ing$/.test(tokens[1]) &&
    !/ly$/.test(tokens[1]) &&
    !BARE_FORM_TOKEN_STOPLIST.has(tokens[1])
  ) {
    const preceder = precedingToken(surrounding, surfaceRaw);
    if (preceder && WH_TO_INFINITIVE_PRECEDERS.has(preceder)) {
      return `a fixed "${preceder} + to-infinitive" frame ("${preceder} ${surfaceRaw}") has no alternative form for students to weigh.`;
    }
    return null;
  }

  // (c) 관사+형용사+명사 통짜 명사구 — 내부 판단 토큰 없음.
  if (tokens.length === 3 && /^(?:a|an|the)$/.test(tokens[0])) {
    const [, adj, noun] = tokens;
    const plainAlpha = /^[a-z][a-z-]*$/;
    if (
      plainAlpha.test(adj) &&
      plainAlpha.test(noun) &&
      !looksLikeParticipleForm(adj) &&
      !looksLikeParticipleForm(noun) &&
      !/ly$/.test(adj) &&
      !/ly$/.test(noun) &&
      !/(?:er|est)$/.test(adj) &&
      !NP_INTERNAL_JUDGMENT_ADJ.has(adj) &&
      !NP_INTERNAL_JUDGMENT_ADJ.has(noun)
    ) {
      return `a whole article + adjective + noun chunk ("${surfaceRaw}") contains no grammar-judgment token inside the underline.`;
    }
  }

  return null;
}
