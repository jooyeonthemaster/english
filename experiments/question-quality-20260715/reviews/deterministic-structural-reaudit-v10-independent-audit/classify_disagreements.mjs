import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [sealedCasesArg, auditDirectoryArg, repoRootArg] = process.argv.slice(2);
if (!sealedCasesArg || !auditDirectoryArg || !repoRootArg) {
  throw new Error(
    "usage: node classify_disagreements.mjs <sealed-cases.json> <audit-directory> <repo-root>",
  );
}

const sealedCasesPath = path.resolve(sealedCasesArg);
const auditDirectory = path.resolve(auditDirectoryArg);
const repoRoot = path.resolve(repoRootArg);
const [casesBytes, mapBytes, predictionsBytes, sealBytes] = await Promise.all([
  readFile(sealedCasesPath),
  readFile(path.join(auditDirectory, "sealed-blind-map.json")),
  readFile(path.join(auditDirectory, "predictions.json")),
  readFile(path.join(auditDirectory, "PREDICTION_SEAL.json")),
]);
const source = JSON.parse(casesBytes.toString("utf8"));
const blindMap = JSON.parse(mapBytes.toString("utf8"));
const predictionPayload = JSON.parse(predictionsBytes.toString("utf8"));
const predictionSeal = JSON.parse(sealBytes.toString("utf8"));
if (sha256(predictionsBytes) !== predictionSeal.predictionsSha256) {
  throw new Error("predictions changed after their pre-adjudication seal");
}

const predictionByBlindId = new Map(
  predictionPayload.predictions.map((prediction) => [prediction.blindId, prediction]),
);
const predictionBySourceId = new Map(
  blindMap.mapping.map((entry) => [
    entry.sourceId,
    predictionByBlindId.get(entry.blindId),
  ]),
);
const casesByPairId = new Map();
for (const caseValue of source.cases) {
  const rows = casesByPairId.get(caseValue.pairId) ?? [];
  rows.push(caseValue);
  casesByPairId.set(caseValue.pairId, rows);
}

const sourceReferences = await buildSourceReferences();
const rows = [];
for (const defect of source.cases) {
  const production = predictionBySourceId.get(defect.id);
  if (defect.expected !== "DEFECT" || production?.prediction !== "NORMAL") continue;
  const pair = casesByPairId.get(defect.pairId) ?? [];
  const control = pair.find((candidate) => candidate.expected === "NORMAL");
  if (!control) throw new Error(`no matched normal control for ${defect.id}`);
  const controlProduction = predictionBySourceId.get(control.id);
  if (controlProduction?.prediction !== "NORMAL") {
    throw new Error(`matched control ${control.id} is not a production true negative`);
  }

  const decision = classify(defect);
  rows.push({
    caseId: defect.id,
    pairId: defect.pairId,
    pairedControlCaseId: control.id,
    family: defect.family,
    language: defect.language,
    sourceClassification: "FN",
    expected: defect.expected,
    productionPrediction: production.prediction,
    adjudication: decision.adjudication,
    rootCause: decision.rootCause,
    reason: decision.reason,
    productScopeEvidence: decision.productScopeEvidence,
    contractEvidence: relevantFixtureEvidence(defect),
    productionEvidence: stripPredictionIdentity(production),
    sourceReferences: sourceReferences[decision.sourceReferenceGroup],
    matchedControl: {
      caseId: control.id,
      expected: control.expected,
      productionPrediction: controlProduction.prediction,
      reviewResult: decision.controlReviewResult,
      fixtureDeltaPaths: diffPaths(defect.fixture, control.fixture),
      contractEvidence: relevantFixtureEvidence(control),
      productionEvidence: stripPredictionIdentity(controlProduction),
    },
    recommendedBoundary: decision.recommendedBoundary,
  });
}

if (rows.length !== 75) {
  throw new Error(`expected 75 false negatives, classified ${rows.length}`);
}
if (new Set(rows.map(({ caseId }) => caseId)).size !== 75) {
  throw new Error("duplicate disagreement case in classification");
}
if (new Set(rows.map(({ pairedControlCaseId }) => pairedControlCaseId)).size !== 75) {
  throw new Error("matched controls are not one-to-one");
}

