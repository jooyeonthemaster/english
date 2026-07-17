import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../../..");

export const paths = {
  privateCorpus: path.join(here, "private/original-passages.private.json"),
  localReferenceFixture: path.join(
    here,
    "private/local-reference-ngram-commitments.private.json",
  ),
  publicCorpus: path.join(here, "corpus-public.json"),
  manifest: path.join(here, "MANIFEST.sha256"),
} as const;

export const MANIFEST_PATHS = [
  "README.md",
  "refresh-local-reference-fixture.mts",
  "build.mts",
  "core.mts",
  "verify.mts",
  "tsconfig.json",
  "corpus-public.json",
  "private/.gitignore",
  "private/local-reference-ngram-commitments.private.json",
  "private/original-passages.private.json",
] as const;

type QuestionType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";

interface GrammarAffordanceBinding {
  mechanism: string;
  sentenceNumber: number;
  anchorExcerpt: string;
}

interface RecommendedBlankDesign {
  sentenceIndex: number;
  sentenceCount: number;
  positionBucket: "INTERNAL" | "PENULTIMATE" | "TERMINAL";
  structuralRole: string;
  difficultyCoverage: string[];
  postBlankRestatementRisk: "LOW" | "NOT_APPLICABLE";
}

interface CorpusRow {
  publicId: string;
  questionType: QuestionType;
  passageText: string;
  descriptors: {
    topicFamily: string;
    discourse: string;
    syntaxBand: string;
    wordBand: string;
  };
  suitability: Record<string, unknown>;
  rightsProvenance: {
    rowPublicId: string;
    campaignScopeId: string;
    origin: string;
    copiedOrAdapted: boolean;
    sourceCitation: null;
    thirdPartyPermissionClaimed: boolean;
    piiManuallyObserved: boolean;
    processingScopeStatus: string;
  };
}

interface PrivateCorpus {
  schemaVersion: string;
  artifactId: string;
  revisionId: string;
  supersedesPrivateArtifactSha256: string;
  confidentiality: string;
  authoredDate: string;
  campaignScopeId: string;
  authoringRecord: {
    compositionMethod: string;
    webSearchUsed: boolean;
    externalApiUsed: boolean;
    externalModelCallUsed: boolean;
    sourceDocumentsConsultedForComposition: unknown[];
    copiedOrAdaptedFromIdentifiableSource: boolean;
    thirdPartyPermissionClaimed: boolean;
    note: string;
  };
  remediationRecord: {
    method: string;
    basis: string;
    webSearchUsed: boolean;
    externalApiUsed: boolean;
    externalModelCallUsed: boolean;
    databaseUsed: boolean;
    rightsAndProcessingScopePreserved: boolean;
    note: string;
  };
  externalModelProcessingScope: {
    status: string;
    permissionBasis: string;
    permittedPurpose: string;
    permittedPayload: string;
    conditions: string[];
    revocationRule: string;
  };
  rows: CorpusRow[];
}

interface LocalReferenceSet {
  label: string;
  provenanceSourcePath: string;
  provenanceSourceArtifactSha256: string;
  selectedPassageCount: number;
  uniqueNormalizedPassageCount: number;
  selectedNormalizedTextSetCommitmentSha256: string;
  normalizedPassageSha256: string[];
  ngramSha256: string[];
}

interface LocalReferenceFixture {
  schemaVersion: string;
  generatedAtUtc: string;
  ngramSize: number;
  normalization: string;
  hashScheme: string;
  containsExactReferencePassageText: boolean;
  containsExactReferenceNgramText: boolean;
  generationOnlyExternalInputs: boolean;
  referenceSets: LocalReferenceSet[];
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function readPrivateCorpus(): PrivateCorpus {
  return JSON.parse(readFileSync(paths.privateCorpus, "utf8")) as PrivateCorpus;
}

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []).map((token) =>
    token.replace(/^'+|'+$/g, ""),
  );
}

function normalizedText(text: string): string {
  return words(text).join(" ");
}

function sentenceCount(text: string): number {
  return (text.match(/[.!?](?=\s|$)/g) ?? []).length;
}

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?](?=\s|$)/g) ?? []).map((sentence) => sentence.trim());
}

const CONTENT_STOP_WORDS = new Set(
  "a an the and or but nor so yet to of in on at by for from with as is are was were be been being it its this that these those what which who whom whose when where how not only may can could should would will do does did has have had into than through after before while even every each no one they them their we you he she his her".split(
    " ",
  ),
);

