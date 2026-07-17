import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  answerDomain,
  answerSetSchema,
  authorPacketSchema,
  canonicalRfc3339Micros,
  hashJson,
  issuedPhase1PacketSchema,
  phase1SealSchema,
  phase1SubmissionSchema,
  phaseOneRecordSha,
  sha256,
  withAnswerSetSha,
  type AnswerSet,
  type AuthorItem,
  type AuthorPacket,
  type IssuedPhase1Packet,
  type Phase1Seal,
  type Phase1Submission,
} from "./contract.mts";

const here = dirname(fileURLToPath(import.meta.url));
const privateRoot = resolve(here, "private");
const shaSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const labelMapRowSchema = z.object({
  itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u), itemId: z.string().regex(/^RCAL2-(G|B|N)[0-9]{2}$/u),
  labelMode: z.enum(["OPTIONS", "INLINE_MARKERS", "CONSTRUCTED"]), surfaceSha256: shaSchema,
  displayToCanonical: z.record(z.string(), z.string()), canonicalToDisplay: z.record(z.string(), z.string()),
}).strict();

export const privateIssueMapSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-private-issue-map-v2"), packetInstanceId: z.string().regex(/^RCAL2-[A-Z0-9_-]{3,60}$/u),
  reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u), canonicalPacketSha256: shaSchema,
  rows: z.array(labelMapRowSchema).length(24),
}).strict();

export const phase2RevealSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-phase2-reveal-v2"), packetInstanceId: z.string().regex(/^RCAL2-[A-Z0-9_-]{3,60}$/u),
  reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u), phase1PacketSha256: shaSchema,
  phase1SubmissionSha256: shaSchema, phase1SealSha256: shaSchema,
  items: z.array(z.object({
    itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u), surfaceSha256: shaSchema, sealedBlindRecordSha256: shaSchema,
    authorizedSource: z.string().min(40).max(6000),
    storedKey: z.object({ canonicalAnswer: answerSetSchema, acceptedEquivalenceSets: z.array(answerSetSchema).min(1).max(20) }).strict(),
    explanation: z.string().min(10).max(5000), scoringContract: z.string().min(10).max(3000), evidenceRefs: z.array(z.string()).min(1).max(50),
  }).strict()).length(24),
}).strict();

export type PrivateIssueMap = z.infer<typeof privateIssueMapSchema>;
export type Phase2Reveal = z.infer<typeof phase2RevealSchema>;

function deterministicOrder<T>(rows: T[], key: (row: T) => string, seed: string, purpose: string): T[] {
  return [...rows].sort((a, b) => {
    const ka = key(a); const kb = key(b);
    return sha256(`${seed}\u0000${purpose}\u0000${ka}`).localeCompare(sha256(`${seed}\u0000${purpose}\u0000${kb}`)) || ka.localeCompare(kb);
  });
}

function render(item: AuthorItem, seed: string) {
  if (item.phase1.labelMode === "OPTIONS") {
    const ordered = deterministicOrder(item.phase1.options, (row) => row.canonicalLabel, seed, `OPTIONS:${item.itemId}`);
    const displayToCanonical: Record<string, string> = {}; const canonicalToDisplay: Record<string, string> = {};
    const options = ordered.map((row, index) => {
      const display = String(index + 1); displayToCanonical[display] = row.canonicalLabel; canonicalToDisplay[row.canonicalLabel] = display;
      return { label: display, text: row.text };
    });
    return { studentSurface: item.phase1.studentSurface, options, displayToCanonical, canonicalToDisplay };
  }
  if (item.phase1.labelMode === "INLINE_MARKERS") {
    const canonical = ["A", "B", "C", "D", "E"];
    const permuted = deterministicOrder(canonical, (row) => row, seed, `MARKERS:${item.itemId}`);
    const displayToCanonical: Record<string, string> = {}; const canonicalToDisplay: Record<string, string> = {};
    permuted.forEach((canonicalLabel, index) => { const display = canonical[index]; displayToCanonical[display] = canonicalLabel; canonicalToDisplay[canonicalLabel] = display; });
    const studentSurface = item.phase1.studentSurface.replace(/⟦([A-E]):/gu, (_whole, label: string) => `⟦${canonicalToDisplay[label]}:`);
    return { studentSurface, options: [], displayToCanonical, canonicalToDisplay };
  }
  return { studentSurface: item.phase1.studentSurface, options: [], displayToCanonical: {}, canonicalToDisplay: {} };
}

