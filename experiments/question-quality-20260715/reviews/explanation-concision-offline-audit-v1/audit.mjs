import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const write = process.argv.includes("--write");
const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const paths = {
  manual: "experiments/question-quality-20260715/reviews/explanation-concision-offline-audit-v1/manual-review.json",
  latest: "scripts/_gen_audit_out/jul15-dawn-questions.json",
  latestManifest: "experiments/question-quality-20260715/baseline/jul15-dawn/private/manifest-private.json",
  latestRater1: "experiments/question-quality-20260715/reviews/jul15-dawn/rater-1-final.json",
  latestRater2: "experiments/question-quality-20260715/reviews/jul15-dawn/rater-2-final.json",
  latestAdjudication: "experiments/question-quality-20260715/reviews/jul15-dawn/adjudication.json",
  premiumManifest: "experiments/question-quality-20260715/reviews/premium-grammar-60/sealed-manifest.json",
  premiumAdjudication: "experiments/question-quality-20260715/reviews/premium-grammar-60/adjudication/adjudication-final.json",
  premiumAdjudicationMd: "experiments/question-quality-20260715/reviews/premium-grammar-60/adjudication/adjudication-final.md",
  baselineEvidence: "experiments/question-quality-20260715/baseline-evidence.json",
  deploymentProvenance: "experiments/question-quality-20260715/offline/production-deployment-provenance.json",
  schema: "src/lib/question-ai-schemas-mc.ts",
  promptContract: "src/lib/question-generation-prompt-contract.ts",
  prompts: "src/app/api/ai/generate-questions-auto/_lib/prompts.ts",
  dispatcher: "src/lib/question-quality/dispatcher.ts",
  explanationLint: "src/lib/question-quality/validators/grammar/explanation-lint.ts",
  grammarShared: "src/lib/question-quality/validators/grammar/shared.ts",
  grammarCombo: "src/lib/question-quality/validators/grammar/combo.ts",
  optionsValidator: "src/lib/question-quality/validators/options.ts",
  miscValidator: "src/lib/question-quality/validators/misc.ts",
  repair: "src/app/api/ai/generate-questions-auto/_lib/question-repair.ts"
};

function bytes(path) {
  return readFileSync(resolve(repo, path));
}

function text(path) {
  return bytes(path).toString("utf8");
}

