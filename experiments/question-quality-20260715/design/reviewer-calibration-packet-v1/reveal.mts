import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  authorPacketSchema,
  hashJson,
  issuedPhase1PacketSchema,
  phase1SealSchema,
  phase1SubmissionSchema,
  sha256,
  type AuthorItem,
  type AuthorPacket,
  type IssuedPhase1Packet,
  type Phase1Seal,
  type Phase1Submission,
} from "./contract.mts";

const here = dirname(fileURLToPath(import.meta.url));
const privateRoot = resolve(here, "private");

const labelMapSchema = z
  .object({
    itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u),
    itemId: z.string().regex(/^RCAL-(G|B|N)[0-9]{2}$/u),
    labelMode: z.enum(["OPTIONS", "INLINE_MARKERS", "CONSTRUCTED"]),
    displayToCanonical: z.record(z.string(), z.string()),
    canonicalToDisplay: z.record(z.string(), z.string()),
  })
  .strict();

export const privateIssueMapSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-private-issue-map-v1"),
    packetInstanceId: z.string().regex(/^RCAL1-[A-Z0-9_-]{3,60}$/u),
    reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
    canonicalPacketSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    rows: z.array(labelMapSchema).length(24),
  })
  .strict();

export const phase2RevealSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-phase2-reveal-v1"),
    packetInstanceId: z.string().regex(/^RCAL1-[A-Z0-9_-]{3,60}$/u),
    reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
    phase1PacketSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    phase1SubmissionSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    phase1SealSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    items: z
      .array(
        z
          .object({
            itemPseudonym: z.string().regex(/^Q[0-9]{3}$/u),
            authorizedSource: z.string().min(40).max(6000),
            storedKey: z
              .object({
                disposition: z.enum(["ANSWER", "NO_ANSWER", "MULTIPLE"]),
                displayAnswers: z.array(z.string().min(1).max(1000)).max(20),
                acceptedResponses: z.array(z.string().min(1).max(1000)).max(20),
              })
              .strict(),
            explanation: z.string().min(10).max(5000),
            scoringContract: z.string().min(10).max(3000),
            evidenceRefs: z.array(z.string()).min(1).max(50),
          })
          .strict(),
      )
      .length(24),
  })
  .strict();

export type PrivateIssueMap = z.infer<typeof privateIssueMapSchema>;
export type Phase2Reveal = z.infer<typeof phase2RevealSchema>;

function deterministicOrder<T>(values: T[], key: (value: T) => string, seed: string, purpose: string): T[] {
  return [...values].sort((a, b) => {
    const ah = sha256(`${seed}\u0000${purpose}\u0000${key(a)}`);
    const bh = sha256(`${seed}\u0000${purpose}\u0000${key(b)}`);
    return ah.localeCompare(bh) || key(a).localeCompare(key(b));
  });
}

function renderIssuedItem(item: AuthorItem, seed: string) {
  if (item.phase1.labelMode === "OPTIONS") {
    const ordered = deterministicOrder(item.phase1.options, (option) => option.canonicalLabel, seed, `OPTIONS:${item.itemId}`);
    const displayToCanonical: Record<string, string> = {};
    const canonicalToDisplay: Record<string, string> = {};
    const options = ordered.map((option, index) => {
      const display = String(index + 1);
      displayToCanonical[display] = option.canonicalLabel;
      canonicalToDisplay[option.canonicalLabel] = display;
      return { label: display, text: option.text };
    });
    return {
      studentSurface: item.phase1.studentSurface,
      options,
      displayToCanonical,
      canonicalToDisplay,
    };
  }
  if (item.phase1.labelMode === "INLINE_MARKERS") {
    const canonical = ["A", "B", "C", "D", "E"];
    const permuted = deterministicOrder(canonical, (label) => label, seed, `MARKERS:${item.itemId}`);
    const displayToCanonical: Record<string, string> = {};
    const canonicalToDisplay: Record<string, string> = {};
    permuted.forEach((canonicalLabel, index) => {
      const display = canonical[index];
      displayToCanonical[display] = canonicalLabel;
      canonicalToDisplay[canonicalLabel] = display;
    });
    const studentSurface = item.phase1.studentSurface.replace(/⟦([A-E]):/gu, (_whole, label: string) => `⟦${canonicalToDisplay[label]}:`);
    return { studentSurface, options: [], displayToCanonical, canonicalToDisplay };
  }
  return { studentSurface: item.phase1.studentSurface, options: [], displayToCanonical: {}, canonicalToDisplay: {} };
}