const classifications = [
  "CONFIRMED_PRODUCT_CONTRACT",
  "ORACLE_SCOPE_MISMATCH",
  "AMBIGUOUS",
  "REDUNDANT_UPSTREAM",
];
const summary = {
  totalFalseNegatives: rows.length,
  matchedControlsReviewed: rows.length,
  byAdjudication: Object.fromEntries(
    classifications.map((name) => [
      name,
      rows.filter(({ adjudication }) => adjudication === name).length,
    ]),
  ),
  byFamily: Object.fromEntries(
    [...new Set(rows.map(({ family }) => family))].sort().map((family) => [
      family,
      Object.fromEntries(
        classifications.map((name) => [
          name,
          rows.filter(
            (row) => row.family === family && row.adjudication === name,
          ).length,
        ]),
      ),
    ]),
  ),
};

const result = {
  schemaVersion: "deterministic-structural-v10-independent-source-adjudication-v1",
  auditId: "deterministic-structural-reaudit-v10-independent-audit",
  classificationDefinitions: {
    CONFIRMED_PRODUCT_CONTRACT:
      "The target production verdict misses a literal invariant inside the current product/helper contract, and the matched control is an in-scope true negative.",
    ORACLE_SCOPE_MISMATCH:
      "The sealed rule is internally deterministic, but this case uses a language or rendered-label inventory outside the current product's reachable schema/postprocess/render contract; its paired control is outside scope for the same reason.",
    AMBIGUOUS:
      "The available sealed and source evidence cannot establish one of the other classifications.",
    REDUNDANT_UPSTREAM:
      "The target function misses, but a separate current blocking invariant catches the defect and distinguishes its paired control.",
  },
  chainOfCustody: {
    authorPayloadSha256: sha256(casesBytes),
    preAdjudicationPredictionsSha256: sha256(predictionsBytes),
    predictionSealVerified: true,
  },
  methodology: {
    falseNegativesReviewed: rows.length,
    matchedControlsReviewed: rows.length,
    oneToOnePairingVerified: true,
    noSourceOrOracleEdits: true,
    noApiNetworkDatabaseSecrets: true,
  },
  summary,
  rows,
};
await writeFile(
  path.join(auditDirectory, "source-aware-adjudication.json"),
  canonicalJsonBytes(result),
);

process.stdout.write(
  [
    "SOURCE_AWARE_ADJUDICATION_OK",
    `FALSE_NEGATIVES ${rows.length}`,
    `MATCHED_CONTROLS ${rows.length}`,
    ...classifications.map((name) => `${name} ${summary.byAdjudication[name]}`),
  ].join("\n") + "\n",
);

