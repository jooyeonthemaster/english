// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { buildBlankPointGuidance } from "@/lib/blank-point-catalog";
import { CandidateDiversityOptions, filterUsedCandidates, rotateByVariantIndex } from "./shared";
import { REPEATED_PHRASE_STOPWORDS, countContentTokens, countWordsForQuality, hasTrailingFunctionWordBlankTarget, isListLikeBlankTarget, isLowValueKillerBlankTarget, isSingleAbstractNounTarget, splitPassageSentences } from "../core";
import { countContentWords } from "../validators/blank/multi";



export function findRepeatedPassagePhrases(passage: string, cap = 10): string[] {
  const words = passage
    .replace(/[^\p{L}\p{N}'\- ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 6) return [];
  const lower = words.map((w) => w.toLowerCase());

  // 내용어 시작 위치별 출현 인덱스. 초고빈도 토큰은 비용·노이즈 가드로 제외.
  const positionsByWord = new Map<string, number[]>();
  for (const [index, token] of lower.entries()) {
    if (REPEATED_PHRASE_STOPWORDS.has(token) || token.length < 3) continue;
    const list = positionsByWord.get(token);
    if (list) list.push(index);
    else positionsByWord.set(token, [index]);
  }

  // 같은 내용어에서 시작하는 출현 쌍을 최대 길이까지 확장해, 겹치는 n-gram
  // 조각이 아니라 반복 구간 전체를 하나의 후보로 수집한다.
  const sampleByNorm = new Map<string, string>();
  for (const positions of positionsByWord.values()) {
    if (positions.length < 2 || positions.length > 25) continue;
    for (let a = 0; a < positions.length - 1; a += 1) {
      for (let b = a + 1; b < positions.length; b += 1) {
        const start = positions[a];
        const other = positions[b];
        let len = 0;
        while (
          other + len < lower.length &&
          start + len < other &&
          lower[start + len] === lower[other + len]
        ) {
          len += 1;
        }
        // 꼬리의 기능어는 잘라 구절을 자연스럽게 만든다.
        while (len > 0 && REPEATED_PHRASE_STOPWORDS.has(lower[start + len - 1])) {
          len -= 1;
        }
        if (len < 2) continue;
        const tokens = words.slice(start, start + len);
        if (countContentWords(tokens) < 2) continue;
        const norm = lower.slice(start, start + len).join(" ");
        if (!sampleByNorm.has(norm)) sampleByNorm.set(norm, tokens.join(" "));
      }
    }
  }

  // 더 긴 반복 구간에 포함되는 부분 구절은 제거하고 최대 구간만 남긴다.
  const norms = [...sampleByNorm.keys()].sort((x, y) => y.length - x.length);
  const collected: string[] = [];
  const collectedNorm: string[] = [];
  for (const norm of norms) {
    if (collectedNorm.some((longer) => longer.includes(norm))) continue;
    collected.push(sampleByNorm.get(norm)!);
    collectedNorm.push(norm);
    if (collected.length >= cap) break;
  }
  return collected;
}



/**
 * 다중 빈칸 전용 후보 제약 블록 — 단일 빈칸 후보 블록 대신 주입된다.
 */
export function buildMultiBlankAvoidBlock(passage: string): string {
  const repeated = findRepeatedPassagePhrases(passage);
  if (repeated.length === 0) return "";
  return [
    "## 다중 빈칸 후보 제약 (지문 자동 스캔)",
    "다음 표현은 지문에 2회 이상 등장하므로 빈칸(blanks[].originalExpression)으로 선택 금지 — 빈칸을 뚫어도 남은 출현이 정답을 그대로 누설해 문항이 거부됩니다:",
    ...repeated.map((p) => `- "${p}"`),
    "위 표현과 그 일부를 포함한 구절도 피하고, 지문에 정확히 1회만 등장하는 표현을 선택하세요.",
  ].join("\n");
}



/** 결론/주장 담화 표지 — KILLER 빈칸 위치(핵심 논지부) 후보 점수에 사용. */
export const THESIS_DISCOURSE_MARKERS =
  /\b(?:therefore|thus|hence|consequently|as a result|in short|in sum|in essence|in other words|in conclusion|ultimately|overall|this means|the point is|what matters|the key|crucially|in fact)\b/i;



export function scoreThesisSentence(sentence: string, index: number, total: number): number {
  let score = 0;
  if (THESIS_DISCOURSE_MARKERS.test(sentence)) score += 3;
  if (index >= total - 2) score += 2; // 결론부(마지막 두 문장)
  if (index === 0) score += 1; // 주제문(첫 문장)
  // 나열 위주 문장은 간결한 스팬을 잡기 어려워 list-like 거부를 유발한다 — 후순위.
  if ((sentence.match(/,/g) ?? []).length >= 2) score -= 2;
  return score;
}



/**
 * KILLER 단일 빈칸 전용 설계 블록 — 빈칸을 글의 핵심 논지(주제문·결론·인과의
 * 귀결)에 두고 정답을 추상 패러프레이즈로 요구한다. 검수 실측(평균 4.0/10)에서
 * KILLER 빈칸이 지엽 세부 + 원문 verbatim 정답 + 무간섭 오답으로 일관되게
 * 미달했던 것의 직접 대응. 후보 문장은 thesis 점수순으로 제시·지정한다.
 */
export function buildKillerBlankCandidateBlock(
  passage: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);
  const total = sentences.length;
  const candidates = filterUsedCandidates(
    sentences
      .map((sentence, index) => ({ sentence, index }))
      .filter(({ sentence }) => countContentTokens(sentence) >= 4),
    diversity?.usedTargets,
    ({ sentence }) => sentence,
  ).items;
  const ranked = [...candidates].sort(
    (a, b) =>
      scoreThesisSentence(b.sentence, b.index, total) -
      scoreThesisSentence(a.sentence, a.index, total),
  );
  // thesis 신호(점수>0)가 있는 문장만 우선 — 설정부/서사 문장이 풀에 섞이면
  // 결론 명제를 설정부 빈칸에 박는 극성 전도가 발생한다(검수 실측 critical).
  // 신호 문장이 너무 적으면 0점 문장으로 보충해 다양성 회전은 유지한다.
  const scored = ranked.filter(
    ({ sentence, index }) => scoreThesisSentence(sentence, index, total) > 0,
  );
  const pool = (scored.length >= 3 ? scored : ranked).slice(0, 8);

  let designated: { sentence: string; index: number } | undefined;
  if (diversity?.diversityEnabled && pool.length > 0) {
    const vi =
      typeof diversity.variantIndex === "number" && Number.isFinite(diversity.variantIndex)
        ? Math.max(0, Math.floor(diversity.variantIndex))
        : Math.floor(Math.random() * pool.length);
    // 재시도 오프셋(attempt×variantCount)이 pool 크기와 배수 관계면 mod 에서
    // 소거돼 같은 문장이 계속 지정된다(실측: list-like 문장 7연속 거부 → 미생성).
    // tier(풀을 몇 바퀴 돌았나)를 더해 재시도마다 다음 후보로 이동시킨다.
    const tier = Math.floor(vi / pool.length);
    designated = pool[(vi + tier) % pool.length];
  }

  return [
    designated
      ? `⭐ 다양성 지시 (항상 적용): 이번 문항은 되도록 다음 문장에서 빈칸 타깃(originalExpression)을 선택하세요: "${designated.sentence}" 그 문장에 간결한 핵심 술부가 없으면(콤마 나열 구간뿐이면) 주저 없이 아래 다른 후보 문장으로 넘어가고, 매번 같은 표현으로 수렴하지 마세요.`
      : "",
    "## KILLER 빈칸 설계 (필수)",
    "이 문항은 KILLER 난이도입니다. 다음 세 가지를 모두 지키지 않으면 거부됩니다:",
    "1. 빈칸 위치: 글의 핵심 논지가 담긴 자리 — 주제문, 결론, 인과의 귀결부, 필자 주장의 핵심 술부. 예시·나열·수치·부수적 세부사항(비용, 시간 같은 지엽)을 빈칸으로 만들지 마세요. originalExpression 은 2~7단어의 간결한 술부/구여야 하며 콤마·콜론·세 항목 이상 나열을 포함하면 거부됩니다 — 문장이 길면 핵심 술부만 잘라 선택하세요.",
    "2. 정답 보기: blankAnswerMode 를 \"PARAPHRASE\" 로 출력하고, 정답 선지는 originalExpression 의 verbatim 복사가 아니라 같은 의미의 **추상적 재진술**이어야 합니다. originalExpression 자체는 여전히 원문 그대로(한 글자도 바꾸지 않고) 출력하세요 — 빈칸 위치 식별용입니다.",
    "2a. 의미 보존: 정답은 그 스팬이 그 자리에서 말하는 명제를 보존해야 합니다. 스팬이 긍정 외양 진술이면 정답도 같은 명제의 재진술이어야 하며, 글 전체의 결론(반대 극성)을 대신 넣으면 담화가 붕괴되어 거부됩니다.",
    "2b. 슬롯 문법: 정답을 빈칸에 넣은 문장이 완전한 정문이어야 합니다 — 스팬이 주어로 시작하면 정답도 주어를 포함하고, 'to ___' 자리면 동사원형으로 시작하고(동명사 금지), 스팬의 동사가 3인칭 단수형이면 정답 동사도 수일치를 유지하고, 스팬 뒤에 관계절(, where/, which)이 남으면 그 선행사가 되는 명사로 끝나야 합니다.",
    "3. 오답 설계 — 두 가지 균형을 모두 지키세요 (위반 시 거부):",
    "   3a. 극성 균형: 정답이 부정 극성(상실·제약·실패류)이면 오답 중 최소 2개도 부정 극성이어야 합니다. 'Unfortunately' 같은 전환 뒤 빈칸에서 정답만 부정이고 오답이 전부 긍정이면 극성 스캔만으로 즉답됩니다.",
    "   3b. 추상도 균형: 오답 중 최소 2개는 정답과 같은 추상 수준(논제급 일반 진술)이어야 합니다. 정답만 추상이고 오답이 전부 구체 사실 나열이면 '가장 추상적인 선지 고르기'로 즉답됩니다.",
    "   매력 오답은 인과 역전, 범위 과장(절대어 purely/entirely 함정), 절반-진실(본문 개념을 빌리되 결론을 비틀기)로 틀리게 만들고, 최소 2개는 본문 어휘·개념을 재활용하세요.",
    pool.length ? "핵심 논지 후보 문장 (우선순위순):" : "",
    ...pool.map(
      ({ sentence, index }) => `${index + 1}. ${sentence}`,
    ),
  ].filter(Boolean).join("\n");
}



export function buildBlankInferenceCandidateBlock(
  passage: string,
  diversity?: CandidateDiversityOptions,
  options: {
    paraphraseAnswer?: boolean;
    doubleNegative?: boolean;
    requestedDifficulty?: string;
  } = {},
): string {
  // 출제 포인트 집중(focus) 가이드 — 정답 형태(환언/이중부정/표준)와 직교하는
  // "정답논리 축"이라 모드 무관하게 후보 블록 앞에 1회 주입한다. pointFocus 미지정
  // 이면 "" 반환이라 기존(비-focus) 동작 불변.
  const pointGuidance = buildBlankPointGuidance({
    variantIndex: diversity?.variantIndex,
    pointFocus: diversity?.pointFocus,
    diversityEnabled: diversity?.diversityEnabled,
  });

  const block = options.paraphraseAnswer
    ? buildBlankParaphraseCandidateBlock(
        passage,
        options.requestedDifficulty,
        diversity,
      )
    : options.doubleNegative
      ? buildNegativeBlankInferenceCandidateBlock(passage, diversity)
      : buildStandardBlankInferenceCandidateBlock(
          passage,
          options.requestedDifficulty,
          diversity,
        );

  return [pointGuidance, block].filter(Boolean).join("\n\n");
}



export function buildNegativeBlankInferenceCandidateBlock(
  passage: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);
  // 기사용 빈칸 스팬을 담고 있는 문장은 후보에서 제외 (전부 걸러지면 원본 유지).
  const candidateSentences = filterUsedCandidates(
    sentences
      .map((sentence, index) => ({ sentence, index }))
      .filter(({ sentence }) => isUsefulNegativeParaphraseSourceSentence(sentence)),
    diversity?.usedTargets,
    ({ sentence }) => sentence,
  ).items;
  const strongCandidates = rotateByVariantIndex(
    candidateSentences.filter(
      ({ sentence }) => getNegativeParaphraseSuggestedTargets(sentence).length > 0,
    ),
    diversity?.variantIndex,
  ).slice(0, 8);
  const secondaryCandidates = candidateSentences
    .filter(({ sentence }) => getNegativeParaphraseSuggestedTargets(sentence).length === 0)
    .slice(0, 4);
  // 다양성 모드: 후보 문장 하나를 명시 지정해 병렬 배치의 각 호출이 실제로 다른
  // 문장을 타깃하게 한다 (제안 순서만으로는 모델이 같은 '최적' 문장으로 수렴).
  // 지정 풀은 강한 후보만이 아니라 사용 가능한 후보 전체 — 짧은 지문에서 강한
  // 후보가 2~3개뿐이면 variantIndex mod 충돌로 같은 문장이 반복 지정되기 때문.
  // 풀을 한 바퀴 돈 변형(spanTier>0)은 같은 문장 안에서 다른 스팬을 우선하게 한다.
  // 소프트 지시 — 부적합하면 다른 후보 허용이라 신규 reject 압력 없음.
  let designatedBlankTarget: { sentence: string; index: number } | undefined;
  let designatedSpanHint = "";
  let designatedSpanTier = 0;
  if (diversity?.diversityEnabled && candidateSentences.length > 0) {
    const designationPool = candidateSentences.slice(0, 12);
    const vi =
      typeof diversity.variantIndex === "number" &&
      Number.isFinite(diversity.variantIndex)
        ? Math.max(0, Math.floor(diversity.variantIndex))
        : Math.floor(Math.random() * designationPool.length);
    designatedBlankTarget = designationPool[vi % designationPool.length];
    designatedSpanTier = Math.floor(vi / designationPool.length);
    const suggestedSpans = getNegativeParaphraseSuggestedTargets(
      designatedBlankTarget.sentence,
    );
    if (suggestedSpans.length > 0) {
      designatedSpanHint = suggestedSpans[designatedSpanTier % suggestedSpans.length];
    }
  }

  if (candidateSentences.length === 0) {
    return [
      "## BLANK_INFERENCE negative-paraphrase target note",
      "- No strong automatic target candidate was detected.",
      "- If the negative-paraphrase detail setting is active, still produce a valid item by choosing a compact central phrase with a logical action or relation.",
      "- The source sentence does not need to contain a negation cue. The correct option must carry the negative/privative paraphrase.",
    ].join("\n");
  }

  return [
    // 지정 라인은 DN 조건부 블록 제목보다 앞에 — "negative-paraphrase 설정일 때만"
    // 으로 읽혀 통째로 무시되지 않게 한다 (다양성 지시는 무조건 적용 대상).
    designatedBlankTarget
      ? `⭐ 다양성 지시 (항상 적용): 이번 문항은 되도록 다음 문장에서 빈칸 타깃(originalExpression)을 선택하세요: "${designatedBlankTarget.sentence}"${
          designatedSpanHint
            ? ` 그 문장 안에서는 "${designatedSpanHint}" 구간을 우선 고려하세요.`
            : designatedSpanTier > 0
              ? " 이 문장은 다른 문항에서도 쓰일 수 있으니 문장의 앞부분이 아닌 다른 구간을 빈칸으로 잡으세요."
              : ""
        } 그 문장이 빈칸 출제에 부적합할 때만 다른 후보를 사용하고, 매번 같은 표현으로 수렴하지 마세요.`
      : "",
    "## BLANK_INFERENCE negative-paraphrase candidates",
    "- If the negative-paraphrase detail setting is active, choose a compact phrase with a real logical action or relation.",
    "- The source sentence does not need an existing negation cue; the correct option must be a non-verbatim negative/privative paraphrase.",
    "- Do not blank a single abstract noun, a colon/comma list, or an example-list slot.",
    "- Every option must fit the same grammatical slot as the originalExpression.",
    strongCandidates.length ? "Strong candidates:" : "Strong candidates: none detected.",
    ...strongCandidates.map(({ sentence, index }) => {
      const suggestedTargets = getNegativeParaphraseSuggestedTargets(sentence).slice(0, 2);
      return suggestedTargets.length
        ? `${index + 1}. ${sentence}\n   Suggested originalExpression options: ${suggestedTargets.map((target) => `"${target}"`).join(", ")}`
        : `${index + 1}. ${sentence}`;
    }),
    secondaryCandidates.length ? "Secondary candidates, use only if you can choose a compact logical phrase:" : "",
    ...secondaryCandidates.map(({ sentence, index }) => {
      const suggestedTargets = getNegativeParaphraseSuggestedTargets(sentence).slice(0, 2);
      return suggestedTargets.length
        ? `${index + 1}. ${sentence}\n   Suggested originalExpression options: ${suggestedTargets.map((target) => `"${target}"`).join(", ")}`
        : `${index + 1}. ${sentence}`;
    }),
  ].filter(Boolean).join("\n");
}



export function buildStandardBlankInferenceCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const minWords =
    requestedDifficulty === "KILLER"
      ? 6
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 3;
  const minContent =
    requestedDifficulty === "KILLER"
      ? 5
      : requestedDifficulty === "INTERMEDIATE"
        ? 3
        : 2;
  const sentences = splitPassageSentences(passage);
  const candidateRows = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      targets: getStandardBlankInferenceSuggestedTargets(
        sentence,
        requestedDifficulty,
      ),
    }))
    .filter((item) => item.targets.length > 0);
  const candidates = rotateByVariantIndex(
    filterUsedCandidates(
      candidateRows,
      diversity?.usedTargets,
      ({ sentence }) => sentence,
    ).items.sort(
      (a, b) =>
        Math.max(...b.targets.map(scoreStandardBlankInferenceTarget)) -
        Math.max(...a.targets.map(scoreStandardBlankInferenceTarget)),
    ),
    diversity?.variantIndex,
  ).slice(0, 8);

  if (candidates.length === 0) {
    return [
      "## BLANK_INFERENCE source-exact target note",
      "- Standard blank mode is active: the correct option may match originalExpression, so the source span itself must carry the inference difficulty.",
      `- For ${requestedDifficulty || "the requested difficulty"}, choose originalExpression as a compact central relation with at least ${minWords} words and ${minContent} meaningful content words when possible.`,
    "- Avoid tiny local tails, reciprocal filler such as 'both parties review each other', long punctuation spans, comma-separated lists, example lists, and isolated abstract nouns.",
      "- KILLER items should blank a claim, causal relation, evaluative turn, or contrast that requires checking the surrounding passage logic.",
    ].join("\n");
  }

  return [
    "## BLANK_INFERENCE source-exact target candidates",
    "- Standard blank mode is active: the correct option may copy originalExpression, so the blank target must be intrinsically inference-worthy.",
    `- For ${requestedDifficulty || "the requested difficulty"}, prefer a clean semantic unit with at least ${minWords} words and ${minContent} meaningful content words, while staying within 13 words and 95 characters.`,
    "- Do not blank a tiny local tail, reciprocal filler such as 'both parties review each other', a colon/semicolon span, a comma-separated list, or an example-list slot.",
    "- For KILLER, choose a passage-central claim/relation/contrast; do not make the answer recoverable from one nearby collocation alone.",
    "- Every option must fit the exact same grammatical slot as originalExpression and include at least two passage-grounded near misses.",
    "Suggested candidates:",
    ...candidates.map(({ sentence, index, targets }) => (
      `${index + 1}. ${sentence}\n   Suggested originalExpression options: ${targets
        .slice(0, 3)
        .map((target) => `"${target}"`)
        .join(", ")}`
    )),
  ].join("\n");
}



