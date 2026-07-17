/**
 * Existing DB/artifact questions -> blinded review packets.
 *
 * This script never calls an LLM or writes to the DB. It removes plan/model/key/warnings
 * from the student-facing packet, randomizes item order deterministically, and keeps the
 * private mapping in a separate file for later adjudication.
 *
 * Usage:
 *   npx tsx experiments/question-quality-20260715/prepare-blind-packets.ts \
 *     --input scripts/_gen_audit_out/jul15-dawn-questions.json \
 *     --out experiments/question-quality-20260715/baseline/jul15-dawn
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

interface ArtifactItem {
  question: JsonRecord;
  envelope: JsonRecord | null;
  originalId: string;
  sourceArtifact: string;
}

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function args(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length - 1; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function optionsOf(question: JsonRecord): Array<{ label: string; text: string }> {
  const structured = isRecord(question.structuredData) ? question.structuredData : {};
  const raw = Array.isArray(structured.options)
    ? structured.options
    : Array.isArray(question.options)
      ? question.options
      : [];
  return raw
    .filter(isRecord)
    .map((option) => ({ label: text(option.label), text: text(option.text) }))
    .filter((option) => option.label || option.text);
}

function firstText(question: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = text(question[key]);
    if (value) return value;
  }
  return "";
}

function renderBody(question: JsonRecord): string {
  const flat = text(question.questionText);
  if (flat) return flat;

  const direction = firstText(question, ["direction", "question", "prompt"]);
  const passage = firstText(question, [
    "passageWithMarkers",
    "passageWithBlank",
    "passageWithNumbers",
    "passageWithOptions",
    "modifiedPassage",
    "passage",
  ]);
  const parts = [direction, passage].filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Cannot render a blind packet: no student-facing question body found");
  }
  return parts.join("\n\n");
}

function inferType(question: JsonRecord, envelope: JsonRecord | null): string {
  const structured = isRecord(question.structuredData) ? question.structuredData : {};
  const explicit =
    text(question.subType) ||
    text(question.type) ||
    text(structured._typeId) ||
    text(envelope?.subType) ||
    text(envelope?.type);
  if (explicit) return explicit;
  if (Array.isArray(question.markedExpressions) && text(question.passageWithMarkers)) {
    return "GRAMMAR_ERROR";
  }
  if (text(question.passageWithBlank)) return "BLANK_INFERENCE";
  return "UNKNOWN";
}

function renderPacket(blindId: string, question: JsonRecord): string {
  const options = optionsOf(question);
  const body = renderBody(question);
  const optionBlock = options.length
    ? ["", "## 선택지", "", ...options.map((option) => `${option.label}. ${option.text}`)].join("\n")
    : "";
  return [
    `# ${blindId}`,
    "",
    body,
    optionBlock,
    "",
    "---",
    "",
    "먼저 정답을 독립적으로 풀고, 가능한 대안 정답이 있으면 함께 기록하십시오. 모델/플랜/저장 정답을 추정하지 마십시오.",
    "",
  ].join("\n");
}

function parseArtifact(inputPath: string): JsonRecord[] {
  const raw = fs.readFileSync(inputPath, "utf8");
  if (path.extname(inputPath).toLowerCase() === ".jsonl") {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const value = JSON.parse(line) as unknown;
        if (!isRecord(value)) throw new Error(`JSONL line ${index + 1} is not an object`);
        return value;
      });
  }
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value)) throw new Error("JSON input must be an array");
  return value.filter(isRecord);
}

function unwrapArtifactRow(row: JsonRecord, index: number): ArtifactItem {
  const sourceArtifact = text(row.__reviewArtifactSource);
  const nested = isRecord(row.question) ? row.question : null;
  const question = nested ?? row;
  const envelope = nested
    ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== "question"))
    : null;
  const originalId =
    text(question.id) ||
    text(row.id) ||
    text(row.passageId) ||
    `artifact-row-${String(index + 1).padStart(4, "0")}`;
  return { question, envelope, originalId, sourceArtifact };
}

function main() {
  const inputArgs = args("--input");
  const outArg = arg("--out");
  if (inputArgs.length === 0 || !outArg) {
    throw new Error("At least one --input and exactly one --out are required");
  }

  const inputPaths = inputArgs.map((inputArg) => path.resolve(inputArg));
  const outDir = path.resolve(outArg);
  const rows = inputPaths.flatMap((inputPath) =>
    parseArtifact(inputPath).map((row) => ({
      ...row,
      __reviewArtifactSource: path.relative(process.cwd(), inputPath),
    })),
  );

  const campaign = path.basename(outDir);
  const normalized = rows.map((row, index) => {
    const item = unwrapArtifactRow(row, index);
    const stableKey = sha256(
      `${campaign}\u0000${item.sourceArtifact}\u0000${item.originalId || JSON.stringify(item.question)}`,
    );
    return { ...item, stableKey };
  });
  normalized.sort((a, b) => a.stableKey.localeCompare(b.stableKey));

  const blindDir = path.join(outDir, "blind");
  const privateDir = path.join(outDir, "private");
  fs.mkdirSync(blindDir, { recursive: true });
  fs.mkdirSync(privateDir, { recursive: true });

  const blindManifest: JsonRecord[] = [];
  const privateManifest: JsonRecord[] = [];
  const reviewTemplate: JsonRecord[] = [];

  normalized.forEach(({ question, envelope, originalId, sourceArtifact, stableKey }, index) => {
    const blindId = `Q${String(index + 1).padStart(3, "0")}`;
    const structured = isRecord(question.structuredData) ? question.structuredData : {};
    const type = inferType(question, envelope);
    const requestedDifficulty =
      text(envelope?.difficulty) ||
      text(question.difficulty) ||
      text(structured.difficulty);
    const packet = renderPacket(blindId, question);
    fs.writeFileSync(path.join(blindDir, `${blindId}.md`), packet, "utf8");

    blindManifest.push({
      blindId,
      packetSha256: sha256(packet),
      type,
      requestedDifficulty,
    });
    privateManifest.push({
      blindId,
      originalId,
      createdAt: question.createdAt ?? envelope?.createdAt ?? null,
      plan:
        structured._generationPlan ??
        question._generationPlan ??
        envelope?.generationPlan ??
        envelope?.plan ??
        envelope?.strategy ??
        null,
      type,
      requestedDifficulty: requestedDifficulty || null,
      storedAnswer: question.correctAnswer ?? structured.correctAnswer ?? structured.correctAnswers ?? null,
      qualityMode: structured._qualityMode ?? null,
      qualityWarnings: structured._qualityWarnings ?? [],
      reviewRecommended: structured._reviewRecommended ?? false,
      stableKey,
      sourceArtifactSha256: sha256(JSON.stringify(question)),
      sourceArtifact,
      artifactEnvelope: envelope,
      question,
    });
    reviewTemplate.push({
      itemId: blindId,
      blindAnswer: null,
      confidence: null,
      alternativeAnswers: [],
      validity: { V1: null, V2: null, V3: null, V4: null, V5: null },
      craft: { C1: null, C2: null, C3: null, C4: null, C5: null, C6: null },
      optionAudit: [],
      issues: [],
      grade: null,
    });
  });

  fs.writeFileSync(path.join(outDir, "manifest-blind.json"), JSON.stringify(blindManifest, null, 2), "utf8");
  fs.writeFileSync(path.join(privateDir, "manifest-private.json"), JSON.stringify(privateManifest, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "review-template.json"), JSON.stringify(reviewTemplate, null, 2), "utf8");
  fs.writeFileSync(
    path.join(outDir, "README.md"),
    [
      `# ${campaign} blind review set`,
      "",
      `- Items: ${normalized.length}`,
      ...inputPaths.map(
        (inputPath) =>
          `- Input: \`${path.relative(process.cwd(), inputPath)}\` (SHA-256 ${sha256(fs.readFileSync(inputPath, "utf8"))})`,
      ),
      "- Reviewers must read only `blind/`, `manifest-blind.json`, `review-template.json`, and the campaign rubric during blind solve.",
      "- `private/` contains answers, plan, warnings, and raw records; open it only after blind answers are frozen.",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(JSON.stringify({ inputPaths, outDir, items: normalized.length }, null, 2));
}

main();
