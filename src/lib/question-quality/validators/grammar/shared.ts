// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { type GrammarPointCode } from "@/lib/grammar-point-catalog";
import { REPEATED_PHRASE_STOPWORDS, countWordsForQuality, findMarkers, isSingleEnglishToken, normalizeComparableText, normalizeLabel, normalizeText, toLowerTokens } from "../../core";


// 객관식 어법(GRAMMAR_ERROR) 밑줄 span 길이 한도. 수능 어법 밑줄은 최소 문법
// 단위(보통 1~4단어)다. HARD 초과 = 절/문장 통째 밑줄(예: 프리미엄 실측
// "these digital platforms create a trusting environment" 7단어/53자) → relaxed
// 폴백에서도 차단. SOFT 초과 = 다소 넓음 → strict에서만 차단(relaxed에선 경고).
export const GRAMMAR_UNDERLINE_HARD_MAX_WORDS = 7;


export const GRAMMAR_UNDERLINE_HARD_MAX_CHARS = 48;


export const GRAMMAR_UNDERLINE_SOFT_MAX_WORDS = 5;


export const GRAMMAR_UNDERLINE_SOFT_MAX_CHARS = 34;



export function extractGrammarPointCode(value: unknown): GrammarPointCode | null {
  const code = normalizeText(value).toLowerCase().replace(/[^a-m]/g, "");
  return /^[a-m]$/.test(code) ? (code as GrammarPointCode) : null;
}



// 무접미 불규칙 과거분사(형태 변화 없음/특수형) — -ing/-ed/-en 정규식으로는
// 못 잡는 분사들. pointCode (c) 진실성 판정 보강용.
export const ZERO_OR_IRREGULAR_PARTICIPLE =
  /\b(?:cut|put|set|hit|let|shut|spread|cost|read|bet|burst|cast|hurt|quit|split|thrust|made|held|left|found|told|kept|brought|thought|caught|taught|sought|spent|sent|lost|won|met|led|paid|laid|said|built|bound|done|gone|seen|known|grown|thrown|blown|flown|shown|drawn|worn|torn|born|sworn|driven|risen|fallen|chosen|frozen|broken|spoken|stolen|woken|written|hidden|bitten|beaten|forgotten|gotten|begun|sung|swum|run|come|become)\b/i;



// 품사 변경 변형 검출: 형용사/동사 → 명사('likely'→'likelihood', 'important'→
// 'importance')는 "어간 유지·형태만 변형" 위반(실측: 프리미엄). 명사화 접미사로
// 한쪽만 갈리고 어간을 공유하는 쌍을 잡는다. 형/부(adj↔adv)는 정상 f 변형이라
// 둘 다 명사 접미사가 아니므로 걸리지 않는다.
export const NOUN_FORMING_SUFFIX = /(?:hood|ness|ity|ment|tion|sion|ance|ence|ship|dom|cy)$/;


export function isGrammarPosChangeMutation(expression: string, errorExpression: string): boolean {
  const a = normalizeText(expression).toLowerCase();
  const b = normalizeText(errorExpression).toLowerCase();
  if (!a || !b || a === b) return false;
  // 단일 토큰 쌍만 — 구/절은 다른 게이트가 처리
  if (/\s/.test(a) || /\s/.test(b)) return false;
  const aNoun = NOUN_FORMING_SUFFIX.test(a);
  const bNoun = NOUN_FORMING_SUFFIX.test(b);
  if (aNoun === bNoun) return false;
  // 어간 공유(앞 4글자 일치)일 때만 — 무관한 단어 오탐 방지
  return a.slice(0, 4) === b.slice(0, 4);
}



/**
 * pointCode 진실성(휴리스틱): 그 코드가 가리키는 문법은 밑줄 표면에 해당 토큰이
 * 실제로 있어야 한다. 토큰셋이 닫혀 판정이 안전한 코드(b 관계사, c 분사, k
 * to-v/v-ing, l 전치사·접속사)만 검사하고, 모호한 코드는 검사하지 않아 오탐을
 * 피한다. true = 라벨이 표면 토큰과 불일치(가짜 디코이 라벨 의심).
 */
export function grammarPointCodeSurfaceMismatch(
  code: GrammarPointCode,
  surface: string,
): boolean {
  const text = normalizeText(surface);
  if (!text) return false;
  switch (code) {
    case "b": // 관계사 — 관계사/명사절 유도어가 표면에 있어야 함
      return !/\b(?:that|what|which|who|whom|whose|where|when|why|how|whether|whereby)\b/i.test(text);
    case "c": // 분사 능/수동 — -ing/-ed/-en 또는 무접미 불규칙 분사
      return (
        !/\b[A-Za-z]+(?:ing|ed|en)\b/i.test(text) &&
        !ZERO_OR_IRREGULAR_PARTICIPLE.test(text)
      );
    case "g": // 대명사 — 닫힌 대명사 토큰셋
      return !/\b(?:it|its|they|them|their|theirs|themselves|itself|that|those|this|these|one|ones|he|him|his|she|her|hers|herself|himself|we|us|our|ours|you|your|yours)\b/i.test(text);
    case "k": // to-v vs v-ing — 'to + 단어' 또는 동명사(-ing)
      return !/\bto\s+[A-Za-z]/i.test(text) && !/\b[A-Za-z]+ing\b/i.test(text);
    case "l": // 전치사 vs 접속사 — 닫힌 혼동쌍 어휘
      return !/\b(?:in|on|at|by|of|to|for|from|with|without|during|while|despite|although|though|because|since|as|if|unless|before|after|until|when|whereas|whilst)\b/i.test(text) &&
        !/\b(?:in spite of|due to|owing to|thanks to|because of|on account of)\b/i.test(text);
    case "m": // 비교·수량/정도 — 비교 표지 또는 기출(m) 수량·정도 한정사(much/many/few/little/very/almost 등)
      return !/\b(?:more|less|most|least|as|than)\b/i.test(text) &&
        !/\b[A-Za-z]+(?:er|est)\b/i.test(text) &&
        !/\b(?:much|many|few|little|fewer|enough|very|almost|so|too|quite)\b/i.test(text);
    default:
      return false;
  }
}



export function hasKillerGrammarStructure(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  // KILLER_STRUCTURE_PATTERNS 단일 소스 — killerStructureSpansTarget(스팬 검사)와
  // 동일 패턴을 공유해 드리프트를 막는다. /g 플래그 상태는 매번 리셋.
  return KILLER_STRUCTURE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(normalized);
  });
}



export function isSimpleAgreementFlip(
  expression: string,
  errorExpression: string,
  correction: string,
): boolean {
  const forms = [expression, errorExpression, correction]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);
  if (forms.length < 2) return false;
  if (!forms.every(isSingleEnglishToken)) return false;
  const stems = forms.map(stripAgreementSuffix);
  return new Set(stems).size === 1 || /^(?:is|are|was|were|has|have|do|does)$/.test(forms.join(" "));
}



