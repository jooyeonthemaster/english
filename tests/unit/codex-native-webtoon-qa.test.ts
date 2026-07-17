import assert from "node:assert/strict";
import test from "node:test";
import {
  CODEX_NATIVE_NARRATIVE_ART_HARD_GATE_KEYS,
  CODEX_NATIVE_PAIR_HARD_GATE_KEYS,
  CODEX_NATIVE_TEXT_PROOF_HARD_GATE_KEYS,
  validateCodexNativeAssetReview,
  validateCodexNativeAssetReviewSet,
  validateCodexNativePairReview,
  type CodexNativeAssetReviewExpectation,
  type CodexNativeAssetReviewKind,
  type CodexNativePairReviewExpectation,
} from "../../src/lib/exam-passages/codex-native-webtoon-qa";

const HASH = {
  source: "1".repeat(64),
  prompt: "2".repeat(64),
  image: "3".repeat(64),
  cuteImage: "4".repeat(64),
};

const REQUIRED_PHRASES = [
  "Participants' minds determine their attitudes",
  "take fuller ownership of their own development.",
] as const;

const baseExpected = {
  runId: "run-current",
  assetId: "passage-1__MACHO_BLACK_RED",
  attempt: 3,
  sourceHash: HASH.source,
  promptHash: HASH.prompt,
  imageSha256: HASH.image,
  generatorAgentId: "generator-01",
};

function trueGates(keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, true]));
}

function textReview(overrides: Record<string, unknown> = {}) {
  return {
    ...baseExpected,
    kind: "TEXT_PROOF",
    reviewerAgentId: "text-reviewer-01",
    pass: true,
    certain: true,
    hardGates: trueGates(CODEX_NATIVE_TEXT_PROOF_HARD_GATE_KEYS),
    metrics: {
      textExactness: 100,
      koreanSemanticFidelity: 95,
      koreanNaturalness: 95,
      layoutReadability: 95,
    },
    requiredPhraseEvidence: REQUIRED_PHRASES.map((phrase, index) => ({
      requiredPhrase: phrase,
      englishTranscription: phrase,
      koreanTranscription:
        index === 0 ? "참가자의 마음은 태도를 결정한다." : "자신의 발달을 더 주도하게 된다.",
      location: `panel ${index + 2}, narration box`,
      englishExact: true,
      koreanMeaningFaithful: true,
      koreanNatural: true,
      readable: true,
    })),
    failureCodes: [],
    correctionDirective: "",
    evidence: ["Original pixels and phone-width view checked panel by panel."],
    ...overrides,
  };
}

function narrativeReview(overrides: Record<string, unknown> = {}) {
  return {
    ...baseExpected,
    kind: "NARRATIVE_ART",
    reviewerAgentId: "narrative-reviewer-01",
    pass: true,
    certain: true,
    hardGates: trueGates(CODEX_NATIVE_NARRATIVE_ART_HARD_GATE_KEYS),
    metrics: {
      contentFidelity: 95,
      logicAccuracy: 95,
      engagement: 85,
      styleFidelity: 90,
      visualTextBalance: 95,
      layoutReadability: 95,
    },
    failureCodes: [],
    correctionDirective: "",
    evidence: ["All source logic units map to the 10-panel visual sequence."],
    ...overrides,
  };
}

function expected<K extends CodexNativeAssetReviewKind>(kind: K) {
  return {
    ...baseExpected,
    kind,
    ...(kind === "TEXT_PROOF"
      ? { requiredEnglishPhrases: REQUIRED_PHRASES }
      : {}),
  } as CodexNativeAssetReviewExpectation & {
    kind: K;
  };
}

function issueCodes(result: ReturnType<typeof validateCodexNativeAssetReview>) {
  assert.equal(result.ok, false);
  return result.issues.map((entry) => entry.code);
}

test("accepts exact TEXT_PROOF and NARRATIVE_ART boundary thresholds", () => {
  const text = validateCodexNativeAssetReview(
    textReview(),
    expected("TEXT_PROOF"),
  );
  const narrative = validateCodexNativeAssetReview(
    narrativeReview(),
    expected("NARRATIVE_ART"),
  );
  assert.equal(text.ok, true);
  assert.equal(narrative.ok, true);
  if (text.ok) assert.equal(text.value.metrics.textExactness, 100);
  if (narrative.ok) assert.equal(narrative.value.metrics.engagement, 85);
});

