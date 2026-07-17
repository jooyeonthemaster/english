import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeCalibrationMetrics,
  DEFAULT_THRESHOLDS,
} from "../../design/reviewer-calibration-packet-v2/metrics.mts";

type Json = any;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const packetRoot = resolve(here, "../../design/reviewer-calibration-packet-v2");
const issuedRoot = resolve(packetRoot, "private/issued");
const phase3Root = resolve(issuedRoot, "adjudicator-c/phase3");
const interagreementRoot = resolve(here, "../calibration-v2-rater-interagreement-v1");
const forbiddenGoldPath = resolve(packetRoot, "private/gold.private.json");

const EXPECTED_PHASE3_BYTES: Record<string, string> = {
  "adjudication-records.json": "7baa3fc25e1186ea3df5e94be34952805f170799e7db7ef3268806a70895ff30",
  "final-gold-proposal.json": "d8a75673498f373074a0bfee88795cb28eb712c5337dabf09fe7e7e6bb8f07da",
  "final-labels.json": "7065fcc419be4a1b4c47095ef4f25a379ccbbcb9ca15763e947d007af15aabef",
  "report.json": "9d679aeaf4839a0ab39e7be11dbe680182c39db7e31e91f170a8ae3ce748fcfe",
  "validator.mts": "0ceb9b0cc9776fd03320e2212ef33b14a3ffbaef1139f32cfa61162d0ce1384e",
};

const EXPECTED_PHASE3_SEMANTIC: Record<string, string> = {
  "adjudication-records.json": "fcde70a47273b32b7127e186a247d4d11c0f65447bb450a4f782efb247f31baf",
  "final-gold-proposal.json": "39c7b1dbdccd451afd744f7509de445a9443b63458e61b213c0e9cd08cac2b7c",
  "final-labels.json": "8533c6184fbf54be80b23b870b16ad5e865a4419322160637531eeef0c2f8150",
  "report.json": "9bf83be9db81f0a37860d97398a9820c94d28c4ce85ad805f8bcc0430edb1d1c",
};

const EXPECTED_LABEL_VECTOR: Record<string, { grade: string; anyFatal: boolean }> = {
  "RCAL2-B01": { grade: "F", anyFatal: true },
  "RCAL2-B02": { grade: "F", anyFatal: true },
  "RCAL2-B03": { grade: "C", anyFatal: false },
  "RCAL2-B04": { grade: "C", anyFatal: false },
  "RCAL2-B05": { grade: "B", anyFatal: false },
  "RCAL2-B06": { grade: "B", anyFatal: false },
  "RCAL2-B07": { grade: "A", anyFatal: false },
  "RCAL2-B08": { grade: "A", anyFatal: false },
  "RCAL2-G01": { grade: "F", anyFatal: true },
  "RCAL2-G02": { grade: "F", anyFatal: true },
  "RCAL2-G03": { grade: "C", anyFatal: false },
  "RCAL2-G04": { grade: "C", anyFatal: false },
  "RCAL2-G05": { grade: "B", anyFatal: false },
  "RCAL2-G06": { grade: "B", anyFatal: false },
  "RCAL2-G07": { grade: "A", anyFatal: false },
  "RCAL2-G08": { grade: "A", anyFatal: false },
  "RCAL2-N01": { grade: "F", anyFatal: true },
  "RCAL2-N02": { grade: "F", anyFatal: true },
  "RCAL2-N03": { grade: "C", anyFatal: false },
  "RCAL2-N04": { grade: "C", anyFatal: false },
  "RCAL2-N05": { grade: "F", anyFatal: true },
  "RCAL2-N06": { grade: "F", anyFatal: true },
  "RCAL2-N07": { grade: "F", anyFatal: true },
  "RCAL2-N08": { grade: "C", anyFatal: false },
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return "{" + entries.map(([key, entry]) => JSON.stringify(key) + ":" + stableJson(entry)).join(",") + "}";
  }
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value: unknown): string {
  return sha256(stableJson(value));
}

function bytesSha(path: string): string {
  ensure(resolve(path) !== forbiddenGoldPath, "FORBIDDEN_TRUSTED_GOLD_ACCESS");
  return sha256(readFileSync(path));
}

function readJson(path: string): Json {
  ensure(resolve(path) !== forbiddenGoldPath, "FORBIDDEN_TRUSTED_GOLD_ACCESS");
  return JSON.parse(readFileSync(path, "utf8"));
}

function rel(path: string): string {
  return relative(repoRoot, path).replace(/\\/gu, "/");
}

function same(left: unknown, right: unknown, message: string): void {
  ensure(stableJson(left) === stableJson(right), message);
}

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function uniqueExact(values: string[], context: string): void {
  ensure(new Set(values).size === values.length, context + ": duplicate values");
}

function exactSet(values: string[], expected: string[], context: string): void {
  uniqueExact(values, context);
  same(sorted(values), sorted(expected), context + ": set mismatch");
}

function normalizeConstructedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function answerDomain(kind: string): string {
  if (kind === "SINGLE_LABEL" || kind === "MULTIPLE_LABELS") return "LABELS";
  if (kind === "SINGLE_TEXT" || kind === "MULTIPLE_TEXTS") return "TEXTS";
  if (kind === "NO_ANSWER") return "NO_ANSWER";
  if (kind === "UNEVALUABLE") return "UNEVALUABLE";
  throw new Error("UNKNOWN_ANSWER_KIND:" + kind);
}

function validateTextAnswer(row: Json, context: string): void {
  ensure(typeof row.text === "string" && row.text.length > 0, context + ": missing text");
  ensure(row.text === row.text.trim(), context + ": text is not outer-trimmed");
  ensure(row.textSha256 === sha256(row.text), context + ": exact text hash mismatch");
  ensure(
    row.normalizedTextSha256 === sha256(normalizeConstructedText(row.text)),
    context + ": normalized text hash mismatch",
  );
}

function answerMembers(answer: Json): string[] {
  if (answer.kind === "SINGLE_LABEL") return [answer.label];
  if (answer.kind === "MULTIPLE_LABELS") return [...answer.labels];
  if (answer.kind === "SINGLE_TEXT") return [answer.text.textSha256];
  if (answer.kind === "MULTIPLE_TEXTS") return answer.texts.map((row: Json) => row.textSha256);
  return [];
}

function answerSetSha(answer: Json): string {
  return hashJson({ domain: answerDomain(answer.kind), members: sorted(answerMembers(answer)) });
}