export function issuePhase1Packet(input: {
  packet: AuthorPacket;
  reviewerPseudonym: string;
  seed: string;
  contractSha256: string;
}): { phase1: IssuedPhase1Packet; privateMap: PrivateIssueMap } {
  const packet = authorPacketSchema.parse(input.packet);
  if (!/^[A-Z0-9_-]{3,40}$/u.test(input.reviewerPseudonym)) throw new Error("REVIEWER_PSEUDONYM_INVALID");
  if (input.seed.length < 16) throw new Error("ISSUE_SEED_TOO_SHORT");
  if (!/^[a-f0-9]{64}$/u.test(input.contractSha256)) throw new Error("CONTRACT_HASH_INVALID");
  const canonicalPacketSha256 = hashJson(packet);
  const packetInstanceId = `RCAL1-${sha256(`${input.reviewerPseudonym}\u0000${input.seed}\u0000${canonicalPacketSha256}`).slice(0, 20).toUpperCase()}`;
  const ordered = deterministicOrder(packet.items, (item) => item.itemId, input.seed, "ITEM_ORDER");
  const rendered = ordered.map((item, index) => {
    const itemPseudonym = `Q${String(index + 1).padStart(3, "0")}`;
    const surface = renderIssuedItem(item, input.seed);
    const publicItem = {
      itemPseudonym,
      surfaceSha256: hashJson({
        direction: item.phase1.direction,
        studentSurface: surface.studentSurface,
        options: surface.options,
        responseInstruction: item.phase1.responseInstruction,
      }),
      direction: item.phase1.direction,
      studentSurface: surface.studentSurface,
      options: surface.options,
      responseInstruction: item.phase1.responseInstruction,
    };
    const map = {
      itemPseudonym,
      itemId: item.itemId,
      labelMode: item.phase1.labelMode,
      displayToCanonical: surface.displayToCanonical,
      canonicalToDisplay: surface.canonicalToDisplay,
    };
    return { publicItem, map };
  });
  const privateMap = privateIssueMapSchema.parse({
    schemaVersion: "reviewer-calibration-private-issue-map-v1",
    packetInstanceId,
    reviewerPseudonym: input.reviewerPseudonym,
    canonicalPacketSha256,
    rows: rendered.map((row) => row.map),
  });
  const phase1 = issuedPhase1PacketSchema.parse({
    schemaVersion: "reviewer-calibration-phase1-v1",
    packetInstanceId,
    reviewerPseudonym: input.reviewerPseudonym,
    canonicalPacketSha256,
    contractSha256: input.contractSha256,
    items: rendered.map((row) => row.publicItem),
    privateMapSha256: hashJson(privateMap),
  });
  return { phase1, privateMap };
}

