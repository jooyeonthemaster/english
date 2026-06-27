// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { buildGrammarPointGuidance, GRAMMAR_POINT_CATALOG, type GrammarPointCode } from "@/lib/grammar-point-catalog";
import { CandidateDiversityOptions, buildSurroundingWindow } from "./shared";
import { countWordsForQuality, normalizeComparableText, normalizeGrammarCorrectionErrorCount, normalizeText, splitPassageSentences } from "../core";


export const GRAMMAR_MARKER_COUNT_MIN = 5;


export const GRAMMAR_MARKER_COUNT_MAX = 10;



export function normalizeGrammarMarkedCount(markedCount: unknown): number {
  const n = typeof markedCount === "number" ? markedCount : Number(markedCount);
  if (!Number.isFinite(n)) return GRAMMAR_MARKER_COUNT_MIN;
  return Math.min(
    GRAMMAR_MARKER_COUNT_MAX,
    Math.max(GRAMMAR_MARKER_COUNT_MIN, Math.round(n)),
  );
}



export function normalizeGrammarAnswerCount(answerCount: unknown, markedCount: number): number {
  const n = typeof answerCount === "number" ? answerCount : Number(answerCount);
  const max = Math.max(1, markedCount);
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(1, Math.round(n)));
}



export type GrammarCandidateTier = "basic" | "intermediate" | "killer";



export type GrammarCandidateRule = {
  code: GrammarPointCode;
  pattern: RegExp;
  note: string;
  trap: string;
  mutationHint: string;
  tier: GrammarCandidateTier;
  priority: number;
};



export type GrammarGenerationCandidate = {
  code: GrammarPointCode;
  expression: string;
  surroundingText: string;
  note: string;
  trap: string;
  mutationHint: string;
  tier: GrammarCandidateTier;
  priority: number;
  index: number;
};