test("rejects every stale or mismatched binding field", () => {
  const cases: Array<[string, unknown]> = [
    ["runId", "old-run"],
    ["assetId", "other-asset"],
    ["attempt", 2],
    ["sourceHash", "a".repeat(64)],
    ["promptHash", "b".repeat(64)],
    ["imageSha256", "c".repeat(64)],
    ["generatorAgentId", "other-generator"],
    ["kind", "NARRATIVE_ART"],
  ];
  for (const [field, value] of cases) {
    const result = validateCodexNativeAssetReview(
      textReview({ [field]: value }),
      expected("TEXT_PROOF"),
    );
    assert.equal(result.ok, false, field);
    if (!result.ok) {
      assert.ok(result.issues.some((entry) => entry.code === "MISMATCH"), field);
    }
  }
});

test("rejects self-review and reuse of the other individual reviewer", () => {
  const self = validateCodexNativeAssetReview(
    textReview({ reviewerAgentId: "generator-01" }),
    expected("TEXT_PROOF"),
  );
  assert.ok(issueCodes(self).includes("SELF_REVIEW"));

  const reused = validateCodexNativeAssetReview(textReview(), {
    ...expected("TEXT_PROOF"),
    otherReviewerAgentIds: ["text-reviewer-01"],
  });
  assert.ok(issueCodes(reused).includes("REVIEWER_REUSE"));
});

test("rejects missing and unknown hard-gate keys for each kind", () => {
  for (const [kind, payload, keys] of [
    ["TEXT_PROOF", textReview, CODEX_NATIVE_TEXT_PROOF_HARD_GATE_KEYS],
    [
      "NARRATIVE_ART",
      narrativeReview,
      CODEX_NATIVE_NARRATIVE_ART_HARD_GATE_KEYS,
    ],
  ] as const) {
    const gates = trueGates(keys);
    delete gates[keys[0]];
    let result = validateCodexNativeAssetReview(
      payload({ hardGates: gates }),
      expected(kind),
    );
    assert.ok(issueCodes(result).includes("MISSING_KEY"), kind);

    result = validateCodexNativeAssetReview(
      payload({ hardGates: { ...trueGates(keys), inventedGate: true } }),
      expected(kind),
    );
    assert.ok(issueCodes(result).includes("UNKNOWN_KEY"), kind);
  }
});

test("rejects missing and unknown top-level or metric keys", () => {
  const missing = textReview();
  delete (missing as Record<string, unknown>).evidence;
  assert.ok(
    issueCodes(
      validateCodexNativeAssetReview(missing, expected("TEXT_PROOF")),
    ).includes("MISSING_KEY"),
  );
  assert.ok(
    issueCodes(
      validateCodexNativeAssetReview(
        textReview({ surprise: true }),
        expected("TEXT_PROOF"),
      ),
    ).includes("UNKNOWN_KEY"),
  );
  assert.ok(
    issueCodes(
      validateCodexNativeAssetReview(
        textReview({ metrics: { textExactness: 100 } }),
        expected("TEXT_PROOF"),
      ),
    ).includes("MISSING_KEY"),
  );
  assert.ok(
    issueCodes(
      validateCodexNativeAssetReview(
        textReview({
          metrics: {
            textExactness: 100,
            layoutReadability: 95,
            invented: 100,
          },
        }),
        expected("TEXT_PROOF"),
      ),
    ).includes("UNKNOWN_KEY"),
  );
});