function validateAnswerSet(answer: Json, context: string): void {
  ensure(answer && typeof answer === "object", context + ": answer missing");
  if (answer.kind === "SINGLE_LABEL") {
    ensure(typeof answer.label === "string" && answer.label === answer.label.trim(), context + ": bad label");
  } else if (answer.kind === "MULTIPLE_LABELS") {
    ensure(Array.isArray(answer.labels) && answer.labels.length >= 2, context + ": labels missing");
    uniqueExact(answer.labels, context + ": labels");
  } else if (answer.kind === "SINGLE_TEXT") {
    validateTextAnswer(answer.text, context + ": text");
  } else if (answer.kind === "MULTIPLE_TEXTS") {
    ensure(Array.isArray(answer.texts) && answer.texts.length >= 2, context + ": texts missing");
    answer.texts.forEach((row: Json, index: number) => validateTextAnswer(row, context + ": text " + index));
    uniqueExact(answer.texts.map((row: Json) => row.textSha256), context + ": exact text hashes");
    uniqueExact(answer.texts.map((row: Json) => row.normalizedTextSha256), context + ": normalized text hashes");
  } else {
    ensure(answer.kind === "NO_ANSWER" || answer.kind === "UNEVALUABLE", context + ": unknown kind");
  }
  ensure(answer.setSha256 === answerSetSha(answer), context + ": answer-set hash mismatch");
}

function canonicalAnswer(answer: Json, displayToCanonical: Record<string, string>): Json {
  const result = clone(answer);
  if (result.kind === "SINGLE_LABEL") {
    result.label = displayToCanonical[result.label] ?? result.label;
  } else if (result.kind === "MULTIPLE_LABELS") {
    result.labels = result.labels.map((label: string) => displayToCanonical[label] ?? label).sort();
  }
  result.setSha256 = answerSetSha(result);
  validateAnswerSet(result, "canonical answer");
  return result;
}

function phaseOneRecordSha(itemPseudonym: string, surfaceSha256: string, answer: Json, confidence: string): string {
  return hashJson({ itemPseudonym, surfaceSha256, answer, confidence });
}

function blockFor(itemId: string): string {
  if (itemId.startsWith("RCAL2-G")) return "GRAMMAR";
  if (itemId.startsWith("RCAL2-B")) return "BLANK";
  return "NONFOCUS";
}

function canonicalFocus(record: Json): Json {
  if (record.block === "GRAMMAR") {
    return { grammarSites: record.grammarSiteJudgments, blankOptions: [], blankAxes: [] };
  }
  if (record.block === "BLANK") {
    return {
      grammarSites: [],
      blankOptions: record.blankOptionJudgments,
      blankAxes: record.blankAxisJudgments.map((row: Json) => ({
        axis: row.axis,
        answerPreserved: row.answerPreserved,
      })),
    };
  }
  return { grammarSites: [], blankOptions: [], blankAxes: [] };
}

function canonicalPhase1Evidence(item: Json, mapRow: Json): Json {
  const studentSurface = item.labelMode === "INLINE_MARKERS"
    ? item.studentSurface.replace(/⟦([A-E]):/gu, (_whole: string, label: string) => {
        return "⟦" + (mapRow.displayToCanonical[label] ?? label) + ":";
      })
    : item.studentSurface;
  const options = item.options.map((option: Json) => ({
    canonicalLabel: mapRow.displayToCanonical[option.label] ?? option.label,
    text: option.text,
  })).sort((a: Json, b: Json) => a.canonicalLabel.localeCompare(b.canonicalLabel));
  return {
    labelMode: item.labelMode,
    direction: item.direction,
    studentSurface,
    options,
    responseInstruction: item.responseInstruction,
  };
}

function mapBy<T extends Record<string, any>>(rows: T[], key: keyof T, context: string): Map<any, T> {
  const result = new Map(rows.map((row) => [row[key], row]));
  ensure(result.size === rows.length, context + ": duplicate " + String(key));
  return result;
}

const packetPublicPath = resolve(packetRoot, "packet-public.json");
const packetPublic = readJson(packetPublicPath);
const packetIds = packetPublic.rows.map((row: Json) => row.itemId);
ensure(packetIds.length === 24, "public packet item count");
uniqueExact(packetIds, "public packet ids");
ensure(packetIds.filter((id: string) => blockFor(id) === "GRAMMAR").length === 8, "public grammar count");
ensure(packetIds.filter((id: string) => blockFor(id) === "BLANK").length === 8, "public blank count");
ensure(packetIds.filter((id: string) => blockFor(id) === "NONFOCUS").length === 8, "public nonfocus count");

type Role = "A" | "B" | "C";

const sourceSpecs: Record<Role, { root: string; records: string; originalRecords: string }> = {
  A: {
    root: resolve(issuedRoot, "rater-a"),
    records: resolve(interagreementRoot, "private/rater-a-review-records-score-bound.json"),
    originalRecords: resolve(issuedRoot, "rater-a/review-records.json"),
  },
  B: {
    root: resolve(issuedRoot, "rater-b"),
    records: resolve(interagreementRoot, "private/rater-b-review-records-score-bound.json"),
    originalRecords: resolve(issuedRoot, "rater-b/review-records.json"),
  },
  C: {
    root: resolve(issuedRoot, "adjudicator-c"),
    records: resolve(issuedRoot, "adjudicator-c/review-records.json"),
    originalRecords: resolve(issuedRoot, "adjudicator-c/review-records.json"),
  },
};

function loadSource(role: Role): Json {
  const spec = sourceSpecs[role];
  const paths = {
    phase1: resolve(spec.root, "phase1.json"),
    submission: resolve(spec.root, "submission.json"),
    seal: resolve(spec.root, "seal.json"),
    map: resolve(spec.root, "private-map.json"),
    reveal: resolve(spec.root, "reveal.json"),
    records: spec.records,
    originalRecords: spec.originalRecords,
  };
  return {
    role,
    paths,
    phase1: readJson(paths.phase1),
    submission: readJson(paths.submission),
    seal: readJson(paths.seal),
    privateMap: readJson(paths.map),
    reveal: readJson(paths.reveal),
    records: readJson(paths.records),
    originalRecords: readJson(paths.originalRecords),
  };
}

function stripMechanicalFields(record: Json): Json {
  const copy = clone(record);
  delete copy.relabelMapSha256;
  delete copy.phase2RevealSha256;
  return copy;
}

function validateMechanicalRebind(source: Json): Json {
  if (source.role === "C") return { relabelMapSha256: 0, phase2RevealSha256: 0 };
  const originalByPseudo = mapBy(source.originalRecords, "itemPseudonym", source.role + " original records");
  let relabelChanges = 0;
  let revealChanges = 0;
  for (const rebound of source.records) {
    const original = originalByPseudo.get(rebound.itemPseudonym);
    ensure(original, source.role + ": missing original record " + rebound.itemPseudonym);
    same(
      stripMechanicalFields(original),
      stripMechanicalFields(rebound),
      source.role + ": judgment mutation outside permitted binding fields " + rebound.itemPseudonym,
    );
    if (original.relabelMapSha256 !== rebound.relabelMapSha256) relabelChanges += 1;
    if (original.phase2RevealSha256 !== rebound.phase2RevealSha256) revealChanges += 1;
  }
  return { relabelMapSha256: relabelChanges, phase2RevealSha256: revealChanges };
}