export function getStandardBlankInferenceSuggestedTargets(
  sentence: string,
  requestedDifficulty?: string,
): string[] {
  const targets: string[] = [];
  const add = (value: string | undefined) => {
    const target = normalizeSuggestedTarget(value ?? "");
    if (isValidStandardBlankInferenceTarget(target, requestedDifficulty)) {
      targets.push(target);
    }
  };

  const patterns = [
    /\b((?:is|are|was|were|becomes?|became|remains?)\s+(?:driven|shaped|defined|constrained|guided|grounded|organized|supported|limited)\s+by\s+[^.;:!?]{18,95}?)(?=\.|,|;|:|$)/gi,
    /\b((?:these|those|such|this|that|the|a|an|most|many|some|users|people|companies|platforms|systems|policy|policies|technology|technologies|models|choices|decisions|problem|issue|challenge|capacity|ability|process|world|economy)\s+[^.;:!?]{0,35}?\b(?:creates?|takes? advantage of|utilizes?|benefits?|requires?|depends?|allows?|enables?|prevents?|fosters?|illuminates?|reveals?|demonstrates?|suggests?|shows?|reflects?|transforms?|reorganizes?|preserves?|maintains?|weakens?|strengthens?|distinguishes?|addresses?|reduces?|increases?|changes?)\b[^.;:!?]{10,95}?)(?=\.|,|;|:|$)/gi,
    /\b((?:not\s+(?:because|whether|only|merely)|rather than|instead of)\b[^.;:!?]{20,95}?)(?=\.|,|;|:|$)/gi,
    /\b((?:selling|creating|maintaining|preserving|cultivating|developing|protecting|reducing|reorganizing|distinguishing|balancing|challenging|supporting|strengthening|weakening|sharing|utilizing)\b[^.;:!?]{12,95}?)(?=\.|,|;|:|$)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sentence))) {
      add(match[1]);
    }
  }

  return [...new Set(targets)]
    .sort((a, b) => scoreStandardBlankInferenceTarget(b) - scoreStandardBlankInferenceTarget(a))
    .slice(0, 4);
}