export function stripAgreementSuffix(value: string): string {
  const lower = value.toLowerCase();
  if (/ies$/.test(lower) && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (/(?:ches|shes|sses|xes|zes|oes)$/.test(lower) && lower.length > 4) {
    return lower.slice(0, -2);
  }
  if (/s$/.test(lower) && lower.length > 3) return lower.slice(0, -1);
  return lower;
}



// ============================================================================
// 수량(quantifier) 어법 게이트 — m 코드. 적대검증(2026-06-23) 결과, 시제와 달리
// 가산성·통사 강제 자리(many/much·a few/a little·much/very 비교급·이중비교급)는
// 시비 0으로 출제 가능하나, 다음은 복수정답 시비를 낳아 정답으로 쓰면 안 된다:
//  ① 의미만 다른 토글(little↔a little, few↔a few, much↔little, some↔any) — 둘 다 정문
//  ② 규범 vs 실사용 논쟁(less/fewer, amount/number)
//  ③ 가산/불가산 양용 명사(experience/time/room…) 앞 — 가산성 강제가 깨짐
//  ④ much↔very·이중비교급이 '진짜 비교급(-er) 수식'이 아닌 자리(very surprised 등)
// isTenseOnlyMutation 과 동일하게 닫힌 리스트로만 매칭해 오탐을 막는다.
// ============================================================================

/**
 * 둘 다 정문이고 의미만 다른 토글 — 어법 오류가 아니라 복수정답. 정답 금지.
 * 정렬키(unordered, 소문자). 필살기 적대검증(2026-06-23)으로 한정사 동의어/극성
 * 토글을 대거 보강 — all/some·each/every·several/few·both/all·neither/either 등.
 */
export const QUANTITY_MEANING_TOGGLE_PAIRS = new Set<string>([
  "a little|little", // 조금 있음 vs 거의 없음 (극성)
  "a few|few",       // 몇몇 있음 vs 거의 없음 (극성)
  "little|much",     // 거의 없음 vs 많음 (양 반대)
  "few|many",        // 거의 없음 vs 많음 (양 반대)
  "few|much",
  "little|many",
  "any|some",        // 화용 극성 — 권유 some·긍정 any 예외가 많아 정답 금지
  // ── 한정사 동의어/극성 토글(둘 다 정문, 의미·뉘앙스만 다름) ──
  "all|some",        // 전체 vs 일부
  "all|both",        // 전체 vs 둘 다(범위)
  "each|every",      // 개별 강조 vs 전체 — 대부분 호환(시비)
  "few|several",     // 거의 없음 vs 여럿(뉘앙스)
  "less|little",     // 비교급 vs 양 한정사(than 없으면 둘 다 정문)
  "many|numerous",   // 동의어
  "a few|some",      // 둘 다 '약간 있음'
  "much|plenty of",  // 동의어(충분/양)
  "a lot of|lots of",// 문체 변이
  "a lot of|plenty of",
  "almost all of the|most of the", // 동의어
  "either|neither",  // 반대 의미, 둘 다 정문
  "no|not any",      // 동의 부정
  "hardly any|very few", // 동의(거의 없음)
]);



/** 규범 vs 실사용 논쟁쌍 — 정답 시 채점 시비. 정답 금지. */
export const QUANTITY_DEBATABLE_PAIRS = new Set<string>([
  "fewer|less",
  "amount|number",
]);



/**
 * 가산/불가산이 **같은 표면형**으로 공존해 many/much 둘 다 정문이 되는 명사만.
 * 필살기 검증(2026-06-23): 네모는 표면형이 고정돼, 복수형(experiences) 앞 much나
 * 단수 앞 many 는 어차피 비문(clean) — 막으면 가장 흔한 안전 패턴(many+복수 가산)을
 * 죽이는 과잉차단이다. 따라서 단수/복수 표면이 동일하거나(zero-plural) 같은 표면에
 * 질량·가산 두 독해가 모두 성립하는 명사만 남긴다(fish/species/fruit/data 등).
 */
export const QUANTITY_AMBIGUOUS_COUNT_NOUNS = new Set<string>([
  "fish", "sheep", "deer", "species", "series", "aircraft", "spacecraft",
  "offspring", "means", "fruit", "data", "media", "salmon", "trout", "cod",
  "shrimp", "squid", "bison", "moose", "swine", "headquarters", "crossroads",
]);



/** very 가 오히려 정문인 자리(형용사화 과거분사·-or형 어휘비교급) — much↔very 정답 금지. */
export const QUANTITY_VERY_LICENSED_WORDS = new Set<string>([
  "surprised", "interested", "pleased", "advanced", "limited", "excited", "tired",
  "amused", "amazed", "worried", "disappointed", "frightened", "satisfied",
  "embarrassed", "confused", "bored", "scared", "annoyed", "relaxed", "concerned",
  "delighted", "exhausted", "experienced", "educated", "detailed", "involved",
  "senior", "junior", "superior", "inferior", "prior", "major", "minor",
]);



/** 진짜 비교급 부사 — much 만 정문이고 very 비문(안전 자리). */
export const QUANTITY_COMPARATIVE_ADVERBS = new Set<string>([
  "later", "sooner", "earlier", "longer", "higher", "lower", "faster", "slower",
  "harder", "closer", "further", "farther", "more", "less", "better", "worse",
]);



export function quantityPairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}



export function isQuantityMeaningToggle(correct: string, wrong: string): boolean {
  return QUANTITY_MEANING_TOGGLE_PAIRS.has(
    quantityPairKey(normalizeComparableText(correct), normalizeComparableText(wrong)),
  );
}



export function isQuantityDebatablePair(correct: string, wrong: string): boolean {
  return QUANTITY_DEBATABLE_PAIRS.has(
    quantityPairKey(normalizeComparableText(correct), normalizeComparableText(wrong)),
  );
}