test("TEXT_PROOF requires exact ordered structured evidence for every required phrase", () => {
  const valid = textReview().requiredPhraseEvidence as Array<Record<string, unknown>>;
  const cases: Array<[string, () => unknown]> = [
    ["missing", () => {
      const payload = textReview();
      delete (payload as Record<string, unknown>).requiredPhraseEvidence;
      return payload;
    }],
    ["extra", () => textReview({
      requiredPhraseEvidence: [
        ...structuredClone(valid),
        {
          requiredPhrase: "invented extra phrase",
          englishTranscription: "invented extra phrase",
          koreanTranscription: "잘못 추가한 문구",
          location: "panel 9",
          englishExact: true,
          koreanMeaningFaithful: true,
          koreanNatural: true,
          readable: true,
        },
      ],
    })],
    ["reordered", () => textReview({
      requiredPhraseEvidence: [structuredClone(valid[1]), structuredClone(valid[0])],
    })],
    ["duplicate", () => textReview({
      requiredPhraseEvidence: [structuredClone(valid[0]), structuredClone(valid[0])],
    })],
    ["required phrase mismatch", () => textReview({
      requiredPhraseEvidence: [
        { ...structuredClone(valid[0]), requiredPhrase: "Participants minds determine attitudes" },
        structuredClone(valid[1]),
      ],
    })],
    ["transcription mismatch", () => textReview({
      requiredPhraseEvidence: [
        { ...structuredClone(valid[0]), englishTranscription: "Participants’ minds determine their attitudes" },
        structuredClone(valid[1]),
      ],
    })],
    ["empty location", () => textReview({
      requiredPhraseEvidence: [
        { ...structuredClone(valid[0]), location: "   " },
        structuredClone(valid[1]),
      ],
    })],
    ["not readable", () => textReview({
      requiredPhraseEvidence: [
        { ...structuredClone(valid[0]), readable: false },
        structuredClone(valid[1]),
      ],
    })],
    ["Korean meaning not faithful", () => textReview({
      requiredPhraseEvidence: [
        { ...structuredClone(valid[0]), koreanMeaningFaithful: false },
        structuredClone(valid[1]),
      ],
    })],
  ];

  for (const [label, payload] of cases) {
    const result = validateCodexNativeAssetReview(
      payload(),
      expected("TEXT_PROOF"),
    );
    assert.equal(result.ok, false, label);
  }

  const missingExpected = { ...expected("TEXT_PROOF") };
  delete missingExpected.requiredEnglishPhrases;
  const result = validateCodexNativeAssetReview(textReview(), missingExpected);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (entry) => entry.path === "$expected.requiredEnglishPhrases",
      ),
    );
  }
});

test("TEXT_PROOF accepts different natural Korean translations without a frozen whitelist", () => {
  for (const koreanTranscription of [
    "참가자의 마음이 태도와 노력의 정도를 좌우한다.",
    "참여자의 생각은 신체 발달을 대하는 태도와 노력 수준을 결정한다.",
  ]) {
    const evidence = structuredClone(
      textReview().requiredPhraseEvidence,
    ) as Array<Record<string, unknown>>;
    evidence[0].koreanTranscription = koreanTranscription;
    const result = validateCodexNativeAssetReview(
      textReview({ requiredPhraseEvidence: evidence }),
      expected("TEXT_PROOF"),
    );
    assert.equal(result.ok, true, koreanTranscription);
  }
});

test("enforces all metric thresholds and valid score bounds", () => {
  const textCases = [
    { textExactness: 99.999, koreanSemanticFidelity: 95, koreanNaturalness: 95, layoutReadability: 95 },
    { textExactness: 100, koreanSemanticFidelity: 94.999, koreanNaturalness: 95, layoutReadability: 95 },
    { textExactness: 100, koreanSemanticFidelity: 95, koreanNaturalness: 94.999, layoutReadability: 95 },
    { textExactness: 100, koreanSemanticFidelity: 95, koreanNaturalness: 95, layoutReadability: 94.999 },
  ];
  for (const metrics of textCases) {
    const result = validateCodexNativeAssetReview(
      textReview({ pass: false, metrics, failureCodes: ["METRIC_LOW"], correctionDirective: "Regenerate all affected text at readable size." }),
      expected("TEXT_PROOF"),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.pass, false);

    const falseApproval = validateCodexNativeAssetReview(
      textReview({ metrics }),
      expected("TEXT_PROOF"),
    );
    assert.ok(issueCodes(falseApproval).includes("BELOW_THRESHOLD"));
  }

  const narrativeFields = {
    contentFidelity: 95,
    logicAccuracy: 95,
    engagement: 85,
    styleFidelity: 90,
    visualTextBalance: 95,
    layoutReadability: 95,
  };
  for (const [field, boundary] of Object.entries(narrativeFields)) {
    const result = validateCodexNativeAssetReview(
      narrativeReview({
        pass: false,
        metrics: { ...narrativeFields, [field]: boundary - 0.001 },
        failureCodes: ["METRIC_LOW"],
        correctionDirective: "Regenerate the page to meet the failed narrative metric.",
      }),
      expected("NARRATIVE_ART"),
    );
    assert.equal(result.ok, true, field);
    if (result.ok) assert.equal(result.value.pass, false, field);
  }
  for (const invalid of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = validateCodexNativeAssetReview(
      textReview({ metrics: { textExactness: invalid, koreanSemanticFidelity: 95, koreanNaturalness: 95, layoutReadability: 95 } }),
      expected("TEXT_PROOF"),
    );
    assert.ok(issueCodes(result).includes("INVALID_VALUE"), String(invalid));
  }
});