function assertExactPseudonymSet(expected: string[], actual: string[], code: string): void {
  if (new Set(actual).size !== actual.length) throw new Error(`${code}_DUPLICATE`);
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${code}_SET_MISMATCH`);
}

function assertAnswerShape(packetItem: IssuedPhase1Packet["items"][number], answer: Phase1Submission["answers"][number]): void {
  const optionLabels = packetItem.options.map((option) => option.label);
  const inlineLabels = [...packetItem.studentSurface.matchAll(/⟦([A-E]):/gu)].map((match) => match[1]);
  const validLabels = optionLabels.length > 0 ? optionLabels : inlineLabels;
  if (answer.answerLabels.some((label) => !validLabels.includes(label))) throw new Error(`ANSWER_LABEL_OUT_OF_SET:${answer.itemPseudonym}`);
  if (new Set(answer.answerLabels).size !== answer.answerLabels.length) throw new Error(`ANSWER_LABEL_DUPLICATE:${answer.itemPseudonym}`);
  const hasText = answer.answerText !== null;
  if (answer.disposition === "ANSWER" && !((answer.answerLabels.length === 1 && !hasText) || (answer.answerLabels.length === 0 && hasText))) {
    throw new Error(`ANSWER_CARDINALITY_INVALID:${answer.itemPseudonym}`);
  }
  if (answer.disposition === "MULTIPLE" && (answer.answerLabels.length < 2 || hasText)) {
    throw new Error(`MULTIPLE_CARDINALITY_INVALID:${answer.itemPseudonym}`);
  }
  if (["NO_ANSWER", "UNEVALUABLE"].includes(answer.disposition) && (answer.answerLabels.length !== 0 || hasText)) {
    throw new Error(`EMPTY_DISPOSITION_HAS_ANSWER:${answer.itemPseudonym}`);
  }
  if (validLabels.length === 0 && answer.answerLabels.length > 0) throw new Error(`CONSTRUCTED_HAS_LABEL:${answer.itemPseudonym}`);
  if (validLabels.length > 0 && hasText) throw new Error(`LABELED_ITEM_HAS_TEXT:${answer.itemPseudonym}`);
}

export function sealPhase1Submission(input: {
  phase1: IssuedPhase1Packet;
  submission: Phase1Submission;
  sealedAt: string;
}): Phase1Seal {
  const phase1 = issuedPhase1PacketSchema.parse(input.phase1);
  const submission = phase1SubmissionSchema.parse(input.submission);
  const phase1Hash = hashJson(phase1);
  if (submission.packetInstanceId !== phase1.packetInstanceId || submission.reviewerPseudonym !== phase1.reviewerPseudonym) {
    throw new Error("SUBMISSION_IDENTITY_MISMATCH");
  }
  if (submission.phase1PacketSha256 !== phase1Hash) throw new Error("SUBMISSION_PACKET_HASH_MISMATCH");
  assertExactPseudonymSet(
    phase1.items.map((item) => item.itemPseudonym),
    submission.answers.map((answer) => answer.itemPseudonym),
    "SUBMISSION_ITEMS",
  );
  const itemById = new Map(phase1.items.map((item) => [item.itemPseudonym, item]));
  for (const answer of submission.answers) assertAnswerShape(itemById.get(answer.itemPseudonym)!, answer);
  return phase1SealSchema.parse({
    schemaVersion: "reviewer-calibration-phase1-seal-v1",
    packetInstanceId: phase1.packetInstanceId,
    reviewerPseudonym: phase1.reviewerPseudonym,
    phase1PacketSha256: phase1Hash,
    phase1SubmissionSha256: hashJson(submission),
    sealedAt: input.sealedAt,
  });
}

export function revealPhase2(input: {
  packet: AuthorPacket;
  phase1: IssuedPhase1Packet;
  submission: Phase1Submission;
  seal: Phase1Seal;
  privateMap: PrivateIssueMap;
}): Phase2Reveal {
  const packet = authorPacketSchema.parse(input.packet);
  const phase1 = issuedPhase1PacketSchema.parse(input.phase1);
  const submission = phase1SubmissionSchema.parse(input.submission);
  const seal = phase1SealSchema.parse(input.seal);
  const privateMap = privateIssueMapSchema.parse(input.privateMap);
  const phase1Hash = hashJson(phase1);
  const submissionHash = hashJson(submission);
  const recomputedSeal = sealPhase1Submission({ phase1, submission, sealedAt: seal.sealedAt });
  if (hashJson(recomputedSeal) !== hashJson(seal)) throw new Error("PHASE1_SEAL_NOT_CANONICAL");
  if (phase1.canonicalPacketSha256 !== hashJson(packet) || privateMap.canonicalPacketSha256 !== hashJson(packet)) {
    throw new Error("CANONICAL_PACKET_HASH_MISMATCH");
  }
  if (phase1.privateMapSha256 !== hashJson(privateMap)) throw new Error("PRIVATE_MAP_HASH_MISMATCH");
  if (
    seal.packetInstanceId !== phase1.packetInstanceId ||
    seal.reviewerPseudonym !== phase1.reviewerPseudonym ||
    seal.phase1PacketSha256 !== phase1Hash ||
    seal.phase1SubmissionSha256 !== submissionHash ||
    submission.phase1PacketSha256 !== phase1Hash
  ) {
    throw new Error("PHASE1_SEAL_BINDING_MISMATCH");
  }
  assertExactPseudonymSet(
    phase1.items.map((item) => item.itemPseudonym),
    privateMap.rows.map((row) => row.itemPseudonym),
    "PRIVATE_MAP_ITEMS",
  );
  const authorById = new Map(packet.items.map((item) => [item.itemId, item]));
  const items = privateMap.rows.map((row) => {
    const item = authorById.get(row.itemId);
    if (!item) throw new Error(`PRIVATE_MAP_UNKNOWN_ITEM:${row.itemId}`);
    const displayAnswers = item.phase2.storedKey.canonicalAnswers.map((answer) => row.canonicalToDisplay[answer] ?? answer);
    return {
      itemPseudonym: row.itemPseudonym,
      authorizedSource: item.phase2.authorizedSource,
      storedKey: {
        disposition: item.phase2.storedKey.disposition,
        displayAnswers,
        acceptedResponses: item.phase2.storedKey.acceptedResponses,
      },
      explanation: item.phase2.explanation,
      scoringContract: item.phase2.scoringContract,
      evidenceRefs: item.phase2.evidenceRefs,
    };
  });
  return phase2RevealSchema.parse({
    schemaVersion: "reviewer-calibration-phase2-reveal-v1",
    packetInstanceId: phase1.packetInstanceId,
    reviewerPseudonym: phase1.reviewerPseudonym,
    phase1PacketSha256: phase1Hash,
    phase1SubmissionSha256: submissionHash,
    phase1SealSha256: hashJson(seal),
    items,
  });
}

function arg(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`MISSING_ARGUMENT:${flag}`);
  return process.argv[index + 1];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function privateOutput(pathValue: string): string {
  const absolute = resolve(pathValue);
  const relativePath = relative(privateRoot, absolute);
  if (relativePath.startsWith("..") || resolve(privateRoot, relativePath) !== absolute) throw new Error("OUTPUT_MUST_BE_UNDER_PACKET_PRIVATE");
  return absolute;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command) return;
  if (command === "issue") {
    const packetPath = resolve(arg("--packet"));
    const contractPath = resolve(arg("--contract"));
    if (!existsSync(packetPath) || !existsSync(contractPath)) throw new Error("ISSUE_INPUT_MISSING");
    const packet = authorPacketSchema.parse(readJson(packetPath));
    const issued = issuePhase1Packet({
      packet,
      reviewerPseudonym: arg("--reviewer"),
      seed: arg("--seed"),
      contractSha256: sha256(readFileSync(contractPath)),
    });
    writeJson(privateOutput(arg("--out-phase1")), issued.phase1);
    writeJson(privateOutput(arg("--out-map")), issued.privateMap);
    return;
  }
  if (command === "seal") {
    const phase1 = issuedPhase1PacketSchema.parse(readJson(resolve(arg("--phase1"))));
    const submission = phase1SubmissionSchema.parse(readJson(resolve(arg("--submission"))));
    writeJson(privateOutput(arg("--out-seal")), sealPhase1Submission({ phase1, submission, sealedAt: arg("--sealed-at") }));
    return;
  }
  if (command === "reveal") {
    const packet = authorPacketSchema.parse(readJson(resolve(arg("--packet"))));
    const phase1 = issuedPhase1PacketSchema.parse(readJson(resolve(arg("--phase1"))));
    const submission = phase1SubmissionSchema.parse(readJson(resolve(arg("--submission"))));
    const seal = phase1SealSchema.parse(readJson(resolve(arg("--seal"))));
    const privateMap = privateIssueMapSchema.parse(readJson(resolve(arg("--map"))));
    writeJson(privateOutput(arg("--out-reveal")), revealPhase2({ packet, phase1, submission, seal, privateMap }));
    return;
  }
  throw new Error(`UNKNOWN_COMMAND:${command}`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