/** context(원문 문장)에서 word 바로 뒤 토큰을 소문자로 — 없으면 "". */
export function quantityTokenAfter(context: string, word: string): string {
  if (!context || !word) return "";
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\b${escaped}\\s+([A-Za-z][A-Za-z'-]*)`, "i").exec(context);
  return m ? m[1].toLowerCase() : "";
}



/**
 * many↔much · a few↔a little · few↔little 가산성 강제가 깨지는 자리를 막는다.
 *  - 직후 명사가 양용(experience/time…)이면 가산성 미고정 → 차단.
 *  - few↔little 의 'few/little of …'(부분 독해 little of them 이 정문) → 차단.
 */
export function quantityCountabilityUnsafe(correct: string, wrong: string, context: string): boolean {
  const key = quantityPairKey(normalizeComparableText(correct), normalizeComparableText(wrong));
  if (key === "few|little") {
    // few↔little 은 가산성 강제이나 'few/little of …'는 부분(partitive) 독해로
    // 'little of them' 이 정문이 되어 시비 → 차단. 직접수식만 안전.
    if (/\b(?:few|little)\s+of\b/i.test(context)) return true;
    const head = quantityTokenAfter(context, "few") || quantityTokenAfter(context, "little");
    if (!head) return true;
    return QUANTITY_AMBIGUOUS_COUNT_NOUNS.has(head);
  }
  if (key !== "many|much" && key !== "a few|a little") return false;
  const head = quantityTokenAfter(context, correct) || quantityTokenAfter(context, wrong);
  // 직후 명사를 못 찾으면 보수적으로 막는다(파싱 실패 시 시비 회피).
  if (!head) return true;
  return QUANTITY_AMBIGUOUS_COUNT_NOUNS.has(head);
}



/** much↔very · 이중비교급(much↔more)은 '진짜 비교급(-er) 수식' 자리에서만 안전. */
export function quantityComparativeUnsafe(correct: string, wrong: string, context: string): boolean {
  const key = quantityPairKey(normalizeComparableText(correct), normalizeComparableText(wrong));
  if (key !== "much|very" && key !== "more|much") return false;
  const next =
    quantityTokenAfter(context, "much") ||
    quantityTokenAfter(context, key === "much|very" ? "very" : "more");
  if (!next) return true; // 수식 대상 못 찾으면 보수적 차단
  // very 가 정문인 자리(형용사화 과거분사·-or형) → 막는다.
  if (key === "much|very" && QUANTITY_VERY_LICENSED_WORDS.has(next)) return true;
  // 최상급(-est, very best/latest) → 막는다.
  if (/[a-z]est$/.test(next)) return true;
  // 안전 = 직후가 진짜 비교급(-er 굴절 또는 비교급 부사). 아니면 막는다.
  const isComparative =
    (/[a-z]er$/.test(next) && !QUANTITY_AMBIGUOUS_COUNT_NOUNS.has(next)) ||
    QUANTITY_COMPARATIVE_ADVERBS.has(next);
  return !isComparative;
}



/**
 * 수량 정답(correct↔wrong)의 시비성 검사 — 시비형이면 차단 이슈 배열 반환.
 * GRAMMAR_ERROR(밑줄)·GRAMMAR_CHOICE_COMBO(네모) 양쪽 검증기에서 공유 호출.
 */
export function collectQuantityAnswerIssues(
  correct: string,
  wrong: string,
  context: string,
): Array<{ code: string; message: string }> {
  const issues: Array<{ code: string; message: string }> = [];
  const a = normalizeText(correct);
  const b = normalizeText(wrong);
  if (!a || !b) return issues;
  if (isQuantityMeaningToggle(a, b)) {
    issues.push({
      code: "grammar-quantity-meaning-toggle",
      message: `Quantity pair "${a}" ↔ "${b}" is a meaning toggle (both grammatical, only the meaning differs), not a grammar error — using it as the answer creates a disputed multiple-answer item.`,
    });
  }
  if (isQuantityDebatablePair(a, b)) {
    issues.push({
      code: "grammar-quantity-debatable",
      message: `Quantity pair "${a}" ↔ "${b}" (less/fewer · amount/number) is a prescriptive-vs-actual usage dispute; do not use it as the grammar answer.`,
    });
  }
  if (quantityCountabilityUnsafe(a, b, context)) {
    issues.push({
      code: "grammar-quantity-ambiguous-noun",
      message: `Quantity error "${a}" ↔ "${b}" modifies a count/mass dual noun whose countability is not fixed; the "wrong" form may be grammatical under another reading.`,
    });
  }
  if (quantityComparativeUnsafe(a, b, context)) {
    issues.push({
      code: "grammar-quantity-debatable",
      message: `Quantity error "${a}" ↔ "${b}" is only safe directly before a true comparative (-er / later); here the "wrong" form (very + participle/superlative, or more + base) can be the grammatical one.`,
    });
  }
  return issues;
}



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

/**
 * 지문에서 expression 이 속한 문장(마침표 경계 기준)과 문장 내 표현 위치를
 * 추출한다 — thin-killer 판정 시 모델이 surroundingText 를 짧게 준 경우에도
 * 실제 문장 구조로 판단하기 위한 보강 문맥.
 *
 * 위치 확정은 보수적으로: surroundingText 윈도(원형/오류형 치환 재시도 포함)로
 * 좁혀질 때만 문장을 반환한다. 윈도를 못 찾으면 빈 결과 — 위치 단서가 무효인
 * 입력은 정확히 이 게이트가 감시하는 퇴화 케이스라, 첫 출현 추측으로 엉뚱한
 * 문장을 구제하는 것보다 구제하지 않는 편이 안전하다(적대검수 2026-07-04).
 */
export function extractContainingSentence(
  passage: string,
  expression: string,
  surroundingText?: string,
  errorExpression?: string,
): { sentence: string; targetStart: number; targetEnd: number } | null {
  const text = normalizeText(passage);
  const target = normalizeText(expression);
  if (!text || !target) return null;
  const surrounding = normalizeText(surroundingText ?? "");
  if (!surrounding) return null;

  // 윈도 위치 탐색 — 원문에 없는 오류형이 surroundingText 에 인용된 실측 케이스를
  // 위해, 오류형→원형 치환본으로도 재시도한다.
  const surroundingCandidates = [surrounding];
  const mutated = normalizeText(errorExpression ?? "");
  if (mutated && mutated.toLowerCase() !== target.toLowerCase()) {
    const swapped = surrounding.replace(
      new RegExp(`(?<![A-Za-z'-])${escapeRegExpLiteral(mutated)}(?![A-Za-z'-])`, "i"),
      target,
    );
    if (swapped !== surrounding) surroundingCandidates.push(swapped);
  }

  let index = -1;
  for (const candidate of surroundingCandidates) {
    const windowStart = text.toLowerCase().indexOf(candidate.toLowerCase());
    if (windowStart < 0) continue;
    const inWindow = findBoundarySafeIndex(
      text.slice(windowStart, windowStart + candidate.length),
      target,
    );
    if (inWindow >= 0) {
      index = windowStart + inWindow;
      break;
    }
  }
  if (index < 0) return null;

  const boundary = /[.!?]/;
  let start = index;
  while (start > 0 && !boundary.test(text[start - 1])) start -= 1;
  let end = index + target.length;
  while (end < text.length && !boundary.test(text[end])) end += 1;
  return {
    sentence: text.slice(start, Math.min(end + 1, text.length)).trim(),
    targetStart: index - start,
    targetEnd: index - start + target.length,
  };
}

// hasKillerGrammarStructure 와 동일 패턴 셋 — 스팬 검사용으로 개별 노출.
const KILLER_STRUCTURE_PATTERNS: RegExp[] = [
  /\b(?:what|which|whose|whom|where|when)\b[\s\S]{0,120}\b(?:is|are|was|were|has|have|do|does|can|could|should|would|may|might)\b/gi,
  /\b(?:with|without)\s+(?:the\s+)?[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){1,6}\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|made|seen|found)\b/gi,
  /\b(?:when|while|if|unless|once|although)\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|asked|seen)\b/gi,
  /\b(?:not only|both|either|neither|from|between)\b[\s\S]{10,140}\b(?:but|and|or|nor|to)\b/gi,
  /\b(?:the number of|a number of|one of|each of|neither of|either of|most of|the rest of)\b[\s\S]{10,120}\b(?:is|are|was|were|has|have|requires?|depends?|seems?)\b/gi,
  /\b(?:make|makes|made|find|finds|found|think|thinks|thought|consider|considers|considered)\s+it\s+(?:possible|impossible|easy|easier|hard|harder|difficult|necessary|important|clear|natural|useful|safe|risky|obvious|worthwhile|likely|unlikely|essential|reasonable)\s+(?:for\s+[A-Za-z][^.;!?]{0,50}\s+)?(?:to\s+[A-Za-z][A-Za-z'-]*|that\b)/gi,
  /\b(?:never|rarely|seldom|little|hardly|scarcely|only\s+(?:then|after|when|by|in|with)|not only|no sooner|under no circumstances|at no time|in no way)\b[\s\S]{0,140}\b(?:am|is|are|was|were|do|does|did|have|has|had|can|could|should|would|will|may|might|must)\s+[A-Za-z][A-Za-z'-]*/gi,
  /\b(?:of|with|including|along with|as well as|who|which|that)\b[\s\S]{25,140}\b(?:is|are|was|were|has|have|requires?|depends?|seems?|make|makes)\b/gi,
];

/**
 * 문장 안 킬러 구조 매치가 밑줄 구간을 실제로 관통하는지 검사한다 — 문장 어딘가에
 * 무관한 장거리 패턴이 있다는 이유만으로 로컬 플립을 구제하지 않기 위함
 * (적대검수 2026-07-04: 긴 학술 문장은 패턴 8에 거의 다 걸린다).
 */
export function killerStructureSpansTarget(
  sentence: string,
  targetStart: number,
  targetEnd: number,
): boolean {
  for (const pattern of KILLER_STRUCTURE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sentence))) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;
      if (matchStart <= targetEnd && matchEnd >= targetStart) return true;
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  return false;
}

export function isThinKillerGrammarErrorTarget(
  markedExpression: Record<string, unknown>,
  passage?: string,
): boolean {
  const expression = normalizeText(markedExpression.expression);
  const errorExpression = normalizeText(markedExpression.errorExpression);
  const correction = normalizeText(markedExpression.correction);
  const surroundingText = normalizeText(markedExpression.surroundingText);
  const pointCode = extractGrammarPointCode(markedExpression.pointCode);
  // 1차: 기존 로컬 윈도 판단(무회귀) — 모델이 준 문맥 자체에 장거리 구조가 있으면 구제.
  const combined = `${expression} ${errorExpression} ${correction} ${surroundingText}`;
  if (hasKillerGrammarStructure(combined)) return false;
  // 2차(보강, 적대검수 2026-07-04 재설계): 모델이 surroundingText 를 짧게 잘라 준
  // 경우의 과잉거부 완화. 위치가 확정될 때만 지문의 포함 문장을 쓰며,
  //  - 수일치(d)는 전용 검사 hasLongDistanceAgreementBeforeTarget — 동사 앞 **같은
  //    절 안**에 수식어 개입(관계사/of·with구/삽입 관형절 닫힘)이 실재할 때만 구제.
  //    범용 킬러 패턴은 절 경계를 넘어 무관 구조에 매칭되므로 d 에는 쓰지 않는다.
  //  - 그 외 코드는 킬러 구조 매치가 밑줄 구간을 관통할 때만 구제.
  const located = passage
    ? extractContainingSentence(
        passage,
        expression || errorExpression,
        surroundingText,
        errorExpression,
      )
    : null;
  if (pointCode === "d") {
    const target = expression || errorExpression;
    const surroundingIdx = findBoundarySafeIndex(surroundingText, target);
    if (
      surroundingIdx >= 0 &&
      hasLongDistanceAgreementBeforeTarget(surroundingText, surroundingIdx)
    ) {
      return false;
    }
    if (located && hasLongDistanceAgreementBeforeTarget(located.sentence, located.targetStart)) {
      return false;
    }
    if (isSimpleAgreementFlip(expression, errorExpression, correction)) return true;
  } else if (
    located &&
    killerStructureSpansTarget(located.sentence, located.targetStart, located.targetEnd)
  ) {
    return false;
  }
  return (
    countWordsForQuality(expression) <= 2 &&
    countWordsForQuality(errorExpression || expression) <= 2 &&
    countWordsForQuality(surroundingText) < 10
  );
}

// 수일치(d) 장거리 판정 — 동사 직전 같은 절 안에 수식어 개입이 실재하는가.
// 관계사·of/with 전명구 마커가 절 내(마지막 쉼표 이후)에 있고 절 앞부분이 5단어
// 이상이거나, 동사 바로 앞이 삽입 관형절의 닫는 쉼표(", which ... ,")면 장거리.
// 분사 후치수식(명사 + V-ing/p.p.+전치사, "the words meaning 'red'...")도 실재
// 개입 수식어다 — 미인식 시 교과서적 장거리 수일치를 얕다고 오반려(26-07-06 RCA:
// 반려본이 심사 95점). 조동사/be 는 진행·수동이라 첫 토큰에서 제외.
const AGREEMENT_MODIFIER_MARKER =
  /\b(?:who|which|that|whose|whom)\b|\b(?:of|with|among|between|including)\s+[A-Za-z]|\b(?!(?:is|are|was|were|am|be|been|being|has|have|had)\b)[A-Za-z][A-Za-z'-]*\s+[A-Za-z]{3,}ing\s+\S|\b(?!(?:is|are|was|were|am|be|been|being|has|have|had|get|gets|got)\b)[A-Za-z][A-Za-z'-]*\s+[A-Za-z]{2,}(?:ed|en)\s+(?:by|in|at|on|to|for|with|from|through|during|as)\b/i;
const APPOSITIVE_CLOSING_BEFORE_TARGET =
  /,\s*(?:which|who|whose|whom|[A-Za-z]+ing|[A-Za-z]+ed)\b[^,;:]*,\s*$/i;

export function hasLongDistanceAgreementBeforeTarget(
  text: string,
  targetStart: number,
): boolean {
  const preTarget = text.slice(Math.max(0, targetStart - 160), targetStart);
  if (!preTarget.trim()) return false;
  if (APPOSITIVE_CLOSING_BEFORE_TARGET.test(preTarget)) return true;
  const lastBoundary = Math.max(
    preTarget.lastIndexOf(","),
    preTarget.lastIndexOf(";"),
    preTarget.lastIndexOf(":"),
  );
  const clauseLocal = preTarget.slice(lastBoundary + 1);
  const words = clauseLocal.trim().split(/\s+/).filter(Boolean);
  return words.length >= 5 && AGREEMENT_MODIFIER_MARKER.test(clauseLocal);
}

// ────────────────────────────────────────────────────────────────────────────
// 지각동사 보어 토글 시비 — 실측 2026-07-04(KILLER 출하 사고): 원문 "We see the
// democratizing power of AI to broaden ..."의 to-V(power를 수식)에서 to를 지우자
// "see + O + 원형"이 지각동사 구문으로 재해석되어 정문 = 무정답 문항이 나갔다.
// 지각동사(see/watch/hear/feel/notice/observe/overhear, + help)가 같은 절 앞에
// 있고 목적어가 개입한 자리의 to-V↔원형↔V-ing 토글은:
//  - 오류형이 원형/V-ing → 지각동사 보어 파스로 항상 정문 → 차단.
//  - 오류형이 to-V → help 뒤(help+O+to-V도 정문)이거나 목적어에 to부정사 보문
//    명사(power/ability/potential 등)가 있으면 정문 파스 존재 → 차단.
//    (둘 다 아니면 *saw him to cross 형의 정상 출제라 통과.)
// 절 경계는 문장부호·종속접속사·관계사만 인정하고 쉼표·등위접속사는 경계로 안
// 본다 — 복수정답 시비는 잘못 출하가 미생성보다 나쁘므로 차단 쪽으로 기운다.

const PERCEPTION_MATRIX_VERB =
  /\b(?:sees?|saw|seen|seeing|watch(?:es|ed|ing)?|hear(?:s|d|ing)?|feels?|felt|feeling|notices?|noticed|noticing|observes?|observed|observing|overhears?|overheard|helps?|helped|helping)\b/gi;

const PERCEPTION_CLAUSE_BOUNDARY =
  /[.;:!?]|\b(?:that|which|who|whom|whose|because|although|though|since|while|when|if|whether|unless|until)\b/gi;

// to부정사 보문을 취하는 명사 — 지각동사 목적어 안에 있으면 to-V조차
// "명사 + to-V" 파스로 정문이 된다(power/ability to broaden 등).
const TO_INFINITIVE_LICENSING_NOUN =
  /\b(?:power|powers|ability|abilities|potential|capacity|capacities|opportunity|opportunities|chance|chances|right|rights|way|ways|tendency|tendencies|desire|desires|need|needs|decision|decisions|attempt|attempts|effort|efforts|willingness|freedom|plan|plans|wish|wishes|intention|intentions|urge|drive|motivation|permission|authority|obligation|duty|failure|refusal|reluctance|eagerness|readiness|determination|commitment|capability|capabilities|incentive|incentives|means|courage|struggle|struggles)\b/i;

function ingVariantsOfBase(base: string): Set<string> {
  const variants = new Set<string>([`${base}ing`]);
  if (/e$/.test(base) && !/(?:ee|ye|oe)$/.test(base)) variants.add(`${base.slice(0, -1)}ing`);
  if (/[^aeiou][aeiou][^aeiouhwxy]$/.test(base)) variants.add(`${base}${base[base.length - 1]}ing`);
  return variants;
}

/**
 * expression↔errorExpression이 같은 어간의 to-V/원형/V-ing 토글인지 분류한다.
 * 선행 to만 인정(밑줄 최소 단위 계약상 to는 항상 표현 머리에 온다).
 * 토글이 아니면 null, 토글이면 오류형(errorExpression) 쪽의 형태를 반환.
 */
function classifyVerbFormToggle(
  sourceExpression: string,
  mutatedExpression: string,
): { base: string; mutatedKind: "to" | "bare" | "ing" } | null {
  const parse = (value: string) => {
    const tokens = normalizeText(value)
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/^[^a-z']+|[^a-z']+$/g, ""))
      .filter(Boolean);
    const hasTo = tokens[0] === "to" && tokens.length >= 2;
    return { hasTo, rest: hasTo ? tokens.slice(1) : tokens };
  };
  const a = parse(sourceExpression);
  const b = parse(mutatedExpression);
  if (a.rest.length === 0 || b.rest.length === 0) return null;
  if (a.rest.length !== b.rest.length) return null;
  for (let i = 1; i < a.rest.length; i += 1) {
    if (a.rest[i] !== b.rest[i]) return null;
  }
  const verbA = a.rest[0];
  const verbB = b.rest[0];
  if (!/^[a-z][a-z'-]*$/.test(verbA) || !/^[a-z][a-z'-]*$/.test(verbB)) return null;
  let base: string;
  let kindA: "bare" | "ing";
  let kindB: "bare" | "ing";
  if (verbA === verbB) {
    base = verbA;
    kindA = kindB = /ing$/.test(verbA) ? "ing" : "bare";
  } else if (ingVariantsOfBase(verbA).has(verbB)) {
    base = verbA;
    kindA = "bare";
    kindB = "ing";
  } else if (ingVariantsOfBase(verbB).has(verbA)) {
    base = verbB;
    kindA = "ing";
    kindB = "bare";
  } else {
    return null;
  }
  const formA = a.hasTo ? "to" : kindA;
  const formB = b.hasTo ? "to" : kindB;
  if (formA === formB) return null;
  return { base, mutatedKind: formB };
}