test("failed reviews require failureCodes and a correction directive", () => {
  const failedGates = trueGates(CODEX_NATIVE_TEXT_PROOF_HARD_GATE_KEYS);
  failedGates.noBrokenGlyphs = false;
  for (const overrides of [
    { failureCodes: [] },
    { correctionDirective: "   " },
  ]) {
    const result = validateCodexNativeAssetReview(
      textReview({
        pass: false,
        hardGates: failedGates,
        failureCodes: ["BROKEN_GLYPH"],
        correctionDirective: "Regenerate panel 3 with exact readable text.",
        ...overrides,
      }),
      expected("TEXT_PROOF"),
    );
    assert.ok(issueCodes(result).includes("EMPTY_VALUE"));
  }
  const validFailure = validateCodexNativeAssetReview(
    textReview({
      pass: false,
      hardGates: failedGates,
      failureCodes: ["BROKEN_GLYPH"],
      correctionDirective: "Regenerate panel 3 with exact readable text.",
    }),
    expected("TEXT_PROOF"),
  );
  assert.equal(validFailure.ok, true);
  if (validFailure.ok) assert.equal(validFailure.value.pass, false);
});

test("requires nonempty, unique evidence and consistent pass declarations", () => {
  for (const evidence of [[], [""], ["same", " same "]]) {
    const result = validateCodexNativeAssetReview(
      textReview({ evidence }),
      expected("TEXT_PROOF"),
    );
    assert.equal(result.ok, false);
  }
  const falseButEligible = validateCodexNativeAssetReview(
    textReview({
      pass: false,
      failureCodes: ["UNMAPPED_FAILURE"],
      correctionDirective: "Regenerate to address the reported issue.",
    }),
    expected("TEXT_PROOF"),
  );
  assert.ok(issueCodes(falseButEligible).includes("INCONSISTENT_PASS"));
});

test("review-set validator requires distinct fresh-eyes agents", () => {
  let result = validateCodexNativeAssetReviewSet(
    textReview(),
    narrativeReview({ reviewerAgentId: "text-reviewer-01" }),
    { ...baseExpected, requiredEnglishPhrases: REQUIRED_PHRASES },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((entry) => entry.code === "REVIEWER_REUSE"));
  }

  result = validateCodexNativeAssetReviewSet(
    textReview(),
    narrativeReview(),
    { ...baseExpected, requiredEnglishPhrases: REQUIRED_PHRASES },
  );
  assert.equal(result.ok, true);
});

const pairExpected: CodexNativePairReviewExpectation = {
  runId: "run-current",
  passageId: "passage-1",
  assets: [
    {
      assetId: "passage-1__MACHO_BLACK_RED",
      concept: "MACHO_BLACK_RED",
      attempt: 3,
      imageSha256: HASH.image,
      generatorAgentId: "generator-01",
      individualReviewerAgentIds: ["text-reviewer-01", "narrative-reviewer-01"],
      individualReviewsPassed: true,
    },
    {
      assetId: "passage-1__CUTE_PASTEL",
      concept: "CUTE_PASTEL",
      attempt: 2,
      imageSha256: HASH.cuteImage,
      generatorAgentId: "generator-02",
      individualReviewerAgentIds: ["text-reviewer-02", "narrative-reviewer-02"],
      individualReviewsPassed: true,
    },
  ],
};