function validateSource(source: Json): Json {
  const role = source.role as Role;
  const phase1 = source.phase1;
  const submission = source.submission;
  const seal = source.seal;
  const privateMap = source.privateMap;
  const reveal = source.reveal;
  const records = source.records;

  ensure(Array.isArray(phase1.items) && phase1.items.length === 24, role + ": phase1 count");
  ensure(Array.isArray(submission.answers) && submission.answers.length === 24, role + ": submission count");
  ensure(Array.isArray(seal.perItemRecordSha256) && seal.perItemRecordSha256.length === 24, role + ": seal count");
  ensure(Array.isArray(privateMap.rows) && privateMap.rows.length === 24, role + ": map count");
  ensure(Array.isArray(reveal.items) && reveal.items.length === 24, role + ": reveal count");
  ensure(Array.isArray(records) && records.length === 24, role + ": review count");

  ensure(phase1.reviewerPseudonym === submission.reviewerPseudonym, role + ": reviewer mismatch submission");
  ensure(phase1.reviewerPseudonym === seal.reviewerPseudonym, role + ": reviewer mismatch seal");
  ensure(phase1.reviewerPseudonym === privateMap.reviewerPseudonym, role + ": reviewer mismatch map");
  ensure(phase1.reviewerPseudonym === reveal.reviewerPseudonym, role + ": reviewer mismatch reveal");
  ensure(phase1.packetInstanceId === submission.packetInstanceId, role + ": packet mismatch submission");
  ensure(phase1.packetInstanceId === seal.packetInstanceId, role + ": packet mismatch seal");
  ensure(phase1.packetInstanceId === privateMap.packetInstanceId, role + ": packet mismatch map");
  ensure(phase1.packetInstanceId === reveal.packetInstanceId, role + ": packet mismatch reveal");

  const phase1Hash = hashJson(phase1);
  const submissionHash = hashJson(submission);
  const sealHash = hashJson(seal);
  const mapHash = hashJson(privateMap);
  const revealHash = hashJson(reveal);
  ensure(submission.phase1PacketSha256 === phase1Hash, role + ": phase1/submission hash");
  ensure(seal.phase1PacketSha256 === phase1Hash, role + ": phase1/seal hash");
  ensure(reveal.phase1PacketSha256 === phase1Hash, role + ": phase1/reveal hash");
  ensure(seal.phase1SubmissionSha256 === submissionHash, role + ": submission/seal hash");
  ensure(reveal.phase1SubmissionSha256 === submissionHash, role + ": submission/reveal hash");
  ensure(reveal.phase1SealSha256 === sealHash, role + ": seal/reveal hash");
  ensure(phase1.privateMapSha256 === mapHash, role + ": private-map commitment");
  ensure(privateMap.canonicalPacketSha256 === phase1.canonicalPacketSha256, role + ": canonical packet mismatch");

  const phase1ByPseudo = mapBy(phase1.items, "itemPseudonym", role + " phase1");
  const answerByPseudo = mapBy(submission.answers, "itemPseudonym", role + " answers");
  const sealByPseudo = mapBy(seal.perItemRecordSha256, "itemPseudonym", role + " seal rows");
  const mapByPseudo = mapBy(privateMap.rows, "itemPseudonym", role + " map rows");
  const revealByPseudo = mapBy(reveal.items, "itemPseudonym", role + " reveal rows");
  const recordByPseudo = mapBy(records, "itemPseudonym", role + " review rows");
  const pseudos = [...phase1ByPseudo.keys()];
  exactSet([...answerByPseudo.keys()], pseudos, role + ": answers pseudonyms");
  exactSet([...sealByPseudo.keys()], pseudos, role + ": seal pseudonyms");
  exactSet([...mapByPseudo.keys()], pseudos, role + ": map pseudonyms");
  exactSet([...revealByPseudo.keys()], pseudos, role + ": reveal pseudonyms");
  exactSet([...recordByPseudo.keys()], pseudos, role + ": review pseudonyms");
  exactSet(privateMap.rows.map((row: Json) => row.itemId), packetIds, role + ": canonical ids");

  const byItemId = new Map<string, Json>();
  for (const itemPseudonym of pseudos) {
    const item = phase1ByPseudo.get(itemPseudonym);
    const answer = answerByPseudo.get(itemPseudonym);
    const sealRow = sealByPseudo.get(itemPseudonym);
    const mapRow = mapByPseudo.get(itemPseudonym);
    const revealRow = revealByPseudo.get(itemPseudonym);
    const record = recordByPseudo.get(itemPseudonym);
    ensure(item && answer && sealRow && mapRow && revealRow && record, role + ": incomplete item binding");
    validateAnswerSet(answer.answer, role + " " + itemPseudonym + " submission");
    validateAnswerSet(record.blindAnswer, role + " " + itemPseudonym + " review");
    ensure(answer.answerSetSha256 === answer.answer.setSha256, role + ": answer/set binding " + itemPseudonym);
    ensure(answer.surfaceSha256 === item.surfaceSha256, role + ": answer surface " + itemPseudonym);
    ensure(mapRow.surfaceSha256 === item.surfaceSha256, role + ": map surface " + itemPseudonym);
    ensure(revealRow.surfaceSha256 === item.surfaceSha256, role + ": reveal surface " + itemPseudonym);
    ensure(record.surfaceSha256 === item.surfaceSha256, role + ": record surface " + itemPseudonym);
    ensure(mapRow.labelMode === item.labelMode, role + ": label mode " + itemPseudonym);
    ensure(
      sealRow.recordSha256 === phaseOneRecordSha(itemPseudonym, item.surfaceSha256, answer.answer, answer.confidence),
      role + ": fresh solve record hash " + itemPseudonym,
    );
    ensure(revealRow.sealedBlindRecordSha256 === sealRow.recordSha256, role + ": reveal solve binding " + itemPseudonym);
    for (const [display, canonical] of Object.entries(mapRow.displayToCanonical)) {
      ensure(mapRow.canonicalToDisplay[canonical as string] === display, role + ": relabel inverse " + itemPseudonym);
    }
    ensure(record.reviewerPseudonym === phase1.reviewerPseudonym, role + ": review identity " + itemPseudonym);
    ensure(record.relabelMapSha256 === hashJson(mapRow), role + ": map row binding " + itemPseudonym);
    ensure(record.phaseOneRecordSha256 === sealRow.recordSha256, role + ": review solve binding " + itemPseudonym);
    ensure(record.phase1SubmissionSha256 === submissionHash, role + ": review submission binding " + itemPseudonym);
    ensure(record.phase2RevealSha256 === revealHash, role + ": review reveal binding " + itemPseudonym);
    same(record.blindAnswer, answer.answer, role + ": blind answer drift " + itemPseudonym);
    ensure(record.blindAnswerSetSha256 === answer.answerSetSha256, role + ": blind answer hash drift " + itemPseudonym);
    ensure(record.block === blockFor(mapRow.itemId), role + ": block mismatch " + itemPseudonym);
    ensure(!byItemId.has(mapRow.itemId), role + ": duplicate canonical item " + mapRow.itemId);

    const solve = canonicalAnswer(answer.answer, mapRow.displayToCanonical);
    if (record.block === "GRAMMAR") {
      const diagnosed = record.grammarSiteJudgments
        .filter((row: Json) => row.diagnosis === "ANSWER_ERROR")
        .map((row: Json) => row.site);
      same(diagnosed, [solve.label], role + ": grammar diagnostics coordinates " + mapRow.itemId);
    }
    if (record.block === "BLANK") {
      const diagnosed = record.blankOptionJudgments
        .filter((row: Json) => row.primaryIntentAxis === "CORRECT")
        .map((row: Json) => row.label);
      same(diagnosed, [solve.label], role + ": blank diagnostics coordinates " + mapRow.itemId);
    }
    byItemId.set(mapRow.itemId, {
      role,
      itemId: mapRow.itemId,
      itemPseudonym,
      reviewerPseudonym: phase1.reviewerPseudonym,
      block: record.block,
      mapRow,
      item,
      answer,
      sealRow,
      revealRow,
      record,
      canonicalBlindAnswer: solve,
      canonicalFocusDiagnostics: canonicalFocus(record),
      canonicalEvidence: {
        phase1: canonicalPhase1Evidence(item, mapRow),
        authorizedSource: revealRow.authorizedSource,
        storedKey: {
          canonicalAnswer: canonicalAnswer(revealRow.storedKey.canonicalAnswer, mapRow.displayToCanonical),
          acceptedEquivalenceSets: revealRow.storedKey.acceptedEquivalenceSets.map((accepted: Json) => {
            return canonicalAnswer(accepted, mapRow.displayToCanonical);
          }),
        },
        explanation: revealRow.explanation,
        scoringContract: revealRow.scoringContract,
        evidenceRefs: revealRow.evidenceRefs,
      },
    });
  }
  ensure(byItemId.size === 24, role + ": canonical item count");
  return {
    ...source,
    hashes: { phase1Hash, submissionHash, sealHash, mapHash, revealHash, recordsHash: hashJson(records) },
    byItemId,
    mechanicalChangedFields: validateMechanicalRebind(source),
  };
}