/**
 * isError 마커의 변형이 지각동사 보어 토글 시비에 해당하면 사유 문자열을,
 * 아니면 null을 반환한다. surroundingText와 (가능하면) 지문 포함 문장 양쪽에서
 * 문맥을 확인한다.
 */
export function findGrammarPerceptionComplementToggle(
  expression: string,
  errorExpression: string,
  surroundingText: string,
  passage?: string,
): string | null {
  const source = normalizeText(expression);
  const mutated = normalizeText(errorExpression);
  if (!source || !mutated) return null;
  const toggle = classifyVerbFormToggle(source, mutated);
  if (!toggle) return null;

  const contexts: Array<{ text: string; targetStart: number }> = [];
  const surrounding = normalizeText(surroundingText);
  if (surrounding) {
    let idx = findBoundarySafeIndex(surrounding, source);
    if (idx < 0) idx = findBoundarySafeIndex(surrounding, mutated);
    if (idx >= 0) contexts.push({ text: surrounding, targetStart: idx });
  }
  if (passage) {
    const located = extractContainingSentence(passage, source, surroundingText, mutated);
    if (located) contexts.push({ text: located.sentence, targetStart: located.targetStart });
  }

  for (const context of contexts) {
    const preTarget = context.text.slice(
      Math.max(0, context.targetStart - 140),
      context.targetStart,
    );
    // 마지막 절 경계 이후(같은 절 안)만 본다.
    PERCEPTION_CLAUSE_BOUNDARY.lastIndex = 0;
    let clauseStart = 0;
    let boundaryMatch: RegExpExecArray | null;
    while ((boundaryMatch = PERCEPTION_CLAUSE_BOUNDARY.exec(preTarget))) {
      clauseStart = boundaryMatch.index + boundaryMatch[0].length;
    }
    const clauseLocal = preTarget.slice(clauseStart);
    PERCEPTION_MATRIX_VERB.lastIndex = 0;
    let verbMatch: RegExpExecArray | null = null;
    let candidate: RegExpExecArray | null;
    while ((candidate = PERCEPTION_MATRIX_VERB.exec(clauseLocal))) {
      verbMatch = candidate;
    }
    if (!verbMatch) continue;
    // 지각동사와 밑줄 사이에 목적어가 실재해야 보어 파스가 성립한다
    // (passive "was seen to leave"처럼 목적어 없는 자리는 정상 출제 가능).
    const objectSegment = clauseLocal.slice(verbMatch.index + verbMatch[0].length);
    const objectWords = objectSegment.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    if (objectWords.length === 0) continue;
    const isHelpMatrix = /^help/i.test(verbMatch[0]);
    if (
      toggle.mutatedKind === "to" &&
      !isHelpMatrix &&
      !TO_INFINITIVE_LICENSING_NOUN.test(objectSegment)
    ) {
      continue;
    }
    const parseNote =
      toggle.mutatedKind === "to"
        ? "the object licenses a noun+to-infinitive reading, so the mutated to-form is still grammatical"
        : `the mutated ${toggle.mutatedKind === "ing" ? "V-ing" : "bare"} form re-parses as a valid perception-verb complement, so it is still grammatical`;
    return `The error mutation "${source}" → "${mutated}" sits after the perception/help verb "${verbMatch[0]}" with an object in between — ${parseNote}; the item has no single wrong answer.`;
  }
  return null;
}



