// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { buildGrammarPointGuidance, GRAMMAR_POINT_CATALOG, type GrammarPointCode } from "@/lib/grammar-point-catalog";
import { buildGrammarFrameKnowledge } from "@/lib/grammar-frames";
import { extractContainingSentence, hasLongDistanceAgreementBeforeTarget } from "../validators/grammar/shared";
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
  /** 지문 내 문장 서수(1-기반, 원문 구두점 분할 기준) — 배치 결정론 힌트용. */
  sentenceOrdinal: number;
  /** 후보 시작 오프셋의 지문 내 상대 위치(0~1). */
  relativePosition: number;
  /** 첫문장(문장 3개 이상 지문)·지문 앞 20% 자리 — 정답(오류) 부적합, 미끼 전용 결정론 표기. */
  earlyPositionDecoyOnly: boolean;
};


export function buildGrammarNineFrameGuide(
  mode: "judgment" | "correction" | "worksheet",
  requestedDifficulty?: string,
): string {
  const difficulty = String(requestedDifficulty ?? "").toUpperCase();

  return [
    // 9프레임 본문(구조 틀·판단·오류 설계·킬러 승격·해설 근거)은 grammar-frames.ts 정본.
    buildGrammarFrameKnowledge(mode, requestedDifficulty),
    difficulty === "KILLER"
      ? "- KILLER 캘리브레이션: 정답은 장거리·절 경계 판단을 강제해야 한다. 단독 -s 플립, 관사, 철자, 시제 단독, 한눈에 보이는 로컬 오류는 KILLER 미달이다."
      : difficulty === "BASIC"
        ? "- BASIC 캘리브레이션: 1-step 판단이어도 실재하는 문법 관계와 그럴듯한 함정이 필요하다. 양보 도치·의미상 주어 동명사·수동 병렬 같은 고급 프레임을 한 문항에 쌓지 말 것."
        : "- INTERMEDIATE 캘리브레이션: 절 경계, 의미상 주어, 보어 자리, 수식 범위 중 하나 이상을 확인해야 풀리게 설계한다.",
    "- 좋은 함정은 로컬로는 자연스러워 보이지만 프레임(구조 틀)을 대면 무너진다. 장식용 표면(관사·단순 전치사·어휘 형용사·비교 조각·담화 표지)에 밑줄을 긋거나 'it are'·'them pushes'·'before to flow' 같은 로컬 파열 오류를 만들지 말 것.",
  ].join("\n");
}



