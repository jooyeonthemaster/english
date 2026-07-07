// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { IMPLIED_MEANING_TRAILING_FUNCTION_WORDS, QuestionQualitySeverity, containsHangul, containsLatinLetter, countLiteral, isRecord, normalizeComparableText, normalizeText, summaryWritingComparableTokens } from "../../core";



export function summaryWritingWordTokens(value: string): string[] {
  return (value.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? []).map((token) =>
    token.toLowerCase(),
  );
}



// ============================================================================
// SW-GATE-BUILDABLE 공유 헬퍼 — [보기](wordBank) 칩 멀티셋으로 빈칸 정답을 조립할 수
// 있는가. WORD_ORDER 의 word-order-unreconstructable 를 cloze(빈칸 영작)로 미러한 것.
// TOPIC_SENTENCE_WRITING cloze 도 이 헬퍼를 재사용한다(같은 구조: wordBank + blanks[].answer).
//
// 26-07-06 실측 F결함(w9dsc1): 정답 "confusing the wind's flow pattern along the
//   building's surface"에 필요한 전치사 "along"이 [보기]에 없고, "the"가 2회 필요한데
//   칩에는 1개뿐 → 학생이 [보기]만으로 정답을 조립할 수 없다(채점 불능급 F).
//
// 판정 원칙:
//   · 멀티셋 부분집합: "the"가 2회 필요하면 칩에도 2개 있어야 한다("중복 필요 단어는
//     같은 문자열 2개로"라는 스키마 계약과 일치).
//   · 폐쇄부류 기능어(관사/전치사/접속사/대명사·한정사)는 어형변화가 없으므로 정확
//     일치한 칩만 공급원이 될 수 있다 — 이것이 "along" 부재·"the" 부족을 결정론으로 잡는 핵심.
//   · 내용어만 어형변화(wordBankFidelity=inflected: 칩=기본형, 정답=활용형)를 허용한다.
//   · 미끼(정답 외 여분 칩)는 정상 — 초과 허용, "부족"만 결함. 미끼는 화면의 실제 칩이므로
//     빼지 않는다(WO 와 달리 학생은 미끼 포함 전체 칩을 물리적으로 사용할 수 있다).
//   · 대체정답(acceptableVariants)이 있으면 하나라도 조립 가능하면 그 빈칸 통과.
// ============================================================================

// 폐쇄부류 기능어(정확 일치 강제) — core 의 전치사/접속사 집합(along 포함)에 관사·등위
// 접속사·대명사·한정사를 보강. 이들은 어형변화하지 않으므로 어간/접두 fuzzy 매칭 대상에서 제외.
const BUILDABILITY_EXTRA_FUNCTION_WORDS = new Set<string>([
  "a", "an", "the",
  "and", "nor", "so", "yet", "both", "either", "neither", "whether",
  "it", "its", "this", "that", "these", "those", "their", "theirs",
  "they", "them", "we", "us", "our", "ours", "you", "your", "yours",
  "he", "she", "his", "her", "hers", "him", "i", "my", "me", "mine",
  "who", "whom", "whose", "which", "what",
  "each", "every", "some", "any", "no", "not", "there", "here",
]);

function isBuildabilityFunctionWord(token: string): boolean {
  return (
    IMPLIED_MEANING_TRAILING_FUNCTION_WORDS.has(token) ||
    BUILDABILITY_EXTRA_FUNCTION_WORDS.has(token)
  );
}