export function isValidStandardBlankInferenceTarget(
  target: string,
  requestedDifficulty?: string,
): boolean {
  if (!target) return false;
  const wordCount = countWordsForQuality(target);
  const contentCount = countContentTokens(target);
  const minWords =
    requestedDifficulty === "KILLER"
      ? 6
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 3;
  const minContent =
    requestedDifficulty === "KILLER"
      ? 5
      : requestedDifficulty === "INTERMEDIATE"
        ? 3
        : 2;

  return (
    wordCount >= minWords &&
    wordCount <= 13 &&
    contentCount >= minContent &&
    target.length <= 95 &&
    !hasTrailingFunctionWordBlankTarget(target) &&
    !isListLikeBlankTarget(target) &&
    !isSingleAbstractNounTarget(target) &&
    !isLowValueKillerBlankTarget(target)
  );
}



export function scoreStandardBlankInferenceTarget(target: string): number {
  const wordCount = countWordsForQuality(target);
  const contentCount = countContentTokens(target);
  const relationBonus = /\b(?:not|but|because|therefore|requires?|depends?|allows?|enables?|prevents?|fosters?|illuminates?|reveals?|suggests?|creates?|takes? advantage|selling|benefit|driven|trusting|capacity|transaction|product|traditional)\b/i.test(target)
    ? 4
    : 0;
  const widthPenalty = wordCount > 12 ? 1 : 0;
  return contentCount * 2 + relationBonus - widthPenalty;
}