export const GRAMMAR_GENERATION_CANDIDATE_RULES: GrammarCandidateRule[] = [
  {
    code: "g",
    pattern: /\b(?:make|makes|made|find|finds|found|think|thinks|thought|consider|considers|considered)\s+it\s+(?:possible|impossible|easy|easier|hard|harder|difficult|necessary|important|clear|natural|useful|safe|risky|obvious|worthwhile|likely|unlikely|essential|reasonable)\s+(?:for\s+[A-Za-z][^.;!?]{0,50}\s+)?(?:to\s+[A-Za-z][A-Za-z'-]*|that\b)/gi,
    note: "Dummy-object it + object complement + real object",
    trap: "The it slot is a dummy object, not a demonstrative; the following adjective/noun complement points to the delayed to-V/that real object.",
    mutationHint: "it <-> this/that, or adjective object-complement <-> adverb",
    tier: "killer",
    priority: 11,
  },
  {
    code: "d",
    pattern: /\b(?:never|rarely|seldom|little|hardly|scarcely|only\s+(?:then|after|when|by|in|with)|not only|no sooner|under no circumstances|at no time|in no way)\b[^.;!?]{0,140}\b(?:am|is|are|was|were|do|does|did|have|has|had|can|could|should|would|will|may|might|must)\s+[A-Za-z][A-Za-z'-]*/gi,
    note: "Negative/restrictive fronting with inversion",
    trap: "A fronted negative or restrictive phrase requires inverted auxiliary/be/do order, and the auxiliary may still need agreement with the true subject.",
    mutationHint: "auxiliary order/agreement: Never have <-> Never has, Not only does <-> Not only do, Only then did <-> Only then does",
    tier: "killer",
    priority: 11,
  },
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
    pattern: /\b(?:is|are|was|were|be|been|being|get|gets|got)\s+(?:[A-Za-z]+ed|known|made|seen|found|given|left|built|told|shown|used)\b/gi,
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


function isNoisyGrammarGenerationCandidate(
  candidate: Pick<GrammarGenerationCandidate, "expression" | "surroundingText" | "tier">,
  requestedDifficulty?: string,
): boolean {
  const difficulty = String(requestedDifficulty ?? "").toUpperCase();
  const expression = normalizeComparableText(candidate.expression);
  const surroundingText = normalizeText(candidate.surroundingText);

  if (difficulty === "BASIC" && candidate.tier === "killer") return true;
  if (
    difficulty === "BASIC" &&
    /^(?:clear|perfect)$/.test(expression) &&
    /\bclear\s+and\s+perfect\s+as\s+it\s+might\s+appear\b/i.test(surroundingText)
  ) {
    return true;
  }
  // (26-07-06) 부정어 도치 규칙(코드 d)이 mid-sentence 자유관계절 목적어
  // ("guided only by what a single ant can sense")를 부정어-도치 트랩으로
  // 오분류해 잘못된 mutation("Never have↔Never has")과 함께 후보로 추천하는
  // 케이스를 제거한다. 실제 도치가 아니고("by/in/with + what/which"는 전치사구
  // 목적어), 관계사·명사절 프레임 자체는 코드 b 후보가 이미 커버하므로 프레임
  // 커버리지는 불변 — 오분류 표기만 걷어내는 정합 필터다.
  if (/^only\s+(?:by|in|with)\s+(?:what|which)\b/i.test(expression)) return true;
  if (/^(?:hard|quite|more|misshapen|given|thicker|both liquid and|as one)$/.test(expression)) return true;
  if (expression === "as it") return true;
  if (/^(?:one|ones|this|these|those)$/.test(expression)) return true;
  if (expression === "as a") return true;
  if (/^looks?\s+more\s+like$/.test(expression)) return true;
  if (/^seems?\s+to\s+[a-z]+$/.test(expression)) return true;
  if (
    /^to\s+[a-z]+$/.test(expression) &&
    new RegExp(`\\bseems?\\s+${expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(surroundingText)
  ) {
    return true;
  }
  if (/^looks?$/.test(expression) && /\blooks?\s+more\s+like\b/i.test(surroundingText)) return true;
  if (/^seems?$/.test(expression) && /\bseems?\s+to\s+[a-z]/i.test(surroundingText)) return true;
  if (expression === "though" && /\bthough\s*,/i.test(surroundingText)) return true;
  if (
    /^(?:despite|in spite of|because of|due to|without|with)$/.test(expression) &&
    /\b(?:despite|in spite of|because of|due to|without|with)\s+it\s+being\b/i.test(surroundingText)
  ) {
    return true;
  }
  if (expression === "being" && /\b(?:despite|in spite of|because of|due to|without|with)\s+it\s+being\b/i.test(surroundingText)) {
    return true;
  }
  if (expression === "depends" && /\b(?:term|mess|thing|fact|answer|result)\b[^.;!?]{0,80}\bdepends\s+on\b/i.test(surroundingText)) {
    return true;
  }
  if (/^(?:who|whom)$/.test(expression) && /\bwho\s+(?:you(?:'re|\s+are)?\s+)?asking\b/i.test(surroundingText)) {
    return true;
  }
  if (/^(?:why|how)$/.test(expression) && /\b(?:why|how)\b[^.;!?]{0,120}\bthe\s+way\b/i.test(surroundingText)) {
    return true;
  }
  if (expression === "than" && /\b(?:more|less|fewer|greater|smaller|larger|better|worse|higher|lower|thicker|thinner|older|younger|rather)\b[^.;!?]{0,90}\bthan\b/i.test(surroundingText)) {
    return true;
  }
  if (
    /^(?:they|these|those|we|it|this|that|he|she)$/.test(expression) &&
    new RegExp(`\\b${expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(?:is|are|was|were|has|have|do|does)\\b`, "i").test(surroundingText)
  ) {
    return true;
  }
  if (expression === "it" && /\b(?:as\s+it\s+might\s+appear|the\s+way\s+it\s+does)\b/i.test(surroundingText)) {
    return true;
  }
  if (expression === "that" && /\bthat\s+way\b/i.test(surroundingText)) {
    return true;
  }
  if (/^it'?s$/.test(expression)) return true;
  if (expression === "uneven" && /\b(?:is|are|was|were|be|been|being|seem|seems|look|looks|become|becomes)\s+uneven\b/i.test(surroundingText)) {
    return true;
  }
  if (/\bsinking\b/.test(expression) && /\bglass\s+is\s+slowly\s+sinking\b/i.test(surroundingText)) {
    return true;
  }
  if (/\bappear(?:s|ed)?\b/.test(expression) && /\bas\s+it\s+might\s+appear\b/i.test(surroundingText)) {
    return true;
  }
  if (
    /^(?:is|are|was|were)\s+[a-z]+(?:ed|en|own)$/.test(expression) &&
    new RegExp(`\\b(?:it|they|he|she|we|you)\\s+${expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(surroundingText)
  ) {
    return true;
  }
  return false;
}

export type ForbiddenGrammarSurface = {
  expression: string;
  reason: string;
};

function findForbiddenGrammarSurfaces(passage: string): ForbiddenGrammarSurface[] {
  const normalizedPassage = normalizeText(passage);
  const forbidden: ForbiddenGrammarSurface[] = [];
  const seen = new Set<string>();
  const push = (expression: string, reason: string) => {
    const normalizedExpression = normalizeText(expression);
    const key = normalizeComparableText(normalizedExpression);
    if (!normalizedExpression || seen.has(key)) return;
    seen.add(key);
    forbidden.push({ expression: normalizedExpression, reason });
  };

  for (const match of normalizedPassage.matchAll(/\blooks?\s+more\s+like\b/gi)) {
    push(match[0], "lexical/comparison surface, not a clean school grammar target");
    push(match[0].match(/\blooks?\b/i)?.[0] ?? "looks", "look(s) inside looks more like is a lexical comparison decoy");
    push("more", "filler comparative token inside looks more like");
  }
  for (const match of normalizedPassage.matchAll(/\bseems?\s+to\s+[A-Za-z][A-Za-z'-]*\b/gi)) {
    push(match[0], "seem + to-infinitive is a shallow checklist decoy here");
    push(match[0].replace(/^[A-Za-z]+\s+/, ""), "to-infinitive inside seems to V is not a meaningful decoy by itself");
  }
  if (/\bthough\s*,/i.test(normalizedPassage)) {
    push("though", "discourse-adverb though with comma invites syntax disputes");
  }
  if (/\b(?:term|mess|thing|fact|answer|result)\b[^.;!?]{0,80}\bdepends\s+on\s+who\s+(?:you(?:'re|\s+are)\s+)?asking\b/i.test(normalizedPassage)) {
    push("depends", "simple depends-on agreement/checklist surface");
    push("who", "who you are asking is a semantic/person decoy, not a clean grammar frame");
  }
  if (/\b(?:an?\s+)?imperceptibly\s+viscous\s+one\b/i.test(normalizedPassage)) {
    push("one", "nearby pronoun reference is too local as a decoy");
  }
  if (/\bthose\s+misshapen\s+sheets\b/i.test(normalizedPassage)) {
    push("Those", "demonstrative before its noun is too local as a decoy");
  }
  for (const match of normalizedPassage.matchAll(/\b(?:they|these|those|we)\s+(?:are|were|have|do)\b/gi)) {
    const pronoun = match[0].match(/\b(?:they|these|those|we)\b/i)?.[0];
    if (pronoun) push(pronoun, "local plural pronoun before an auxiliary creates obvious it-are style mutations");
  }
  if (/\bthey\s+were\s+blown\b/i.test(normalizedPassage)) {
    push("were blown", "nearby pronoun + passive phrase is too shallow as a decoy");
  }
  for (const match of normalizedPassage.matchAll(/\b(?:more|less|fewer|greater|smaller|larger|better|worse|higher|lower|thicker|thinner|older|younger|rather)\b[^.;!?]{0,90}\bthan\b/gi)) {
    if (/\bthan\b/i.test(match[0])) {
      push("than", "standalone comparative than is a filler decoy unless the full comparative frame is tested");
    }
  }
  for (const match of normalizedPassage.matchAll(/\b(?:why|how)\b[^.;!?]{0,120}\bthe\s+way\b/gi)) {
    const head = match[0].match(/\b(?:why|how)\b/i)?.[0];
    if (head) push(head, "how/why near the way is semantic or collocational, not a grammar target");
  }
  if (/\bas\s+it\s+might\s+appear\b/i.test(normalizedPassage)) {
    push("Clear", "fronted concessive adjective is too advanced as a BASIC decoy");
    push("perfect", "fronted concessive adjective is too advanced as a BASIC decoy");
    push("it", "local pronoun inside concessive as it might appear is a decorative decoy");
    push("as it", "mixed connector+pronoun span");
    push("appear", "as it might appear is not a passive/adverb target");
  }
  if (/\bthat\s+way\b/i.test(normalizedPassage)) {
    push("that", "demonstrative in that way is a decorative decoy, not a real grammar frame");
  }
  if (/\bit\s+(?:is|was|has|does)\b|\bit's\b/i.test(normalizedPassage)) {
    push("it", "local it + be/auxiliary is too shallow unless it is a true dummy-object frame");
  }
  if (/\bthe\s+way\s+it\s+does\b/i.test(normalizedPassage)) {
    push("it", "local pronoun in the way it does is too shallow as a decoy");
    push("does", "do-support in the way it does is too local unless it is the actual tested answer");
  }
  if (/\b(?:former|latter)\b/i.test(normalizedPassage)) {
    push("latter", "former/latter is a lexical reference target, not a grammar frame");
  }
  for (const match of normalizedPassage.matchAll(/\bAs\s+one\b/gi)) {
    push(match[0], "discourse/reporting phrase starter is not a grammar target");
  }
  if (/\bit(?:'s|\s+is)\s+not\s+a\s+solid\b/i.test(normalizedPassage)) {
    push("it's", "contraction in it's not a solid is a low-value decoy");
  }
  if (/\b(?:is|are|was|were|be|been|being|seem|seems|look|looks|become|becomes)\s+uneven\b/i.test(normalizedPassage)) {
    push("uneven", "simple predicate adjective is too local as a decoy");
  }
  if (/\bglass\s+is\s+slowly\s+sinking\b/i.test(normalizedPassage)) {
    push("sinking", "sink passive/active preference is debatable here");
  }
  if (/\b(?:despite|in spite of|because of|due to|without|with)\s+it\s+being\b/i.test(normalizedPassage)) {
    push("despite", "despite it being creates a formal its-being dispute");
    push("being", "it being after a preposition is a noisy formal-register decoy");
  }
  if (/\bboth\s+liquid\s+and\b/i.test(normalizedPassage)) {
    push("both liquid and", "shallow correlative fragment");
  }
  if (/\bas\s+a\b/i.test(normalizedPassage)) {
    push("as a", "tiny preposition/article chunk");
  }
  if (/\bthicker\b/i.test(normalizedPassage)) {
    push("thicker", "bare comparative adjective filler");
  }
  if (/\bwere\b[^.;!?]{0,80}\band\s+solidified\b/i.test(normalizedPassage)) {
    push("solidified", "same-clause parallel/tense-only trap is too local");
  }
  // 지각동사(+help) + 목적어 + to-V — to를 지우면 지각동사 보어(원형)로,
  // 두면 명사+to-V 수식으로 읽혀 어느 방향의 변형도 정문이 되는 무정답 자리
  // (실측 26-07-04: "We see the ... power of AI to broaden" → broaden 정문).
  for (const match of normalizedPassage.matchAll(
    /\b(?:sees?|saw|seen|seeing|watch(?:es|ed|ing)?|hear(?:s|d|ing)?|feels?|felt|notices?|noticed|observes?|observed|helps?|helped)\b[^.;:!?]{1,80}?\b(to\s+[A-Za-z][A-Za-z'-]*)\b/gi,
  )) {
    push(
      match[1],
      "verbal after a perception/help verb re-parses as a valid complement with or without to — no single wrong form exists here",
    );
  }

  return forbidden;
}

function buildForbiddenGrammarSurfaceBlock(passage: string): string {
  const forbidden = findForbiddenGrammarSurfaces(passage);
  if (forbidden.length === 0) return "";
  return [
    "## Forbidden grammar target surfaces detected in this passage",
    "- These exact source surfaces are tempting but low-quality. Do not underline them, do not mutate them, and do not use them as non-answer decoys. If any appears in markedExpressions, the item will be rejected.",
    ...forbidden.slice(0, 30).map((item) =>
      `- "${escapePromptSnippet(item.expression)}" -- ${escapePromptSnippet(item.reason)}`,
    ),
  ].join("\n");
}



/**
 * 긴 후보 표면을 잘라 노출할 때 단어를 중간에서 끊지 않는다. maxChars 이내의
 * 마지막 공백(단어 경계)에서 자르되, 경계가 없거나 너무 앞이면 문자 슬라이스로
 * 폴백한다(단, 그 폴백 자체는 드묾 — 영어 산문은 공백이 잦다).
 */
function truncateGrammarExpressionAtWord(raw: string, maxChars: number): string {
  const head = raw.slice(0, maxChars);
  const lastBoundary = head.lastIndexOf(" ");
  const cleanHead = lastBoundary >= Math.floor(maxChars / 3) ? head.slice(0, lastBoundary) : head;
  return cleanHead.trim();
}

// 원문 오프셋 기준 문장 경계 — passage-sentence-utils 의 분할 정규식을 원문에
// 그대로 적용해 각 문장의 끝 오프셋을 얻는다(공백 정규화 없이 오프셋 보존).
// 배치 결정론 힌트(26-07-14 round-1 ③: 첫문장/전반부 후보 = 미끼 전용)용.
const GRAMMAR_SENTENCE_RANGE_RE = /[^.!?]+[.!?]+[”’'")\]]*(?=\s|$)/g;

function computeGrammarSentenceEndOffsets(passage: string): number[] {
  const ends: number[] = [];
  for (const match of passage.matchAll(GRAMMAR_SENTENCE_RANGE_RE)) {
    ends.push((match.index ?? 0) + match[0].length);
  }
  return ends.length ? ends : [passage.length];
}

export function findGrammarGenerationCandidates(
  passage: string,
  requestedDifficulty?: string,
): GrammarGenerationCandidate[] {
  const candidates: GrammarGenerationCandidate[] = [];
  const seen = new Set<string>();
  const sentenceEnds = computeGrammarSentenceEndOffsets(passage);

  for (const rule of GRAMMAR_GENERATION_CANDIDATE_RULES) {
    for (const match of passage.matchAll(rule.pattern)) {
      const rawExpression = normalizeText(match[0]);
      if (!rawExpression || rawExpression.length < 2) continue;
      // 후보 expression은 모델이 밑줄로 그대로 복사할 수 있으므로 짧게 유지한다
      // (긴 후보 → 긴 밑줄 유도). 최소 문법 단위 원칙과 일치. 잘라낼 때는
      // 단어 중간("...biolo...")이 아니라 마지막 완전한 단어 경계에서 자른다.
      const expression =
        rawExpression.length > 60
          ? `${truncateGrammarExpressionAtWord(rawExpression, 57)}...`
          : rawExpression;
      const index = match.index ?? passage.indexOf(match[0]);
      if (index < 0) continue;
      const surroundingText = buildSurroundingWindow(passage, index, match[0].length);
      if (
        isNoisyGrammarGenerationCandidate(
          { expression, surroundingText, tier: rule.tier },
          requestedDifficulty,
        )
      ) {
        continue;
      }
      const key = `${rule.code}:${normalizeComparableText(expression).slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // 배치 결정론(26-07-14): 후보의 문장 서수·상대위치를 원문 오프셋으로 계산해
      // 데이터에 심는다. 첫문장(스캔 즉답) 또는 지문 앞 20% 이전 후보는 정답
      // 부적합(미끼 전용)으로 표기한다. 첫문장 규칙은 문장 3개 이상 지문에서만 —
      // 1~2문장 지문에서 후보 풀 대부분을 표기하면 되레 혼선(실패 위험)이라 20%
      // 규칙만 남긴다. 후보 제거가 아니라 표기라 실패율 영향 0.
      const sentenceOrdinal = (() => {
        for (let i = 0; i < sentenceEnds.length; i += 1) {
          if (index < sentenceEnds[i]) return i + 1;
        }
        return sentenceEnds.length;
      })();
      const relativePosition = passage.length > 0 ? index / passage.length : 0;
      const earlyPositionDecoyOnly =
        relativePosition < 0.2 || (sentenceEnds.length >= 3 && sentenceOrdinal === 1);
      candidates.push({
        code: rule.code,
        expression,
        surroundingText,
        note: rule.note,
        trap: rule.trap,
        mutationHint: rule.mutationHint,
        tier: rule.tier,
        priority: rule.priority,
        index,
        sentenceOrdinal,
        relativePosition,
        earlyPositionDecoyOnly,
      });
    }
  }

  return candidates.sort((a, b) => {
    // 배치 결정론(26-07-14): 첫문장/전반부(앞 20%) 후보는 정답 부적합(미끼 전용)
    // 이라 뒤로 보낸다 — KILLER STEP 1 이 목록 상단부터 정답 자리를 걷으므로
    // 20% 이후 후보가 먼저 온다. 같은 그룹 안에서는 기존 점수순 유지.
    if (a.earlyPositionDecoyOnly !== b.earlyPositionDecoyOnly) {
      return a.earlyPositionDecoyOnly ? 1 : -1;
    }
    return (
      grammarCandidateScore(b, requestedDifficulty) -
      grammarCandidateScore(a, requestedDifficulty)
    );
  });
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



/**
 * 금지 표면·구두점 파편을 걷어낸 "실사용 가능" 후보만 남긴다.
 *
 * 배경(실측 26-07-04, glass 지문): 정규식 후보 탐지기가 그 지문의 금지 표면
 * ("looks more like ...", "seems to obey", "asking: ...", "that way ...")을
 * 그대로 후보로 추천 — 프롬프트가 "이 자리를 우선 써라"와 "이 표면은 금지"를
 * 동시에 말하는 자기모순으로 모델이 게이트 거부 루프에 갇혔다. 후보 목록을
 * 금지 표면과 동일한 기준으로 필터링해 모순을 제거한다.
 */
export function selectUsableGrammarCandidates(
  passage: string,
  requestedDifficulty?: string,
): { candidates: GrammarGenerationCandidate[]; forbidden: ForbiddenGrammarSurface[] } {
  const forbidden = findForbiddenGrammarSurfaces(passage);
  const forbiddenKeys = forbidden.map((item) => normalizeComparableText(item.expression));
  const usable = findGrammarGenerationCandidates(passage, requestedDifficulty).filter(
    (candidate) => {
      // 게이트(grammar-underline-punctuated-fragment)가 거부하는 구두점 포함
      // 스팬은 후보로도 주지 않는다.
      if (/[,;:]/.test(candidate.expression)) return false;
      const key = normalizeComparableText(candidate.expression);
      if (!key) return false;
      // 금지 표면과 단어 경계 기준 상호 포함이면 제외.
      return !forbiddenKeys.some((forbiddenKey) => {
        if (!forbiddenKey) return false;
        if (key === forbiddenKey) return true;
        const shorter = key.length <= forbiddenKey.length ? key : forbiddenKey;
        const longer = key.length <= forbiddenKey.length ? forbiddenKey : key;
        return new RegExp(
          `(?<![a-z0-9'-])${shorter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9'-])`,
          "i",
        ).test(longer);
      });
    },
  );
  return { candidates: usable, forbidden };
}

export function buildGrammarSourceCandidateBlock(
  passage: string,
  requestedDifficulty: string | undefined,
  mode: "judgment" | "correction",
  limit = 14,
): string {
  const forbiddenSurfaceBlock = buildForbiddenGrammarSurfaceBlock(passage);
  const candidates = selectGrammarCandidatesForPrompt(
    selectUsableGrammarCandidates(passage, requestedDifficulty).candidates,
    limit,
  );
  const difficulty = String(requestedDifficulty ?? "").toUpperCase();
  if (candidates.length === 0) {
    return [
      "## Source-backed grammar target candidates",
      forbiddenSurfaceBlock,
      "- No high-confidence grammar candidate was detected by heuristics. Still choose only exact expressions from the passage, and avoid article/spelling/tiny-preposition errors.",
    ].filter(Boolean).join("\n");
  }

  return [
    "## Source-backed grammar target candidates",
    forbiddenSurfaceBlock,
    "- Prefer answer and decoy targets from this list before inventing another location. Copy the expression from the original passage exactly; mutate only the answer expression.",
    mode === "correction"
      ? "- For GRAMMAR_CORRECTION, underline a wider clause/sentence containing the chosen candidate, not just the expression itself."
      : "- For GRAMMAR_ERROR, use these as marked expressions or nearby marked spans, keeping non-answer decoys grammatically correct.",
    mode === "judgment"
      ? "- For GRAMMAR_ERROR, every marked expression must be a real decision point. A correct decoy is still a tested grammar frame, not a decorative word, lexical adjective, pronoun, comparative particle, or local auxiliary."
      : "",
    // 배치 결정론(26-07-14): 첫문장/전반부 후보의 미끼 전용 표기를 읽는 법 —
    // 후보 데이터(use=/position=)에 심긴 신호의 범례. 정답은 20% 이후 자리 우선.
    mode === "judgment" && candidates.some((candidate) => candidate.earlyPositionDecoyOnly)
      ? "- Position discipline: candidates marked 미끼 전용(정답 부적합: 첫문장/전반부) sit in the first sentence or the first 20% of the passage — a first-glance scan answer. Never place the answer (error) on them; use them only as correct decoys. Choose the answer among candidates at or beyond the 20% mark (the list is already sorted that way; see each candidate's position= field)."
      : "",
    difficulty === "KILLER"
      ? "- KILLER priority: first try candidates tagged tier=killer. Single-token finite/nonfinite flips, adjacent subject-verb agreement, or obvious verb+s changes are rejected unless the surrounding span also contains a long-distance clause, modifier, relation, or parallel-structure check."
      : difficulty === "BASIC"
        ? "- BASIC priority: choose a visible but still meaningful one-step grammar relation; avoid exotic reduced clauses as the answer."
        : "- INTERMEDIATE priority: choose at least one candidate whose trap requires checking clause boundary, semantic subject, or collocation.",
    // (26-07-06 2차: "5자리 지정 설계" 실험은 기각·원복 — 다지문 재측정에서
    // ST-K 63→56. 후보 탐지기의 tier 라벨이 얕은 자리를 killer 로 태깅하면 지정이
    // 그 자리를 고정해 재시도가 전부 같은 나쁜 자리를 렌더 → 구제 출하 38점.
    // 모델의 자리 선택 자유(STEP 1 톱다운 + 게이트 압박)가 결정론 지정보다 낫다.)
    // KILLER 설계 순서 — 실측 26-07-06(스모크 KILLER 4/4의 마지막 strict 거절이
    // grammar-killer-answer-point-repeated): 제약 나열만으론 모델이 정답 코드와
    // 같은 코드의 자리를 디코이로 고른다. "정답 먼저 → 코드 X 기록 → 디코이는
    // X 금지 → 자기검증"의 절차를 명시해 자리 선택 단계에서 충돌을 제거한다.
    difficulty === "KILLER" && mode === "judgment"
      ? [
          "- ⭐ KILLER design order (follow these steps in this exact order):",
          "  STEP 1 — Choose the ANSWER site first: walk the candidate list below from the top and take the FIRST tier=killer candidate whose mutation (follow its mutation= hint) survives the counter-parse check (no alternative reading makes the mutated form grammatical). Do not settle for a shallower or more mechanical site further down while a higher-listed killer candidate is usable — the list is sorted by answer quality. The answer must sit inside a structurally layered sentence and require a long-distance dependency (true subject head across modifiers ↔ verb / antecedent ↔ relative clause / semantic subject ↔ participle / first parallel item onward). A single-token participle-adjective swap before a noun or a locally-resolvable flip is rejected as the answer.",
          "  STEP 2 — Write down the answer's pointCode X. Every non-answer underline must then use a pointCode DIFFERENT from X. If another candidate in this list shares code X — even a tempting one — do not underline it at all; place that decoy on a different grammar frame instead. A KILLER item that repeats the answer's code in any decoy is rejected whole.",
          "  STEP 3 — Self-check before returning JSON: (i) no non-answer label carries pointCode X; (ii) the five underlines span at least 3 distinct pointCodes with at most 2 per code; (iii) the answer's surroundingText quotes the full dependency span from the source (10+ words); (iv) every decoy is defensibly correct and structurally meaningful, not a decorative token; (v) no underlined surface appears in the forbidden-surface list above — if one does, relocate it before returning.",
        ].join("\n")
      : "",
    ...(() => {
      const killerCodeSeen = new Map<GrammarPointCode, number>();
      return candidates.map((candidate, index) => {
      const info = GRAMMAR_POINT_CATALOG[candidate.code];
      const killerSeen = killerCodeSeen.get(candidate.code) ?? 0;
      // 배치 결정론(26-07-14): 첫문장/전반부 후보는 정답 부적합 — 미끼 전용 표기가
      // answer-preferred 지정보다 우선한다(교정형은 밑줄 전부가 오류라 디코이
      // 개념이 없으므로 judgment 만). answer-preferred 로 세지도 않아, 같은 코드의
      // 후속 killer 후보가 정상적으로 answer-preferred 를 받는다.
      const earlyDecoyOnly = mode === "judgment" && candidate.earlyPositionDecoyOnly;
      if (difficulty === "KILLER" && candidate.tier === "killer" && !earlyDecoyOnly) {
        killerCodeSeen.set(candidate.code, killerSeen + 1);
      }
      const preferredUse = earlyDecoyOnly
        ? difficulty === "KILLER" && candidate.tier === "killer" && killerSeen > 0
          // 미끼 전용이라도 정답과 같은 코드로 나란히 밑줄하면 answer-point-repeated
          // 로 거부되는 것은 동일 — 두 신호를 함께 인쇄한다.
          ? "decoy-only — 미끼 전용(정답 부적합: 첫문장/전반부) · never underline this as a decoy while the answer uses the same code"
          : "decoy-only — 미끼 전용(정답 부적합: 첫문장/전반부)"
        : difficulty === "KILLER" && candidate.tier === "killer"
          ? killerSeen > 0
            // 같은 코드의 killer 후보가 이미 answer-preferred 로 나열됐다면, 이
            // 후보를 정답과 나란히 디코이로 쓰는 순간 answer-point-repeated 로
            // 문항 전체가 거부된다 — 대체 정답으로만 허용.
            ? "alternate-answer-only — never underline this as a decoy while the answer uses the same code"
            : "answer-preferred"
          : candidate.tier === "basic" && difficulty !== "BASIC"
            ? "decoy-preferred"
            : "answer-or-decoy";
      const wideSpanNote =
        countWordsForQuality(candidate.expression) > 5
          ? `span="wide match — underline only ONE decision token inside this span, never the whole span"`
          : "";
      // 문장 서수·상대위치를 후보 라인에 그대로 노출 — 분산·정답 배치 판단의
      // 결정론 근거(모델 추정이 아니라 계산값).
      const positionNote = `position="sentence ${candidate.sentenceOrdinal}, ~${Math.round(candidate.relativePosition * 100)}% into passage"`;
      return [
        `${index + 1}. code=(${candidate.code}) ${info.label}`,
        `tier=${candidate.tier}`,
        `use=${preferredUse}`,
        positionNote,
        `expression="${escapePromptSnippet(candidate.expression)}"`,
        wideSpanNote,
        `trap="${escapePromptSnippet(candidate.trap)}"`,
        `mutation="${escapePromptSnippet(candidate.mutationHint)}"`,
        `context="${escapePromptSnippet(candidate.surroundingText)}"`,
      ].filter(Boolean).join(" | ");
      });
    })(),
  ].filter(Boolean).join("\n");
}


function selectGrammarCandidatesForPrompt(
  candidates: GrammarGenerationCandidate[],
  limit: number,
): GrammarGenerationCandidate[] {
  const selected: GrammarGenerationCandidate[] = [];
  const deferred: GrammarGenerationCandidate[] = [];
  const counts = new Map<GrammarPointCode, number>();
  const maxPerCodeFirstPass = 2;

  for (const candidate of candidates) {
    const count = counts.get(candidate.code) ?? 0;
    if (count < maxPerCodeFirstPass && selected.length < limit) {
      selected.push(candidate);
      counts.set(candidate.code, count + 1);
      continue;
    }
    deferred.push(candidate);
  }

  for (const candidate of deferred) {
    if (selected.length >= limit) break;
    selected.push(candidate);
  }

  return selected;
}



export function escapePromptSnippet(value: string): string {
  return normalizeText(value).replace(/"/g, "'");
}



// ── 게이트-일관 정답자리 사전 판정 (26-07-06 1회호출 캠페인) ─────────────────
// 정답 사이트를 반려하는 게이트와 '같은 논리'를 생성 전에 후보에 역적용해
// "정답 금지/안전"을 가른다. 기각된 '자리 지정' 실험(정규식 tier 오라벨이 모델을
// 나쁜 자리에 고정, ST-K 63→56)과 달리 판정기=반려 게이트라 오라벨이 원리적으로
// 없고, 모델은 안전 풀 안에서 자유 선택한다(지정이 아니라 지뢰 지도).
// 실측 근거: 최종 스윕에서 잔여 반려 전부가 정답자리 코드(overdrilled that↔what·
// generic a/m·인접 수일치·관형 분사) — 모델 프라이어가 금지 자리를 반복 선택.
function escapeGrammarCandidateRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 출하 게이트 isLinkingVerbComplementSite(validators/grammar/shared.ts 의
// LINKING_VERB_BEFORE_TARGET) 미러 — 비공개 상수라 사전검사용 사본을 둔다.
// 게이트 쪽 목록이 바뀌면 여기도 함께 갱신할 것(판정 불일치 = 모순① 재발).
const GRAMMAR_PRECHECK_LINKING_VERB_BEFORE_TARGET =
  /\b(?:seem|seems|seemed|seeming|appear|appears|appeared|appearing|become|becomes|became|becoming|remain|remains|remained|remaining|stay|stays|stayed|staying|prove|proves|proved|proven|proving|grow|grows|grew|grown|growing|turn|turns|turned|turning|feel|feels|felt|feeling|look|looks|looked|looking|sound|sounds|sounded|sounding|taste|tastes|tasted|tasting|smell|smells|smelled|smelling|get|gets|got|gotten|getting)\s+$/i;

function classifyGrammarKillerAnswerBan(
  candidate: GrammarGenerationCandidate,
  passage: string,
): string | null {
  const surface = normalizeText(candidate.expression).toLowerCase();
  const tokens = surface.split(/\s+/).filter(Boolean);
  // (1) grammar-killer-generic-answer-point 짝 — a/m 은 KILLER 정답 코드 금지.
  if (candidate.code === "a" || candidate.code === "m") {
    return "코드 (a)/(m)은 KILLER 정답 금지";
  }
  // (2) findGrammarKillerOverdrilledAnswer(과훈련) 짝 — that/what 표면의 b 코드는
  // 사실상 that↔what 변형으로 흘러 전면 반려된다.
  if (
    candidate.code === "b" &&
    (tokens.includes("that") || tokens.includes("what"))
  ) {
    return "that↔what 계열은 과훈련 반려 — 정답은 where↔which·전치사+관계대명사 방향으로";
  }
  // (2b) findGrammarKillerOverdrilledAnswer(a) 짝 — one/each/either/neither of +
  // 복수명사의 동사 수 뒤집기는 장거리 여부와 무관하게 과훈련 전면 반려된다.
  // (26-07-14 모순① 해소: 종전엔 of구가 (3)의 개입 수식어로 잡혀 '안전' 오표기 —
  // 확정 반려 자리를 정답으로 고르도록 유도했다.)
  if (
    candidate.code === "d" &&
    /\b(?:one|each|either|neither)\s+of\b/i.test(`${surface} ${candidate.surroundingText}`)
  ) {
    return "one/each/either/neither of + 복수명사 수일치 뒤집기 — 과훈련 전면 반려";
  }
  // (3) grammar-killer-thin-answer/인접 수일치 짝 — 동사 앞 같은 절에 실재 개입
  // 수식어가 없으면 수일치 정답은 thin 반려된다.
  if (candidate.code === "d") {
    const located = extractContainingSentence(
      passage,
      candidate.expression,
      candidate.surroundingText,
    );
    if (
      !located ||
      !hasLongDistanceAgreementBeforeTarget(located.sentence, located.targetStart)
    ) {
      return "동사 앞 개입 수식어 없는 인접 수일치 — thin 반려";
    }
  }
  // (4) shallow-participle 짝 — 명사 앞 관형 -ed 분사 단독 플립은 반려.
  // 등위 동사열(", V-ed"/"and V-ed" = 병렬 깨기)은 게이트도 허용하므로 제외.
  if (candidate.code === "c" && tokens.length === 1 && /ed$/.test(surface)) {
    const attributive = new RegExp(
      `\\b${escapeGrammarCandidateRegex(surface)}\\s+[a-z][a-z'-]*s?\\b`,
      "i",
    ).test(candidate.surroundingText);
    const coordinated = new RegExp(
      `(?:,|\\band\\b|\\bor\\b)\\s+${escapeGrammarCandidateRegex(surface)}\\b`,
      "i",
    ).test(candidate.surroundingText);
    if (attributive && !coordinated) {
      return "명사 앞 관형 분사 단독 플립 — shallow 반려 (병렬 깨기로 쓸 때만 정답 가능)";
    }
  }
  // (5) findGrammarKillerOverdrilledAnswer(b) 짝 — 형용사↔부사(-ly) 맞교환은
  // 계사(seem/become/remain 등) 직후 보어 자리가 아니면 무조건 반려된다. f 후보의
  // mutation 힌트는 사실상 전부 -ly 맞교환으로 흐르므로, 계사 직후 판단 토큰을
  // 확인할 수 없는 f 자리는 반려 예고로 분류한다. 확인 경로 2가지:
  //   (i) 표면이 계사로 시작하는 스팬("remain strict …") — 계사 바로 뒤 토큰이
  //       게이트 통과 자리(그 토큰만 밑줄해야 함).
  //   (ii) 단일 토큰 표면 — 주변문에서 그 토큰 직전이 계사인지 대조.
  // (26-07-14 모순① 해소: 종전엔 f 후보 전부 '안전' 오표기. 게이트도 위치 확인
  // 실패 시 반려하므로, 미확인=반려 예고가 게이트-보수 방향으로 일치한다.)
  if (candidate.code === "f") {
    const linkingComplement = (() => {
      const firstToken = tokens[0] ?? "";
      if (
        tokens.length >= 2 &&
        GRAMMAR_PRECHECK_LINKING_VERB_BEFORE_TARGET.test(`${firstToken} `)
      ) {
        return true;
      }
      const decisionToken = (tokens[tokens.length - 1] ?? "").replace(/\.{3}$/, "");
      if (!decisionToken || !/^[a-z][a-z'-]*$/.test(decisionToken)) return false;
      const site = normalizeText(candidate.surroundingText);
      const match = site.match(
        new RegExp(
          `(^|[^A-Za-z'-])${escapeGrammarCandidateRegex(decisionToken)}(?![A-Za-z'-])`,
          "i",
        ),
      );
      if (!match || typeof match.index !== "number") return false;
      const before = site.slice(0, match.index + match[1].length);
      return GRAMMAR_PRECHECK_LINKING_VERB_BEFORE_TARGET.test(before);
    })();
    if (!linkingComplement) {
      return "형용사↔부사(-ly) 맞교환은 반려 — 계사(seem/become/remain 등) 직후 보어 자리만 정답 허용";
    }
  }
  return null;
}

export function buildGrammarErrorCandidateBlock(
  passage: string,
  requestedMarkerCount = 5,
  requestedAnswerCount = 1,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
  /** 결핍(제한 지문) 판정 기준 개수 — 스페어 과잉생성(G=K+1) 시 검증 기준 K 를
   * 전달해, 요청 개수(G)가 커졌다는 이유로 결핍 모드가 조기 발동하지 않게 한다. */
  scarcityBaseCount?: number,
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

  // 금지 표면 블록은 아래 buildGrammarSourceCandidateBlock 이 한 번 인쇄한다
  // (26-07-06: 여기서 forbiddenSurfaceBlock 을 또 넣어 프롬프트에 2회 중복
  // 인쇄되던 것을 제거 — source-candidate 사본 1회만 유지. GRAMMAR_CORRECTION
  // 경로도 source-candidate 로만 1회 인쇄되므로 무영향).

  // 제한 지문 모드 — 금지 표면을 걷어낸 실사용 후보가 요청 마커 수를 감당하지
  // 못하는 지문(실측: glass 지문 — 금지 표면 20+개가 후보 대부분과 겹침)에서는
  // 모델이 장식 표면·논쟁 자리로 빠지며 게이트 거부 루프에 갇힌다. 그 대신
  // "정직한 같은 코드 재사용"을 명시적으로 허용해 깨끗한 자리 안에서 문항이
  // 성립하게 한다(monotony 게이트는 3회+에서만 발화 — 2회/코드는 안전).
  const { candidates: usableCandidates } = selectUsableGrammarCandidates(
    passage,
    requestedDifficulty,
  );
  const usableCodes = new Set(usableCandidates.map((candidate) => candidate.code));
  const scarcityBase = normalizeGrammarMarkedCount(
    scarcityBaseCount ?? requestedMarkerCount,
  );
  const isScarcePassage =
    usableCandidates.length < scarcityBase + 2 || usableCodes.size < 3;
  const scarcePassageBlock = isScarcePassage
    ? [
        "- ⚠️ 제한 지문 모드 (이 지문은 깨끗한 어법 판단 자리가 부족합니다):",
        "  · 밑줄은 금지 표면 목록에 없는 **명백한 구조 자리**만 사용하세요. 장식 표면이나 논쟁 자리를 채워 넣는 순간 문항 전체가 거부됩니다.",
        "  · 서로 다른 pointCode 가 부족하면, **같은 코드를 최대 2회까지**(반드시 서로 다른 문장·서로 다른 세부 판단으로) 정직하게 재사용하는 것이 장식 디코이보다 낫습니다.",
        `  · 그래도 ${markedCount}개 자리가 안 나오면 한 문장 안에서 서로 다른 절의 자리를 나눠 쓰세요(절당 1개, 8단어 이상 간격). 무리한 비문이나 규범 논쟁 자리를 만들어 개수를 채우지 마세요.`,
      ].join("\n")
    : "";

  return [
    "## GRAMMAR_ERROR target planning guardrail",
    disputedBanLine,
    scarcePassageBlock,
    "- Do not underline mixed connector+pronoun chunks such as 'as it'. If testing concessive as, underline only 'as'; if testing pronoun reference, underline only the pronoun.",
    "- ⭐ Underline span = the minimal grammatical unit only (usually 1-3 words, never more than 5). expression/errorExpression IS the exact underlined surface, so keep it to the single token that carries the grammar decision (the verb / participle / relative word / pronoun / adjective-adverb / to-V / connector). NEVER underline a full clause (subject + finite verb + object) or a whole sentence — e.g. 'create', not 'these digital platforms create a trusting environment'.",
    "- ⭐ pointCode must be true to the underlined surface: the code's required token must actually appear inside the underline (b→relative word, c→participle -ing/p.p., k→to-V or -ing, g→pronoun, l→during/while/despite/because, m→comparative marker). Never fabricate a code just to fill decoy diversity.",
    "- Never underline sentence fragments that contain punctuation such as a colon, comma, or semicolon (e.g. 'asking: for some scientists it is'). Move the underline to the exact grammar token instead.",
    "- Point-code distribution is part of the item quality: across all marked expressions, use at least three different pointCodes and never use the same pointCode more than twice. In particular, do not use three relation/nominal-clause b-code decoys in one item; swap one for c/d/e/f/g/h/i/k/l if the passage allows it.",
    "- Marker spacing is mandatory: never place two labels back-to-back or within fewer than two source words of each other. Prefer one marker per sentence; if two labels must share a sentence, put them in different clauses with at least 8 source words between the underlined spans.",
    `- The final item must contain ${markedCount} marked expression(s) labeled ${labels}.`,
    `- Exactly ${answerCount} marked expression(s) must be grammatically incorrect.`,
    answerCount >= 2
      ? "- In the direction, do not disclose the answer count; ask students to choose all grammatically incorrect parts using '모두'."
      : "- In the direction, use single-answer wording for one grammatically incorrect part.",
    "- If the requested answer count is lower than the marked count, keep the remaining labels grammatically correct as non-answer decoys. If it equals the marked count, every label must be intentionally incorrect and 오답 분석 can be empty.",
    "- Use the original passage as correct source text. For every answer, mutate only the marked expression and keep the original expression/correction verbatim.",
    // 오류형 3원칙 — 개별 실측 사례 나열 대신 위반 '계열'로 묶는다(게이트 짝:
    // grammar-obvious-* / grammar-debatable-* 계열). 지문 특이 표면은
    // buildForbiddenGrammarSurfaceBlock 이 그 지문에서만 조건부 주입한다.
    "- Wrong-form principle 1 (no locally broken surfaces): never create errors a student rejects at a glance without reading the clause — modal/auxiliary + V-ing or to-V ('can paying', 'can to pay'), passive intransitives ('be appeared'), seem + V-ing, double -ing ('being employing'), adjacent agreement flips ('the glass are', 'it are', 'they is'), object pronouns as subject ('them pushes'), any preposition + to-V ('by to disturb', 'before to flow'), fake inversion fragments, or any token not present in the source. BASIC may be simpler, but it must still look like a real exam trap.",
    "- Wrong-form principle 2 (no debatable mutations): if the mutated sentence can be read as grammatical under ANY standard interpretation (tense-only change, active/passive infinitive preference, collocational preference such as 'attention to finding', formal-register disputes like 'despite it being', colloquial object who, discourse though), it cannot be the answer. Re-run the mutated sentence through every plausible parse before committing.",
    "- Wrong-form principle 2a (pronoun answers): before committing a pronoun-number answer (g), enumerate every candidate antecedent across the WHOLE passage, beyond sentence boundaries. If any antecedent semantically licenses the underlined number, discard the site. Never plant a pronoun-number error as the object of pay/afford/buy-type verbs when a plural goods/treatment noun exists in the discourse.",
    "- Wrong-form principle 3 (structure over vocabulary): the answer must break a structural frame, not a lexical preference — do not use shallow participle-adjective swaps before a noun, semantic who/what readings, or single connector swaps unless tied to a deeper cross-clause dependency.",
    "- Shallow 'depends on' ban (always applies): a plain 'X depends on Y' subject-verb agreement (depends <-> depend) offers little trap value and is rejected. Never use such a bare agreement flip as the answer OR as a decoy unless a long intervening modifier genuinely separates the true subject head from the verb.",
    "- Decoy quality: each non-answer label must carry its own plausible grammar question (agreement, voice, relative/nominal clause, participle, complement form, dummy it, inversion, adjective/adverb, connector, comparison) and must be clearly, defensibly correct in that context. If a decoy can be dismissed without reading its clause — or could be argued wrong by a careful reader — replace it. Avoid decorative surfaces (standalone comparatives, tiny pronoun/article/do-support tokens, discourse markers, tokens inside frozen idioms such as 'that is,') and side-by-side subject+passive pairs.",
    "- Answer-site giveaway check: reject an answer site when an unmarked token adjacent to the underline resolves the judgment by pattern-matching alone (e.g. an unmarked parallel '-ing' such as 'or delaying' right after a to-V/-ing answer). The student must need the grammar frame, not the neighbor.",
    "- Decoy pre-exposure check: if the exact grammatical form a decoy tests (same participle/adjective/pronoun pattern) already appears unmarked elsewhere in the passage, the decoy is answerable by copying — relocate it.",
    "- Option uniqueness: every markedExpressions.expression must be a different visible option. Do not reuse the same word/phrase under two labels, even if the pointCode differs.",
    requestedDifficulty === "KILLER"
      ? "- KILLER point-code discipline: the answer's grammar point must not be repeated as a same-point decoy; each non-answer underline should test a different frame so the option set feels curated, not padded."
      : "",
    requestedDifficulty === "KILLER"
      ? "- KILLER answer pointCode must be a precise structural frame (b/c/d/e/f/g/h/i/k/l). Do not tag the answer as generic a or lexical/comparison m."
      : "",
    requestedDifficulty === "KILLER"
      ? "- KILLER answer ban: do not make a single concessive as/though -> how idiom (e.g. Clear and perfect as it might appear) the answer. That is an idiom check, not a sufficiently layered KILLER structure."
      : "",
    requestedDifficulty === "KILLER"
      ? "- KILLER answer ban: do not make a one-token connector/preposition swap such as because -> because of, although -> despite, or while -> during the answer. Connector/preposition errors are allowed only when tied to a deeper cross-clause dependency."
      : "",
    "- Terminology precision: name only the actual school-grammar structure the underline tests, with standard terms (주어/목적어/정동사/조동사/접속사/전치사/동명사/분사/관계대명사/명사절/보어). Never mislabel: a pronoun-reference check is not a noun-clause issue; parallel participles are not phrasal verbs; seem + to-V is a complement, not an object; appear is a linking verb, never an adverb or passive; 'that' in 'that way' is a determiner. If unsure of a category name, describe the structure instead — never invent terms such as '전사구'.",
    "- Polish discipline: spellcheck all Korean and English explanation text. Never return typos such as 'dsepite'.",
    "- Explanation quality: for every incorrect label, cite the student-visible wrong surface first, then the correction. Write '(C) been associating is wrong; it should be been associated', never '(C) been associated is ...'.",
    "- Explanation quality: for long-distance subject-verb agreement, the main explanation must name the intervening modifier/relative/appositive phrase and the true subject head; do not stop at 'the subject is plural'.",
    "- Explanation length cap: main explanation must be a polished student-facing paragraph of 200-450 Korean characters following the 4-step structure (sentence skeleton -> verdict with the syntactic reason -> correction -> optional one-line trap note); each wrongOptionExplanations value should be one concise sentence. Do not quote full source sentences, narrate failed hypotheses, expose scratchpad/self-correction, or write meta-review phrases such as 'let me check again', 'I will re-check the question', or Korean equivalents.",
    "- Explanation label discipline: never use a shorthand range such as 'remaining (B)~(F)' or '나머지 (B)~(F)'. Label reordering can make ranges wrong or ugly; enumerate only the actual non-answer labels individually.",
    "- KeyPoints discipline: mention only grammar tokens actually tested by marked options. Do not add unrelated source tokens such as unless/although if no underline tests them.",
    "- Tag discipline: tags must name real tested grammar frames only. Do not invent vague/padded tags such as noun flow analysis, vocabulary flow analysis, or general content-flow labels.",
    "- If the passage has fewer source sentences than requested marked expressions, you may mark more than one expression in a sentence only when they test clearly different clauses or grammar relations.",
    requestedDifficulty === "KILLER"
      ? "- KILLER calibration: make the wrong forms look locally natural until the full sentence structure is checked. Do not use a lone main-verb/subject-verb/local -s error as the answer; it must require checking a relation, reduced clause, semantic subject, long modifier, complement pattern, or parallel range. Also never use a visibly broken local form — including a noun directly followed by 'what' ('N what ...', a post-nominal relative 'that' mutated into 'what') — as the answer; that one-glance error is rejected, so keep an 'N what' form only for decoy disproof, never as the KILLER answer."
      : requestedDifficulty === "INTERMEDIATE"
        ? "- INTERMEDIATE calibration: avoid visibly broken local errors such as 'it are', 'N what ...', 'depends -> depending' before a colon, 'seems V-ing', or 'afford/want/decide to V-ing'. Do not pad with one/that/those/does decoys; the wrong form should still look locally tempting until the student checks a clause boundary, antecedent, semantic subject, complement pattern, or modifier scope."
        : "",
    requestedDifficulty === "KILLER"
      ? "- ⭐ KILLER answer-site selection: put the answer in the passage's most structurally layered sentence (two or more of: relative clause, inserted phrase, participial clause, parallel range, long pre-verbal modifier). The answer's surroundingText MUST contain the full dependency span the student needs (true subject head to verb / antecedent to relative clause / semantic subject to participle / first parallel item onward) — a short local snippet will be rejected as thin."
      : "",
    requestedDifficulty === "KILLER"
      ? (() => {
          // 게이트-일관 정답자리 사전 판정 — 위 classifyGrammarKillerAnswerBan 주석 참조.
          const safe: string[] = [];
          const banned: string[] = [];
          for (const candidate of usableCandidates) {
            const ban = classifyGrammarKillerAnswerBan(candidate, passage);
            const entry = `"${escapePromptSnippet(candidate.expression)}"(${candidate.code})`;
            if (ban) {
              if (banned.length < 8) banned.push(`${entry} → ${ban}`);
            } else if (candidate.earlyPositionDecoyOnly) {
              // 첫문장/전반부 후보는 게이트 반려 대상은 아니지만 정답 부적합
              // (미끼 전용 표기)이라 '안전' 목록에 올리지 않는다 — 후보 라인의
              // use=decoy-only 표기와 정합 (26-07-14 배치 결정론).
              continue;
            } else if (safe.length < 8) {
              safe.push(entry);
            }
          }
          if (!safe.length && !banned.length) return "";
          return [
            "- 🎯 정답(오류) 자리 사전 판정 — 출하 게이트와 동일한 판정기로 미리 계산했습니다. '정답 금지' 자리를 정답으로 만들면 반드시 반려되어 재생성됩니다:",
            safe.length
              ? `  · 정답 후보로 안전: ${safe.join(", ")} — 이 목록은 지정이 아니라 안전 지도입니다. 목록 밖이라도 장거리 의존이 실재하는 더 다층적인 자리가 보이면 그쪽이 우선이지만, 아래 금지 계열만은 반드시 피하세요.`
              : "  · 사전 판정을 통과한 정답 후보가 목록에 없습니다 — 후보 목록 밖이라도 장거리 의존이 실재하는 자리를 정답으로 삼되, 아래 금지 계열은 반드시 피하세요.",
            banned.length
              ? `  · 정답 금지(미끼로만 사용): ${banned.join("; ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");
        })()
      : "",
    buildGrammarNineFrameGuide("judgment", requestedDifficulty),
    // 어법끝 28년 빈도 증류 가이드 — 정답 포인트 코어 풀 + 함정 디코이 카드 +
    // (다양성 모드) variantIndex 로테이션 정답 포인트 지정.
    // 핵심 집중 모드면 정답 포인트를 고빈출/9프레임 톱셋으로 좁힌다.
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
          // 배치 결정론(26-07-14): 첫문장·누적 20% 이전에서 시작하는 문장은 정답
          // 호스트 로테이션에서 제외 — 후보 데이터의 미끼 전용(첫문장/전반부)
          // 표기와 이 힌트가 서로 모순되지 않게 한다. 제외 후 풀이 비면(짧은
          // 지문) 기존 전체 로테이션을 그대로 유지해 동작 불변.
          const pooled = sentences.slice(0, sentencePool);
          const totalLength = pooled.reduce((sum, sentence) => sum + sentence.length, 0);
          const eligible: number[] = [];
          let cumulative = 0;
          pooled.forEach((sentence, i) => {
            const startRatio = totalLength > 0 ? cumulative / totalLength : 0;
            cumulative += sentence.length;
            if (i >= 1 && startRatio >= 0.2) eligible.push(i + 1);
          });
          const vi =
            typeof diversity.variantIndex === "number" &&
            Number.isFinite(diversity.variantIndex)
              ? Math.max(0, Math.floor(diversity.variantIndex))
              : Math.floor(Math.random() * sentencePool);
          const target = eligible.length
            ? eligible[vi % eligible.length]
            : (vi % sentencePool) + 1;
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
    "- REQUIRED JSON contract: every underlinedSegments item must include sourceText, displayedText, isError=true, errorPart, and correctedPart. Do not put the correction only in correctAnswer.",
    "- Top-level correctedPart/correctedParts must mirror the correctedPart values from underlinedSegments; correctAnswer is just a display summary.",
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
    buildGrammarNineFrameGuide("correction", requestedDifficulty),
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