// 소유격 's 는 어형변화의 하나로 보고 비교 전에 제거한다(칩 "wind" ↔ 정답 "wind's" 허용).
function stripBuildabilityPossessive(token: string): string {
  return token.replace(/['’]s$/, "");
}

// 내용어 어간: 굴절어미(-s/-es/-ed/-ing) 1개 + 묵음 e 를 제거한다. make↔making,
// color↔colors, confuse↔confusing, increase↔increasing 등 규칙 굴절을 흡수한다.
function inflectionalStem(token: string): string {
  return token.replace(/(ing|ed|es|s)$/, "").replace(/e$/, "");
}

// 불규칙 활용 → 기본형 (26-07-06 Fable 적대검증 보강). 칩=기본형·정답=활용형 계약에서
// 규칙 굴절만 흡수하면 불규칙 동사(made/took/brought…)가 오탐(조립 불가로 오판)된다 —
// 이 게이트는 F급이라 오탐 = 생성 실패 위험. 수능 지문 빈출 불규칙만 수록(폐쇄 목록).
const IRREGULAR_FORM_TO_BASE: Record<string, string> = {
  made: "make", took: "take", taken: "take", found: "find", brought: "bring",
  thought: "think", held: "hold", kept: "keep", built: "build", grew: "grow",
  grown: "grow", rose: "rise", risen: "rise", fell: "fall", fallen: "fall",
  led: "lead", met: "meet", paid: "pay", said: "say", saw: "see", seen: "see",
  gave: "give", given: "give", came: "come", went: "go", gone: "go",
  knew: "know", known: "know", got: "get", gotten: "get", ran: "run",
  wrote: "write", written: "write", drew: "draw", drawn: "draw",
  chose: "choose", chosen: "choose", spoke: "speak", spoken: "speak",
  taught: "teach", sought: "seek", bought: "buy", caught: "catch",
  left: "leave", lost: "lose", sent: "send", spent: "spend", stood: "stand",
  understood: "understand", won: "win", wore: "wear", worn: "wear",
  threw: "throw", thrown: "throw", shown: "show", done: "do", did: "do",
  became: "become", begun: "begin", began: "begin", broke: "break",
  broken: "break", felt: "feel", hid: "hide", hidden: "hide", laid: "lay",
  lain: "lie", lay: "lie", meant: "mean", rode: "ride", ridden: "ride",
  sang: "sing", sung: "sing", sat: "sit", slept: "sleep", told: "tell",
  woke: "wake", woken: "wake", was: "be", were: "be", been: "be", is: "be",
  are: "be", am: "be", being: "be", had: "have", has: "have",
};

function toBaseForm(token: string): string {
  return IRREGULAR_FORM_TO_BASE[token] ?? token;
}

function buildabilityExactEq(answerToken: string, chipToken: string): boolean {
  return (
    stripBuildabilityPossessive(answerToken) ===
    stripBuildabilityPossessive(chipToken)
  );
}

/** 칩 토큰 C 가 정답 토큰 A 를 공급할 수 있는가(정확 일치 or 내용어 어형변화). */
export function wordBankChipCoversAnswerToken(
  answerToken: string,
  chipToken: string,
): boolean {
  const a = stripBuildabilityPossessive(answerToken);
  const c = stripBuildabilityPossessive(chipToken);
  if (!a || !c) return false;
  if (a === c) return true;
  // 기능어는 어형변화가 없다 — 정확 일치가 아니면 공급 불가(the/along/of… 정밀 검출).
  if (isBuildabilityFunctionWord(a) || isBuildabilityFunctionWord(c)) return false;
  // 불규칙 활용(made↔make, brought↔bring) — 기본형으로 접은 뒤 비교.
  if (toBaseForm(a) === toBaseForm(c)) return true;
  // 내용어 규칙 굴절: 어미+묵음 e 제거 후 어간 일치(make↔making, color↔colors).
  const sa = inflectionalStem(toBaseForm(a));
  const sc = inflectionalStem(toBaseForm(c));
  if (sa.length >= 3 && sa === sc) return true;
  // 파생(predict↔prediction) — 한쪽이 다른쪽의 접두(≥4글자). 관대 쪽 편향(거짓양성 회피).
  if ((a.startsWith(c) || c.startsWith(a)) && Math.min(a.length, c.length) >= 4) return true;
  return false;
}

type WordBankBuildBlank = { label: string; candidates: string[] };

function consumeCandidateFromPool(
  answerTokens: string[],
  pool: string[],
): { missing: string[]; leftover: string[] } {
  const remaining = [...pool];
  const deferred: string[] = [];
  // pass 1: 정확 일치 우선 소비(어간 일치가 "정확히 필요한" 칩을 먼저 훔치지 않게).
  for (const token of answerTokens) {
    const i = remaining.findIndex((chip) => buildabilityExactEq(token, chip));
    if (i >= 0) remaining.splice(i, 1);
    else deferred.push(token);
  }
  const missing: string[] = [];
  // pass 2: 남은 토큰을 내용어 어형변화 매칭으로 소비. 못 찾으면 부족(missing).
  for (const token of deferred) {
    const i = remaining.findIndex((chip) =>
      wordBankChipCoversAnswerToken(token, chip),
    );
    if (i >= 0) remaining.splice(i, 1);
    else missing.push(token);
  }
  return { missing, leftover: remaining };
}

/**
 * [보기](wordBank) 칩 멀티셋으로 각 빈칸 정답을 조립할 수 있는지 검사.
 * 반환: 조립 불가한 빈칸별 { label, missing 토큰 } 목록(모두 조립 가능하면 빈 배열).
 * - 칩은 공유 풀(멀티셋). 빈칸을 순서대로 소비한다.
 * - 각 빈칸: candidates(정답 + acceptableVariants) 중 부족 토큰이 가장 적은(가능하면 0) 후보 선택.
 */
export function findUnbuildableWordBankBlanks(
  wordBankChips: string[],
  blanks: WordBankBuildBlank[],
): { label: string; missing: string[] }[] {
  let pool = wordBankChips.flatMap((chip) => summaryWritingWordTokens(chip));
  const defects: { label: string; missing: string[] }[] = [];
  for (const blank of blanks) {
    let best: { missing: string[]; leftover: string[] } | null = null;
    for (const candidate of blank.candidates) {
      const tokens = summaryWritingWordTokens(candidate);
      if (tokens.length === 0) continue;
      const res = consumeCandidateFromPool(tokens, pool);
      if (best === null || res.missing.length < best.missing.length) best = res;
      if (res.missing.length === 0) break; // 조립 가능 후보를 찾음 — 종료.
    }
    if (!best) continue;
    pool = best.leftover; // 선택된 후보의 칩을 공유 풀에서 소비.
    if (best.missing.length > 0) {
      defects.push({ label: blank.label, missing: [...new Set(best.missing)] });
    }
  }
  return defects;
}

/** blanks[] 레코드에서 조립검사용 { label, candidates=[answer, ...acceptableVariants] } 추출. */
export function collectWordBankBuildBlanks(
  blanks: Record<string, unknown>[],
): WordBankBuildBlank[] {
  const out: WordBankBuildBlank[] = [];
  for (let index = 0; index < blanks.length; index += 1) {
    const blank = blanks[index];
    const answer = normalizeText(blank.answer);
    if (!answer) continue;
    const variants = Array.isArray(blank.acceptableVariants)
      ? blank.acceptableVariants.map((v) => normalizeText(v)).filter(Boolean)
      : [];
    const rawLabel = normalizeText(blank.label);
    const label = rawLabel || `(${String.fromCharCode(65 + index)})`;
    out.push({ label, candidates: [answer, ...variants] });
  }
  return out;
}

/** 조립 불가 결함 목록 → add() 메시지 문자열. */
function formatUnbuildableDetail(
  defects: { label: string; missing: string[] }[],
): string {
  return defects
    .map((d) => `${d.label}: ${d.missing.map((token) => `"${token}"`).join(", ")}`)
    .join(" / ");
}



export function validateSummaryWritingQuestion(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const summary = normalizeText(question.summaryWithBlanks);
  const modelAnswer = normalizeText(question.modelAnswer);
  const clueMode = normalizeText(question.clueMode);
  const wordBankPolicy = normalizeText(question.wordBankPolicy);
  const blanks = Array.isArray(question.blanks)
    ? question.blanks.filter(isRecord)
    : [];
  const wordBank = Array.isArray(question.wordBank)
    ? question.wordBank
        .map((word) => normalizeText(word))
        .filter(Boolean)
    : [];
  const wordBankDistractors = Array.isArray(question.wordBankDistractors)
    ? question.wordBankDistractors
        .map((word) => normalizeText(word))
        .filter(Boolean)
    : [];

  // 라벨은 blanks[].label 우선, 없으면 summaryWithBlanks 의 (X) placeholder 에서 추출.
  const labelsFromBlanks = blanks
    .map((blank) => normalizeText(blank.label).toUpperCase())
    .filter((label) => /^\([A-Z]\)$/.test(label));
  const labelsFromSummary = Array.from(summary.matchAll(/\(([A-Z])\)/g)).map(
    (match) => `(${match[1]})`,
  );
  const blankLabels = [
    ...new Set(
      (labelsFromBlanks.length > 0
        ? labelsFromBlanks
        : labelsFromSummary.length > 0
          ? labelsFromSummary
          : ["(A)"]
      ).slice(0, 3),
    ),
  ].sort();

  // SW-GATE-MODELANSWER (sw-modelanswer-present): 모범답안 없으면 채점 불가.
  if (!modelAnswer) {
    add(
      "error",
      "sw-modelanswer-present",
      "SUMMARY_WRITING modelAnswer(전체 모범 영작)가 비어 있습니다.",
    );
  }

  if (!summary) {
    add(
      "error",
      "sw-summary-blank-marker-count",
      "SUMMARY_WRITING summaryWithBlanks(요약문)가 비어 있습니다.",
    );
  }

  // SW-GATE-MARKER (sw-summary-blank-marker-count): summaryWithBlanks 에 각 라벨이
  // 정확히 1회. placeholder 누락/중복은 마스킹·렌더가 깨진다.
  if (
    summary &&
    blankLabels.some((label) => countLiteral(summary, label) !== 1)
  ) {
    add(
      "error",
      "sw-summary-blank-marker-count",
      `summaryWithBlanks must contain ${blankLabels.join(", ")} exactly once each.`,
    );
  }

  // SW-GATE-ANSWER-LANGUAGE (sw-answer-language): 빈칸 answer·modelAnswer 는 영어.
  let answerLanguageReported = false;
  for (const blank of blanks) {
    const answer = normalizeText(blank.answer);
    if (!answer) continue;
    if (containsHangul(answer) || !containsLatinLetter(answer)) {
      add(
        "error",
        "sw-answer-language",
        "SUMMARY_WRITING blanks[].answer must be an English word or phrase.",
      );
      answerLanguageReported = true;
      break;
    }
  }
  if (
    !answerLanguageReported &&
    modelAnswer &&
    (containsHangul(modelAnswer) || !containsLatinLetter(modelAnswer))
  ) {
    add(
      "error",
      "sw-answer-language",
      "SUMMARY_WRITING modelAnswer must be an English sentence.",
    );
  }

  // SW-GATE-LEAK (sw-answer-not-in-summary): 정답 "어구"가 학생노출 요약문에 그대로
  // 적혀 있으면(=빈칸 자리에 정답을 써둔 실수) 누수. 단, 단일 내용어 1개가 겹치는
  // 것만으로는 막지 않는다 — 요약문은 지문의 paraphrase/inference 이고 connectorFrame
  // (", which can lead to greater bias in the result" 등)·빈칸밖 문장이 정답과 같은
  // 내용어(bias/sample/result/increasing …)를 정당하게 공유할 수 있어 거짓양성이 난다.
  // 진짜 누수는 정답의 "연속 다토큰 어구"가 요약문에 통째로 박혀 있는 경우다.
  // placeholder 무결성(빈칸에 정답이 안 들어감)은 sw-summary-blank-marker-count 가 보장.
  const summaryComparable = normalizeComparableText(summary);
  if (summaryComparable) {
    // placeholder 라벨((A))은 토큰 경계로만 작동하게 제거해 라벨이 인접 어구를
    // 잇는 거짓 연속을 막는다. connectorFrameAfter 같은 빈칸밖 텍스트는 그대로 둔다.
    const summaryTokens = summaryWritingComparableTokens(
      summary.replace(/\([A-Z]\)/g, " "),
    );
    const summarySequence = ` ${summaryTokens.join(" ")} `;
    // 빈칸별 answer(= 빈칸에 들어갈 비밀 어구)만 검사한다. modelAnswer 는 빈칸을 채운
    // "전체 문장"이라 connectorFrame·빈칸밖 문맥을 visible summary 와 길게 정당하게
    // 공유하므로 누수 비교에서 제외(포함 시 그 공유 문맥이 그대로 거짓양성을 만든다).
    const leakSources = blanks
      .map((blank) => normalizeText(blank.answer))
      .filter(Boolean);
    // 정답 어구의 연속 내용어(2토큰 이상)가 요약문 토큰열에 통째로 나타나면 누수로 본다.
    // 단일 내용어 1개 공유는 paraphrase/inference 의 자연스러운 겹침이라 허용.
    let leakedPhrase = "";
    for (const source of leakSources) {
      const phraseTokens = summaryWritingComparableTokens(source);
      if (phraseTokens.length < 2) continue;
      const phrase = ` ${phraseTokens.join(" ")} `;
      if (summarySequence.includes(phrase)) {
        leakedPhrase = phraseTokens.join(" ");
        break;
      }
    }
    if (leakedPhrase) {
      add(
        "error",
        "sw-answer-not-in-summary",
        `정답 어구가 summaryWithBlanks 에 통째로 노출됩니다(누수): "${leakedPhrase}". 빈칸에는 placeholder 라벨만 두세요.`,
      );
    }
  }

  // SW-GATE-ORDER (sw-wordbank-no-answer-order): [보기]의 나열 순서가 modelAnswer
  // (또는 answer 들을 이은) 어순과 같으면 어순을 무료로 누설. 반드시 셔플돼야 함.
  if (wordBank.length >= 2) {
    const bankSequence = wordBank
      .flatMap((chip) => summaryWritingWordTokens(chip))
      .join(" ");
    const answerSequence = (
      modelAnswer ||
      blanks.map((blank) => normalizeText(blank.answer)).join(" ")
    );
    const answerTokenSequence = summaryWritingWordTokens(answerSequence).join(" ");
    if (
      bankSequence &&
      answerTokenSequence &&
      answerTokenSequence.includes(bankSequence)
    ) {
      add(
        "error",
        "sw-wordbank-no-answer-order",
        "wordBank(보기)가 정답 어순 그대로입니다. 보기 순서를 정답과 다르게 셔플하세요.",
      );
    }
  }

  // SW-GATE-COVERAGE (sw-wordbank-answer-coverage): [보기] 칩 하나가 '여러 단어로 된 정답
  // 어구 전체'를 통째로(연속) 담으면 정답이 노출된다(예: wordBank=["depth of conceptual
  // synthesis and memory encoding"]). BASIC 재배열 영작은 정답을 단어 단위로 흩어 칩으로
  // 주므로(useAll+미끼0 이어도) 어떤 칩도 다단어 정답을 연속으로 담지 않아 무발화한다.
  // 단일어 정답은 정상적으로 보기에 들어가는 형식(받아쓰기)이라 검사 대상에서 제외한다.
  // (이전 '토큰 집합 커버리지' 방식은 BASIC useAll+미끼0 을 오탐 차단해 폐기 — 누설 신호는
  //  '커버리지'가 아니라 '한 칩 = 다단어 정답 통째'다.)
  {
    const deobf = (value: string) =>
      normalizeComparableText(value).replace(/_+/g, "").replace(/\s+/g, " ").trim();
    const chipsNorm = wordBank.map((chip) => deobf(chip)).filter(Boolean);
    const leaked = blanks
      .map((blank) => deobf(normalizeText(blank.answer)))
      .filter((ans) => ans.split(" ").filter(Boolean).length >= 2)
      .find((ans) => chipsNorm.some((chip) => chip === ans || chip.includes(ans)));
    if (leaked) {
      add(
        "error",
        "sw-wordbank-answer-coverage",
        "[보기]의 한 칩이 여러 단어로 된 정답 어구를 통째로 담아 정답이 노출됩니다. 정답 어구는 한 칩에 몰아넣지 말고 단어 단위로 흩거나 미끼(wordBankDistractors)를 추가하세요.",
      );
    }
  }

  // SW-GATE-FIRSTLETTER (clueMode=firstLetter): 앞글자 단서는 렌더 단계에서 blanks[].answer 의
  // 각 단어 첫 글자를 직접 파생해 "(A) r____ o____ ..." 단어별 슬롯으로 그린다
  // (summaryWritingMaskedSummary). 즉 모델의 firstLetterHint 필드는 표시에 쓰이지 않으므로
  // 그 토큰 정렬을 강제하지 않는다(과거 sw-firstletter-align 게이트가 안 쓰는 필드 때문에 멀쩡한
  // 문제를 리젝하던 것을 제거). 유효 조건은 각 빈칸 answer 가 존재하는 것뿐 — 이는 아래
  // sw-answer-language / sw-modelanswer-present 가 이미 보장한다.

  // SW-GATE-DISTRACTOR (sw-distractor-semantic): usePartial(미끼 사용) 인데
  // wordBankDistractors 가 비어 있으면 어느 게 미끼인지 검증·교사면이 비게 됨 — 경고.
  if (
    wordBankPolicy === "usePartial" &&
    wordBank.length > 0 &&
    wordBankDistractors.length === 0
  ) {
    add(
      "warning",
      "sw-distractor-semantic",
      "wordBankPolicy=usePartial 인데 wordBankDistractors(미끼 목록)가 비어 있습니다.",
    );
  }

  // ── wave2 게이트 2종 ──────────────────────────────────────────────────────
  const koreanGloss = normalizeText(question.koreanGloss);
  const direction = normalizeText(question.direction);

  // SW-GATE-DIRECTION (sw-direction-wordbank-mismatch): 발문이 [보기]/[해석]을
  // 지시하는데 해당 학생노출 필드가 비어 있으면 학생이 볼 수 없는 상자를 참조하는
  // 발문이라 문항이 지시대로 풀 수 없다(베이스라인 실측 runIndex 46 지적 계열).
  if (direction) {
    if (/\[보기\]|보기\s*에서/.test(direction) && wordBank.length === 0) {
      add(
        "error",
        "sw-direction-wordbank-mismatch",
        "발문이 [보기]에서 단어를 고르라고 지시하지만 wordBank 가 비어 있어 학생에게 [보기]가 렌더되지 않습니다.",
      );
    }
    if (/\[해석\]|해석\s*을?\s*참고/.test(direction) && !koreanGloss) {
      add(
        "error",
        "sw-direction-wordbank-mismatch",
        "발문이 [해석]을 참고하라고 지시하지만 koreanGloss 가 비어 있어 학생에게 [해석]이 렌더되지 않습니다.",
      );
    }
  }

  // SW-GATE-GLOSS-LEAK (sw-gloss-answer-leak): usePartial("필요한 단어만 골라")
  // 인데 [보기] 칩 전부가 정답 토큰(미끼 0)이고 [해석](koreanGloss)까지 전문 번역
  // 으로 제공되면, 단어 집합([보기])과 내용·어순([해석])이 동시에 노출돼 영작이
  // 받아쓰기로 전락한다(베이스라인 실측 runIndex 45: 해석이 정답 어구 "절대적인
  // 독점적 지위를 유지했던"을 그대로 비추고 wordBank 7칩 = 정답 7단어). 한국어↔
  // 영어 의미 비교는 비결정론이므로, 결정론 프록시 = "usePartial + 미끼 0 +
  // 칩 전부 정답 소속 + 해석 존재" 조합으로 판정한다. useAll(재배열 형식)·미끼가
  // 실재하는 usePartial·해석 없는 문항은 발화하지 않는다 — 무회귀.
  if (
    koreanGloss &&
    wordBankPolicy === "usePartial" &&
    wordBank.length >= 2 &&
    wordBankDistractors.length === 0
  ) {
    const answerWordTokens = blanks.flatMap((blank) =>
      summaryWritingWordTokens(normalizeText(blank.answer)),
    );
    const answerTokenSet = new Set(answerWordTokens);
    const chipMatchesAnswerToken = (chip: string) => {
      if (answerTokenSet.has(chip)) return true;
      for (const token of answerTokenSet) {
        // 어형 변화(inflected) 허용: color↔colors, establish↔establishing.
        if (chip.length >= 4 && token.startsWith(chip)) return true;
        if (token.length >= 4 && chip.startsWith(token)) return true;
      }
      return false;
    };
    const chipTokens = wordBank.flatMap((chip) => summaryWritingWordTokens(chip));
    const hasMultiWordAnswer = blanks.some(
      (blank) => summaryWritingWordTokens(normalizeText(blank.answer)).length >= 2,
    );
    if (
      hasMultiWordAnswer &&
      chipTokens.length >= 2 &&
      chipTokens.every(chipMatchesAnswerToken)
    ) {
      add(
        "error",
        "sw-gloss-answer-leak",
        "[해석](koreanGloss)이 정답 내용을 그대로 비추는데 [보기] 칩 전부가 정답 단어(미끼 0)입니다 — 단어와 내용·어순이 동시에 노출돼 영작이 받아쓰기가 됩니다. 미끼(wordBankDistractors)를 추가하거나 해석을 빈칸 영역이 가려진 형태로 바꾸세요.",
      );
    }
  }

  // SW-GATE-BUILDABLE (sw-answer-not-buildable-from-wordbank): [보기](wordBank) 칩
  // 멀티셋으로 각 빈칸 정답을 조립할 수 없으면(필요 토큰이 부족 — 예: "along" 부재,
  // "the" 2회 필요한데 1개뿐) 학생이 [보기]만으로 정답을 만들 수 없어 채점 불능(F).
  // WORD_ORDER word-order-unreconstructable 미러. 어형변화(inflected)·미끼 초과·
  // 대체정답(acceptableVariants 하나라도 조립가능하면 통과)은 정상. wordBank 없는(자유 영작)
  // 문항은 검사하지 않는다 — 무회귀.
  if (wordBank.length > 0) {
    const buildBlanks = collectWordBankBuildBlanks(blanks);
    if (buildBlanks.length > 0) {
      const defects = findUnbuildableWordBankBlanks(wordBank, buildBlanks);
      if (defects.length > 0) {
        add(
          "error",
          "sw-answer-not-buildable-from-wordbank",
          `[보기](wordBank) 칩으로 정답을 조립할 수 없습니다 — 부족 토큰 ${formatUnbuildableDetail(defects)}. 필요한 단어를 wordBank 에 추가하세요(중복 필요 단어는 같은 문자열을 개수만큼). 미끼 초과는 허용됩니다.`,
        );
      }
    }
  }
}