export const GRAMMAR_GENERATION_CANDIDATE_RULES: GrammarCandidateRule[] = [
  {
    code: "b",
    pattern: /\b(?:in|at|on|for|from|through|by|with)\s+which\b|\b(?:what|that|which|who|whom|whose|where|when)\b/gi,
    note: "관계사/명사절 접속사",
    trap: "선행사 유무, 뒤 절의 완전/불완전, 전치사+관계대명사 여부를 확인하게 함",
    mutationHint: "what <-> that/which, where <-> which, who/whom 격 오류",
    tier: "killer",
    priority: 10,
  },
  {
    code: "c",
    pattern: /\bwith\s+(?:the\s+)?[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,5}\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|made|seen|found)\b|\b(?:when|while|if|unless|once|although)\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|asked|seen)\b/gi,
    note: "with+O+분사 / 축약 부사절 분사",
    trap: "의미상 주어와 분사의 능동/수동 관계를 확인하게 함",
    mutationHint: "v-ing <-> p.p., being p.p. <-> p.p.",
    tier: "killer",
    priority: 10,
  },
  {
    code: "c",
    pattern: /\b[A-Za-z][A-Za-z'-]*(?:s)?\s+(?:called|known|based|made|used|given|left|seen|found|created|built|designed|involving|requiring|including|containing|leading|causing)\b/gi,
    note: "명사 뒤 분사 수식",
    trap: "수식받는 명사가 행위자인지 대상인지 확인하게 함",
    mutationHint: "p.p. <-> v-ing, reduced relative clause 오류",
    tier: "intermediate",
    priority: 8,
  },
  {
    code: "d",
    pattern: /\b(?:the number of|a number of|one of|each of|neither of|either of|percent of|half of|most of|the rest of)\b[^.;!?]{0,90}\b(?:is|are|was|were|has|have|do|does|seem|seems|require|requires|depend|depends|make|makes)\b/gi,
    note: "수량 표현/부분 표현 수일치",
    trap: "가까운 명사가 아니라 진짜 주어와 동사의 수를 확인하게 함",
    mutationHint: "singular verb <-> plural verb",
    tier: "intermediate",
    priority: 8,
  },
  {
    code: "d",
    pattern: /\b(?:[A-Za-z]+ing|What|That|Whether)\b[^.;!?]{10,110}\b(?:is|are|was|were|has|have|requires?|depends?|seems?)\b/gi,
    note: "긴 주어/절 주어 수일치",
    trap: "삽입구와 수식어를 걷어내고 주어 핵을 찾게 함",
    mutationHint: "verb+s <-> bare/plural verb, is <-> are",
    tier: "killer",
    priority: 9,
  },
  {
    code: "e",
    pattern: /\b(?:is|are|was|were|be|been|being|get|gets|got)\s+(?:[A-Za-z]+ed|known|made|seen|found|given|left|built|told|shown|used)\b|\b(?:occur|occurs|happen|happens|appear|appears|disappear|disappears|consist|consists|belong|belongs)\b/gi,
    note: "능동태/수동태 및 자동사 수동 불가",
    trap: "목적어 유무와 주어가 행위자인지 대상인지 확인하게 함",
    mutationHint: "active <-> passive, 자동사에 be p.p. 금지",
    tier: "intermediate",
    priority: 7,
  },
  {
    code: "f",
    pattern: /\b(?:seem|seems|look|looks|sound|sounds|feel|feels|remain|remains|keep|keeps|stay|stays|become|becomes|get|gets|grow|grows|make|makes|find|finds|leave|leaves|render|renders)\b[^.;!?]{0,55}\b[A-Za-z]+(?:ly)?\b|\b(?:hard|hardly|late|lately|high|highly|near|nearly|close|closely|most|mostly|costly|friendly|likely|lively)\b/gi,
    note: "형용사/부사 자리",
    trap: "보어 자리와 부사 수식 자리를 구분하게 함",
    mutationHint: "adjective <-> adverb, hard/hardly류 의미 차이",
    tier: "intermediate",
    priority: 8,
  },
  {
    code: "g",
    pattern: /\b(?:it|its|itself|they|them|their|theirs|themselves|one|ones|that|those|this|these)\b/gi,
    note: "대명사/지시어 일치",
    trap: "지시 대상의 수와 동일 대상 여부를 앞뒤 문맥에서 확인하게 함",
    mutationHint: "it <-> they, that <-> those, one <-> it",
    tier: "intermediate",
    priority: 6,
  },
  {
    code: "h",
    pattern: /\b(?:make|makes|made|have|has|had|let|lets|see|sees|hear|hears|watch|watches|notice|notices|enable|enables|allow|allows|cause|causes|force|forces|encourage|encourages|expect|expects)\b[^.;!?]{1,90}\b(?:to\s+)?[A-Za-z]+(?:ing|ed)?\b/gi,
    note: "목적격보어 형태",
    trap: "사역/지각/준사역 동사의 목적격보어 형태와 O-OC 관계를 확인하게 함",
    mutationHint: "bare infinitive <-> to-v, v-ing/p.p. 보어",
    tier: "intermediate",
    priority: 7,
  },
  {
    code: "i",
    pattern: /\b(?:both\s+[^.;!?]{1,80}\s+and|not only\s+[^.;!?]{1,100}\s+but(?:\s+also)?|either\s+[^.;!?]{1,80}\s+or|neither\s+[^.;!?]{1,80}\s+nor|from\s+[^.;!?]{1,60}\s+to|between\s+[^.;!?]{1,60}\s+and|rather than)\b/gi,
    note: "병렬/상관접속 구조",
    trap: "A와 B의 품사·구·절 형태를 멀리 떨어진 자리까지 맞춰 보게 함",
    mutationHint: "parallel form mismatch, omitted repeated to 오판 방지",
    tier: "killer",
    priority: 9,
  },
  {
    code: "k",
    pattern: /\b(?:spend|spends|spent)\b[^.;!?]{0,70}\b[A-Za-z]+ing\b|\b(?:look forward to|be used to|object to|contribute to|when it comes to|devoted to|committed to)\s+[A-Za-z]+ing\b|\b(?:remember|remembers|forget|forgets|regret|regrets|try|tries|stop|stops)\s+(?:to\s+)?[A-Za-z]+ing?\b/gi,
    note: "to부정사/동명사 선택",
    trap: "to가 전치사인지 부정사 표지인지, 동사별 의미 차이를 확인하게 함",
    mutationHint: "to-v <-> v-ing",
    tier: "intermediate",
    priority: 9,
  },
  {
    code: "l",
    pattern: /\b(?:because of|due to|despite|in spite of|although|though|even though|while|during)\b/gi,
    note: "전치사/접속사 선택",
    trap: "뒤에 명사구가 오는지 S+V 절이 오는지 확인하게 함",
    mutationHint: "because <-> because of, although <-> despite, while <-> during",
    tier: "basic",
    priority: 5,
  },
  {
    code: "m",
    pattern: /\b(?:as\s+[A-Za-z]+(?:\s+as)?|more\s+[A-Za-z]+|less\s+[A-Za-z]+|[A-Za-z]+er\s+than|the\s+more|the\s+less|than)\b/gi,
    note: "비교구문",
    trap: "as-as 어순, 비교급 수식어, 병렬 비교 대상을 확인하게 함",
    mutationHint: "as 형용사 as, than 비교 대상 병렬",
    tier: "intermediate",
    priority: 4,
  },
];