// ════════════════════════════════════════════════════════════════════════════
// KILLER 과훈련(over-drilled) 정답 craft 게이트 — findGrammarKillerOverdrilledAnswer
// ════════════════════════════════════════════════════════════════════════════
// 실측(26-07-06 소넷5 검수 패널 30문항 + 코퍼스 250행/KILLER 58): KILLER 어법의
// 최대 결함축 = "정답 포인트가 과훈련된 전형 패턴"(MAJOR 11건). 문항 자체는
// 유효(정답 유일)하나 KILLER 계약(최상위 변별)을 어긴다 — F급이 아니라 craft 급.
// 실측 버킷 네 종:
//   (a) one/each/either/neither of + 복수명사 주어의 동사 수 뒤집기
//       ("One of ... contributions were")
//   (b) 형용사↔부사(-ly) 맞교환 (표면쌍이 정확히 X↔X+ly)
//       ("importantly↔important", "individually↔individual", "frequent↔frequently")
//   (c) that↔what 맞교환 (동일 표면이 코퍼스 26회 반복)
//   (d) 주어핵 인접(장거리 수식어 부재)의 얕은 수일치 뒤집기 (does↔do, was↔were)
//       ("objects being measured really does exist")
// 반드시 requestedDifficulty === "KILLER" 에서만 발화 — INTERMEDIATE/BASIC 에선
// 정당한 포인트이므로 절대 미발화(자기게이트: 아래 함수가 KILLER 아니면 즉시 null).

/** be/have/do 계사·조동사 수 일치 단독 플립 쌍(순서 무관 정렬키). */
const NUMBER_AGREEMENT_FLIP_PAIRS = new Set<string>([
  "are|is", "was|were", "has|have", "do|does", "am|are", "am|is",
  "aren't|isn't", "wasn't|weren't", "doesn't|don't", "hasn't|haven't",
]);

/** 계사·조동사 수 일치 폼(장거리·얕은 수일치 게이트에서 verb 임을 보장). */
const COPULAR_AUX_AGREEMENT_FORMS = new Set<string>([
  "am", "is", "are", "was", "were", "has", "have", "do", "does",
]);

/** 같은 동사 어간의 3인칭 단수(-s/-es/-ies) ↔ 원형/복수. */
function isThirdPersonSAgreementFlip(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!/^[a-z][a-z'-]*$/.test(short) || !/^[a-z][a-z'-]*$/.test(long)) return false;
  if (short.length < 2) return false;
  if (long === `${short}s`) return true;                          // run↔runs, require↔requires
  if (long === `${short}es`) return true;                         // pass↔passes, go↔goes
  if (/y$/.test(short) && long === `${short.slice(0, -1)}ies`) return true; // carry↔carries
  return false;
}

/** 수(number) 단독 일치 플립인가 — 계사쌍 또는 같은 어간 3인칭 -s. */
export function isNumberAgreementFlip(a: string, b: string): boolean {
  const x = normalizeText(a).toLowerCase();
  const y = normalizeText(b).toLowerCase();
  if (!x || !y || x === y) return false;
  if (/\s/.test(x) || /\s/.test(y)) return false;
  if (NUMBER_AGREEMENT_FLIP_PAIRS.has([x, y].sort().join("|"))) return true;
  return isThirdPersonSAgreementFlip(x, y);
}

/** 계사·조동사 한정 수 일치 플립(얕은/장거리 수일치 판정용 — 명사복수 오탐 배제). */
function isCopularAgreementFlip(a: string, b: string): boolean {
  const x = normalizeText(a).toLowerCase();
  const y = normalizeText(b).toLowerCase();
  if (!COPULAR_AUX_AGREEMENT_FORMS.has(x) || !COPULAR_AUX_AGREEMENT_FORMS.has(y)) return false;
  return isNumberAgreementFlip(x, y);
}

// 수일치 얕음/깊음 판별 (26-07-06 검수 실측 "objects being measured really does"):
// 타깃 동사에서 뒤로 걸으며 분사(-ing/-ed)·부사·한정사를 건너뛰고 처음 만나는
// 명사 후보의 수가 "정답 동사가 요구하는 주어 수"와 일치하면 그 명사가 곧 주어
// (=학생이 그 명사만 보면 즉답, 얕음). 불일치하면 그 명사는 교란 명사(attractor)
// 이고 진짜 주어는 더 왼쪽(=진짜 KILLER, "arguments presented by the committee
// was"). 명사 수 판정은 크루드(-s 접미)지만, 오판 방향이 "깊음"으로 기울면
// 보수적 미발화라 안전하다.
const INTERVENING_SKIP_TOKENS = new Set([
  "really", "also", "often", "still", "now", "just", "even", "never", "always",
  "sometimes", "usually", "actually", "certainly", "probably", "truly", "indeed",
  "the", "a", "an", "its", "his", "her", "their", "our", "not",
]);
const PLURAL_COPULAR_FORMS = new Set(["do", "are", "were", "have"]);
const SINGULAR_COPULAR_FORMS = new Set(["does", "is", "was", "has"]);
function adjacentSubjectMatchesRequiredNumber(
  contextText: string,
  targetIndex: number,
  correctFormToken: string,
): boolean {
  const correct = correctFormToken.toLowerCase();
  const requiredPlural = PLURAL_COPULAR_FORMS.has(correct);
  if (!requiredPlural && !SINGULAR_COPULAR_FORMS.has(correct)) return false;
  const before = contextText.slice(0, targetIndex).trim();
  if (!before) return false;
  const tokens = before.split(/\s+/).slice(-7);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i].toLowerCase().replace(/[^a-z'-]/g, "");
    if (!token) return false;
    if (
      /(?:ing|ed)$/.test(token) ||
      /ly$/.test(token) ||
      INTERVENING_SKIP_TOKENS.has(token)
    ) {
      continue;
    }
    // 첫 명사 후보 — 크루드 수 판정(-s 복수, 단 -ss 제외).
    const nounLooksPlural = /[^s]s$/.test(token);
    return nounLooksPlural === requiredPlural;
  }
  return false;
}

// -ly 로 끝나지만 형용사인 단어들 — friend→friendly 같은 명사→형용사(정상 오류
// 유형)를 형/부 맞교환으로 오판하지 않도록 제외.
const LY_ADJECTIVES = new Set<string>([
  "friendly", "likely", "lovely", "lonely", "lively", "costly", "deadly", "timely",
  "orderly", "elderly", "weekly", "daily", "early", "ugly", "silly", "holy", "jolly",
  "cowardly", "worldly", "monthly", "yearly", "hourly", "leisurely", "lowly", "only",
  "manly", "womanly", "brotherly", "fatherly", "motherly", "heavenly", "earthly",
  "kindly", "sickly", "deathly", "ghastly", "ghostly", "homely", "measly", "miserly",
  "prickly", "saintly", "scholarly", "seemly", "shapely", "sprightly", "stately",
  "surly", "unruly", "unsightly", "wobbly", "curly", "crumbly", "bubbly", "chilly",
  "hilly", "wily", "oily", "beastly", "burly", "gnarly", "grisly", "portly", "sly",
]);

// (b) 오탐 방어: 감각·상태 연결동사(계사) 보어 자리의 형용사↔부사는 절 구조
// 분석(연결동사 판별)이 필요한 심층 자리라 KILLER 정당 포인트다 — 과훈련 아님.
// be동사(is/are/was/were)는 진행/수동 조동사로도 쓰여(are frequently used) 뒤
// 부사가 동사 수식인 경우가 흔하므로 제외 집합에 넣지 않는다.
const LINKING_VERB_BEFORE_TARGET =
  /\b(?:seem|seems|seemed|seeming|appear|appears|appeared|appearing|become|becomes|became|becoming|remain|remains|remained|remaining|stay|stays|stayed|staying|prove|proves|proved|proven|proving|grow|grows|grew|grown|growing|turn|turns|turned|turning|feel|feels|felt|feeling|look|looks|looked|looking|sound|sounds|sounded|sounding|taste|tastes|tasted|tasting|smell|smells|smelled|smelling|get|gets|got|gotten|getting)\s+$/i;

/** 형용사 어간 → 인정 가능한 -ly 부사형 집합(정확 매칭 전용). */
function adverbFormsOfAdjective(base: string): Set<string> {
  const forms = new Set<string>([`${base}ly`]);              // quick→quickly, important→importantly
  if (/y$/.test(base)) forms.add(`${base.slice(0, -1)}ily`); // easy→easily, happy→happily
  if (/le$/.test(base)) forms.add(`${base.slice(0, -1)}y`);  // simple→simply, possible→possibly
  if (/ic$/.test(base)) forms.add(`${base}ally`);            // basic→basically, dramatic→dramatically
  if (/ll$/.test(base)) forms.add(`${base.slice(0, -1)}y`);  // full→fully, dull→dully
  if (/ue$/.test(base)) forms.add(`${base.slice(0, -1)}y`);  // true→truly, due→duly
  return forms;
}