export function buildBlankParaphraseCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const minWords =
    requestedDifficulty === "KILLER"
      ? 7
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 3;
  const minContent =
    requestedDifficulty === "KILLER"
      ? 5
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 2;
  const sentences = splitPassageSentences(passage);
  const candidateRows = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      targets: getBlankParaphraseSuggestedTargets(
        sentence,
        requestedDifficulty,
      ),
    }))
    .filter((item) => item.targets.length > 0);
  const candidates = rotateByVariantIndex(
    filterUsedCandidates(
      candidateRows,
      diversity?.usedTargets,
      ({ sentence }) => sentence,
    ).items.sort(
      (a, b) =>
        Math.max(...b.targets.map(scoreBlankParaphraseTarget)) -
        Math.max(...a.targets.map(scoreBlankParaphraseTarget)),
    ),
    diversity?.variantIndex,
  ).slice(0, 8);

  if (candidates.length === 0) {
    return [
      "## BLANK_INFERENCE paraphrase-answer target note",
      "- The blank paraphrase setting is active, but no strong automatic source target was detected.",
      `- For ${requestedDifficulty || "the requested difficulty"}, choose originalExpression as a clean semantic unit with at least ${minWords} words and ${minContent} meaningful content words when possible.`,
      "- Avoid tiny local tails, long clauses, punctuation/list spans, and dangling modal/auxiliary/function-word endings.",
      "- The visible correct option must be a non-verbatim paraphrase that fits the exact same grammatical slot.",
    ].join("\n");
  }

  return [
    "## BLANK_INFERENCE paraphrase-answer target candidates",
    "- The blank paraphrase setting is active. Prefer one of these source-backed originalExpression candidates instead of a tiny local tail.",
    `- For ${requestedDifficulty || "the requested difficulty"}, originalExpression should have at least ${minWords} words and ${minContent} meaningful content words when possible, while staying within 12 words and 90 characters.`,
    "- Use a suggested originalExpression exactly when it fits the item; otherwise choose the same kind of compact semantic relation from the listed sentence.",
    "- Do not choose a whole clause, comma-separated list span, or a 2-3 word tail such as 'making subsequent judgments' for INTERMEDIATE/KILLER.",
    "- The visible correct option must paraphrase the selected source span, preserve polarity and grammar slot, and avoid copying source wording.",
    "Suggested candidates:",
    ...candidates.map(({ sentence, index, targets }) => (
      `${index + 1}. ${sentence}\n   Suggested originalExpression options: ${targets
        .slice(0, 3)
        .map((target) => `"${target}"`)
        .join(", ")}`
    )),
  ].join("\n");
}