export function findGrammarGenerationCandidates(
  passage: string,
  requestedDifficulty?: string,
): GrammarGenerationCandidate[] {
  const candidates: GrammarGenerationCandidate[] = [];
  const seen = new Set<string>();

  for (const rule of GRAMMAR_GENERATION_CANDIDATE_RULES) {
    for (const match of passage.matchAll(rule.pattern)) {
      const rawExpression = normalizeText(match[0]);
      if (!rawExpression || rawExpression.length < 2) continue;
      // 후보 expression은 모델이 밑줄로 그대로 복사할 수 있으므로 짧게 유지한다
      // (긴 후보 → 긴 밑줄 유도). 최소 문법 단위 원칙과 일치.
      const expression =
        rawExpression.length > 60
          ? `${rawExpression.slice(0, 57).trim()}...`
          : rawExpression;
      const index = match.index ?? passage.indexOf(match[0]);
      if (index < 0) continue;
      const key = `${rule.code}:${normalizeComparableText(expression).slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        code: rule.code,
        expression,
        surroundingText: buildSurroundingWindow(passage, index, match[0].length),
        note: rule.note,
        trap: rule.trap,
        mutationHint: rule.mutationHint,
        tier: rule.tier,
        priority: rule.priority,
        index,
      });
    }
  }

  return candidates.sort((a, b) => (
    grammarCandidateScore(b, requestedDifficulty) -
    grammarCandidateScore(a, requestedDifficulty)
  ));
}



export function grammarCandidateScore(
  candidate: GrammarGenerationCandidate,
  requestedDifficulty?: string,
): number {
  const difficulty = String(requestedDifficulty ?? "").toUpperCase();
  const tierBonus =
    difficulty === "KILLER"
      ? candidate.tier === "killer" ? 5 : candidate.tier === "intermediate" ? 2 : -2
      : difficulty === "BASIC"
        ? candidate.tier === "basic" ? 4 : candidate.tier === "intermediate" ? 1 : -2
        : candidate.tier === "intermediate" ? 3 : candidate.tier === "killer" ? 1 : 0;
  const spanBonus = Math.min(3, Math.floor(countWordsForQuality(candidate.surroundingText) / 8));
  return candidate.priority + tierBonus + spanBonus;
}



export function buildGrammarSourceCandidateBlock(
  passage: string,
  requestedDifficulty: string | undefined,
  mode: "judgment" | "correction",
  limit = 14,
): string {
  const candidates = findGrammarGenerationCandidates(passage, requestedDifficulty).slice(0, limit);
  const difficulty = String(requestedDifficulty ?? "").toUpperCase();
  if (candidates.length === 0) {
    return [
      "## Source-backed grammar target candidates",
      "- No high-confidence grammar candidate was detected by heuristics. Still choose only exact expressions from the passage, and avoid article/spelling/tiny-preposition errors.",
    ].join("\n");
  }

  return [
    "## Source-backed grammar target candidates",
    "- Prefer answer and decoy targets from this list before inventing another location. Copy the expression from the original passage exactly; mutate only the answer expression.",
    mode === "correction"
      ? "- For GRAMMAR_CORRECTION, underline a wider clause/sentence containing the chosen candidate, not just the expression itself."
      : "- For GRAMMAR_ERROR, use these as marked expressions or nearby marked spans, keeping non-answer decoys grammatically correct.",
    difficulty === "KILLER"
      ? "- KILLER priority: first try candidates tagged tier=killer. Single-token finite/nonfinite flips, adjacent subject-verb agreement, or obvious verb+s changes are rejected unless the surrounding span also contains a long-distance clause, modifier, relation, or parallel-structure check."
      : difficulty === "BASIC"
        ? "- BASIC priority: choose a visible but still meaningful one-step grammar relation; avoid exotic reduced clauses as the answer."
        : "- INTERMEDIATE priority: choose at least one candidate whose trap requires checking clause boundary, semantic subject, or collocation.",
    ...candidates.map((candidate, index) => {
      const info = GRAMMAR_POINT_CATALOG[candidate.code];
      const preferredUse =
        difficulty === "KILLER" && candidate.tier === "killer"
          ? "answer-preferred"
          : candidate.tier === "basic" && difficulty !== "BASIC"
            ? "decoy-preferred"
            : "answer-or-decoy";
      return [
        `${index + 1}. code=(${candidate.code}) ${info.label}`,
        `tier=${candidate.tier}`,
        `use=${preferredUse}`,
        `expression="${escapePromptSnippet(candidate.expression)}"`,
        `trap="${escapePromptSnippet(candidate.trap)}"`,
        `mutation="${escapePromptSnippet(candidate.mutationHint)}"`,
        `context="${escapePromptSnippet(candidate.surroundingText)}"`,
      ].join(" | ");
    }),
  ].join("\n");
}



export function escapePromptSnippet(value: string): string {
  return normalizeText(value).replace(/"/g, "'");
}



export function buildGrammarErrorCandidateBlock(
  passage: string,
  requestedMarkerCount = 5,
  requestedAnswerCount = 1,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);
  const markedCount = normalizeGrammarMarkedCount(requestedMarkerCount);
  const answerCount = normalizeGrammarAnswerCount(requestedAnswerCount, markedCount);
  const labels = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"]
    .slice(0, markedCount)
    .join(" ");

  // 지문에 규범 논쟁 자리(복수 등위 주어 + 동격 each + 단수동사)가 있으면 구체
  // 인용으로 금지한다 — 추상 규칙만으로는 모델이 이 자리를 고집해 재시도를
  // 소모한다 (실측: attempts 12→30). 게이트(grammar-disputed-usage-target)의
  // 프롬프트 측 짝.
  const disputedSourceMatch = passage.match(
    /\b(?:and|or)\b[^.;]{0,80}?\beach\s+[A-Za-z]+s(?=[\s.,;])/i,
  );
  const disputedBanLine = disputedSourceMatch
    ? `- 🚫 절대 밑줄 금지 자리: 지문의 "...${disputedSourceMatch[0].slice(-60)}..." 구간(복수 등위 주어 + each + 동사 — 표준 규범과 실사용이 갈리는 논쟁 자리)에는 정답으로도 디코이로도 어떤 라벨도 배치하지 마세요. 이 자리를 밑줄 치면 문항이 거부됩니다.`
    : "";

  return [
    "## GRAMMAR_ERROR target planning guardrail",
    disputedBanLine,
    "- ⭐ Underline span = the minimal grammatical unit only (usually 1-3 words, never more than 5). expression/errorExpression IS the exact underlined surface, so keep it to the single token that carries the grammar decision (the verb / participle / relative word / pronoun / adjective-adverb / to-V / connector). NEVER underline a full clause (subject + finite verb + object) or a whole sentence — e.g. 'create', not 'these digital platforms create a trusting environment'.",
    "- ⭐ pointCode must be true to the underlined surface: the code's required token must actually appear inside the underline (b→relative word, c→participle -ing/p.p., k→to-V or -ing, g→pronoun, l→during/while/despite/because, m→comparative marker). Never fabricate a code just to fill decoy diversity.",
    `- The final item must contain ${markedCount} marked expression(s) labeled ${labels}.`,
    `- Exactly ${answerCount} marked expression(s) must be grammatically incorrect.`,
    answerCount >= 2
      ? "- In the direction, do not disclose the answer count; ask students to choose all grammatically incorrect parts using '모두'."
      : "- In the direction, use single-answer wording for one grammatically incorrect part.",
    "- If the requested answer count is lower than the marked count, keep the remaining labels grammatically correct as non-answer decoys. If it equals the marked count, every label must be intentionally incorrect and 오답 분석 can be empty.",
    "- Use the original passage as correct source text. For every answer, mutate only the marked expression and keep the original expression/correction verbatim.",
    "- If the passage has fewer source sentences than requested marked expressions, you may mark more than one expression in a sentence only when they test clearly different clauses or grammar relations.",
    requestedDifficulty === "KILLER"
      ? "- KILLER calibration: make the wrong forms look locally natural until the full sentence structure is checked. Do not use a lone main-verb/subject-verb/local -s error as the answer; it must require checking a relation, reduced clause, semantic subject, long modifier, complement pattern, or parallel range."
      : "",
    // 어법끝 28년 빈도 증류 가이드 — 정답 포인트 코어 풀 + 함정 디코이 카드 +
    // (다양성 모드) variantIndex 로테이션 정답 포인트 지정.
    // 핵심 집중 모드면 정답 포인트를 고빈출 톱셋(1000제 상위 6)으로 좁힌다.
    buildGrammarPointGuidance({
      variantIndex: diversity?.variantIndex,
      usedPointCodes: diversity?.usedPointCodes,
      diversityEnabled: diversity?.diversityEnabled,
      pointFocus: diversity?.pointFocus,
      answerCount,
      requestedDifficulty,
      mode: "judgment",
    }),
    buildGrammarSourceCandidateBlock(
      passage,
      requestedDifficulty,
      "judgment",
      Math.max(12, markedCount + 5),
    ),
    // 다양성 모드: 정답 밑줄의 호스트 문장도 로테이션 힌트로 지정 — 포인트만
    // 지정하면 같은 포인트를 받은 병렬 유닛들이 지문의 같은 '손쉬운 자리'로
    // 수렴한다 (실측: 고유 정답 표현 후퇴). 포인트 지시가 우선인 소프트 힌트.
    diversity?.diversityEnabled && sentences.length > 1
      ? (() => {
          const sentencePool = Math.min(sentences.length, 14);
          const vi =
            typeof diversity.variantIndex === "number" &&
            Number.isFinite(diversity.variantIndex)
              ? Math.max(0, Math.floor(diversity.variantIndex))
              : Math.floor(Math.random() * sentencePool);
          const target = (vi % sentencePool) + 1;
          return `⭐ 다양성 보조 지시: 정답(오류) 밑줄은 되도록 아래 문장 목록의 문장 ${target}에 배치하세요. 지정 포인트의 문법 구조가 그 문장에 없으면 이 문장 힌트는 무시하고 포인트 지시를 따르되, 매번 같은 표현을 오류로 만들지 마세요.`;
        })()
      : "",
    sentences.length
      ? "Detected passage sentences for target distribution:"
      : "No reliable sentence split was detected; still choose exact source expressions from the passage.",
    ...sentences.slice(0, 14).map((sentence, index) => `${index + 1}. ${sentence}`),
  ].filter(Boolean).join("\n");
}



/**
 * 네모 어법 후보 블록 — GRAMMAR_ERROR 가드레일 골격 + 기출 768문항 역설계
 * 조합 규칙(오답 믹스 single 1~2 / multi 1~3 / all 0~1, 슬롯 커버리지).
 */
export function buildGrammarChoiceComboCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);

  // GRAMMAR_ERROR 와 동일한 규범 논쟁 자리 구체 금지 — 콤보는 두 후보를 나란히
  // 보여줘 정답 시비 가능성이 더 크다.
  const disputedSourceMatch = passage.match(
    /\b(?:and|or)\b[^.;]{0,80}?\beach\s+[A-Za-z]+s(?=[\s.,;])/i,
  );
  const disputedBanLine = disputedSourceMatch
    ? `- 🚫 절대 네모 금지 자리: 지문의 "...${disputedSourceMatch[0].slice(-60)}..." 구간(복수 등위 주어 + each + 동사 — 표준 규범과 실사용이 갈리는 논쟁 자리)에는 네모를 만들지 마세요.`
    : "";

  // KILLER 는 하드 포인트(b/c/i) 2슬롯이 핵심 변별 장치 — 공유 가이드의 코어 풀
  // 로테이션 지정이 a/d/f 를 가리키면 캘리브레이션 라인과 충돌해 모델이 지정을
  // 따른다 (실측: killer1 에서 point-mix 경고 4/6). KILLER 는 지정을 여기서
  // 하드 우선으로 직접 발행하고, 공유 가이드는 카탈로그/함정 카드만 쓴다.
  const isKiller = requestedDifficulty === "KILLER";
  // pointFocus 면 정답 포인트가 고빈출 포커스셋(b/d/k/c/g/f — 병렬 i 제외)으로 제한된다.
  // 그때 하드풀에 i 를 두면 "i를 하드 정답으로" vs "i는 디코이만"이 모순되므로 i 를 뺀다.
  const comboPointFocus = !!diversity?.pointFocus;
  const killerDesignation = (() => {
    if (!isKiller) return "";
    const hardPool = comboPointFocus ? ["b", "c", "d"] : ["b", "c", "i"];
    const vi =
      typeof diversity?.variantIndex === "number" && Number.isFinite(diversity.variantIndex)
        ? Math.max(0, Math.floor(diversity.variantIndex))
        : 0;
    const first = hardPool[vi % hardPool.length];
    const second = hardPool[(vi + 1) % hardPool.length];
    const third = hardPool[(vi + 2) % hardPool.length];
    return `- ⭐ KILLER 네모 포인트 지정: 두 네모는 하드 포인트 (${first}) ${GRAMMAR_POINT_CATALOG[first as keyof typeof GRAMMAR_POINT_CATALOG].label}, (${second}) ${GRAMMAR_POINT_CATALOG[second as keyof typeof GRAMMAR_POINT_CATALOG].label} 에 배치하세요. 지문에 그 구조가 정말 없으면 (${third}) ${GRAMMAR_POINT_CATALOG[third as keyof typeof GRAMMAR_POINT_CATALOG].label} 로 대체하되, 하드 포인트(${hardPool.join("/")})가 두 네모 미만이면 안 됩니다. 남은 한 네모는 ${comboPointFocus ? "포커스셋의 다른 포인트" : "코어 풀의 다른 포인트"}를 사용하세요.`;
  })();

  return [
    "## GRAMMAR_CHOICE_COMBO target planning guardrail",
    disputedBanLine,
    "- The final item must contain exactly 3 boxed slots labeled (A) (B) (C), in three different sentences, each testing a different pointCode.",
    "- Each slot's correctExpression must be verbatim source text. The wrongExpression must be clearly ungrammatical in that exact position — never a tense-only change or a debatable stylistic preference.",
    "- 🚫 누설 금지: 네모로 만들 표현(올바른 후보든 틀린 후보든)과 동일한 단어/연어가 지문의 다른 곳에 무마킹으로 그대로 남아 있는 자리는 선택 금지 — 같은 문장의 평행구(예: 동일한 'composed of' 구조 반복)가 있으면 학생이 베껴 풉니다. 그런 자리는 피하고 다른 위치를 고르세요. 위반 시 문항이 거부됩니다.",
    "- Option mix: exactly one all-correct option; among the four wrong options use 1~2 options wrong in one slot, 1~3 options wrong in two slots, and at most 1 option wrong in all three slots. Every slot's wrongExpression must appear in at least one wrong option.",
    isKiller
      ? comboPointFocus
        ? "- KILLER calibration: at least two slots must test hard points (관계사 b, 분사 능/수동 c, 수일치 d), prefer long-distance dependencies (수식어구 건너 수일치, 관계사 절 경계 일치), and include at least two options wrong in two or more slots."
        : "- KILLER calibration: at least two slots must test hard points (관계사 b, 분사 능/수동 c, 병렬 i), prefer long-distance dependencies (수식어구 건너 수일치, 절 경계 너머 병렬), and include at least two options wrong in two or more slots."
      : "",
    killerDesignation,
    // 어법끝 빈도 가이드 — 세 슬롯 포인트 지정(answerCount=3 은 폴백 없는
    // 3포인트 지정) + 다양성 회피. KILLER 는 위의 하드 우선 지정이 대신한다.
    buildGrammarPointGuidance({
      variantIndex: diversity?.variantIndex,
      usedPointCodes: diversity?.usedPointCodes,
      diversityEnabled: isKiller ? false : diversity?.diversityEnabled,
      pointFocus: diversity?.pointFocus,
      answerCount: 3,
    }),
    sentences.length
      ? "Detected passage sentences for slot distribution (pick three different sentences):"
      : "No reliable sentence split was detected; still choose exact source expressions from the passage.",
    ...sentences.slice(0, 14).map((sentence, index) => `${index + 1}. ${sentence}`),
  ].filter(Boolean).join("\n");
}



export function buildGrammarCorrectionCandidateBlock(
  passage: string,
  requestedErrorCount?: number,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);
  const errorCount = normalizeGrammarCorrectionErrorCount(requestedErrorCount);

  return [
    "## GRAMMAR_CORRECTION target planning guardrail",
    `- Underline exactly ${errorCount} sentence-level or clause-level segment(s) from the original passage. A full sentence is ideal.`,
    `- Every underlined segment must contain a hidden grammar error. The underline count and error count are both ${errorCount}.`,
    "- Do not include grammatically correct extra underlined segments for GRAMMAR_CORRECTION.",
    "- Do NOT underline only the wrong word/form. The underlined sourceText must be wider than errorPart by at least several words.",
    "- sourceText must be an original passage segment. displayedText is sourceText after changing correctedPart into errorPart inside that segment.",
    "- correctAnswer must list every label and correctedPart in order, joined with comma + space. It must not be the full underlined segment.",
    "- correctedParts should list every corrected expression in the same order as underlinedSegments.",
    "- Do NOT print a separate error sentence below the passage. The visible question must show the original passage with the wider underlined segment(s).",
    "- Use wording like \"다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.\"",
    // 다양성(반복 생성) 모드 한정 품질 가드 — 지문의 깨끗한 오류 자리가
    // 고갈되는 천장 부근에서 모델이 '깨진 새 문항'(정답시비·조작된 교정)을
    // 양산하는 것을 막는다. 캡 없이 꼬리를 '유효한 반복'으로 흡수. baseline
    // 경로는 이 가드를 받지 않아 동작 불변. (E2E 검증 short-dedup 회귀 대응)
    diversity?.diversityEnabled
      ? [
          "- ⭐ 다양성 한계 가드(반복 생성 시 품질 우선): 변별의 핵심은 '새로운 오류 자리'가 아니라 '명백한 단일 오류'다. 지문에 더 이상 명백하고 논쟁 없는 오류 자리가 남지 않았으면, 모호한 새 자리를 억지로 만들지 말고 앞서 쓴 명백한 오류 자리를 다른 문장·다른 밑줄 범위·다른 해설로 재사용하라. 깨진 새 문항보다 유효한 반복이 낫다.",
          "- 🚫 다음 자리는 정답시비를 유발하므로 새 오류 타깃으로 쓰지 마라: (1) 'and + 동사'가 동명사 병렬로도 정동사 병렬로도 읽히는 자리(예: tried wearing X and turning↔turned Y), (2) one/it/that 등으로 바꿔도 양쪽이 자연스러운 대명사 자리, (3) 능동/수동·시제가 문맥상 양쪽 다 허용되는 자리.",
          "- 🚫 correctedPart 무결성: correctedPart 는 네가 errorPart 로 바꾸기 전 sourceText 원문에 실제로 있던 바로 그 단어(들)여야 한다. 원문에도 errorPart 에도 없는 제3의 단어를 정답으로 만들지 마라 — displayedText 에 correctedPart 를 도로 넣으면 정확히 sourceText 가 되어야 한다.",
        ].join("\n")
      : "",
    buildGrammarPointGuidance({
      variantIndex: diversity?.variantIndex,
      usedPointCodes: diversity?.usedPointCodes,
      diversityEnabled: diversity?.diversityEnabled,
      pointFocus: diversity?.pointFocus,
      answerCount: errorCount,
      requestedDifficulty,
      mode: "correction",
    }),
    buildGrammarSourceCandidateBlock(
      passage,
      requestedDifficulty,
      "correction",
      Math.max(12, errorCount + 6),
    ),
    "- Avoid padding with articles, tiny prepositions, punctuation, spelling-only changes, optional style improvements, or debatable active/passive infinitive preferences such as to gain vs to be gained.",
    requestedDifficulty === "KILLER"
      ? "- KILLER calibration: use a long enough underlined clause/sentence that students must inspect structure, not just spot a visibly odd token."
      : "",
    sentences.length
      ? "Detected source sentences. Prefer one of these as sourceText:"
      : "No reliable sentence split was detected; still choose an exact sentence/clause segment from the passage.",
    ...sentences.slice(0, 14).map((sentence, index) => `${index + 1}. ${sentence}`),
  ].filter(Boolean).join("\n");
}