/** 표면쌍이 정확히 형용사↔부사(-ly) 맞교환인가 — 정확히 하나만 -ly. */
export function isAdjectiveAdverbLySwap(a: string, b: string): boolean {
  const x = normalizeText(a).toLowerCase();
  const y = normalizeText(b).toLowerCase();
  if (!x || !y || x === y) return false;
  if (!/^[a-z][a-z'-]*$/.test(x) || !/^[a-z][a-z'-]*$/.test(y)) return false;
  const xLy = /ly$/.test(x);
  const yLy = /ly$/.test(y);
  if (xLy === yLy) return false; // 둘 다 -ly거나 둘 다 아니면 형/부 쌍 아님
  const base = xLy ? y : x;
  const adverb = xLy ? x : y;
  if (LY_ADJECTIVES.has(adverb)) return false;
  return adverbFormsOfAdjective(base).has(adverb);
}

/** 형/부 타깃 앞이 감각·상태 연결동사(계사) 자리인가(과훈련 제외 신호). */
function isLinkingVerbComplementSite(
  expression: string,
  errorExpression: string,
  surroundingText: string,
): boolean {
  if (!surroundingText) return false;
  for (const target of [expression, errorExpression]) {
    const t = normalizeText(target);
    if (!t) continue;
    const idx = findBoundarySafeIndex(surroundingText, t);
    if (idx < 0) continue;
    if (LINKING_VERB_BEFORE_TARGET.test(surroundingText.slice(0, idx))) return true;
  }
  return false;
}

/**
 * KILLER 어법 정답이 과훈련된 전형 패턴(a~d)에 해당하면 교정 지시형 메시지를,
 * 아니면 null 을 반환한다. requestedDifficulty !== "KILLER" 이면 항상 null(자기게이트).
 * 검출 대상은 isError 마커의 정답쌍(expression=원형/정답, errorExpression=오류형).
 * 메시지는 retry 프롬프트로 들어가므로: 무슨 패턴이라 거절됐는지 + 무엇을 대신
 * 쓸지(구조 신설 아닌 지문 내 다른 심층 자리)까지 지시한다.
 */
export function findGrammarKillerOverdrilledAnswer(
  markedExpression: Record<string, unknown>,
  passage?: string,
  requestedDifficulty?: string,
): string | null {
  if (requestedDifficulty !== "KILLER") return null;
  const expression = normalizeText(markedExpression.expression);
  const errorExpression = normalizeText(markedExpression.errorExpression);
  if (!expression || !errorExpression) return null;
  if (normalizeComparableText(expression) === normalizeComparableText(errorExpression)) {
    return null;
  }
  const surroundingText = normalizeText(markedExpression.surroundingText);
  const deeperMenu =
    "a long-distance subject-verb agreement across a genuine intervening relative/appositive or of/with phrase, a nominal vs relative clause-gap, a participle voice error, or a parallel-structure break";

  // (c) that↔what 맞교환 — 동일 표면이 코퍼스 26회 반복(최고빈도 과훈련).
  const comparablePair = new Set([
    normalizeComparableText(expression),
    normalizeComparableText(errorExpression),
  ]);
  if (comparablePair.size === 2 && comparablePair.has("that") && comparablePair.has("what")) {
    return `KILLER GRAMMAR_ERROR rejected: the answer is an over-drilled "that ↔ what" swap — the single most repeated CSAT grammar point (26 identical surfaces in the corpus). Move the error to a different, deeper site already present in the passage: ${deeperMenu}.`;
  }

  // (b) 형용사↔부사(-ly) 맞교환 — 계사 보어(심층) 제외.
  if (isAdjectiveAdverbLySwap(expression, errorExpression)) {
    if (!isLinkingVerbComplementSite(expression, errorExpression, surroundingText)) {
      return `KILLER GRAMMAR_ERROR rejected: the answer is an over-drilled adjective↔adverb (-ly) swap ("${expression}" ↔ "${errorExpression}") — a BASIC/INTERMEDIATE point every student drills. Move the error to a deeper site already in the passage: ${deeperMenu}.`;
    }
  }

  // (a) one/each/either/neither of + 복수명사 주어의 동사 수 뒤집기.
  if (
    /\b(?:one|each|either|neither)\s+of\b/i.test(surroundingText) &&
    isNumberAgreementFlip(expression, errorExpression)
  ) {
    return `KILLER GRAMMAR_ERROR rejected: the answer is the over-drilled "one/each/either/neither of + plural noun → verb number" trap ("${expression}" ↔ "${errorExpression}"). Every student memorizes that the verb agrees with the singular head, not the plural noun. Choose a less mechanical, deeper site already in the passage: ${deeperMenu}.`;
  }

  // (d) 주어핵 인접(장거리 수식어 부재)의 얕은 수일치 뒤집기 (does↔do, was↔were).
  // 다어절 표현("does exist"↔"do exist")은 정확히 한 토큰만 다른 경우 그 토큰쌍으로
  // 판정한다 — isNumberAgreementFlip 의 공백 가드가 다어절을 전부 놓치던 실측 구멍.
  const copularFlipPair = ((): [string, string] | null => {
    if (isCopularAgreementFlip(expression, errorExpression)) {
      return [expression, errorExpression];
    }
    const expTokens = normalizeText(expression).split(/\s+/);
    const errTokens = normalizeText(errorExpression).split(/\s+/);
    if (expTokens.length < 2 || expTokens.length !== errTokens.length) return null;
    let diff: [string, string] | null = null;
    for (let i = 0; i < expTokens.length; i += 1) {
      if (expTokens[i].toLowerCase() === errTokens[i].toLowerCase()) continue;
      if (diff) return null;
      diff = [expTokens[i], errTokens[i]];
    }
    return diff && isCopularAgreementFlip(diff[0], diff[1]) ? diff : null;
  })();
  if (copularFlipPair) {
    // 문맥 탐색: 표시형(errorExpression)이 지문/주변문에 실재하므로 둘 다 시도.
    let contextText = surroundingText;
    let targetIndex = -1;
    for (const target of [expression, errorExpression]) {
      if (!target) continue;
      targetIndex = surroundingText ? findBoundarySafeIndex(surroundingText, target) : -1;
      if (targetIndex >= 0) break;
      if (passage) {
        const located = extractContainingSentence(passage, target, surroundingText, errorExpression);
        if (located) {
          contextText = located.sentence;
          targetIndex = located.targetStart;
          break;
        }
      }
    }
    // 문맥 확정 실패 시 보수적 미발화. 확정됐으면 인접 명사의 수가 정답 동사의
    // 요구 주어 수와 일치할 때(=그 명사가 곧 주어, 학생 즉답 가능) 얕음으로 발화.
    // 불일치(교란 명사 개재 = 진짜 KILLER)면 통과. 기존 hasLongDistance… 헬퍼는
    // 분사+by구 개재를 인식 못 해 양방향 오판이 실측됐다 — 수 대조로 교체.
    if (
      targetIndex >= 0 &&
      adjacentSubjectMatchesRequiredNumber(contextText, targetIndex, copularFlipPair[0])
    ) {
      return `KILLER GRAMMAR_ERROR rejected: the answer is a shallow subject-verb number flip ("${expression}" ↔ "${errorExpression}") with the true subject sitting right next to the verb (no genuine attractor noun in between). At KILLER the agreement must span a real long-distance modifier with a misleading attractor noun so the subject head is non-obvious. Move the error to such a site, or pick another deep structure already in the passage: ${deeperMenu}.`;
    }
  }

  return null;
}


// ════════════════════════════════════════════════════════════════════════════
// 비표준 문법 용어 렉시콘 — findNonstandardGrammarTerminology (임무2)
// ════════════════════════════════════════════════════════════════════════════
// 실측(26-07-06): 학생용 어법 해설이 비표준/전문 언어학 용어를 노출한다. 기존
// dispatcher 게이트는 '전사구' 하나만 잡았다. 실측 발견 용어를 확장하고, 각
// 용어에 학생용 대체 표현을 메시지에 담아 교정 재생성을 유도한다("계사→be동사/
// 연결동사"). 정규식은 표준어 오탐을 피하도록 앵커링한다(예: '관계사' 안의 '계사').