export function issuePhase1Packet(input: { packet: AuthorPacket; reviewerPseudonym: string; seed: string; contractSha256: string }) {
  const packet = authorPacketSchema.parse(input.packet);
  if (!/^[A-Z0-9_-]{3,40}$/u.test(input.reviewerPseudonym)) throw new Error("REVIEWER_PSEUDONYM_INVALID");
  if (input.seed.length < 16) throw new Error("ISSUE_SEED_TOO_SHORT");
  if (!/^[a-f0-9]{64}$/u.test(input.contractSha256)) throw new Error("CONTRACT_HASH_INVALID");
  const canonicalPacketSha256 = hashJson(packet);
  const packetInstanceId = `RCAL2-${sha256(`${input.reviewerPseudonym}\u0000${input.seed}\u0000${canonicalPacketSha256}`).slice(0, 20).toUpperCase()}`;
  const ordered = deterministicOrder(packet.items, (row) => row.itemId, input.seed, "ITEM_ORDER");
  const rows = ordered.map((item, index) => {
    const itemPseudonym = `Q${String(index + 1).padStart(3, "0")}`;
    const output = render(item, input.seed);
    const publicShape = { labelMode: item.phase1.labelMode, direction: item.phase1.direction, studentSurface: output.studentSurface, options: output.options, responseInstruction: item.phase1.responseInstruction };
    const surfaceSha256 = hashJson(publicShape);
    return {
      publicItem: { itemPseudonym, surfaceSha256, ...publicShape },
      map: { itemPseudonym, itemId: item.itemId, labelMode: item.phase1.labelMode, surfaceSha256, displayToCanonical: output.displayToCanonical, canonicalToDisplay: output.canonicalToDisplay },
    };
  });
  const privateMap = privateIssueMapSchema.parse({ schemaVersion: "reviewer-calibration-private-issue-map-v2", packetInstanceId, reviewerPseudonym: input.reviewerPseudonym, canonicalPacketSha256, rows: rows.map((row) => row.map) });
  const phase1 = issuedPhase1PacketSchema.parse({ schemaVersion: "reviewer-calibration-phase1-v2", packetInstanceId, reviewerPseudonym: input.reviewerPseudonym, canonicalPacketSha256, contractSha256: input.contractSha256, items: rows.map((row) => row.publicItem), privateMapSha256: hashJson(privateMap) });
  return { phase1, privateMap };
}