export function getBlankParaphraseSuggestedTargets(
  sentence: string,
  requestedDifficulty?: string,
): string[] {
  const targets: string[] = [];
  const add = (value: string | undefined) => {
    const target = normalizeSuggestedTarget(value ?? "");
    if (isValidBlankParaphraseSuggestedTarget(target, requestedDifficulty)) {
      targets.push(target);
    }
  };

  const patterns = [
    /\b(?:tendency|tendencies)\s+to\s+([^.;:!?]{20,95}?)(?=\s+when\b|,|\.|;|:|$)/gi,
    /\b(?:ability|capacity)\s+to\s+([^.;:!?]{20,95}?)(?=\s+(?:depend(?:ed|s)?|was|is|are|were)\b|,|\.|;|:|$)/gi,
    /\b((?:ability|capacity)\s+to\s+[^.;:!?]{20,95}?)(?=,|\.|;|:|$)/gi,
    /\b((?:does|do|did|is|are|was|were)\s+not\s+(?:simply|merely|only)?\s*[^.;:!?]{10,80}?\s+but\s+[^.;:!?]{10,80}?)(?=\.|,|;|:|$)/gi,
    /\b((?:not\s+because|not\s+whether|not\s+only|not\s+merely)\b[^.;:!?]{20,95}?)(?=\.|,|;|:|$)/gi,
    /\b((?:requires?|depends?|allows?|enables?|helps?|prevents?|fosters?|illuminates?|reveals?|demonstrates?|suggests?|shows?)\b[^.;:!?]{15,90}?)(?=\.|,|;|:|$)/gi,
    /\b((?:bridge|bridging|maintain|maintaining|preserve|preserving|cultivate|cultivating|engage|engaging|recognize|recognizing|interpret|interpreting|reconcile|reconciling|construct|constructing|shape|shaping|adapt|adapting)\b[^.;:!?]{12,90}?)(?=\.|,|;|:|$)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sentence))) {
      add(match[1]);
    }
  }

  return [...new Set(targets)]
    .sort((a, b) => scoreBlankParaphraseTarget(b) - scoreBlankParaphraseTarget(a))
    .slice(0, 4);
}