const NONSTANDARD_GRAMMAR_TERMS: Array<{ term: RegExp; label: string; replacement: string }> = [
  { term: /전사구/, label: "전사구", replacement: "전치사구(전치사+명사)" },
  { term: /보문\s*명사/, label: "보문 명사", replacement: "명사(동격 that절이 뒤따르는 명사)" },
  // '관계사' 안의 '계사'(관+계사) 오탐 방지 — 앞이 '관'이 아닐 때만.
  { term: /(?<!관)계사/, label: "계사", replacement: "be동사/연결동사" },
  { term: /술어부\s*골격/, label: "술어부 골격", replacement: "문장의 서술어(동사) 구조" },
  { term: /통사적으로/, label: "통사적으로", replacement: "문장 구조상" },
];

// ── keyPoints-실문항 정합 (26-07-06 검수 실측: "3번째 핵심 포인트가 규칙적으로
// 이 문항에 없는 문법 주제를 가리킴" — 스키마가 개수만 요구하고 라벨 연동을
// 강제하지 않아 모델이 일반론 필러로 채우던 구조 결함) ─────────────────────
// pointCode → 그 포인트를 서술할 때 반드시 등장하는 한국어 키워드(관대하게).
const KEYPOINT_TOPIC_KEYWORDS: Record<string, RegExp> = {
  a: /정동사|준동사|본동사|동사\s*자리|동사의\s*개수/,
  b: /관계|that|what|완전|불완전|선행사/i,
  c: /분사|v-?ing|p\.?p/i,
  d: /수\s*일치|수일치|단수|복수/,
  e: /능동|수동|태\b|목적어/,
  f: /형용사|부사/,
  g: /대명사|지칭/,
  h: /목적격\s*보어|목적보어|5형식/,
  i: /병렬|등위|대구/,
  j: /가정법/,
  k: /부정사|동명사|to-?v|v-?ing|to\s*부정사/i,
  l: /전치사|접속사/,
  m: /비교|수량|배수/,
};

/**
 * keyPoints 가 실제 밑줄 라벨과 연동되는지 검증한다.
 * 규칙: ① 각 항목은 실제 존재하는 밑줄 라벨 "(X)" 로 시작 ② 1번째 항목은 정답
 * 라벨 ③ 라벨의 pointCode 가 알려져 있으면 항목 본문이 그 포인트의 키워드를
 * 포함해야 함(주제 이탈 필러 차단). 위반 시 교정 지시형 메시지, 정상이면 null.
 */
export function findGrammarKeypointChoiceMismatch(
  keyPoints: unknown,
  markedExpressions: Array<Record<string, unknown>>,
  correctAnswer: unknown,
): string | null {
  if (!Array.isArray(keyPoints) || keyPoints.length === 0) return null;
  const points = keyPoints.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  if (points.length === 0) return null;
  const labelSet = new Map<string, string>();
  for (const m of markedExpressions) {
    const label = normalizeLabel(m.label);
    if (label) labelSet.set(label, typeof m.pointCode === "string" ? m.pointCode : "");
  }
  if (labelSet.size === 0) return null;
  const answerLabels = new Set(
    String(correctAnswer ?? "")
      .split(/[,\s]+/)
      .map((part) => normalizeLabel(part))
      .filter(Boolean),
  );
  const issues: string[] = [];
  points.forEach((point, index) => {
    const labelMatch = point.match(/^\s*\(([A-J])\)/i);
    if (!labelMatch) {
      issues.push(
        `keyPoint ${index + 1} does not start with an underline label — every key point must be anchored to an actual choice like "(D) ..."`,
      );
      return;
    }
    const label = normalizeLabel(`(${labelMatch[1].toUpperCase()})`);
    if (!labelSet.has(label)) {
      issues.push(`keyPoint ${index + 1} references ${label}, which is not an underlined choice in this item`);
      return;
    }
    if (index === 0 && answerLabels.size > 0 && !answerLabels.has(label)) {
      issues.push(`keyPoint 1 must cover the answer label (${[...answerLabels].join(", ")}), got ${label}`);
    }
    const pointCode = labelSet.get(label) ?? "";
    const topicPattern = KEYPOINT_TOPIC_KEYWORDS[pointCode];
    if (topicPattern && !topicPattern.test(point)) {
      issues.push(
        `keyPoint ${index + 1} (${label}, pointCode ${pointCode}) does not describe that choice's grammar topic — generic filler points are forbidden`,
      );
    }
  });
  if (issues.length === 0) return null;
  return `Grammar keyPoints are not grounded in this item's actual choices: ${issues.join(" | ")}. Rewrite exactly 3 key points, each starting with a real underline label, the first covering the answer.`;
}

// ── CORE-10 표적 강제 (26-07-06 유저 결정: "어법은 대략 10개 핵심 포인트를
// 겨냥") — 정답 포인트가 카탈로그 핵심 10선(GRAMMAR_CORE_ANSWER_CODES) 밖의
// 희귀 코드(j 가정법 / l 전치사vs접속사 / m 비교·수량)면 craft 거절해 핵심
// 포인트로 재시도시킨다(디코이로는 허용).
const CORE_ANSWER_POINT_CODES = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "k"]);

export function findGrammarAnswerPointNotCore(
  markedExpressions: Array<Record<string, unknown>>,
): string | null {
  const outliers = markedExpressions
    .filter((m) => m.isError === true)
    .map((m) => ({
      label: normalizeLabel(m.label),
      pointCode: typeof m.pointCode === "string" ? m.pointCode : "",
    }))
    .filter((m) => m.pointCode && !CORE_ANSWER_POINT_CODES.has(m.pointCode));
  if (outliers.length === 0) return null;
  const detail = outliers.map((m) => `${m.label}(pointCode ${m.pointCode})`).join(", ");
  return `Grammar answer point ${detail} is outside the CORE-10 target set (a 정동사/b 관계사/c 분사/d 수일치/e 태/f 형·부/g 대명사/h 목적격보어/i 병렬/k to-v·v-ing). Rare points (j 가정법, l 전치사vs접속사, m 비교·수량) may appear only as decoys — move the answer to a CORE-10 site in the passage.`;
}

/**
 * 어법 해설/keyPoints 문자열에서 비표준 문법 용어를 검출한다. 하나라도 있으면
 * 발견 용어와 학생용 대체 표현을 담은 교정 지시형 메시지를, 없으면 null 을 반환.
 */
export function findNonstandardGrammarTerminology(text: unknown): string | null {
  const value = normalizeText(text);
  if (!value) return null;
  const hits = NONSTANDARD_GRAMMAR_TERMS.filter((entry) => entry.term.test(value));
  if (hits.length === 0) return null;
  const names = hits.map((hit) => `'${hit.label}'`).join(", ");
  const swaps = hits.map((hit) => `'${hit.label}'→'${hit.replacement}'`).join(", ");
  return `Grammar explanation/keyPoints uses nonstandard/linguistics terminology (${names}); rewrite with standard school-grammar terms: ${swaps}.`;
}



/**
 * 어법 해설의 메타 누출 — 출제 과정 서술 또는 생성 지침 어휘.
 * 어휘용보다 넓게: 다중어 타깃("to interact")·과거형 어미(변형하였습니다)·
 * 생성 지침 어휘(지시문/가이드라인/함정으로/유도하는 함정/포인트를 활용/출제 의도).
 */