const sources = {
  A: validateSource(loadSource("A")),
  B: validateSource(loadSource("B")),
  C: validateSource(loadSource("C")),
};

same(sources.A.mechanicalChangedFields, { relabelMapSha256: 0, phase2RevealSha256: 24 }, "A mechanical changes");
same(sources.B.mechanicalChangedFields, { relabelMapSha256: 24, phase2RevealSha256: 0 }, "B mechanical changes");
same(sources.C.mechanicalChangedFields, { relabelMapSha256: 0, phase2RevealSha256: 0 }, "C mechanical changes");

function validateAcceptedSets(label: Json): void {
  validateAnswerSet(label.canonicalAnswer, label.itemId + " canonical");
  ensure(Array.isArray(label.acceptedEquivalenceSets) && label.acceptedEquivalenceSets.length > 0, label.itemId + ": accepted sets empty");
  label.acceptedEquivalenceSets.forEach((answer: Json, index: number) => {
    validateAnswerSet(answer, label.itemId + " accepted " + index);
  });
  uniqueExact(label.acceptedEquivalenceSets.map((answer: Json) => answer.setSha256), label.itemId + ": accepted set hashes");
  ensure(
    label.acceptedEquivalenceSets.some((answer: Json) => answer.setSha256 === label.canonicalAnswer.setSha256),
    label.itemId + ": canonical answer not accepted",
  );
  const domain = answerDomain(label.canonicalAnswer.kind);
  ensure(
    label.acceptedEquivalenceSets.every((answer: Json) => answerDomain(answer.kind) === domain),
    label.itemId + ": accepted answer domain mix",
  );
}

function stripCorrection(rows: Json[]): Json[] {
  return rows.map((row: Json) => {
    const copy = clone(row);
    delete copy.correction;
    return copy;
  });
}

function sourceSnapshot(source: Json, itemId: string): Json {
  const row = source.byItemId.get(itemId);
  ensure(row, source.role + ": missing snapshot " + itemId);
  return {
    reviewerPseudonym: row.reviewerPseudonym,
    itemPseudonym: row.itemPseudonym,
    sourceReviewRecordSha256: hashJson(row.record),
    freshSolveRecordSha256: row.sealRow.recordSha256,
    canonicalBlindAnswer: row.canonicalBlindAnswer,
    anyFatal: row.record.anyFatal,
    fatalDomains: row.record.fatalDomains,
    fatalCodes: row.record.fatalCodes,
    grade: row.record.grade,
    canonicalFocusDiagnosticsSha256: hashJson(row.canonicalFocusDiagnostics),
  };
}

function countBy(values: string[]): Record<string, number> {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [
    value,
    values.filter((entry) => entry === value).length,
  ]));
}

function composition(labels: Json[]): Json {
  const byBlock = Object.fromEntries(["GRAMMAR", "BLANK", "NONFOCUS"].map((block) => {
    const rows = labels.filter((row) => row.block === block);
    return [block, {
      items: rows.length,
      fatal: rows.filter((row) => row.anyFatal).length,
      grades: countBy(rows.map((row) => row.grade)),
    }];
  }));
  const issues: string[] = [];
  for (const block of ["GRAMMAR", "BLANK", "NONFOCUS"]) {
    const rows = labels.filter((row) => row.block === block);
    if (rows.length !== 8) issues.push(block + "_COUNT_NOT_8");
    if (rows.filter((row) => row.anyFatal).length !== 2) issues.push(block + "_FATAL_COUNT_NOT_2");
    for (const grade of ["F", "C", "B", "A"]) {
      if (rows.filter((row) => row.grade === grade).length !== 2) {
        issues.push(block + "_GRADE_" + grade + "_COUNT_NOT_2");
      }
    }
  }
  return { byBlock, issues: issues.sort() };
}