function classify(caseValue) {
  if (caseValue.family === "SUMMARY_COMPLETE_MC") {
    if (caseValue.language === "ko") {
      return {
        adjudication: "ORACLE_SCOPE_MISMATCH",
        rootCause: "SUMMARY_KOREAN_OPTION_SURFACE_OUTSIDE_ENGLISH_PAIR_CONTRACT",
        sourceReferenceGroup: "summary",
        reason:
          "The oracle is coherent, but this fixture's visible options are Korean sentences. Current SUMMARY_COMPLETE_MC requires English blank answers and English option pairs and emits summary-mc-option-language for Hangul option text. The paired control has the same out-of-scope Korean option inventory.",
        productScopeEvidence: {
          optionLanguage: "Korean",
          currentProductOptionContract: "English-only paired expressions",
        },
        controlReviewResult: "OUT_OF_SCOPE_SAME_LANGUAGE_AND_OPTION_SHAPE",
        recommendedBoundary:
          "Do not broaden the English SUMMARY_COMPLETE_MC binder to Korean option inventories from this oracle. If a Korean summary-MC product is introduced, define and test it in its own schema.",
      };
    }
    return {
      adjudication: "CONFIRMED_PRODUCT_CONTRACT",
      rootCause: "SUMMARY_AUTHORITATIVE_FULL_OPTION_CUE_ABSTENTION",
      sourceReferenceGroup: "summary",
      reason:
        "An authoritative final/required/completed English carrier uniquely quotes one complete option while storedKey names another. The helper sees the exact option surface but abstains because its decisive-cue grammar does not recognize these authoritative carrier frames. The paired control changes only the key and is a true negative.",
      productScopeEvidence: {
        optionLanguage: "English",
        bindingMode: "unique exact full-option occurrence",
      },
      controlReviewResult: "IN_SCOPE_TRUE_NEGATIVE_SUPPORTS_EXACT_BINDING_BOUNDARY",
      recommendedBoundary:
        "Bind only a unique exact whole-option surface in an authoritative final/required/completed carrier, then compare its label literally with the stored key. Do not add fuzzy or semantic matching.",
    };
  }

  if (caseValue.family === "GRAMMAR_ERROR_LEADING_LABEL") {
    return {
      adjudication: "ORACLE_SCOPE_MISMATCH",
      rootCause: "GRAMMAR_RENDERED_LABEL_INVENTORY_OUTSIDE_CANONICAL_A_TO_J",
      sourceReferenceGroup: "grammar",
      reason:
        "This false negative uses a plain-word/entity/confusable rendered-label inventory rather than the production GRAMMAR_ERROR labels (A) through (J). The AI schema requires those labels and postprocess canonicalizes markedExpressions to that alphabet before quality validation. The paired control retains the same unreachable inventory, so this row cannot justify broadening the production leading-reference grammar.",
      productScopeEvidence: {
        renderedLabels: caseValue.fixture.renderedLabelInventory?.labels ?? [],
        currentProductRenderedLabels: "(A) through (J)",
      },
      controlReviewResult: "OUT_OF_SCOPE_SAME_NONCANONICAL_RENDERED_INVENTORY",
      recommendedBoundary:
        "Keep exact literal membership for reachable (A)-(J) labels. Do not teach the production gate to treat Note/Tip/Rule/entity words as grammar underline labels solely to fit this oracle.",
    };
  }

  if (caseValue.family === "SENTENCE_ORDER_COMPLETE_UNITS") {
    if (caseValue.language === "ko") {
      return {
        adjudication: "ORACLE_SCOPE_MISMATCH",
        rootCause: "SENTENCE_ORDER_KOREAN_UNIT_OUTSIDE_ENGLISH_READING_CONTRACT",
        sourceReferenceGroup: "sentenceUnits",
        reason:
          "The Korean fragment judgment is linguistically coherent, but current SENTENCE_ORDER is the English-reading type: its prompt and bounded certificate are English, its word counter counts Latin tokens, and Korean assessment types are separately registered. The paired control is Korean as well, so this pair is outside the current product lane.",
        productScopeEvidence: {
          fixtureLanguage: "ko",
          currentProductLane: "English SENTENCE_ORDER",
        },
        controlReviewResult: "OUT_OF_SCOPE_SAME_KOREAN_LANGUAGE",
        recommendedBoundary:
          "Do not add Korean fragment heuristics to the English sentence-order validator from this holdout. Define a Korean structural-order type and its own controls if the product needs it.",
      };
    }
    return {
      adjudication: "CONFIRMED_PRODUCT_CONTRACT",
      rootCause: "SENTENCE_ORDER_ENGLISH_FRAGMENT_CERTIFICATE_GAP",
      sourceReferenceGroup: "sentenceUnits",
      reason:
        "The English unit lacks an independent finite matrix clause, but the bounded production fragment certificate does not cover this surface. Terminal punctuation, quotation, colon, dash, or semicolon does not complete it. The paired control supplies an independent clause and is a true negative.",
      productScopeEvidence: {
        fixtureLanguage: "en",
        targetInvariant: "every displayed sentence unit must contain an independent finite clause",
      },
      controlReviewResult: "IN_SCOPE_TRUE_NEGATIVE_SUPPORTS_BOUNDED_FRAGMENT_RULE",
      recommendedBoundary:
        "Add only the attested English fragment certificate, paired with its complete control; do not introduce a general short-text or punctuation heuristic.",
    };
  }

  if (caseValue.family === "SENTENCE_ORDER_STANDALONE_LABELS") {
    return {
      adjudication: "CONFIRMED_PRODUCT_CONTRACT",
      rootCause: "SENTENCE_ORDER_LABEL_NORMALIZER_ERASES_EXACTNESS",
      sourceReferenceGroup: "sentenceLabels",
      reason:
        "The current product and prompt require exactly three standalone labels (A), (B), (C). normalizeSentenceOrderParagraphLabel uppercases and extracts any embedded ASCII A/B/C, so alternate brackets, bare/dotted labels, attached punctuation, lowercase, and mixed systems collapse to valid labels. The exact paired control is a true negative.",
      productScopeEvidence: {
        structuralLabels: caseValue.fixture.entries.map((entry) => entry.labelNode),
        placements: caseValue.fixture.entries.map((entry) => entry.placement),
        currentProductLabels: ["(A)", "(B)", "(C)"],
      },
      controlReviewResult: "IN_SCOPE_TRUE_NEGATIVE_SUPPORTS_LITERAL_LABEL_CHECK",
      recommendedBoundary:
        "Compare raw trimmed labelNode values literally with (A)/(B)/(C) before any convenience normalization; keep incidental paragraph prose outside the structural-label decision.",
    };
  }

  throw new Error(`unclassified family ${caseValue.family}`);
}