export function isValidBlankParaphraseSuggestedTarget(
  target: string,
  requestedDifficulty?: string,
): boolean {
  if (!target) return false;
  const wordCount = countWordsForQuality(target);
  const contentCount = countContentTokens(target);
  const minWords =
    requestedDifficulty === "KILLER"
      ? 7
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 3;
  const minContent =
    requestedDifficulty === "KILLER"
      ? 5
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 2;

  return (
    wordCount >= minWords &&
    wordCount <= 12 &&
    contentCount >= minContent &&
    target.length <= 90 &&
    !hasTrailingFunctionWordBlankTarget(target) &&
    !isListLikeBlankTarget(target) &&
    !isSingleAbstractNounTarget(target)
  );
}



export function scoreBlankParaphraseTarget(target: string): number {
  const wordCount = countWordsForQuality(target);
  const contentCount = countContentTokens(target);
  const relationBonus = /\b(?:not|but|because|therefore|requires?|depends?|allows?|enables?|prevents?|fosters?|illuminates?|constructs?|shapes?|bridge|maintain|preserve|critical|selective)\b/i.test(target)
    ? 3
    : 0;
  const widthPenalty = wordCount > 11 ? 1 : 0;
  return contentCount * 2 + relationBonus - widthPenalty;
}



export function isUsefulNegativeParaphraseSourceSentence(sentence: string): boolean {
  if (sentence.length < 45) return false;
  if (/\b(?:such as|including|for example)\s*$/i.test(sentence)) return false;
  return /\b(?:because|therefore|rather|while|whereas|when|if|not only|not merely|by contrast|in that sense|this is why|requires?|depends?|allows?|allowing|guides?|guide|protects?|protecting|strengthens?|strengthening|prevents?|preventing|keeps?|keeping|evaluating|judging|making|ensuring|influenced|based on|contribute|recover|moving|focus|revision)\b/i.test(sentence);
}



