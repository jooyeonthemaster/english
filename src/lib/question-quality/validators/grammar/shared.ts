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
      return !/\b(?:that|what|which|who|whom|whose|where|when|why)\b/i.test(text);
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
      return !/\b(?:during|while|despite|although|though|because|since|as|if|unless|before|after|until|when|whereas|whilst)\b/i.test(text) &&
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
  return (
    /\b(?:what|which|whose|whom|where|when)\b[\s\S]{0,120}\b(?:is|are|was|were|has|have|do|does|can|could|should|would|may|might)\b/i.test(normalized) ||
    /\b(?:with|without)\s+(?:the\s+)?[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){1,6}\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|made|seen|found)\b/i.test(normalized) ||
    /\b(?:when|while|if|unless|once|although)\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|asked|seen)\b/i.test(normalized) ||
    /\b(?:not only|both|either|neither|from|between)\b[\s\S]{10,140}\b(?:but|and|or|nor|to)\b/i.test(normalized) ||
    /\b(?:the number of|a number of|one of|each of|neither of|either of|most of|the rest of)\b[\s\S]{10,120}\b(?:is|are|was|were|has|have|requires?|depends?|seems?)\b/i.test(normalized) ||
    /\b(?:of|with|including|along with|as well as|who|which|that)\b[\s\S]{25,140}\b(?:is|are|was|were|has|have|requires?|depends?|seems?|make|makes)\b/i.test(normalized)
  );
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



export function isThinKillerGrammarErrorTarget(markedExpression: Record<string, unknown>): boolean {
  const expression = normalizeText(markedExpression.expression);
  const errorExpression = normalizeText(markedExpression.errorExpression);
  const correction = normalizeText(markedExpression.correction);
  const surroundingText = normalizeText(markedExpression.surroundingText);
  const pointCode = extractGrammarPointCode(markedExpression.pointCode);
  const combined = `${expression} ${errorExpression} ${correction} ${surroundingText}`;
  if (hasKillerGrammarStructure(combined)) return false;
  if (pointCode === "d" && isSimpleAgreementFlip(expression, errorExpression, correction)) return true;
  return (
    countWordsForQuality(expression) <= 2 &&
    countWordsForQuality(errorExpression || expression) <= 2 &&
    countWordsForQuality(surroundingText) < 10
  );
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
    if (overlap === 0) return me.label ? normalizeLabel(me.label) : `(${label})`;
  }
  return null;
}