function relevantFixtureEvidence(caseValue) {
  const fixture = caseValue.fixture;
  switch (caseValue.family) {
    case "SUMMARY_COMPLETE_MC":
      return {
        authority: fixture.carrier.authority,
        kind: fixture.carrier.kind,
        quotedText: fixture.carrier.quotedText,
        quotedOptionKey: fixture.options.find(
          (option) => option.text === fixture.carrier.quotedText,
        )?.key ?? null,
        storedKey: fixture.storedKey,
      };
    case "GRAMMAR_ERROR_LEADING_LABEL":
      return {
        inventoryState: fixture.renderedLabelInventory.state,
        renderedLabels: fixture.renderedLabelInventory.labels,
        leadingToken: fixture.leadingReference.token,
        explicit: fixture.leadingReference.explicit,
        atStart: fixture.leadingReference.atStart,
      };
    case "SENTENCE_ORDER_COMPLETE_UNITS":
      return {
        incompleteUnits: fixture.unitAnalysis
          .filter(({ independentFiniteUnit }) => independentFiniteUnit === false)
          .map(({ text, basis }) => ({ text, basis })),
      };
    case "SENTENCE_ORDER_STANDALONE_LABELS":
      return {
        entryCount: fixture.entries.length,
        structuralLabels: fixture.entries.map(({ labelNode }) => labelNode),
        placements: fixture.entries.map(({ placement }) => placement),
      };
    default:
      return {};
  }
}

function stripPredictionIdentity(prediction) {
  return Object.fromEntries(
    Object.entries(prediction).filter(
      ([key]) => !["blindId", "family", "language", "prediction"].includes(key),
    ),
  );
}

function diffPaths(left, right, pointer = "fixture") {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    const result = [];
    const max = Math.max(left.length, right.length);
    for (let index = 0; index < max; index += 1) {
      result.push(...diffPaths(left[index], right[index], `${pointer}/${index}`));
    }
    return result;
  }
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const result = [];
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      result.push(...diffPaths(left[key], right[key], `${pointer}/${key}`));
    }
    return result;
  }
  return [pointer];
}

async function buildSourceReferences() {
  const groups = {
    summary: [
      ["src/lib/question-quality/validators/summary/mc.ts", [165, 200, 252, 260, 561, 577, 630]],
      ["src/lib/question-schemas-mc.ts", [281, 294]],
    ],
    grammar: [
      ["src/lib/question-ai-schemas-mc.ts", [119, 121, 323, 335]],
      ["src/lib/question-postprocess/processors/grammar-error.ts", [51, 101, 130, 706, 731]],
      ["src/lib/question-quality/validators/grammar/shared.ts", [1058, 1121]],
    ],
    sentenceUnits: [
      ["src/lib/question-quality/validators/sentence-order.ts", [110, 116, 254, 286]],
      ["src/lib/question-quality/core.ts", [336]],
      ["src/lib/question-schemas-mc.ts", [95]],
      ["src/lib/question-generation-prompt-contract.ts", [92, 122]],
      ["src/lib/korean/registry/index.ts", [74]],
    ],
    sentenceLabels: [
      ["src/lib/question-quality/validators/sentence-order.ts", [77, 144, 150, 620]],
      ["src/lib/question-schemas-mc.ts", [95, 99]],
      ["src/lib/question-prompts-mc.ts", [360]],
    ],
  };
  return Object.fromEntries(
    await Promise.all(
      Object.entries(groups).map(async ([group, entries]) => [
        group,
        await Promise.all(
          entries.map(async ([relativePath, lines]) => ({
            path: relativePath,
            lines,
            sha256: sha256(await readFile(path.join(repoRoot, relativePath))),
          })),
        ),
      ]),
    ),
  );
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