function reviewerScoreLabels(source: Json, itemIds: string[]): Json[] {
  return itemIds.map((itemId) => {
    const row = source.byItemId.get(itemId);
    const common = {
      itemId,
      block: row.block,
      canonicalAnswer: row.canonicalBlindAnswer,
      acceptedEquivalenceSets: [row.canonicalBlindAnswer],
      anyFatal: row.record.anyFatal,
      grade: row.record.grade,
    };
    if (row.block === "GRAMMAR") {
      return {
        ...common,
        grammarSites: stripCorrection(row.record.grammarSiteJudgments),
        blankOptions: [],
        blankAxes: [],
      };
    }
    if (row.block === "BLANK") {
      return {
        ...common,
        grammarSites: [],
        blankOptions: row.record.blankOptionJudgments,
        blankAxes: row.record.blankAxisJudgments.map((axis: Json) => ({
          axis: axis.axis,
          answerPreserved: axis.answerPreserved,
        })),
      };
    }
    return { ...common, grammarSites: [], blankOptions: [], blankAxes: [] };
  });
}

function meets(value: Json, threshold: Json): boolean {
  return value.denominator > 0
    && value.numerator * threshold.denominator >= threshold.numerator * value.denominator;
}

function manualThresholdEvaluation(metrics: Json): Json {
  const reasons: string[] = [];
  for (const [name, threshold] of Object.entries(DEFAULT_THRESHOLDS.global)) {
    if (!meets(metrics[name], threshold)) reasons.push("GLOBAL_" + name.toUpperCase());
  }
  for (const block of ["GRAMMAR", "BLANK", "NONFOCUS"]) {
    for (const [name, threshold] of Object.entries(DEFAULT_THRESHOLDS.eachBlock)) {
      if (name === "grammarSiteAgreement" && block !== "GRAMMAR") continue;
      if ((name === "blankOptionAgreement" || name === "blankAxisAgreement") && block !== "BLANK") continue;
      const value = name === "blindSolveExactAgreement"
        ? metrics.blockBlindSolveExactAgreement[block]
        : metrics.block[block][name];
      if (!meets(value, threshold)) reasons.push(block + "_" + name.toUpperCase());
    }
  }
  return { pass: reasons.length === 0, reasonCodes: reasons };
}

function validateReviewedVector(labels: Json[]): void {
  ensure(labels.length === 24, "reviewed label vector: count drift");
  for (const label of labels) {
    const expected = EXPECTED_LABEL_VECTOR[label.itemId];
    ensure(expected, "reviewed label vector: unknown item " + label.itemId);
    ensure(
      label.grade === expected.grade && label.anyFatal === expected.anyFatal,
      "reviewed grade/fatal vector drift " + label.itemId,
    );
  }
}

function validateConstructedSets(labels: Json[]): Json {
  const byId = mapBy(labels, "itemId", "final labels for constructed audit");
  const n05 = byId.get("RCAL2-N05");
  const n06 = byId.get("RCAL2-N06");
  const n07 = byId.get("RCAL2-N07");
  ensure(n05.acceptedEquivalenceSets.length === 9, "N05 accepted-set count");
  ensure(n06.acceptedEquivalenceSets.length === 16, "N06 accepted-set count");
  ensure(n07.acceptedEquivalenceSets.length === 2, "N07 accepted-set count");
  ensure(n05.acceptedEquivalenceSets.every((row: Json) => row.kind === "SINGLE_TEXT"), "N05 answer kind");
  ensure(n06.acceptedEquivalenceSets.every((row: Json) => row.kind === "MULTIPLE_TEXTS" && row.texts.length === 2), "N06 answer kind");
  ensure(n07.acceptedEquivalenceSets.every((row: Json) => row.kind === "SINGLE_TEXT"), "N07 answer kind");

  const n06Members = n06.acceptedEquivalenceSets.flatMap((row: Json) => row.texts.map((text: Json) => text.text));
  const active = [...new Set(n06Members.filter((text: string) => /technician (?:had )?calibrated the sensor/u.test(text)))];
  const passive = [...new Set(n06Members.filter((text: string) => /sensor (?:was|had been) calibrated by the technician/u.test(text)))];
  ensure(active.length === 4, "N06 active member count");
  ensure(passive.length === 4, "N06 passive member count");
  const expectedCross = new Set(active.flatMap((a) => passive.map((p) => {
    return hashJson({ domain: "TEXTS", members: sorted([sha256(a), sha256(p)]) });
  })));
  exactSet(
    n06.acceptedEquivalenceSets.map((row: Json) => row.setSha256),
    [...expectedCross],
    "N06 full active/passive cross product",
  );
  for (const accepted of n06.acceptedEquivalenceSets) {
    const reversed = clone(accepted);
    reversed.texts.reverse();
    ensure(answerSetSha(reversed) === accepted.setSha256, "N06 order invariance");
  }
  return {
    N05: { acceptedSets: 9, unique: true, structuralHashesValid: true },
    N06: {
      acceptedSets: 16,
      unique: true,
      structuralHashesValid: true,
      activeMembers: active.length,
      passiveMembers: passive.length,
      fullCrossProduct: true,
      memberOrderInvariant: true,
    },
    N07: { acceptedSets: 2, unique: true, structuralHashesValid: true },
  };
}

