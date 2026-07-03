import { resolveQuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import type { QuestionQualityIssue } from "@/lib/question-quality";
import type { QuestionGenerationRejectionIssue, QuestionGenerationRejectionSummary, RejectionPhase, RejectionRecorder, RunGenerationInput } from "./run-question-generation-types";
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mergeCustomPromptWithTypeSettings(
  customPrompt: string | undefined,
  typeSettingsPrompt: string,
): string | undefined {
  const parts = [customPrompt?.trim(), typeSettingsPrompt.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

export function formatIssuesForLog(issues: unknown): string {
  try {
    return JSON.stringify(issues);
  } catch {
    return String(issues);
  }
}

export function recordRejection(
  recorder: RejectionRecorder | undefined,
  issue: QuestionGenerationRejectionIssue,
) {
  if (!recorder) return;
  recorder.issues.push({
    ...issue,
    message: issue.message.slice(0, 800),
  });
}

export function summarizeQualityIssues(issues: QuestionQualityIssue[]): string {
  return issues
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join(" | ")
    .slice(0, 800);
}

export function buildRejectionSample(
  subType: string,
  question: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (subType === "GRAMMAR_ERROR") {
    const markedExpressions = Array.isArray(question.markedExpressions)
      ? question.markedExpressions
          .filter(isRecord)
          .map((item) => ({
            label: item.label,
            expression: item.expression,
            isError: item.isError,
            errorExpression: item.errorExpression,
            correction: item.correction,
            pointCode: item.pointCode,
          }))
      : [];
    const passageWithMarkers =
      typeof question.passageWithMarkers === "string"
        ? question.passageWithMarkers
        : "";

    return {
      markedCount: markedExpressions.length,
      renderedMarkerCount: (passageWithMarkers.match(/__[^_]+__/g) ?? []).length,
      markedExpressions,
      correctAnswer: question.correctAnswer,
      correctAnswers: question.correctAnswers,
      passageWithMarkersPreview: passageWithMarkers.slice(0, 300),
    };
  }

  if (subType === "GRAMMAR_CHOICE_COMBO") {
    const slots = Array.isArray(question.slots)
      ? question.slots
          .filter(isRecord)
          .map((item) => ({
            label: item.label,
            correctExpression: item.correctExpression,
            wrongExpression: item.wrongExpression,
            pointCode: item.pointCode,
          }))
      : [];
    const passageWithMarkers =
      typeof question.passageWithMarkers === "string"
        ? question.passageWithMarkers
        : "";

    return {
      slotCount: slots.length,
      renderedSlotCount: (passageWithMarkers.match(/\([A-C]\)\s*\[[^\[\]]*\/[^\[\]]*\]/g) ?? []).length,
      slots,
      correctAnswer: question.correctAnswer,
      passageWithMarkersPreview: passageWithMarkers.slice(0, 300),
    };
  }

  if (subType !== "IRRELEVANT") return undefined;
  const sentences = Array.isArray(question.sentences)
    ? question.sentences.filter((sentence): sentence is string => typeof sentence === "string")
    : [];
  const irrelevantIndex = Number(question.irrelevantIndex);
  const insertedSentence =
    Number.isInteger(irrelevantIndex) && irrelevantIndex >= 0
      ? sentences[irrelevantIndex]
      : undefined;

  return {
    sentenceCount: sentences.length,
    irrelevantIndex: Number.isInteger(irrelevantIndex) ? irrelevantIndex : null,
    correctAnswer: question.correctAnswer,
    insertedSentence: insertedSentence?.slice(0, 180),
    firstSentence: sentences[0]?.slice(0, 180),
    lastSentence: sentences[sentences.length - 1]?.slice(0, 180),
  };
}

export function buildRejectionSummary(
  recorder: RejectionRecorder,
): QuestionGenerationRejectionSummary {
  const phaseCounts: Record<RejectionPhase, number> = {
    model: 0,
    postprocess: 0,
    quality: 0,
  };
  const codeCounts = new Map<string, number>();

  for (const issue of recorder.issues) {
    phaseCounts[issue.phase] += 1;
    for (const code of issue.codes ?? []) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }

  const topCodes = [...codeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));
  const lastIssue = recorder.issues.at(-1);
  const topCodeText = topCodes
    .map(({ code, count }) => `${code} x${count}`)
    .join(", ");
  const message = [
    `Rejected candidates: ${recorder.issues.length}`,
    topCodeText ? `Top codes: ${topCodeText}` : "",
    lastIssue ? `Last: ${lastIssue.phase}/${lastIssue.subType} - ${lastIssue.message}` : "",
  ].filter(Boolean).join(" | ");

  return {
    total: recorder.issues.length,
    phaseCounts,
    topCodes,
    lastIssue,
    message,
  };
}

function correctiveActionForCode(code: string): string | null {
  switch (code) {
    case "duplicate-option-text":
      return "Every marked expression must be a unique visible option. Do not underline the same word or phrase twice; choose five different grammar decision points.";
    case "grammar-render-marker-count":
      return "The rendered passage must show every requested marker exactly once. Ensure each markedExpressions.expression occurs in the passage and is copied exactly.";
    case "grammar-error-not-mutated":
      return "At least one answer must visibly mutate the original source expression. For the answer, keep expression/correction as the original source and put the wrong student-visible form in errorExpression.";
    case "grammar-source-expression-not-backed":
    case "grammar-correction-not-source-backed":
      return "Copy expression and correction verbatim from the original passage. Do not invent a source form or correct to a phrase that is absent from the passage.";
    case "mid-word-marker":
      return "Do not insert a marker inside a word or punctuation run. Wrap only the exact standalone expression and verify the rendered marker count.";
    case "grammar-decoy-point-monotony":
      return "Do not pad the item with repeated pointCodes. Use at most two marks from the same grammar frame and spread decoys across different frames.";
    case "grammar-obvious-adjacent-sv-agreement":
      return "Do not use a directly adjacent subject-verb -s flip as the answer. If testing agreement, insert an attractor phrase, relative clause, or long subject between head noun and verb.";
    case "grammar-obvious-modal-gerund":
    case "grammar-obvious-modal-to-infinitive":
      return "For GRAMMAR_ERROR, do not create visibly broken modal/auxiliary surfaces such as 'can paying' or 'can to pay'; choose a subtler clause/complement trap.";
    case "grammar-obvious-intransitive-passive":
      return "Do not passivize intransitive verbs such as appear, happen, occur, belong, consist, remain, or seem.";
    case "grammar-obvious-endure-passive-object":
      return "Do not create transparent passive-with-object errors such as 'has been endured temperatures'; choose a less obvious active/passive target.";
    case "grammar-gibberish-inversion-fragment":
      return "Do not create fake inversion/subjunctive fragments such as 'had some church endured'; wrong forms must be plausible exam grammar, not gibberish.";
    case "grammar-obvious-finite-to-ing-colon":
      return "Do not turn an essential finite predicate before a colon into an -ing participle; choose a subtler finite/nonfinite target.";
    case "grammar-obvious-local-pronoun-agreement":
      return "Do not create locally visible pronoun-auxiliary clashes such as 'it are' or 'they is'; pronoun-reference answers must remain locally plausible and require antecedent tracking.";
    case "grammar-obvious-object-pronoun-subject":
      return "Do not put object-case pronouns in finite subject position, such as 'them pushes'. If testing pronoun reference, keep the displayed pronoun locally grammatical and make students track the antecedent.";
    case "grammar-obvious-before-after-to-infinitive":
      return "Do not mutate before/after + V-ing into before/after + to-V. Choose a nonfinite/complement trap that is locally plausible and context-dependent.";
    case "grammar-obvious-seem-to-gerund":
      return "Do not mutate 'seems to V' into 'seems V-ing'; it is too visibly broken for exam-quality grammar.";
    case "grammar-shallow-local-participle-parallel":
      return "Avoid same-clause participle parallel swaps such as 'were blown and solidified' -> 'were blown and solidifying'; choose a deeper structural target.";
    case "grammar-obvious-connector-to-what":
      return "Do not mutate connectors such as even if/although/while/because into 'what'; use a genuine clause-structure trap.";
    case "grammar-obvious-despite-being-to-be":
      return "Do not mutate 'despite it being' into 'despite it to be'; it is too visibly broken.";
    case "grammar-shallow-despite-although-gerund":
      return "Do not use despite -> although before 'it being' as the answer; choose a less overdrilled, source-backed structural target.";
    case "grammar-shallow-participle-adjective-answer":
      return "For INTERMEDIATE/KILLER grammar, do not use a shallow participle-adjective swap before a noun, such as 'neglected populations' -> 'neglecting populations'.";
    case "grammar-appear-adverb-mislabel":
    case "grammar-appear-pointcode-voice-mismatch":
      return "Do not call 'appear' an adverb or tag it as passive voice; in 'as it might appear' it is a linking/intransitive verb.";
    case "grammar-nonstandard-terminology":
      return "Use only standard school grammar terms; do not invent or mistype terms such as '전사구'.";
    case "grammar-obvious-living-finite":
    case "grammar-obvious-living-lived":
      return "Do not turn a reduced postmodifier like 'people living in ...' into a finite live/lives/lived form.";
    case "grammar-obvious-what-noun-prefix":
    case "grammar-obvious-noun-what-relative":
      return "Do not prepend 'what' to a complete noun phrase or complete clause; use what/that only when the following clause structure actually supports it.";
    case "grammar-debatable-attention-to-gerund":
      return "Avoid to-V -> V-ing mutations near 'attention to ...' because 'attention to finding' can be grammatical; choose an airtight structural target.";
    case "grammar-debatable-more-most-like":
      return "Avoid 'looks more like' -> 'looks most like'; it is a debatable lexical/degree choice, not a clean grammar error.";
    case "grammar-lexical-look-like-answer":
      return "Do not use 'look(s) more like' -> 'look(s) more likely/most like' as a grammar error; skip that passage phrase entirely.";
    case "grammar-semantic-how-why-answer":
      return "Do not use how/why near 'the way ...' as a grammar-error answer; it is semantic/collocational rather than a clean grammar violation.";
    case "grammar-debatable-sink-passive":
      return "Avoid sinking -> sunk/passive as the answer; 'sink' has transitive/passive uses and can make the grammar judgment debatable.";
    case "grammar-shallow-because-despite-clause":
      return "Avoid because -> despite before a finite clause; it is an overdrilled local preposition/conjunction swap.";
    case "grammar-killer-answer-point-repeated":
      return "For KILLER grammar, do not repeat the answer's grammar pointCode in decoys; make each non-answer underline use a different grammar frame.";
    case "grammar-killer-generic-answer-point":
      return "For KILLER grammar, do not tag the answer as generic a or lexical/comparison m. Choose a precise structural frame such as d, c, b, e, g, h, i, k, or l.";
    case "grammar-explanation-self-contradictory":
      return "Rewrite the explanation as a clean final rationale only; never include self-review, backtracking, or scratchpad language.";
    case "grammar-weak-filler-decoys":
      return "Replace weak filler underlines with meaningful grammar decisions that could attract a strong student. Do not use decorative surfaces such as it, that way, As one, does, it's, looks/looks more like, former/latter, uneven, one/ones, or bare comparative words as decoys.";
    case "grammar-marker-too-dense":
      return "Space grammar markers apart: no back-to-back labels, no labels within fewer than two source words, and prefer one marker per sentence or clearly separated clauses.";
    case "grammar-killer-thin-answer":
    case "killer-answer-not-structurally-loaded":
      return "For KILLER, the answer must require long-distance structure, semantic subject, reduced clause, complement pattern, or modifier-scope reasoning.";
    case "grammar-killer-thin-concessive-as":
      return "For KILLER grammar, do not use a single concessive as/though -> how idiom as the answer; choose a deeper cross-clause or long-distance structural dependency.";
    case "grammar-killer-thin-connector":
      return "For KILLER grammar, do not use a single connector/preposition swap such as because -> because of as the answer; choose a deeper cross-clause or long-distance dependency.";
    case "grammar-debatable-it-being-decoy":
      return "Do not use 'it being' after a preposition as a correct decoy; it can invite a formal 'its being' dispute.";
    case "grammar-explanation-typo":
      return "Spellcheck every explanation and wrong-option rationale; fix typos such as 'dsepite' before returning the item.";
    case "grammar-noun-clause-pronoun-mislabel":
      return "Do not call a plain pronoun-reference or independent-clause check a noun-clause issue; use the exact grammar category of the marked structure.";
    case "grammar-phrasal-verb-mislabel":
      return "Do not call passive participles or parallel participle phrases phrasal verbs; reserve 'phrasal verb' for verb + particle/preposition combinations.";
    case "grammar-vague-metadata-tag":
      return "Use only precise grammar-frame tags that correspond to marked options; remove vague tags such as noun-flow analysis.";
    case "grammar-look-like-complement-mislabel":
      return "Do not explain 'look(s) more like + noun phrase' as an adjective-complement test; it is a comparative/prepositional pattern.";
    case "grammar-seem-to-complement-mislabel":
      return "Do not explain 'seem(s) to V' as an adjective-complement or copular-complement test; analyze it as seem + to-infinitive clause, or choose a different decoy.";
    case "grammar-seem-to-object-mislabel":
      return "Do not call the to-infinitive after seem an object; seem is intransitive/copular and the to-infinitive is a complement clause.";
    case "grammar-that-way-adverb-mislabel":
      return "Do not call 'that' in 'that way' a demonstrative adverb; it is a demonstrative determiner modifying the noun way.";
    case "grammar-human-made-postmodifier-mislabel":
      return "Do not call human-made a post-nominal participle; in phrases like 'human-made substances' it is a pre-nominal compound adjective.";
    case "grammar-basic-overloaded-design":
      return "For BASIC grammar, do not pile up advanced frames in keyPoints or decoys; keep the answer one-step and the decoys clean, familiar, and accurately explained.";
    case "grammar-too-basic-decoys":
      return "For INTERMEDIATE/KILLER grammar, replace pronoun/do-support filler decoys such as those/one/does with structurally meaningful distractors.";
    case "grammar-shallow-checklist-decoys":
      return "Replace shallow checklist decoys such as this/as a/it/that way/does/As one/looks more like/seems to V with structurally tempting grammar targets from different clauses.";
    case "grammar-shallow-depends-decoy":
      return "Do not use a simple 'depends on' subject-verb match as a decoy; replace it with a structurally meaningful target.";
    case "grammar-shallow-nearby-passive-decoy":
      return "Do not use nearby pronoun + be p.p. phrases such as 'they were blown' as passive-voice decoys; choose a more structurally loaded target.";
    case "grammar-shallow-than-decoy":
      return "Do not use standalone comparative 'than' as a correct decoy; replace it with a structurally meaningful comparative, clause, complement, or modifier-scope target.";
    case "grammar-explanation-too-long-hard":
      return "Shorten the main grammar explanation to the answer's decisive structure only; put non-answer rationales in wrongOptionExplanations.";
    case "grammar-agreement-explanation-too-thin":
      return "For long-distance subject-verb agreement, explicitly name the intervening modifier/relative phrase and the true subject head in the main explanation.";
    case "grammar-keypoint-untested-token":
      return "Do not mention a connector or grammar token in keyPoints unless one marked option actually tests that token.";
    case "grammar-mixed-as-it-span":
      return "Do not underline 'as it' as one target; choose either the connector 'as' or the pronoun 'it' only if that exact item is being tested.";
    case "grammar-underline-punctuated-fragment":
      return "Do not underline punctuation-bearing sentence fragments such as 'asking: for some scientists it is'; move the marker to the exact grammar token.";
    case "grammar-error-explanation-surface-order":
      return "In explanations, mention the student-visible wrong surface first, then the correct source form.";
    case "grammar-surrounding-missing-marker":
      return "Ensure every marker's surroundingText contains the exact marked expression and points to the same source location.";
    default:
      return null;
  }
}

function shortRetrySurface(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function rejectedGrammarSurfaceLine(issue: QuestionGenerationRejectionIssue): string | null {
  if (issue.subType !== "GRAMMAR_ERROR") return null;
  const markedExpressions = Array.isArray(issue.sample?.markedExpressions)
    ? issue.sample.markedExpressions.filter(isRecord)
    : [];
  if (markedExpressions.length === 0) return null;
  const surfaces = markedExpressions
    .map((item) => {
      const label = shortRetrySurface(item.label) || "?";
      const expression = shortRetrySurface(item.expression);
      const errorExpression = shortRetrySurface(item.errorExpression);
      if (!expression) return "";
      return errorExpression && errorExpression !== expression
        ? `${label}:${expression}->${errorExpression}`
        : `${label}:${expression}`;
    })
    .filter(Boolean)
    .slice(0, 6);
  if (surfaces.length === 0) return null;
  return `- Rejected sample surfaces to abandon: ${surfaces.join("; ")}. Choose fresh, source-backed grammar targets instead of reusing these weak or broken surfaces.`;
}

/**
 * 직전 시도에서 새로 기록된 거절 사유를 다음 프롬프트에 주입할 짧은 한국어
 * 교정 지시 블록으로 만든다. 같은 실수를 반복하는 "맹목 재시도"를 구체적 사유를
 * 본 "교정 재생성"으로 바꿔 수율을 올리고 재시도 횟수를 줄인다.
 */
function retrySurfaceKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function rejectedGrammarSurfaceSummaryLine(
  issues: QuestionGenerationRejectionIssue[],
): string | null {
  const seen = new Set<string>();
  const surfaces: string[] = [];
  for (const issue of issues) {
    if (issue.subType !== "GRAMMAR_ERROR") continue;
    const markedExpressions = Array.isArray(issue.sample?.markedExpressions)
      ? issue.sample.markedExpressions.filter(isRecord)
      : [];
    for (const item of markedExpressions) {
      const expression = shortRetrySurface(item.expression);
      if (!expression) continue;
      const errorExpression = shortRetrySurface(item.errorExpression);
      const correction = shortRetrySurface(item.correction);
      const label = shortRetrySurface(item.label);
      const pointCode = shortRetrySurface(item.pointCode);
      const isError = item.isError === true;
      const mutation =
        errorExpression && errorExpression !== expression
          ? `${expression}->${errorExpression}`
          : correction && correction !== expression
            ? `${expression}->${correction}`
            : expression;
      const summary = [
        label ? `${label}:` : "",
        mutation,
        pointCode ? `(${pointCode})` : "",
        isError ? "[answer]" : "",
      ].filter(Boolean).join("");
      const key = retrySurfaceKey(summary);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      surfaces.push(summary);
      if (surfaces.length >= 14) break;
    }
    if (surfaces.length >= 14) break;
  }
  if (surfaces.length === 0) return null;
  return `- Hard-ban failed GRAMMAR_ERROR surfaces from all previous attempts: ${surfaces.join("; ")}. Do not reuse these expressions, labels, or mutation patterns; choose a new source-backed frame.`;
}

export function buildCorrectiveRetryFeedback(
  issues: QuestionGenerationRejectionIssue[],
  options: { cumulativeIssues?: QuestionGenerationRejectionIssue[] } = {},
): string | undefined {
  if (issues.length === 0) return undefined;
  const seen = new Set<string>();
  const lines: string[] = [];
  const grammarSurfaceSummary = rejectedGrammarSurfaceSummaryLine(
    options.cumulativeIssues?.length ? options.cumulativeIssues : issues,
  );
  if (grammarSurfaceSummary) lines.push(grammarSurfaceSummary);
  for (const issue of issues) {
    const key =
      issue.codes && issue.codes.length > 0
        ? issue.codes.join(",")
        : issue.message;
    if (seen.has(key)) continue;
    seen.add(key);
    const codeText = issue.codes?.length ? `[${issue.codes.join(", ")}] ` : "";
    // 따옴표 안 내용(정답·표현 파생 텍스트)은 다음 프롬프트로의 누설 경로가 될 수
    // 있어 …로 가린다. 게이트 이름·구조적 사유는 보존돼 교정 신호로는 충분하다.
    const detail = issue.message
      .replace(/[“”"][^“”"]*[“”"]|'[^']*'/g, "…")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    if (detail) lines.push(`- ${codeText}${detail}`);
    const sampleLine = rejectedGrammarSurfaceLine(issue);
    if (sampleLine) lines.push(sampleLine);
    for (const code of issue.codes ?? []) {
      const action = correctiveActionForCode(code);
      if (action) lines.push(`- Fix: ${action}`);
    }
    if (lines.length >= 14) break;
  }
  if (lines.length === 0) return undefined;
  return [
    "## Corrective retry feedback from the previous failed generation",
    "## 직전 생성 실패 — 아래 사유를 반드시 교정해서 다시 출제",
    ...lines,
    "Regenerate a fresh item that fixes every listed defect. Preserve the requested type, answer count, marker count, and source-grounded corrections. Do not repeat the same failed surface pattern.",
    "위와 동일한 실수를 반복하지 마세요. 형식·정답 개수·밑줄/표현의 원문 일치·오답 선지의 매력도(지문 어휘에 기반한 그럴듯한 near-miss, 정답과 길이·문체가 비슷할 것)를 모두 충족하는 새 문항을 생성하세요.",
  ].join("\n");
}

export function hasDoubleNegativeBlankSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const blankSettings = input.typeSettings?.BLANK_INFERENCE;
  return (
    typeof blankSettings === "object" &&
    blankSettings !== null &&
    "doubleNegative" in blankSettings &&
    (blankSettings as { doubleNegative?: unknown }).doubleNegative === true
  );
}

export function hasBlankParaphraseAnswerSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const resolved = resolveQuestionTypeGenerationSettings(
    "BLANK_INFERENCE",
    input.typeSettings?.BLANK_INFERENCE,
  );
  return (
    resolved.blankInferenceParaphraseAnswer === true &&
    resolved.blankInferenceDoubleNegative !== true &&
    (resolved.blankInferenceBlankCount ?? 1) === 1
  );
}

export function hasSingleBlankInferenceSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const resolved = resolveQuestionTypeGenerationSettings(
    "BLANK_INFERENCE",
    input.typeSettings?.BLANK_INFERENCE,
  );
  return (resolved.blankInferenceBlankCount ?? 1) === 1;
}

export function getLargestIrrelevantSlotCount(input: RunGenerationInput): number {
  let maxSlotCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "IRRELEVANT" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxSlotCount = Math.max(
      maxSlotCount,
      resolved.irrelevantSlotCount ?? 0,
    );
  }
  return maxSlotCount;
}

export function getLargestGrammarMarkerCount(input: RunGenerationInput): number {
  let maxMarkerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxMarkerCount = Math.max(
      maxMarkerCount,
      resolved.grammarMarkerCount ?? 0,
    );
  }
  return maxMarkerCount;
}

export function getLargestGrammarAnswerCount(input: RunGenerationInput): number {
  let maxAnswerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxAnswerCount = Math.max(
      maxAnswerCount,
      resolved.grammarAnswerCount ?? 0,
    );
  }
  return maxAnswerCount;
}