function pairReview(overrides: Record<string, unknown> = {}) {
  return {
    runId: pairExpected.runId,
    passageId: pairExpected.passageId,
    assets: pairExpected.assets.map(
      ({ assetId, concept, attempt, imageSha256 }) => ({
        assetId,
        concept,
        attempt,
        imageSha256,
      }),
    ),
    reviewerAgentId: "pair-reviewer-01",
    pass: true,
    certain: true,
    hardGates: trueGates(CODEX_NATIVE_PAIR_HARD_GATE_KEYS),
    failureConcepts: [],
    correctionDirective: "",
    evidence: ["Both approved pages were compared side by side at full and phone size."],
    ...overrides,
  };
}

test("accepts a fully bound, independent pair review", () => {
  const result = validateCodexNativePairReview(pairReview(), pairExpected);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.assets.length, 2);
});

test("pair review rejects stale asset attempts/hashes and unrelated assets", () => {
  for (const mutate of [
    (assets: Array<Record<string, unknown>>) => { assets[0].attempt = 2; },
    (assets: Array<Record<string, unknown>>) => { assets[1].imageSha256 = "9".repeat(64); },
    (assets: Array<Record<string, unknown>>) => { assets[0].assetId = "unrelated"; },
    (assets: Array<Record<string, unknown>>) => { assets[1] = { ...assets[0] }; },
  ]) {
    const assets = structuredClone(pairReview().assets) as Array<Record<string, unknown>>;
    mutate(assets);
    const result = validateCodexNativePairReview(pairReview({ assets }), pairExpected);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((entry) => entry.code === "MISMATCH" || entry.code === "INVALID_VALUE"));
    }
  }
});

test("pair review requires exact gates, evidence, and a third fresh reviewer", () => {
  const missingGate = trueGates(CODEX_NATIVE_PAIR_HARD_GATE_KEYS);
  delete missingGate.contentEquivalent;
  let result = validateCodexNativePairReview(
    pairReview({ hardGates: missingGate }),
    pairExpected,
  );
  assert.equal(result.ok, false);

  result = validateCodexNativePairReview(
    pairReview({ hardGates: { ...trueGates(CODEX_NATIVE_PAIR_HARD_GATE_KEYS), extra: true } }),
    pairExpected,
  );
  assert.equal(result.ok, false);

  result = validateCodexNativePairReview(pairReview({ evidence: [] }), pairExpected);
  assert.equal(result.ok, false);

  for (const reviewerAgentId of [
    "generator-01",
    "text-reviewer-01",
    "narrative-reviewer-02",
  ]) {
    result = validateCodexNativePairReview(
      pairReview({ reviewerAgentId }),
      pairExpected,
    );
    assert.equal(result.ok, false, reviewerAgentId);
  }
});

test("pair review cannot falsely claim that both individual reviews passed", () => {
  const expectedWithFailure: CodexNativePairReviewExpectation = {
    ...pairExpected,
    assets: [
      { ...pairExpected.assets[0], individualReviewsPassed: false },
      pairExpected.assets[1],
    ],
  };
  const result = validateCodexNativePairReview(
    pairReview(),
    expectedWithFailure,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (entry) =>
          entry.code === "MISMATCH" &&
          entry.path === "$.hardGates.bothIndividuallyPassed",
      ),
    );
  }
});

test("failed pair review requires valid failureConcepts and correction", () => {
  const gates = trueGates(CODEX_NATIVE_PAIR_HARD_GATE_KEYS);
  gates.conceptsDistinct = false;
  const valid = validateCodexNativePairReview(
    pairReview({
      pass: false,
      hardGates: gates,
      failureConcepts: ["CUTE_PASTEL"],
      correctionDirective: "Regenerate CUTE_PASTEL with a pure pastel visual language.",
    }),
    pairExpected,
  );
  assert.equal(valid.ok, true);

  for (const overrides of [
    { failureConcepts: [] },
    { failureConcepts: ["UNRELATED"] },
    { failureConcepts: ["CUTE_PASTEL"], correctionDirective: "" },
  ]) {
    const result = validateCodexNativePairReview(
      pairReview({
        pass: false,
        hardGates: gates,
        correctionDirective: "Regenerate the failed concept.",
        ...overrides,
      }),
      pairExpected,
    );
    assert.equal(result.ok, false);
  }
});