function validatePhase3(artifacts: Json, checkedSources: Record<Role, Json>, enforceByteBaseline = false): Json {
  const labels = artifacts.labels;
  const adjudications = artifacts.adjudications;
  const proposal = artifacts.proposal;
  const report = artifacts.report;
  ensure(Array.isArray(labels) && labels.length === 24, "final labels count");
  ensure(Array.isArray(adjudications) && adjudications.length === 24, "adjudication count");
  ensure(Array.isArray(proposal.items) && proposal.items.length === 24, "proposal count");
  exactSet(labels.map((row: Json) => row.itemId), packetIds, "final label ids");
  exactSet(adjudications.map((row: Json) => row.itemId), packetIds, "adjudication ids");
  exactSet(proposal.items.map((row: Json) => row.itemId), packetIds, "proposal ids");
  validateReviewedVector(labels);

  const labelById = mapBy(labels, "itemId", "final labels");
  const adjudicationById = mapBy(adjudications, "itemId", "adjudications");
  const proposalById = mapBy(proposal.items, "itemId", "proposal items");
  for (const label of labels) {
    ensure(label.block === blockFor(label.itemId), label.itemId + ": final block");
    ensure(label.anyFatal === (label.grade === "F"), label.itemId + ": grade/fatal drift");
    validateAcceptedSets(label);
    if (label.block === "GRAMMAR") {
      ensure(label.grammarSites.map((row: Json) => row.site).join("") === "ABCDE", label.itemId + ": grammar sites");
      ensure(label.blankOptions.length === 0 && label.blankAxes.length === 0, label.itemId + ": grammar diagnostics spill");
    } else if (label.block === "BLANK") {
      ensure(label.blankOptions.map((row: Json) => row.label).join("") === "12345", label.itemId + ": blank options");
      ensure(label.blankAxes.length === 7, label.itemId + ": blank axes");
      ensure(label.grammarSites.length === 0, label.itemId + ": blank diagnostics spill");
    } else {
      ensure(label.grammarSites.length === 0 && label.blankOptions.length === 0 && label.blankAxes.length === 0, label.itemId + ": nonfocus diagnostics");
    }

    const adjudication = adjudicationById.get(label.itemId);
    const proposalRow = proposalById.get(label.itemId);
    ensure(adjudication.block === label.block, label.itemId + ": adjudication block");
    ensure(proposalRow.block === label.block, label.itemId + ": proposal block");
    for (const role of ["A", "B", "C"] as Role[]) {
      same(adjudication.sourceRows[role], sourceSnapshot(checkedSources[role], label.itemId), label.itemId + ": source snapshot " + role);
    }
    same(adjudication.adjudicatorFreshSolve, {
      recordSha256: adjudication.sourceRows.C.freshSolveRecordSha256,
      canonicalAnswer: adjudication.sourceRows.C.canonicalBlindAnswer,
    }, label.itemId + ": adjudicator fresh solve");
    same(adjudication.finalDecision.canonicalAnswer, label.canonicalAnswer, label.itemId + ": final canonical answer");
    same(adjudication.finalDecision.acceptedEquivalenceSets, label.acceptedEquivalenceSets, label.itemId + ": final accepted sets");
    ensure(adjudication.finalDecision.anyFatal === label.anyFatal, label.itemId + ": adjudication fatal");
    ensure(adjudication.finalDecision.grade === label.grade, label.itemId + ": adjudication grade");
    if (label.block === "GRAMMAR") {
      same(stripCorrection(adjudication.canonicalDiagnostics.grammarSites), label.grammarSites, label.itemId + ": grammar diagnostics");
    } else if (label.block === "BLANK") {
      same(adjudication.canonicalDiagnostics.blankOptions, label.blankOptions, label.itemId + ": blank diagnostics");
      same(adjudication.canonicalDiagnostics.blankAxes, label.blankAxes, label.itemId + ": blank axes");
    }

    const cEvidence = checkedSources.C.byItemId.get(label.itemId).canonicalEvidence;
    ensure(adjudication.rationaleEvidence.majorityVoteUsed === false, label.itemId + ": majority vote");
    ensure(adjudication.rationaleEvidence.storedKeyAndAuthorExplanationTreatedAsEvidenceOnly === true, label.itemId + ": evidence policy");
    ensure(adjudication.rationaleEvidence.phase1Direction === cEvidence.phase1.direction, label.itemId + ": rationale direction");
    ensure(adjudication.rationaleEvidence.phase1StudentSurface === cEvidence.phase1.studentSurface, label.itemId + ": rationale surface");
    ensure(adjudication.rationaleEvidence.authorizedSource === cEvidence.authorizedSource, label.itemId + ": rationale source");
    ensure(adjudication.rationaleEvidence.revealedExplanation === cEvidence.explanation, label.itemId + ": rationale explanation");
    ensure(adjudication.rationaleEvidence.scoringContractSha256 === hashJson(cEvidence.scoringContract), label.itemId + ": scoring contract hash");
    ensure(adjudication.rationaleEvidence.storedKeySha256 === hashJson(cEvidence.storedKey), label.itemId + ": stored key hash");
    same(adjudication.rationaleEvidence.evidenceRefs, cEvidence.evidenceRefs, label.itemId + ": evidence refs");

    same(proposalRow.independentReviewRecordSha256, [
      hashJson(checkedSources.A.byItemId.get(label.itemId).record),
      hashJson(checkedSources.B.byItemId.get(label.itemId).record),
    ], label.itemId + ": independent review hashes");
    same(proposalRow.adjudicatorFreshSolve, {
      recordSha256: checkedSources.C.byItemId.get(label.itemId).sealRow.recordSha256,
      answer: checkedSources.C.byItemId.get(label.itemId).canonicalBlindAnswer,
      answerSetSha256: checkedSources.C.byItemId.get(label.itemId).canonicalBlindAnswer.setSha256,
    }, label.itemId + ": proposal fresh solve");
    ensure(proposalRow.adjudicationRecordSha256 === hashJson(adjudication), label.itemId + ": adjudication hash");
    same(proposalRow.finalLabel, label, label.itemId + ": proposal final label");
  }

  ensure(
    !stableJson(adjudications).includes("authorHypothesis")
      && !stableJson(adjudications).includes("gold.private")
      && !stableJson(adjudications).includes("trustedGold"),
    "adjudication includes forbidden posterior-authority material",
  );

  const constructed = validateConstructedSets(labels);
  const gradeCounts = countBy(labels.map((row: Json) => row.grade));
  const fatalCount = labels.filter((row: Json) => row.anyFatal).length;
  same(gradeCounts, { A: 4, B: 4, C: 7, F: 9 }, "global grade counts");
  ensure(fatalCount === 9, "global fatal count");
  const compositionResult = composition(labels);
  same(compositionResult.byBlock, report.composition.byBlock, "report block composition");
  same(compositionResult.issues, report.composition.issues, "report composition issues");
  ensure(report.composition.issuanceEligible === false, "composition must be ineligible");
  same(compositionResult.issues, [
    "NONFOCUS_FATAL_COUNT_NOT_2",
    "NONFOCUS_GRADE_A_COUNT_NOT_2",
    "NONFOCUS_GRADE_B_COUNT_NOT_2",
    "NONFOCUS_GRADE_C_COUNT_NOT_2",
    "NONFOCUS_GRADE_F_COUNT_NOT_2",
  ], "composition issue set");

  ensure(proposal.packetPrivateSha256 === bytesSha(resolve(packetRoot, "private/items.private.json")), "proposal packet bytes hash");
  ensure(proposal.contractSha256 === bytesSha(resolve(packetRoot, "contract.mts")), "proposal contract bytes hash");
  ensure(proposal.metricsSha256 === bytesSha(resolve(packetRoot, "metrics.mts")), "proposal metrics bytes hash");
  ensure(proposal.independentRatersPerItem === 2 && proposal.freshAdjudicatorsPerItem === 1, "proposal reviewer counts");
  ensure(resolve(phase3Root, "final-gold-proposal.json") !== forbiddenGoldPath, "proposal aliases trusted gold path");

  const summary = {
    items: 24,
    grades: gradeCounts,
    fatal: fatalCount,
    nonfatal: 24 - fatalCount,
    anySourceDisagreement: adjudications.filter((row: Json) => row.disagreementFlags.any).length,
    blindAnswerDisagreement: adjudications.filter((row: Json) => row.disagreementFlags.blindAnswerSet).length,
    fatalFlagDisagreement: adjudications.filter((row: Json) => row.disagreementFlags.fatalFlag).length,
    fatalDomainDisagreement: adjudications.filter((row: Json) => row.disagreementFlags.fatalDomainSet).length,
    gradeDisagreement: adjudications.filter((row: Json) => row.disagreementFlags.grade).length,
    focusDiagnosticDisagreement: adjudications.filter((row: Json) => row.disagreementFlags.focusDiagnostics).length,
  };
  same(summary, report.itemSummary, "report item summary");
  ensure(report.sourceIntegrity.finalLabelsSemanticSha256 === hashJson(labels), "report final label semantic hash");
  ensure(report.sourceIntegrity.adjudicationRecordsSemanticSha256 === hashJson(adjudications), "report adjudication semantic hash");
  ensure(report.sourceIntegrity.finalGoldProposalSemanticSha256 === hashJson(proposal), "report proposal semantic hash");
  ensure(report.sourceIntegrity.scoreBoundReviewRecordSemanticSha256.A === hashJson(checkedSources.A.records), "report A source semantic hash");
  ensure(report.sourceIntegrity.scoreBoundReviewRecordSemanticSha256.B === hashJson(checkedSources.B.records), "report B source semantic hash");
  ensure(report.sourceIntegrity.scoreBoundReviewRecordSemanticSha256.C === hashJson(checkedSources.C.records), "report C source semantic hash");
  ensure(report.sourceIntegrity.cPhase1SubmissionSha256 === hashJson(checkedSources.C.submission), "report C submission hash");

  const metricsByRole: Record<string, Json> = {};
  const thresholdByRole: Record<string, Json> = {};
  for (const role of ["A", "B", "C"] as Role[]) {
    const metrics = computeCalibrationMetrics({
      schemaVersion: "reviewer-calibration-score-input-v2",
      goldStatus: "FINAL_ADJUDICATED_GOLD",
      packetSha256: proposal.packetPrivateSha256,
      oracleSha256: hashJson(proposal),
      reviewerPseudonym: checkedSources[role].phase1.reviewerPseudonym,
      gold: labels,
      review: reviewerScoreLabels(checkedSources[role], labels.map((row: Json) => row.itemId)),
    });
    const threshold = manualThresholdEvaluation(metrics);
    same(metrics, report.metricsAgainstFinalLabels[role].metrics, "report metrics " + role);
    same(threshold, report.metricsAgainstFinalLabels[role].thresholdEvaluation, "report thresholds " + role);
    ensure(threshold.pass === false, role + ": threshold preview unexpectedly passes");
    metricsByRole[role] = metrics;
    thresholdByRole[role] = threshold;
  }
  same(report.thresholds, DEFAULT_THRESHOLDS, "report threshold constants");
  same(report.certificationPreview.metricThresholdEvaluationsArePreviewOnly, thresholdByRole, "certificate preview thresholds");
  ensure(report.certificationPreview.certificateIssued === false, "certificate declared issued");
  ensure(report.certificationPreview.blockedBeforeCertificateIssuance === true, "certificate not blocked");
  ensure(report.certificationPreview.effectiveDecision === "FAILED", "certificate preview decision");
  same(report.certificationPreview.reasonCodes, ["PACKET_COMPOSITION_INELIGIBLE", ...compositionResult.issues], "certificate reason codes");

  if (enforceByteBaseline) {
    for (const [name, expected] of Object.entries(EXPECTED_PHASE3_BYTES)) {
      ensure(bytesSha(resolve(phase3Root, name)) === expected, "phase3 bytes drift " + name);
    }
    for (const [name, expected] of Object.entries(EXPECTED_PHASE3_SEMANTIC)) {
      ensure(hashJson(readJson(resolve(phase3Root, name))) === expected, "phase3 semantic drift " + name);
    }
  }
  return {
    gradeCounts,
    fatalCount,
    composition: compositionResult,
    constructed,
    thresholdByRole,
    metricsByRole,
  };
}