function assertExactSet(expected: string[], actual: string[], code: string): void {
  if (new Set(actual).size !== actual.length) throw new Error(`${code}_DUPLICATE`);
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${code}_SET_MISMATCH`);
}

function labelMembers(answer: AnswerSet): string[] {
  if (answer.kind === "SINGLE_LABEL") return [answer.label];
  if (answer.kind === "MULTIPLE_LABELS") return answer.labels;
  return [];
}

function assertAnswerShape(item: IssuedPhase1Packet["items"][number], answer: Phase1Submission["answers"][number]): void {
  if (answer.surfaceSha256 !== item.surfaceSha256) throw new Error(`ANSWER_SURFACE_HASH_MISMATCH:${answer.itemPseudonym}`);
  const domain = answerDomain(answer.answer.kind);
  const validLabels = item.options.length ? item.options.map((row) => row.label) : [...item.studentSurface.matchAll(/⟦([A-E]):/gu)].map((row) => row[1]);
  if (item.labelMode === "CONSTRUCTED" && domain === "LABELS") throw new Error(`CONSTRUCTED_HAS_LABEL:${answer.itemPseudonym}`);
  if (item.labelMode !== "CONSTRUCTED" && domain === "TEXTS") throw new Error(`LABELED_ITEM_HAS_TEXT:${answer.itemPseudonym}`);
  if (labelMembers(answer.answer).some((label) => !validLabels.includes(label))) throw new Error(`ANSWER_LABEL_OUT_OF_SET:${answer.itemPseudonym}`);
  if (answer.answer.setSha256 !== answer.answerSetSha256) throw new Error(`ANSWER_SET_BINDING_MISMATCH:${answer.itemPseudonym}`);
}

export function sealPhase1Submission(input: { phase1: IssuedPhase1Packet; submission: Phase1Submission; sealedAt: string }): Phase1Seal {
  const phase1 = issuedPhase1PacketSchema.parse(input.phase1);
  const submission = phase1SubmissionSchema.parse(input.submission);
  const phase1Hash = hashJson(phase1);
  if (submission.packetInstanceId !== phase1.packetInstanceId || submission.reviewerPseudonym !== phase1.reviewerPseudonym) throw new Error("SUBMISSION_IDENTITY_MISMATCH");
  if (submission.phase1PacketSha256 !== phase1Hash) throw new Error("SUBMISSION_PACKET_HASH_MISMATCH");
  assertExactSet(phase1.items.map((row) => row.itemPseudonym), submission.answers.map((row) => row.itemPseudonym), "SUBMISSION_ITEMS");
  const items = new Map(phase1.items.map((row) => [row.itemPseudonym, row]));
  for (const answer of submission.answers) assertAnswerShape(items.get(answer.itemPseudonym)!, answer);
  const perItemRecordSha256 = submission.answers.map((row) => ({ itemPseudonym: row.itemPseudonym, recordSha256: phaseOneRecordSha(row.itemPseudonym, row.surfaceSha256, row.answer, row.confidence) }));
  if (new Set(perItemRecordSha256.map((row) => row.recordSha256)).size !== perItemRecordSha256.length) throw new Error("PHASE1_RECORD_HASH_CROSS_ITEM_REUSE");
  if (canonicalRfc3339Micros(input.sealedAt) === null) throw new Error("SEAL_TIMESTAMP_INVALID");
  return phase1SealSchema.parse({ schemaVersion: "reviewer-calibration-phase1-seal-v2", packetInstanceId: phase1.packetInstanceId, reviewerPseudonym: phase1.reviewerPseudonym, phase1PacketSha256: phase1Hash, phase1SubmissionSha256: hashJson(submission), perItemRecordSha256, sealedAt: input.sealedAt });
}

function mapLabels(answer: AnswerSet, mapping: Record<string, string>): AnswerSet {
  if (answer.kind === "SINGLE_LABEL") return withAnswerSetSha({ kind: "SINGLE_LABEL", label: mapping[answer.label] ?? answer.label });
  if (answer.kind === "MULTIPLE_LABELS") return withAnswerSetSha({ kind: "MULTIPLE_LABELS", labels: answer.labels.map((label) => mapping[label] ?? label) });
  return answer;
}

export function revealPhase2(input: { packet: AuthorPacket; phase1: IssuedPhase1Packet; submission: Phase1Submission; seal: Phase1Seal; privateMap: PrivateIssueMap }): Phase2Reveal {
  const packet = authorPacketSchema.parse(input.packet); const phase1 = issuedPhase1PacketSchema.parse(input.phase1);
  const submission = phase1SubmissionSchema.parse(input.submission); const seal = phase1SealSchema.parse(input.seal); const privateMap = privateIssueMapSchema.parse(input.privateMap);
  const phase1Hash = hashJson(phase1); const submissionHash = hashJson(submission);
  const canonicalSeal = sealPhase1Submission({ phase1, submission, sealedAt: seal.sealedAt });
  if (hashJson(canonicalSeal) !== hashJson(seal)) throw new Error("PHASE1_SEAL_NOT_CANONICAL");
  if (phase1.canonicalPacketSha256 !== hashJson(packet) || privateMap.canonicalPacketSha256 !== hashJson(packet)) throw new Error("CANONICAL_PACKET_HASH_MISMATCH");
  if (phase1.privateMapSha256 !== hashJson(privateMap)) throw new Error("PRIVATE_MAP_HASH_MISMATCH");
  if (seal.phase1PacketSha256 !== phase1Hash || seal.phase1SubmissionSha256 !== submissionHash) throw new Error("PHASE1_SEAL_BINDING_MISMATCH");
  assertExactSet(phase1.items.map((row) => row.itemPseudonym), privateMap.rows.map((row) => row.itemPseudonym), "PRIVATE_MAP_ITEMS");
  const authorById = new Map(packet.items.map((row) => [row.itemId, row]));
  const sealByPseudo = new Map(seal.perItemRecordSha256.map((row) => [row.itemPseudonym, row.recordSha256]));
  const issuedByPseudo = new Map(phase1.items.map((row) => [row.itemPseudonym, row]));
  const items = privateMap.rows.map((row) => {
    const item = authorById.get(row.itemId); const issued = issuedByPseudo.get(row.itemPseudonym);
    if (!item || !issued || row.surfaceSha256 !== issued.surfaceSha256) throw new Error(`MAP_ITEM_BINDING_MISMATCH:${row.itemPseudonym}`);
    return {
      itemPseudonym: row.itemPseudonym, surfaceSha256: issued.surfaceSha256, sealedBlindRecordSha256: sealByPseudo.get(row.itemPseudonym),
      authorizedSource: item.phase2.authorizedSource,
      storedKey: {
        canonicalAnswer: mapLabels(item.phase2.storedKey.canonicalAnswer, row.canonicalToDisplay),
        acceptedEquivalenceSets: item.phase2.storedKey.acceptedEquivalenceSets.map((answer) => mapLabels(answer, row.canonicalToDisplay)),
      },
      explanation: item.phase2.explanation, scoringContract: item.phase2.scoringContract, evidenceRefs: item.phase2.evidenceRefs,
    };
  });
  return phase2RevealSchema.parse({ schemaVersion: "reviewer-calibration-phase2-reveal-v2", packetInstanceId: phase1.packetInstanceId, reviewerPseudonym: phase1.reviewerPseudonym, phase1PacketSha256: phase1Hash, phase1SubmissionSha256: submissionHash, phase1SealSha256: hashJson(seal), items });
}

function arg(flag: string): string { const index = process.argv.indexOf(flag); if (index < 0 || !process.argv[index + 1]) throw new Error(`MISSING_ARGUMENT:${flag}`); return process.argv[index + 1]; }
function readJson(path: string): unknown { return JSON.parse(readFileSync(path, "utf8")); }
function privateOutput(pathValue: string): string {
  const absolute = resolve(pathValue); const rel = relative(privateRoot, absolute);
  if (rel.startsWith("..") || resolve(privateRoot, rel) !== absolute) throw new Error("OUTPUT_MUST_BE_UNDER_PACKET_PRIVATE");
  return absolute;
}
function writeJson(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

async function main(): Promise<void> {
  const command = process.argv[2]; if (!command) return;
  if (command === "issue") {
    const packetPath = resolve(arg("--packet")); const contractPath = resolve(arg("--contract"));
    if (!existsSync(packetPath) || !existsSync(contractPath)) throw new Error("ISSUE_INPUT_MISSING");
    const issued = issuePhase1Packet({ packet: authorPacketSchema.parse(readJson(packetPath)), reviewerPseudonym: arg("--reviewer"), seed: arg("--seed"), contractSha256: sha256(readFileSync(contractPath)) });
    writeJson(privateOutput(arg("--out-phase1")), issued.phase1); writeJson(privateOutput(arg("--out-map")), issued.privateMap); return;
  }
  if (command === "seal") {
    const phase1 = issuedPhase1PacketSchema.parse(readJson(resolve(arg("--phase1")))); const submission = phase1SubmissionSchema.parse(readJson(resolve(arg("--submission"))));
    writeJson(privateOutput(arg("--out-seal")), sealPhase1Submission({ phase1, submission, sealedAt: arg("--sealed-at") })); return;
  }
  if (command === "reveal") {
    writeJson(privateOutput(arg("--out-reveal")), revealPhase2({ packet: authorPacketSchema.parse(readJson(resolve(arg("--packet")))), phase1: issuedPhase1PacketSchema.parse(readJson(resolve(arg("--phase1")))), submission: phase1SubmissionSchema.parse(readJson(resolve(arg("--submission")))), seal: phase1SealSchema.parse(readJson(resolve(arg("--seal")))), privateMap: privateIssueMapSchema.parse(readJson(resolve(arg("--map")))) })); return;
  }
  throw new Error(`UNKNOWN_COMMAND:${command}`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