export function getNegativeParaphraseSuggestedTargets(sentence: string): string[] {
  const targets: string[] = [];
  const patterns = [
    /\b((?:guide|guides|guiding|protect|protects|protecting|strengthen|strengthens|strengthening|allow|allows|allowing|prevent|prevents|preventing|keep|keeps|keeping|evaluate|evaluates|evaluating|judge|judges|judging|make|makes|making|ensure|ensures|ensuring)\b[^.;:!?]{8,90})/gi,
    /\b((?:the\s+)?protection of [^.;:!?]{8,70})/gi,
    /\b((?:the\s+)?ability to [^.;:!?]{8,70})/gi,
    /\b((?:are|is|was|were|be|being|been)\s+(?:ultimately\s+)?based on [^.;:!?]{8,80})/gi,
    /\b((?:can|could|may|might|will|would|should|must)(?:\s+\w+ly)?\s+be\s+influenced by [^.;:!?]{8,80})/gi,
    /\b((?:influenced by|not beyond the reach of|points? to|contribute(?:s)? to)\b[^.;:!?]{8,80})/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sentence))) {
      const target = normalizeSuggestedTarget(match[1] ?? "");
      if (
        target &&
        countContentTokens(target) >= 2 &&
        !isSingleAbstractNounTarget(target) &&
        !isListLikeBlankTarget(target)
      ) {
        targets.push(target);
      }
    }
  }

  return [...new Set(targets)].slice(0, 4);
}



export function normalizeSuggestedTarget(value: string): string {
  return value
    .replace(/^that\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[;:,.!?]+$/g, "")
    .trim();
}