const artifacts = {
  labels: readJson(resolve(phase3Root, "final-labels.json")),
  adjudications: readJson(resolve(phase3Root, "adjudication-records.json")),
  proposal: readJson(resolve(phase3Root, "final-gold-proposal.json")),
  report: readJson(resolve(phase3Root, "report.json")),
};

const validated = validatePhase3(artifacts, sources, true);

const interagreementReportPath = resolve(interagreementRoot, "report.json");
const interagreementReport = readJson(interagreementReportPath);
ensure(
  artifacts.report.sourceIntegrity.publicInteragreementReportBytesSha256 === bytesSha(interagreementReportPath),
  "public interagreement report bytes binding",
);
ensure(
  artifacts.report.sourceIntegrity.publicInteragreementReportSemanticSha256 === interagreementReport.reportSemanticSha256,
  "public interagreement report semantic binding",
);

const cReviewStat = statSync(sources.C.paths.records);
const cSealStat = statSync(sources.C.paths.seal);
const cRevealStat = statSync(sources.C.paths.reveal);
const aReviewStat = statSync(sourceSpecs.A.originalRecords);
const bReviewStat = statSync(sourceSpecs.B.originalRecords);
const interagreementStat = statSync(interagreementReportPath);
ensure(cSealStat.mtimeMs < cRevealStat.mtimeMs, "C seal/reveal observed order");
ensure(aReviewStat.mtimeMs < cReviewStat.mtimeMs, "A/C observed review order changed");
ensure(bReviewStat.mtimeMs < cReviewStat.mtimeMs, "B/C observed review order changed");
ensure(interagreementStat.mtimeMs < cReviewStat.mtimeMs, "interagreement/C observed order changed");

const provenance = {
  cSealEmbeddedAt: sources.C.seal.sealedAt,
  cSealModifiedUtc: cSealStat.mtime.toISOString(),
  cRevealModifiedUtc: cRevealStat.mtime.toISOString(),
  cPhase2ReviewModifiedUtc: cReviewStat.mtime.toISOString(),
  aPhase2ReviewModifiedUtc: aReviewStat.mtime.toISOString(),
  bPhase2ReviewModifiedUtc: bReviewStat.mtime.toISOString(),
  interagreementReportModifiedUtc: interagreementStat.mtime.toISOString(),
  cPhase2SemanticSha256: hashJson(sources.C.records),
  cPhase2CarriesCompletionTimestamp: false,
  cPhase2BeforeABAccessCryptographicallyVerified: false,
  observation: "A, B, and the A/B interagreement report predate the C phase2 review file; no access log or phase2 timestamp commitment proves non-access.",
};

function expectRejected(name: string, action: () => void): Json {
  try {
    action();
    throw new Error("MUTATION_WAS_ACCEPTED:" + name);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ensure(!message.startsWith("MUTATION_WAS_ACCEPTED:"), message);
    return { name, expected: "REJECT", result: "REJECTED", evidence: message };
  }
}

const hostileMutations: Json[] = [];