function contentWords(text: string): Set<string> {
  return new Set(words(text).filter((token) => !CONTENT_STOP_WORDS.has(token)));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / union.size;
}

function maximumPostBlankContentJaccard(row: CorpusRow): number {
  const blankUnit = row.suitability.recommendedBlankUnit as string;
  const rowSentences = sentences(row.passageText);
  const blankIndex = rowSentences.indexOf(blankUnit);
  assert(blankIndex >= 0, `${row.publicId}: blank unit sentence missing`);
  const target = contentWords(blankUnit);
  return rowSentences
    .slice(blankIndex + 1)
    .reduce((maximum, sentence) => Math.max(maximum, jaccard(target, contentWords(sentence))), 0);
}

function ngrams(text: string, size: number): Set<string> {
  const tokens = words(text);
  const result = new Set<string>();
  for (let i = 0; i + size <= tokens.length; i += 1) {
    result.add(tokens.slice(i, i + size).join(" "));
  }
  return result;
}

function countValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function parseWordBand(band: string): [number, number] {
  const match = /^(\d+)_(\d+)$/.exec(band);
  assert(match, `invalid word band: ${band}`);
  return [Number(match[1]), Number(match[2])];
}

function assertNoMachinePiiPatterns(text: string, rowId: string): void {
  const patterns: Array<[string, RegExp]> = [
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["url", /\b(?:https?:\/\/|www\.)\S+/i],
    ["at-handle", /(^|\s)@[a-z0-9_]+/i],
    ["ipv4", /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
    ["phone-like", /(?:\+?\d[\d(). -]{7,}\d)/],
    ["long-number", /\b\d{6,}\b/],
    ["korean-resident-id", /\b\d{6}-[1-4]\d{6}\b/],
  ];
  for (const [label, pattern] of patterns) {
    assert(!pattern.test(text), `${rowId}: machine PII pattern hit (${label})`);
  }
}

function validatePrivateCorpus(corpus: PrivateCorpus): void {
  assert.equal(corpus.schemaVersion, "question-quality-original-s1-v6-private-v2");
  assert.equal(corpus.artifactId, "original-s1-v6");
  assert.equal(corpus.revisionId, "original-s1-v6-remediation-v1");
  assert.equal(
    corpus.supersedesPrivateArtifactSha256,
    "bcb5d7683e9ee6bd110add462da6956dea6468e29dd2222d00067e80ddcabb68",
  );
  assert.equal(corpus.confidentiality, "PRIVATE_EXACT_TEXT_GIT_IGNORED");
  assert.equal(corpus.campaignScopeId, "question-quality-20260715-s1-v6");
  assert.equal(corpus.authoringRecord.webSearchUsed, false);
  assert.equal(corpus.authoringRecord.externalApiUsed, false);
  assert.equal(corpus.authoringRecord.externalModelCallUsed, false);
  assert.deepEqual(corpus.authoringRecord.sourceDocumentsConsultedForComposition, []);
  assert.equal(corpus.authoringRecord.copiedOrAdaptedFromIdentifiableSource, false);
  assert.equal(corpus.authoringRecord.thirdPartyPermissionClaimed, false);
  assert.equal(corpus.remediationRecord.webSearchUsed, false);
  assert.equal(corpus.remediationRecord.externalApiUsed, false);
  assert.equal(corpus.remediationRecord.externalModelCallUsed, false);
  assert.equal(corpus.remediationRecord.databaseUsed, false);
  assert.equal(corpus.remediationRecord.rightsAndProcessingScopePreserved, true);
  assert.equal(
    corpus.remediationRecord.basis,
    "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-independent-audit-v1",
  );
  assert.equal(
    corpus.externalModelProcessingScope.status,
    "PERMITTED_BY_REQUESTING_USER_FOR_S1_V6_ONLY",
  );
  assert(corpus.externalModelProcessingScope.conditions.length >= 3);
  assert.equal(corpus.rows.length, 12);

  const ids = new Set<string>();
  const topics = new Set<string>();
  const discourses = new Set<string>();
  let grammarCount = 0;
  let blankCount = 0;
  let grammarBindingCount = 0;
  let internalBlankCount = 0;
  let penultimateBlankCount = 0;
  let terminalBlankCount = 0;
  let internalContrastOrCounterexampleCount = 0;
  let internalAnaphoricOrCausalBridgeCount = 0;
  let dualDifficultyBlankCount = 0;
  let maximumPostBlankRestatementJaccard = 0;

  for (const row of corpus.rows) {
    assert(/^OS1V6-[GB]\d{2}$/.test(row.publicId), `${row.publicId}: invalid public id`);
    assert(!ids.has(row.publicId), `${row.publicId}: duplicate public id`);
    ids.add(row.publicId);
    topics.add(row.descriptors.topicFamily);
    discourses.add(row.descriptors.discourse);
    assert.equal(row.passageText, row.passageText.trim(), `${row.publicId}: outer whitespace`);
    assert(!/[\r\n]/.test(row.passageText), `${row.publicId}: passage must be one paragraph`);
    assert(/^[\x20-\x7E]+$/.test(row.passageText), `${row.publicId}: non-ASCII passage byte`);
    assert(!/(?:_{2,}|\[blank\]|<blank>|\(A\))/i.test(row.passageText), `${row.publicId}: marker leak`);
    assertNoMachinePiiPatterns(row.passageText, row.publicId);

    const count = words(row.passageText).length;
    const [minimum, maximum] = parseWordBand(row.descriptors.wordBand);
    assert(count >= minimum && count <= maximum, `${row.publicId}: ${count} outside ${row.descriptors.wordBand}`);
    const rowSentences = sentences(row.passageText);
    const rowSentenceCount = rowSentences.length;
    assert(
      rowSentenceCount >= 7 && rowSentenceCount <= 13,
      `${row.publicId}: unexpected sentence count ${rowSentenceCount}`,
    );
    assert(row.descriptors.syntaxBand.length > 0);

    assert.equal(row.rightsProvenance.rowPublicId, row.publicId);
    assert.equal(row.rightsProvenance.campaignScopeId, corpus.campaignScopeId);
    assert.equal(row.rightsProvenance.origin, "NEW_ORIGINAL_COMPOSITION_FOR_THIS_USER_REQUEST");
    assert.equal(row.rightsProvenance.copiedOrAdapted, false);
    assert.equal(row.rightsProvenance.sourceCitation, null);
    assert.equal(row.rightsProvenance.thirdPartyPermissionClaimed, false);
    assert.equal(row.rightsProvenance.piiManuallyObserved, false);
    assert.equal(
      row.rightsProvenance.processingScopeStatus,
      "PERMITTED_BY_REQUESTING_USER_FOR_S1_V6_ONLY",
    );

    if (row.questionType === "GRAMMAR_ERROR") {
      grammarCount += 1;
      const affordances = row.suitability.grammarAffordances;
      const bindings = row.suitability.grammarAffordanceBindings as
        | GrammarAffordanceBinding[]
        | undefined;
      assert(Array.isArray(affordances) && affordances.length >= 5, `${row.publicId}: grammar affordances`);
      assert(affordances.every((entry) => typeof entry === "string" && entry.length > 0));
      assert.equal(new Set(affordances).size, affordances.length, `${row.publicId}: duplicate affordance`);
      assert(Array.isArray(bindings), `${row.publicId}: missing grammar affordance bindings`);
      assert.equal(bindings.length, affordances.length, `${row.publicId}: binding cardinality`);
      assert.equal(
        new Set(bindings.map((binding) => binding.mechanism)).size,
        bindings.length,
        `${row.publicId}: duplicate binding mechanism`,
      );
      assert.deepEqual(
        bindings.map((binding) => binding.mechanism).sort(),
        [...affordances].sort(),
        `${row.publicId}: affordance/binding mismatch`,
      );
      for (const binding of bindings) {
        assert(
          Number.isInteger(binding.sentenceNumber) &&
            binding.sentenceNumber >= 1 &&
            binding.sentenceNumber <= rowSentenceCount,
          `${row.publicId}: binding sentence range`,
        );
        assert.equal(binding.anchorExcerpt, binding.anchorExcerpt.trim());
        assert(binding.anchorExcerpt.length >= 12, `${row.publicId}: binding anchor too short`);
        assert(
          rowSentences[binding.sentenceNumber - 1].includes(binding.anchorExcerpt),
          `${row.publicId}: binding anchor is not in declared sentence (${binding.mechanism})`,
        );
        assert.equal(
          row.passageText.split(binding.anchorExcerpt).length - 1,
          1,
          `${row.publicId}: binding anchor must be unique (${binding.mechanism})`,
        );
      }
      grammarBindingCount += bindings.length;
      assert.equal(row.suitability.cleanSource, true);
    } else {
      blankCount += 1;
      const hinge = row.suitability.inferentialHinge;
      const blankUnit = row.suitability.recommendedBlankUnit;
      const axes = row.suitability.distractorAxes;
      const design = row.suitability.recommendedBlankDesign as RecommendedBlankDesign | undefined;
      const difficultyAffordance = row.suitability.difficultyAffordance as
        | Record<string, unknown>
        | undefined;
      assert(typeof hinge === "string" && hinge.length >= 40, `${row.publicId}: inferential hinge`);
      assert(
        typeof blankUnit === "string" && row.passageText.includes(blankUnit),
        `${row.publicId}: recommended blank unit is not exact source text`,
      );
      assert.equal(row.passageText.split(blankUnit).length - 1, 1, `${row.publicId}: blank unit occurrence`);
      const actualSentenceIndex = rowSentences.indexOf(blankUnit) + 1;
      assert(actualSentenceIndex > 0, `${row.publicId}: blank unit must be a complete sentence`);
      assert(Array.isArray(axes) && axes.length >= 4, `${row.publicId}: distractor axes`);
      assert(design, `${row.publicId}: missing recommended blank design`);
      assert.equal(design.sentenceIndex, actualSentenceIndex, `${row.publicId}: blank position drift`);
      assert.equal(design.sentenceCount, rowSentenceCount, `${row.publicId}: blank sentence count drift`);
      const expectedPosition =
        actualSentenceIndex === rowSentenceCount
          ? "TERMINAL"
          : actualSentenceIndex === rowSentenceCount - 1
            ? "PENULTIMATE"
            : "INTERNAL";
      assert.equal(design.positionBucket, expectedPosition, `${row.publicId}: position bucket drift`);
      assert(/^[A-Z_]+$/.test(design.structuralRole), `${row.publicId}: structural role`);
      assert.deepEqual(
        [...design.difficultyCoverage].sort(),
        ["INTERMEDIATE", "KILLER"],
        `${row.publicId}: both difficulties must be covered`,
      );
      assert(
        design.postBlankRestatementRisk === "LOW" ||
          design.postBlankRestatementRisk === "NOT_APPLICABLE",
        `${row.publicId}: post-blank restatement risk`,
      );
      assert(
        difficultyAffordance &&
          typeof difficultyAffordance.intermediate === "string" &&
          difficultyAffordance.intermediate.length >= 40 &&
          typeof difficultyAffordance.killer === "string" &&
          difficultyAffordance.killer.length >= 40,
        `${row.publicId}: difficulty affordance`,
      );
      if (design.positionBucket === "INTERNAL") internalBlankCount += 1;
      if (design.positionBucket === "PENULTIMATE") penultimateBlankCount += 1;
      if (design.positionBucket === "TERMINAL") terminalBlankCount += 1;
      if (
        design.positionBucket === "INTERNAL" &&
        /(?:CONTRAST|COUNTEREXAMPLE)/.test(design.structuralRole)
      ) {
        internalContrastOrCounterexampleCount += 1;
      }
      if (
        design.positionBucket === "INTERNAL" &&
        /(?:ANAPHORIC|CAUSAL)/.test(design.structuralRole)
      ) {
        internalAnaphoricOrCausalBridgeCount += 1;
      }
      dualDifficultyBlankCount += 1;
      const postBlankJaccard = maximumPostBlankContentJaccard(row);
      maximumPostBlankRestatementJaccard = Math.max(
        maximumPostBlankRestatementJaccard,
        postBlankJaccard,
      );
      if (design.positionBucket === "INTERNAL") {
        assert(postBlankJaccard < 0.2, `${row.publicId}: post-blank lexical restatement risk`);
      }
      assert.equal(row.suitability.cleanSource, true);
    }
  }

  assert.equal(grammarCount, 6);
  assert.equal(blankCount, 6);
  assert.equal(grammarBindingCount, 30);
  assert(internalBlankCount >= 4, "internal blank-site coverage below target");
  assert(terminalBlankCount + penultimateBlankCount <= 2, "late blank-site concentration above target");
  assert(internalContrastOrCounterexampleCount >= 2, "internal contrast/counterexample coverage below target");
  assert(internalAnaphoricOrCausalBridgeCount >= 1, "internal anaphoric/causal coverage below target");
  assert.equal(dualDifficultyBlankCount, 6);
  assert(maximumPostBlankRestatementJaccard < 0.2, "post-blank lexical restatement maximum");
  assert.equal(topics.size, 12, "topic families must be row-diverse");
  assert(discourses.size >= 10, "discourse families are not sufficiently diverse");
}

function readLocalReferenceSets(): LocalReferenceSet[] {
  const fixtureBytes = readFileSync(paths.localReferenceFixture);
  const fixture = JSON.parse(fixtureBytes.toString("utf8")) as LocalReferenceFixture;
  assert.equal(
    fixture.schemaVersion,
    "question-quality-original-s1-v6-local-reference-fixture-v1",
  );
  assert.equal(fixture.ngramSize, 8);
  assert(!Number.isNaN(Date.parse(fixture.generatedAtUtc)));
  assert.equal(fixture.containsExactReferencePassageText, false);
  assert.equal(fixture.containsExactReferenceNgramText, false);
  assert.equal(fixture.generationOnlyExternalInputs, true);
  assert.equal(fixture.referenceSets.length, 2);
  for (const reference of fixture.referenceSets) {
    assert(reference.selectedPassageCount > 0);
    assert(reference.uniqueNormalizedPassageCount > 0);
    assert.equal(
      reference.normalizedPassageSha256.length,
      reference.uniqueNormalizedPassageCount,
    );
    assert.equal(
      new Set(reference.normalizedPassageSha256).size,
      reference.normalizedPassageSha256.length,
    );
    assert.equal(new Set(reference.ngramSha256).size, reference.ngramSha256.length);
    assert(reference.normalizedPassageSha256.every((hash) => /^[a-f0-9]{64}$/.test(hash)));
    assert(reference.ngramSha256.every((hash) => /^[a-f0-9]{64}$/.test(hash)));
  }
  return fixture.referenceSets;
}

function buildOriginalityReport(rows: CorpusRow[]) {
  const crossN = 5;
  const localN = 8;
  const rowSets = rows.map((row) => ({ id: row.publicId, set: ngrams(row.passageText, crossN) }));
  let crossSharedNgramCount = 0;
  let crossPairsWithOverlap = 0;
  let crossMaximumForPair = 0;
  for (let i = 0; i < rowSets.length; i += 1) {
    for (let j = i + 1; j < rowSets.length; j += 1) {
      let shared = 0;
      for (const gram of rowSets[i].set) if (rowSets[j].set.has(gram)) shared += 1;
      crossSharedNgramCount += shared;
      if (shared > 0) crossPairsWithOverlap += 1;
      crossMaximumForPair = Math.max(crossMaximumForPair, shared);
    }
  }

  const referenceSets = readLocalReferenceSets();
  const referenceSummaries = referenceSets.map((reference) => {
    const normalizedHashSet = new Set(reference.normalizedPassageSha256);
    const localGramHashSet = new Set(reference.ngramSha256);
    let rowsWithOverlap = 0;
    let sharedNgramCount = 0;
    let maximumForRow = 0;
    let exactNormalizedDuplicates = 0;
    for (const row of rows) {
      const rowNormalized = normalizedText(row.passageText);
      if (normalizedHashSet.has(sha256(rowNormalized))) exactNormalizedDuplicates += 1;
      let shared = 0;
      for (const gram of ngrams(row.passageText, localN)) {
        if (localGramHashSet.has(sha256(gram))) shared += 1;
      }
      if (shared > 0) rowsWithOverlap += 1;
      sharedNgramCount += shared;
      maximumForRow = Math.max(maximumForRow, shared);
    }
    return {
      label: reference.label,
      privateFixturePath: "private/local-reference-ngram-commitments.private.json",
      provenanceSourcePath: reference.provenanceSourcePath,
      provenanceSourceArtifactSha256: reference.provenanceSourceArtifactSha256,
      selectedPassageCount: reference.selectedPassageCount,
      uniqueNormalizedPassageCount: reference.uniqueNormalizedPassageCount,
      selectedTextSetCommitmentSha256:
        reference.selectedNormalizedTextSetCommitmentSha256,
      ngramSize: localN,
      hashedNgramCount: reference.ngramSha256.length,
      exactNormalizedDuplicates,
      rowsWithOverlap,
      sharedNgramCount,
      maximumSharedNgramsForOneNewRow: maximumForRow,
    };
  });

  assert.equal(crossSharedNgramCount, 0, "new rows share one or more five-token sequences");
  for (const summary of referenceSummaries) {
    assert.equal(summary.exactNormalizedDuplicates, 0, `${summary.label}: exact duplicate`);
    assert.equal(summary.sharedNgramCount, 0, `${summary.label}: eight-token overlap`);
  }

  return {
    methodVersion: "offline-token-ngram-v1",
    normalization: "lowercase ASCII word tokens; punctuation and whitespace removed",
    crossRow: {
      ngramSize: crossN,
      comparedPairCount: (rows.length * (rows.length - 1)) / 2,
      pairsWithOverlap: crossPairsWithOverlap,
      sharedNgramCount: crossSharedNgramCount,
      maximumSharedNgramsForOnePair: crossMaximumForPair,
    },
    selectedLocalCorpus: referenceSummaries,
    interpretation:
      "Zero overlap at these thresholds is local evidence against copying; it is not a global originality or non-infringement proof.",
  };
}

export function buildPublicArtifact(): Record<string, unknown> {
  const corpus = readPrivateCorpus();
  validatePrivateCorpus(corpus);
  const originality = buildOriginalityReport(corpus.rows);
  const privateBytes = readFileSync(paths.privateCorpus);
  const grammarRows = corpus.rows.filter((row) => row.questionType === "GRAMMAR_ERROR");
  const blankRows = corpus.rows.filter((row) => row.questionType === "BLANK_INFERENCE");
  const blankDesigns = blankRows.map(
    (row) => row.suitability.recommendedBlankDesign as RecommendedBlankDesign,
  );
  const finalOrPenultimateCount = blankDesigns.filter(
    (design) => design.positionBucket === "TERMINAL" || design.positionBucket === "PENULTIMATE",
  ).length;
  const internalContrastOrCounterexampleCount = blankDesigns.filter(
    (design) =>
      design.positionBucket === "INTERNAL" &&
      /(?:CONTRAST|COUNTEREXAMPLE)/.test(design.structuralRole),
  ).length;
  const internalAnaphoricOrCausalBridgeCount = blankDesigns.filter(
    (design) =>
      design.positionBucket === "INTERNAL" && /(?:ANAPHORIC|CAUSAL)/.test(design.structuralRole),
  ).length;

  return {
    schemaVersion: "question-quality-original-s1-v6-public-v2",
    artifactId: corpus.artifactId,
    revisionId: corpus.revisionId,
    supersedesPrivateArtifactSha256: corpus.supersedesPrivateArtifactSha256,
    status: "SEALED_ORIGINAL_CORPUS_NOT_DISPATCH_AUTHORIZATION",
    authoredDate: corpus.authoredDate,
    campaignScopeId: corpus.campaignScopeId,
    confidentialityBoundary: {
      privateExactTextGitIgnored: true,
      publicArtifactContainsPassageText: false,
      privateArtifactUtf8Bytes: privateBytes.byteLength,
      privateArtifactSha256: sha256(privateBytes),
      rowCommitmentScheme: "SHA256(stable-json(full private row))",
    },
    compositionRecord: {
      method: corpus.authoringRecord.compositionMethod,
      webSearchUsed: false,
      externalApiUsed: false,
      externalModelCallUsed: false,
      sourceDocumentsConsultedForCompositionCount: 0,
      copiedOrAdaptedFromIdentifiableSource: false,
      thirdPartyPermissionClaimed: false,
    },
    remediationRecord: {
      method: corpus.remediationRecord.method,
      basis: corpus.remediationRecord.basis,
      webSearchUsed: false,
      externalApiUsed: false,
      externalModelCallUsed: false,
      databaseUsed: false,
      rightsAndProcessingScopePreserved: true,
    },
    externalModelProcessingScope: corpus.externalModelProcessingScope,
    aggregate: {
      rowCount: corpus.rows.length,
      questionTypeCounts: countValues(corpus.rows.map((row) => row.questionType)),
      topicFamilyCounts: countValues(corpus.rows.map((row) => row.descriptors.topicFamily)),
      discourseCounts: countValues(corpus.rows.map((row) => row.descriptors.discourse)),
      syntaxBandCounts: countValues(corpus.rows.map((row) => row.descriptors.syntaxBand)),
      wordBandCounts: countValues(corpus.rows.map((row) => row.descriptors.wordBand)),
      totalWords: corpus.rows.reduce((sum, row) => sum + words(row.passageText).length, 0),
      machinePiiPatternHits: 0,
      manualPiiObservedRows: 0,
      grammarAffordanceBindingCount: grammarRows.reduce(
        (sum, row) =>
          sum + (row.suitability.grammarAffordanceBindings as GrammarAffordanceBinding[]).length,
        0,
      ),
      blankRecommendedPositionCounts: countValues(
        blankDesigns.map((design) => design.positionBucket),
      ),
      blankStructuralRoleCounts: countValues(blankDesigns.map((design) => design.structuralRole)),
      blankFinalOrPenultimateCount: finalOrPenultimateCount,
      blankFinalOrPenultimateShare: finalOrPenultimateCount / blankRows.length,
      blankInternalCount: blankDesigns.filter((design) => design.positionBucket === "INTERNAL").length,
      blankInternalContrastOrCounterexampleCount: internalContrastOrCounterexampleCount,
      blankInternalAnaphoricOrCausalBridgeCount: internalAnaphoricOrCausalBridgeCount,
      blankDualDifficultyCoverageCount: blankDesigns.filter(
        (design) =>
          new Set(design.difficultyCoverage).size === 2 &&
          design.difficultyCoverage.includes("INTERMEDIATE") &&
          design.difficultyCoverage.includes("KILLER"),
      ).length,
      maximumPostBlankContentJaccard: Math.max(
        ...blankRows.map((row) => maximumPostBlankContentJaccard(row)),
      ),
    },
    rows: corpus.rows.map((row) => {
      const typeSpecificDesign =
        row.questionType === "GRAMMAR_ERROR"
          ? {
              grammarAffordanceCount: (row.suitability.grammarAffordances as string[]).length,
              grammarAffordanceBindingCount: (
                row.suitability.grammarAffordanceBindings as GrammarAffordanceBinding[]
              ).length,
            }
          : {
              recommendedBlankDesign: row.suitability
                .recommendedBlankDesign as RecommendedBlankDesign,
              maximumPostBlankContentJaccard: maximumPostBlankContentJaccard(row),
              difficultyAffordancePresent: true,
            };
      return {
        publicId: row.publicId,
        questionType: row.questionType,
        descriptors: row.descriptors,
        wordCount: words(row.passageText).length,
        sentenceCount: sentenceCount(row.passageText),
        passageUtf8Bytes: Buffer.byteLength(row.passageText, "utf8"),
        passageSha256: sha256(row.passageText),
        fullPrivateRowCommitmentSha256: sha256(stableStringify(row)),
        rightsProvenanceCommitmentSha256: sha256(stableStringify(row.rightsProvenance)),
        provenanceStatus: row.rightsProvenance.origin,
        thirdPartyPermissionClaimed: false,
        piiStatus: "MANUAL_ATTESTATION_FALSE_AND_MACHINE_PATTERN_SCAN_CLEAR",
        processingScopeStatus: row.rightsProvenance.processingScopeStatus,
        typeSpecificDesign,
      };
    }),
    originality,
    admission: {
      corpusRightsAndScopeRecord: "PASS_FOR_S1_V6_SCOPED_PROCESSING",
      piiBoundary: "PASS_LOCAL_PATTERN_AND_MANUAL_ATTESTATION",
      generationAuthorized: false,
      reason:
        "Corpus scope alone does not satisfy provider privacy, allow-list, credential, price, budget, controller-registry, or exact-wire gates.",
    },
    evidentiaryLimits: [
      "This is a factual engineering record, not legal advice or a legal opinion.",
      "Local overlap checks cannot establish global uniqueness, copyrightability, ownership, or non-infringement.",
      "No third-party permission is represented because no third-party source was intentionally used or adapted.",
      "Pattern scanning and manual observation reduce PII risk but cannot prove the absence of every possible identifier.",
      "The processing permission is purpose-, payload-, campaign-, and condition-limited and may be revoked before dispatch.",
    ],
  };
}

export function publicArtifactBytes(): string {
  return `${JSON.stringify(buildPublicArtifact(), null, 2)}\n`;
}

export function manifestBytes(publicBytes: string): string {
  return `${MANIFEST_PATHS.map((relativePath) => {
    const bytes =
      relativePath === "corpus-public.json"
        ? Buffer.from(publicBytes, "utf8")
        : readFileSync(path.join(here, relativePath));
    return `${sha256(bytes)}  ${relativePath}`;
  }).join("\n")}\n`;
}