export function grammarExplanationLeaksMeta(text: string): boolean {
  if (!text) return false;
  // 생성 지침 어휘 — 학생 해설에 절대 등장하면 안 됨.
  if (/지시문|가이드라인|출제\s*의도|출제\s*포인트|어법\s*포인트\s*(?:관점|측면|차원)|포인트\s*관점에서|유도하는\s*함정|함정으로\s*(?:만들|변형|유도|구성)|포인트를\s*활용|타깃\s*포인트|타고전/.test(text)) {
    return true;
  }
  // 출제 과정 서술: "X(를) Y(로) (잘못) 변형/바꾸/치환/교체 + 하였/했/한/된/하여/해서/시켰/시킨".
  // 타깃 Y 는 다중어(to interact 등)도 허용.
  if (/['"]?[A-Za-z][A-Za-z'\- ]*['"]?\s*(?:을|를)\s*['"]?[A-Za-z][A-Za-z'\- ]*['"]?\s*(?:로|으로)\s*(?:잘못\s*)?(?:변형|바꾸|바꿔|바꾼|치환|교체|변경)(?:하였|했|한|된|하여|해서|시켰|시킨)/.test(text)) {
    return true;
  }
  // 한국어 변형 서술 — 주어/대상이 한국어("이를 ~로 변형하였으므로")라 위 영어
  // 패턴이 놓친 누출. 과거시제 변형 동사(변형하였/했/시켰)는 *이미 변형한* 산출물
  // 임을 노출 — 클린 해설은 "변형하면"(조건)이지 "변형하였"(완료)을 안 쓴다.
  if (/(?:로|으로)\s*(?:잘못\s*)?(?:변형|치환|교체|변경)(?:하였|했(?!\s*을\s*때)|시켰|시킨|한\s*것|하므로|하였으므로|하여|해서)/.test(text)) {
    return true;
  }
  // 생성 설계 어휘 + "틀린/잘못된 변형" 명시. (포인트 설정/이번 문항에서는 = 출제 메타)
  if (/정답\s*설계|출제\s*설계|설계에\s*따라|(?:정답\s*)?포인트\s*설정|이번\s*문항에서는|(?:틀린|잘못된|오답)\s*변형/.test(text)) {
    return true;
  }
  // 내부 생성 필드명 노출 (errorExpression/pointCode 등) — 학생 해설에 절대 금지.
  if (/\b(errorExpression|correctExpression|wrongExpression|pointCode|_?typeId|slotValues?)\b/i.test(text)) {
    return true;
  }
  // 원형(변형 전) 누설·변형 형태·출제 설계 포인트 — 후처리 청소기와 동일 표면형.
  if (/원문은|원(?:문|래)\s*표현|정답형(?:인|을|이|은)|변형(?:된|한|인)?\s*형태|(?:정답으로|정답형으로|오답으로)\s*변형|포인트로\s*설계|(?:의도된|의도한)\s*(?:정답\s*)?포인트|변형(?:한|된|인)\s*(?:것|부분|결과|표현|단어)/.test(text)) {
    return true;
  }
  // 출제 프레이밍·원본 노출·수동 변형 서사 (라운드2~3).
  if (/문제에서(?:는|의)|문제를?\s*설계(?:했|하였|한)|(?:실제\s*)?본문에서(?:의)?\s*올바른|올바른\s*표현은\s*['"]?[A-Za-z]|정답으로\s*지정|(?:정답\s*)?포인트\s*설계|설계\s*지시|(?:정답\s*)?포인트인\b|지정된\s*\d\s*순위|\d\s*순위[^.]*?어법\s*포인트|어법\s*포인트의\s*검토|고친\s*형태|변형(?:되어|되었|됨)|변형하게\s*되면/.test(text)) {
    return true;
  }
  // 조건형 변형 서사 ("…으로 변형하면/바꾸면 … 틀리/비문/오답").
  // 주의: "틀립니다/틀린"은 음절이 달라 "틀리"로 안 잡힘 → 음절 집합으로.
  if (/(?:로|으로)\s*(?:잘못\s*)?(?:변형|바꾸|바꿔|치환|고치)(?:하면|면|하여|해서|한|게\s*되면)[^.]*?(?:틀[린립려리렸림]|비문|오류|오답|어긋|없[어이]|사라)/.test(text)) {
    return true;
  }
  return false;
}

/** 합법적으로 인접 반복될 수 있는 영어 단어(중복 게이트 예외). */
export const GRAMMAR_LEGIT_ADJACENT_REPEATS = new Set(["had", "that", "ho"]);


/**
 * 어법 마커가 앞/뒤 단어를 그대로 중복하는지 검출한다 — "which is __(F) is
 * costed__"처럼 errorExpression이 이웃 단어를 삼켜 깨진 텍스트가 된 케이스.
 * 라벨 `(X)`를 제외한 첫/끝 내용 토큰을 마커 밖 이웃 토큰과 비교한다.
 */
export function findGrammarMarkerAdjacentDuplicate(passageWithMarkers: string): string | null {
  const re = /([A-Za-z']+)\s+__\([A-Ja-j]\)\s*([^_]+?)__(?:\s+([A-Za-z']+))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(passageWithMarkers))) {
    const before = match[1].toLowerCase();
    const innerTokens = match[2].trim().split(/\s+/).filter(Boolean);
    const after = match[3]?.toLowerCase();
    const innerFirst = innerTokens[0]?.toLowerCase();
    const innerLast = innerTokens[innerTokens.length - 1]?.toLowerCase();
    if (innerFirst && before === innerFirst && !GRAMMAR_LEGIT_ADJACENT_REPEATS.has(before)) {
      return `${before} ${innerFirst}`;
    }
    if (after && innerLast && after === innerLast && !GRAMMAR_LEGIT_ADJACENT_REPEATS.has(after)) {
      return `${innerLast} ${after}`;
    }
  }
  return null;
}



/**
 * isError 마커의 surroundingText가 자신의 마커 단어(expression/errorExpression/
 * correction)를 하나도 포함하지 않으면 위치 단서가 무효다 — 모델이 다른 문장을
 * 가리킨 것으로, 전역 폴백 오배치와 해설-오류 불일치를 유발한다.
 */
export function findGrammarSurroundingMissingMarker(
  markedExpressions: Record<string, unknown>[],
): string | null {
  for (const me of markedExpressions) {
    if (me.isError !== true) continue;
    const surrounding = normalizeText(me.surroundingText);
    if (!surrounding) continue;
    const surroundTokens = new Set(toLowerTokens(surrounding));
    const markerTokens = [
      normalizeText(me.expression),
      normalizeText(me.errorExpression),
      normalizeText(me.correction),
    ].flatMap((s) => toLowerTokens(s));
    if (markerTokens.length === 0) continue;
    if (!markerTokens.some((t) => surroundTokens.has(t))) {
      return normalizeLabel(me.label) || "(?)";
    }
  }
  return null;
}



/**
 * isError 마커의 렌더 inner 가 errorExpression 과 다르면 라벨을 반환한다 —
 * 실측(26-07-05 final-std): (E) 마커가 오류형 'which' 대신 정답형 'in which'를
 * 지문에 박아 학생이 보는 표면과 선지가 어긋났다(무정답급). 마커 계약상
 * inner = "(라벨) errorExpression" 이어야 한다(비교는 normalizeComparableText).
 */
export function findGrammarMarkerErrorFormMismatch(
  passageWithMarkers: string,
  markedExpressions: Record<string, unknown>[],
): string | null {
  const labelToInner = new Map<string, string>();
  for (const marker of findMarkers(passageWithMarkers)) {
    const m = marker.inner.match(/^\(([A-Ja-j])\)\s*([\s\S]*)$/);
    if (m && !labelToInner.has(m[1].toUpperCase())) {
      labelToInner.set(m[1].toUpperCase(), m[2]);
    }
  }
  for (const me of markedExpressions) {
    if (me.isError !== true) continue;
    const label = normalizeLabel(me.label).replace(/[()]/g, "").toUpperCase();
    const inner = labelToInner.get(label);
    const errorExpression = normalizeText(me.errorExpression);
    if (!inner || !errorExpression) continue;
    if (normalizeComparableText(inner) !== normalizeComparableText(errorExpression)) {
      return me.label ? normalizeLabel(me.label) : `(${label})`;
    }
  }
  return null;
}

/**
 * 어법 마커가 surroundingText와 동떨어진 위치에 배치됐는지 검출한다. 각 isError
 * 마커의 렌더 위치 주변 내용어와 모델 surroundingText의 내용어가 전혀 겹치지
 * 않으면 오배치로 본다(전역 폴백이 엉뚱한 동형 단어에 박은 케이스). surroundingText
 * 내용어가 2개 미만이면 신뢰할 수 없어 건너뛴다(위양성 방지).
 */
export function findGrammarMisplacedMarker(
  passageWithMarkers: string,
  markedExpressions: Record<string, unknown>[],
): string | null {
  const markers = findMarkers(passageWithMarkers);
  const labelToMarker = new Map<string, { start: number; end: number }>();
  for (const marker of markers) {
    const label = marker.inner.match(/^\(([A-Ja-j])\)/)?.[1]?.toUpperCase();
    if (label && !labelToMarker.has(label)) labelToMarker.set(label, marker);
  }
  for (const me of markedExpressions) {
    if (me.isError !== true) continue;
    const label = normalizeLabel(me.label).replace(/[()]/g, "").toUpperCase();
    const marker = labelToMarker.get(label);
    const surrounding = normalizeText(me.surroundingText);
    if (!marker || !surrounding) continue;

    // 마커 단어(expression/errorExpression)는 surrounding 내용어에서 제외 —
    // 위치 단서가 되는 이웃 내용어만 남긴다.
    const markerWords = new Set(
      [normalizeText(me.expression), normalizeText(me.errorExpression)]
        .flatMap((s) => toLowerTokens(s)),
    );
    const surroundContent = toLowerTokens(surrounding).filter(
      (t) => t.length >= 3 && !REPEATED_PHRASE_STOPWORDS.has(t) && !markerWords.has(t),
    );
    if (surroundContent.length < 2) continue;

    const ctxStart = Math.max(0, marker.start - 45);
    const ctxEnd = Math.min(passageWithMarkers.length, marker.end + 45);
    const around = `${passageWithMarkers.slice(ctxStart, marker.start)} ${passageWithMarkers.slice(marker.end, ctxEnd)}`;
    const aroundTokens = new Set(toLowerTokens(around));
    const overlap = surroundContent.filter((t) => aroundTokens.has(t)).length;
    const requiredOverlap = Math.min(2, Math.ceil(surroundContent.length / 2));
    if (overlap < requiredOverlap) return me.label ? normalizeLabel(me.label) : `(${label})`;
  }
  return null;
}