hostileMutations.push(expectRejected("delete_item", () => {
  const mutated = clone(artifacts);
  mutated.labels.pop();
  validatePhase3(mutated, sources);
}));

hostileMutations.push(expectRejected("duplicate_id", () => {
  const mutated = clone(artifacts);
  mutated.labels[23].itemId = mutated.labels[22].itemId;
  validatePhase3(mutated, sources);
}));

hostileMutations.push(expectRejected("binding_swap", () => {
  const mutated = loadSource("C");
  const temporary = mutated.records[0].phaseOneRecordSha256;
  mutated.records[0].phaseOneRecordSha256 = mutated.records[1].phaseOneRecordSha256;
  mutated.records[1].phaseOneRecordSha256 = temporary;
  validateSource(mutated);
}));

hostileMutations.push(expectRejected("accepted_set_change", () => {
  const mutated = clone(artifacts);
  const label = mutated.labels.find((row: Json) => row.itemId === "RCAL2-N05");
  label.acceptedEquivalenceSets.pop();
  validatePhase3(mutated, sources);
}));

hostileMutations.push(expectRejected("grade_fatal_drift", () => {
  const mutated = clone(artifacts);
  const label = mutated.labels.find((row: Json) => row.itemId === "RCAL2-G03");
  label.grade = "A";
  validatePhase3(mutated, sources);
}));

hostileMutations.push(expectRejected("forced_composition_balance", () => {
  const mutated = clone(artifacts.labels);
  const targets = ["A", "A", "B", "B", "C", "C", "F", "F"];
  mutated.filter((row: Json) => row.block === "NONFOCUS").forEach((row: Json, index: number) => {
    row.grade = targets[index];
    row.anyFatal = targets[index] === "F";
  });
  validateReviewedVector(mutated);
}));

hostileMutations.push(expectRejected("constructed_duplicate_member", () => {
  const n06 = clone(artifacts.labels.find((row: Json) => row.itemId === "RCAL2-N06").canonicalAnswer);
  n06.texts[1] = clone(n06.texts[0]);
  n06.setSha256 = answerSetSha(n06);
  validateAnswerSet(n06, "hostile N06 duplicate");
}));

hostileMutations.push(expectRejected("declared_semantic_hash_drift", () => {
  const mutated = clone(artifacts);
  mutated.report.sourceIntegrity.finalLabelsSemanticSha256 = "0".repeat(64);
  validatePhase3(mutated, sources);
}));

const n06Canonical = artifacts.labels.find((row: Json) => row.itemId === "RCAL2-N06").canonicalAnswer;
const reversedN06 = clone(n06Canonical);
reversedN06.texts.reverse();
validateAnswerSet(reversedN06, "N06 reversed-order positive control");
ensure(reversedN06.setSha256 === n06Canonical.setSha256, "N06 reversed-order positive control identity");
hostileMutations.push({
  name: "multiple_text_member_order",
  expected: "ACCEPT_SAME_IDENTITY",
  result: "ACCEPTED_SAME_IDENTITY",
  setSha256: reversedN06.setSha256,
});

const semanticDefects = {
  N01: {
    observedFinding: artifacts.adjudications.find((row: Json) => row.itemId === "RCAL2-N01")
      .rationaleEvidence.concreteFindings[0],
    authorizedSource: artifacts.adjudications.find((row: Json) => row.itemId === "RCAL2-N01")
      .rationaleEvidence.authorizedSource,
    result: "CONTRADICTION",
  },
  B02: {
    observedFinding: artifacts.adjudications.find((row: Json) => row.itemId === "RCAL2-B02")
      .rationaleEvidence.concreteFindings[1],
    revealedExplanation: artifacts.adjudications.find((row: Json) => row.itemId === "RCAL2-B02")
      .rationaleEvidence.revealedExplanation,
    result: "UNSUPPORTED_PARAPHRASE",
  },
};
ensure(
  semanticDefects.N01.observedFinding.includes("upper path remains open while the lower path closes"),
  "N01 contradiction evidence changed",
);
ensure(
  semanticDefects.N01.authorizedSource.includes("bridge") && semanticDefects.N01.authorizedSource.includes("path below stays open"),
  "N01 authorized source evidence changed",
);
ensure(
  semanticDefects.B02.observedFinding.includes("delay, error, and manipulation impossible"),
  "B02 unsupported finding evidence changed",
);
ensure(
  !semanticDefects.B02.revealedExplanation.includes("manipulation"),
  "B02 explanation unexpectedly supports manipulation claim",
);

function verifySourceInventory(): void {
  const evidencePath = resolve(here, "evidence.json");
  if (!existsSync(evidencePath)) return;
  const evidence = readJson(evidencePath);
  ensure(Array.isArray(evidence.sourceInventory), "evidence source inventory missing");
  for (const row of evidence.sourceInventory) {
    const absolute = resolve(repoRoot, row.path);
    ensure(absolute !== forbiddenGoldPath, "evidence inventory contains forbidden gold");
    ensure(bytesSha(absolute) === row.bytesSha256, "source bytes changed: " + row.path);
  }
}

function verifyManifest(): void {
  const manifestPath = resolve(here, "MANIFEST.sha256");
  if (!existsSync(manifestPath)) return;
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/gu).filter(Boolean);
  const expectedFiles = ["REPORT.md", "evidence.json", "report.json", "verify.mts"];
  ensure(lines.length === expectedFiles.length, "manifest entry count");
  const seen: string[] = [];
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/u.exec(line);
    ensure(match, "bad manifest line: " + line);
    const [, expected, name] = match;
    ensure(expectedFiles.includes(name), "unexpected manifest file " + name);
    ensure(bytesSha(resolve(here, name)) === expected, "manifest hash mismatch " + name);
    seen.push(name);
  }
  exactSet(seen, expectedFiles, "manifest files");
}

verifySourceInventory();
verifyManifest();

const output = {
  valid: true,
  auditVerdict: "FAIL",
  issuanceRecommendation: "BLOCK",
  trustedGoldRead: false,
  networkOrExternalActivity: false,
  itemCount: 24,
  gradeCounts: validated.gradeCounts,
  fatalCount: validated.fatalCount,
  compositionEligible: false,
  compositionIssues: validated.composition.issues,
  metricThresholdPass: Object.fromEntries(Object.entries(validated.thresholdByRole).map(([role, value]: [string, Json]) => [
    role,
    value.pass,
  ])),
  semanticSha256: Object.fromEntries(Object.entries(EXPECTED_PHASE3_SEMANTIC).map(([name]) => [
    name,
    hashJson(readJson(resolve(phase3Root, name))),
  ])),
  constructedAnswerSets: validated.constructed,
  provenance,
  semanticDefects,
  hostileMutations,
};

console.log(JSON.stringify(output, null, 2));