function json(path) {
  return JSON.parse(text(path));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function describe(values) {
  if (!values.length) return { n: 0, mean: null, median: null, min: null, max: null };
  return {
    n: values.length,
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    median: round(median(values)),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function sentenceCount(value) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return 0;
  const parts = normalized
    .split(/(?<=[.!?])(?:["'”’)]*)\s+(?=[가-힣A-Za-z0-9(①-⑩])/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return Math.max(1, parts.length);
}

function hangulCount(value) {
  return [...String(value ?? "")].filter((character) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(character)).length;
}

function wrongExplanationEntries(raw) {
  if (Array.isArray(raw)) {
    return raw.map((entry) => [String(entry?.label ?? ""), String(entry?.explanation ?? "")]);
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([label, value]) => [label, typeof value === "string" ? value : String(value?.explanation ?? "")]);
  }
  return [];
}

function tokens(value) {
  return new Set(
    String(value ?? "")
      .toLowerCase()
      .match(/[가-힣]{2,}|[a-z]{3,}/gu)?.filter((token) => !new Set([
        "따라서", "그리고", "하지만", "문장", "지문", "정답", "오답", "부분", "해당", "형태", "역할", "사용", "설명"
      ]).has(token)) ?? []
  );
}

function overlap(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

function keyRestatementHits(explanation, keyPoints) {
  return (keyPoints ?? []).filter((point) => overlap(explanation, point) >= 0.6).length;
}

function mainSentenceRedundancyPairs(explanation) {
  const sentences = String(explanation ?? "")
    .split(/(?<=[.!?])(?:["'”’)]*)\s+/u)
    .map((part) => part.trim())
    .filter((part) => tokens(part).size >= 4);
  let count = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    for (let j = i + 1; j < sentences.length; j += 1) {
      if (overlap(sentences[i], sentences[j]) >= 0.55) count += 1;
    }
  }
  return count;
}

const proceduralPatterns = [
  /학술적으로\s*패러프레이/gu,
  /(?:원문|표현)을?[^.]{0,50}패러프레이/gu,
  /출제\s*(?:과정|의도|포인트)/gu,
  /(?:다시|재차)\s*(?:검토|확인)/gu,
  /정답을\s*(?:찾기|고르기)\s*위해/gu,
  /(?:우선|먼저)\s*문제를\s*살펴/gu
];

const terminologyPatterns = [
  /전사구/gu,
  /보문\s*명사/gu,
  /(?<![관회세통설기])계사(?!년|월|일|시)/gu,
  /술어부\s*골격/gu,
  /통사적으로/gu,
  /질의\s*관계/gu,
  /비인칭\s*동사/gu,
  /등위\s*상관접속/gu
];

function regexHits(value, patterns) {
  return patterns.reduce((count, pattern) => count + [...String(value ?? "").matchAll(pattern)].length, 0);
}

function canonicalLabel(value) {
  const label = String(value ?? "").trim().toUpperCase();
  const circle = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5", "⑥": "6", "⑦": "7", "⑧": "8", "⑨": "9", "⑩": "10" };
  if (circle[label]) return circle[label];
  const paren = /^\(([A-J]|\d{1,2})\)$/.exec(label);
  return paren ? paren[1] : label;
}

function correctLabels(question) {
  const values = Array.isArray(question.correctAnswers)
    ? question.correctAnswers
    : String(question.correctAnswer ?? "").split(/\s*,\s*/);
  return new Set(values.map(canonicalLabel).filter(Boolean));
}

function deterministicLabelAudit(question) {
  const options = Array.isArray(question.options) ? question.options : [];
  const optionLabels = new Set(options.map((option) => canonicalLabel(option?.label)).filter(Boolean));
  const answers = correctLabels(question);
  const wrongEntries = wrongExplanationEntries(question.wrongOptionExplanations);
  const wrongLabels = wrongEntries.map(([label]) => canonicalLabel(label)).filter(Boolean);
  const expectedWrong = [...optionLabels].filter((label) => !answers.has(label));
  return {
    optionCount: optionLabels.size,
    answerCount: answers.size,
    expectedWrongExplanationCount: expectedWrong.length,
    actualWrongExplanationCount: wrongEntries.length,
    missingWrongLabels: expectedWrong.filter((label) => !wrongLabels.includes(label)),
    extraWrongLabels: wrongLabels.filter((label) => !optionLabels.has(label)),
    answerLabelsInWrongExplanations: wrongLabels.filter((label) => answers.has(label)),
    duplicateWrongLabels: wrongLabels.filter((label, index) => wrongLabels.indexOf(label) !== index)
  };
}

function metricsFor(question) {
  const explanation = String(question.explanation ?? "");
  const wrongEntries = wrongExplanationEntries(question.wrongOptionExplanations);
  const keyPoints = Array.isArray(question.keyPoints) ? question.keyPoints.map(String) : [];
  const allStudentText = [explanation, ...wrongEntries.map(([, value]) => value), ...keyPoints].join("\n");
  return {
    mainChars: explanation.length,
    mainHangulChars: hangulCount(explanation),
    mainSentences: sentenceCount(explanation),
    wrongExplanationCount: wrongEntries.length,
    wrongExplanationChars: wrongEntries.reduce((sum, [, value]) => sum + value.length, 0),
    wrongExplanationSentences: wrongEntries.reduce((sum, [, value]) => sum + sentenceCount(value), 0),
    longestWrongExplanationChars: Math.max(0, ...wrongEntries.map(([, value]) => value.length)),
    keyPointCount: keyPoints.length,
    keyPointChars: keyPoints.reduce((sum, value) => sum + value.length, 0),
    totalStudentFacingChars: explanation.length + wrongEntries.reduce((sum, [, value]) => sum + value.length, 0) + keyPoints.reduce((sum, value) => sum + value.length, 0),
    keyRestatementHits: keyRestatementHits(explanation, keyPoints),
    mainSentenceRedundancyPairs: mainSentenceRedundancyPairs(explanation),
    proceduralFillerHits: regexHits(allStudentText, proceduralPatterns),
    terminologySuspicionHits: regexHits(allStudentText, terminologyPatterns),
    labelAudit: deterministicLabelAudit(question)
  };
}

function aggregate(rows) {
  const manualRows = rows.filter((row) => row.manual);
  const classes = {};
  for (const row of manualRows) classes[row.manual.classification] = (classes[row.manual.classification] ?? 0) + 1;
  return {
    items: rows.length,
    independentPassageClusters: new Set(rows.map((row) => row.passageId).filter(Boolean)).size,
    mainChars: describe(rows.map((row) => row.metrics.mainChars)),
    mainHangulChars: describe(rows.map((row) => row.metrics.mainHangulChars)),
    mainSentences: describe(rows.map((row) => row.metrics.mainSentences)),
    wrongExplanationCount: describe(rows.map((row) => row.metrics.wrongExplanationCount)),
    wrongExplanationChars: describe(rows.map((row) => row.metrics.wrongExplanationChars)),
    totalStudentFacingChars: describe(rows.map((row) => row.metrics.totalStudentFacingChars)),
    itemsOverMain450: rows.filter((row) => row.metrics.mainChars > 450).length,
    itemsOverMain500: rows.filter((row) => row.metrics.mainChars > 500).length,
    itemsOverMain650: rows.filter((row) => row.metrics.mainChars > 650).length,
    itemsWithWrongExplanationOver180: rows.filter((row) => row.metrics.longestWrongExplanationChars > 180).length,
    itemsWithHeuristicKeyRestatement: rows.filter((row) => row.metrics.keyRestatementHits > 0).length,
    itemsWithHeuristicSentenceRedundancy: rows.filter((row) => row.metrics.mainSentenceRedundancyPairs > 0).length,
    itemsWithProceduralFillerPattern: rows.filter((row) => row.metrics.proceduralFillerHits > 0).length,
    itemsWithTerminologySuspicionPattern: rows.filter((row) => row.metrics.terminologySuspicionHits > 0).length,
    itemsWithDeterministicLabelCoverageFailure: rows.filter((row) => {
      const audit = row.metrics.labelAudit;
      return audit.missingWrongLabels.length || audit.extraWrongLabels.length || audit.answerLabelsInWrongExplanations.length || audit.duplicateWrongLabels.length;
    }).length,
    manuallyReviewed: manualRows.length,
    manualClassification: classes,
    manualFlags: {
      repeatedPremiseOrKeyRestatement: manualRows.filter((row) => row.manual.repeatedPremiseOrKeyRestatement).length,
      proceduralFiller: manualRows.filter((row) => row.manual.proceduralFiller).length,
      unsupportedTerminology: manualRows.filter((row) => row.manual.unsupportedTerminology).length,
      labelOrKeyMismatch: manualRows.filter((row) => row.manual.labelOrKeyMismatch).length,
      decisiveEvidenceOmitted: manualRows.filter((row) => row.manual.decisiveEvidenceOmitted).length,
      clearFactualError: manualRows.filter((row) => row.manual.clearFactualError).length
    },
    sealedV4Failures: rows.filter((row) => row.sealedV4 === false).length
  };
}

function group(rows, keyFn) {
  return Object.fromEntries(
    [...new Set(rows.map(keyFn))].sort().map((key) => [key, aggregate(rows.filter((row) => keyFn(row) === key))])
  );
}

const manual = json(paths.manual);
const latestManual = new Map(manual.latest15.map((entry) => [entry.itemId, entry]));
const premiumManual = new Map(manual.premiumGrammar60Stratified.map((entry) => [entry.itemId, entry]));
const latestQuestions = json(paths.latest);
const latestManifest = json(paths.latestManifest);
const latestByOriginalId = new Map(latestQuestions.map((question) => [question.id, question]));
const latestRater1 = new Map(json(paths.latestRater1).map((entry) => [entry.itemId, entry]));
const latestRater2 = new Map(json(paths.latestRater2).map((entry) => [entry.itemId, entry]));
const latestAdjudication = new Map(json(paths.latestAdjudication).map((entry) => [entry.itemId, entry]));
const deploymentCutoff = Date.parse("2026-07-14T14:55:04.535Z");

function finalLatestV4(itemId) {
  const adjudicated = latestAdjudication.get(itemId);
  if (adjudicated) return adjudicated.finalValidity.V4;
  const left = latestRater1.get(itemId)?.validity?.V4;
  const right = latestRater2.get(itemId)?.validity?.V4;
  if (left !== right) throw new Error(`Unadjudicated V4 disagreement for ${itemId}`);
  return left;
}

const latestRows = latestManifest.map((manifestEntry) => {
  const raw = latestByOriginalId.get(manifestEntry.originalId);
  if (!raw) throw new Error(`Missing latest raw row ${manifestEntry.originalId}`);
  const question = raw.structuredData;
  return {
    itemId: manifestEntry.blindId,
    originalId: manifestEntry.originalId,
    passageId: raw.passageId,
    createdAt: manifestEntry.createdAt,
    deploymentSide: Date.parse(manifestEntry.createdAt) < deploymentCutoff ? "PRE_DEPLOY" : "POST_DEPLOY",
    plan: manifestEntry.plan,
    type: manifestEntry.type,
    difficulty: manifestEntry.requestedDifficulty,
    sealedV4: finalLatestV4(manifestEntry.blindId),
    metrics: metricsFor(question),
    manual: latestManual.get(manifestEntry.blindId) ?? null
  };
});

const premiumManifest = json(paths.premiumManifest);
const premiumAdjudication = json(paths.premiumAdjudication);
const premiumFinalById = new Map(premiumAdjudication.items.map((entry) => [entry.itemId, entry]));
const premiumRows = premiumManifest.items.map((entry) => {
  const question = entry.fullCandidate.question;
  const final = premiumFinalById.get(entry.itemId);
  if (!final) throw new Error(`Missing premium adjudication ${entry.itemId}`);
  return {
    itemId: entry.itemId,
    originalId: entry.sourceKey,
    passageId: entry.passageId,
    createdAt: null,
    deploymentSide: "HISTORICAL_EXPERIMENT_NOT_PRODUCTION_DEPLOY_BOUND",
    plan: "PREMIUM_GRAMMAR_TRIPLE_LADDER",
    type: "GRAMMAR_ERROR",
    difficulty: entry.fullCandidate.difficulty,
    run: final.run,
    sealedV4: final.validity.V4,
    finalGrade: final.grade,
    metrics: metricsFor(question),
    manual: premiumManual.get(entry.itemId) ?? null
  };
});

const sourceTexts = Object.fromEntries([
  "schema", "promptContract", "prompts", "dispatcher", "explanationLint", "grammarShared", "grammarCombo", "optionsValidator", "miscValidator", "repair"
].map((key) => [key, text(paths[key])]));

const contractObservations = {
  blankSchemaRequestsMain200To450AndAllWrongTraps: /빈칸[^\n]*200~450자[\s\S]{0,500}각 오답의 함정 기제/.test(sourceTexts.schema),
  grammarSchemaRequestsMain200To450: /정답 해설 \(한국어, 200~450자, 4단 구조\)/.test(sourceTexts.schema),
  premiumPromptCapsMain200To450: /Keep explanation to 200-450 Korean characters/.test(sourceTexts.prompts),
  premiumPromptCapsWrongUnder180: /wrongOptionExplanations value to one concise Korean sentence under 180 characters/.test(sourceTexts.prompts),
  commonPromptRequestsThreeToFiveSentences: /explanation: Korean, 3-5 concise evidence-based sentences/.test(sourceTexts.promptContract),
  contractRequiresAllWrongOptionExplanations: /wrongOptionExplanations must contain exactly one entry for each wrong option label/.test(sourceTexts.promptContract),
  grammarHardLengthGate650: /normalizedGrammarExplanation\.length > 650/.test(sourceTexts.dispatcher),
  grammarSoftLengthGate500: /normalizedGrammarExplanation\.length > 500/.test(sourceTexts.dispatcher),
  genericKillerMinimum80Warning: /explanation\.length < 80/.test(sourceTexts.miscValidator),
  explanationOnlyRepairIsGrammarOnly: /subType === "GRAMMAR_ERROR"[\s\S]{0,180}blockingIssues\.every\(\(issue\) => isExplanationOnlyGrammarIssue/.test(sourceTexts.repair),
  explanationRepairUsesFullResponseSchema: /generateWithRetry\([\s\S]{0,80}responseSchema/.test(sourceTexts.repair),
  complementizerThatGatePresent: /complementizer that after a clause-taking verb/.test(sourceTexts.grammarCombo),
  retainedObjectPassiveGatePresent: /grammar-debatable-retained-object-passive/.test(sourceTexts.dispatcher),
  factualTerminologyErrorSplitPresent: /grammar-terminology-error/.test(sourceTexts.dispatcher)
};

const latestByTypePlan = group(latestRows, (row) => `${row.type}|${row.plan}`);
const latestByDeploy = group(latestRows, (row) => row.deploymentSide);
const premiumByDifficulty = group(premiumRows, (row) => row.difficulty);
const premiumReviewed = premiumRows.filter((row) => row.manual);

const data = {
  schemaVersion: "explanation-concision-offline-audit-v1",
  generatedDeterministically: true,
  externalNetworkCalls: 0,
  modelCalls: 0,
  apiCalls: 0,
  databaseCalls: 0,
  secretReads: 0,
  deploymentBoundary: {
    cutoffUtc: "2026-07-14T14:55:04.535Z",
    cutoffKst: "2026-07-14T23:55:04.535+09:00",
    latestPreCount: latestRows.filter((row) => row.deploymentSide === "PRE_DEPLOY").length,
    latestPostCount: latestRows.filter((row) => row.deploymentSide === "POST_DEPLOY").length,
    triggerParityKnown: false,
    warning: "The latest dump crosses the deployment boundary. The production deployment was dirty and Trigger per-file parity is unknown; post-deploy rows are a tiny descriptive window, not a prevalence estimate for the current worktree."
  },
  currentContractObservations: contractObservations,
  latest15: {
    overall: aggregate(latestRows),
    byDeploymentSide: latestByDeploy,
    byTypePlan: latestByTypePlan,
    rows: latestRows
  },
  premiumGrammar60: {
    overall: aggregate(premiumRows),
    byDifficulty: premiumByDifficulty,
    manuallyReviewedStratifiedSubset: aggregate(premiumReviewed),
    repeatedPassageClusters: premiumManifest.duplicatePassageClusters.length,
    warning: "Sixty rows are two generations over thirty passage clusters; item-level rates are descriptive and not sixty independent observations.",
    rows: premiumRows
  },
  manualHeuristicValidation: {
    latestManualCount: latestRows.filter((row) => row.manual).length,
    premiumManualCount: premiumReviewed.length,
    note: "Lexical overlap and terminology regexes are screening signals only. Manual flags, displayed item inspection and sealed V4 adjudication control factual conclusions."
  },
  limitations: [
    "No database was queried; the latest dump and historical sealed artifacts are the complete data boundary.",
    "The latest fifteen contain only five distinct passages, fourteen KILLER requests and a mixed deployment boundary.",
    "The current worktree contains uncommitted post-sample quality changes; historical failures are not estimates of current-source prevalence.",
    "Sentence splitting and lexical-overlap heuristics can miscount English quotations, Korean abbreviations and intentionally concise keyPoint summaries.",
    "Factual error and decisive-evidence omission require semantic judgment; regex counts are not substitutes."
  ]
};

const hashPaths = [...new Set(Object.values(paths))].sort();
const sourceHashes = {
  schemaVersion: "explanation-concision-source-hashes-v1",
  files: hashPaths.map((path) => ({ path, bytes: bytes(path).length, sha256: sha256(bytes(path)) }))
};

const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const dataText = stable(data);
const hashesText = stable(sourceHashes);

if (direct && write) {
  writeFileSync(resolve(here, "audit-data.json"), dataText, "utf8");
  writeFileSync(resolve(here, "source-hashes.json"), hashesText, "utf8");
  console.log("WROTE audit-data.json source-hashes.json");
} else if (direct) {
  process.stdout.write(dataText);
}

export { data, dataText, sourceHashes, hashesText };
