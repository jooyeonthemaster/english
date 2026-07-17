import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const sourceRelative = "experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/private/exact-wire-preflight-v1.json";
const sourcePath = path.join(repoRoot, sourceRelative);
const expectedSourceSha256 = "96318916c4ef714ae55febab3a63b992e93d6e2911f03235698487f40601ca7a";
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string => JSON.stringify(value, Object.keys(value as object).sort());

type Plan = "STANDARD" | "PREMIUM";
type Row = {
  passageToken: string;
  questionType: "GRAMMAR_ERROR" | "BLANK_INFERENCE";
  profileId: string;
  plan: Plan;
  difficulty: "INTERMEDIATE" | "KILLER";
  wireBodyUtf8Bytes: number;
  maxOutputTokens: number;
};

function summary(values: number[]) {
  assert(values.length > 0);
  const sum = values.reduce((left, right) => left + right, 0);
  return {
    n: values.length,
    sumBodyUtf8Bytes: sum,
    meanBodyUtf8Bytes: Math.round(sum / values.length * 10) / 10,
    minimumBodyUtf8Bytes: Math.min(...values),
    maximumBodyUtf8Bytes: Math.max(...values),
  };
}

function group(rows: Row[], key: (row: Row) => string) {
  const keys = [...new Set(rows.map(key))].sort();
  return Object.fromEntries(keys.map((value) => [
    value,
    summary(rows.filter((row) => key(row) === value).map((row) => row.wireBodyUtf8Bytes)),
  ]));
}

const controlByType = { GRAMMAR_ERROR: "G0_CURRENT_CONTROL", BLANK_INFERENCE: "B0_CURRENT_CONTROL" } as const;
const emergencyRates = {
  STANDARD: { input: 2.7, output: 16.2 },
  PREMIUM: { input: 7.2, output: 32.4 },
} as const;
const overheadTokens = 4_096;
const safetyMultiplier = 1.1;

function costCeiling(rows: Row[]) {
  const byPlan = Object.fromEntries((Object.keys(emergencyRates) as Plan[]).map((plan) => {
    const selected = rows.filter((row) => row.plan === plan);
    const body = selected.reduce((sum, row) => sum + row.wireBodyUtf8Bytes, 0);
    const output = selected.reduce((sum, row) => sum + row.maxOutputTokens, 0);
    const rate = emergencyRates[plan];
    const value = safetyMultiplier * (((body + selected.length * overheadTokens) * rate.input) + output * rate.output) / 1_000_000;
    return [plan, { assignments: selected.length, illustrativeEmergencyCeilingUsd: Math.ceil(value * 1e9) / 1e9 }];
  }));
  return byPlan;
}

function compile() {
  const sourceBytes = readFileSync(sourcePath);
  assert.equal(sha256(sourceBytes), expectedSourceSha256, "S1 exact-wire private artifact drifted");
  const source = JSON.parse(sourceBytes.toString("utf8")) as any;
  const rows = source.durableControllerUnpricedBinding.assignments as Row[];
  assert.equal(rows.length, 180);
  assert(rows.every((row) => Number.isSafeInteger(row.wireBodyUtf8Bytes) && row.wireBodyUtf8Bytes > 0));
  assert.equal(rows.reduce((sum, row) => sum + row.wireBodyUtf8Bytes, 0), 7_562_124);

  const profileIds = [...new Set(rows.map((row) => row.profileId))].sort();
  assert.equal(profileIds.length, 8);
  const paired: Record<string, unknown> = {};
  for (const profileId of profileIds.filter((id) => !id.endsWith("CURRENT_CONTROL"))) {
    const treatment = rows.filter((row) => row.profileId === profileId);
    const type = treatment[0]!.questionType;
    assert(treatment.every((row) => row.questionType === type));
    const controlId = controlByType[type];
    const controlIndex = new Map(rows
      .filter((row) => row.profileId === controlId)
      .map((row) => [`${row.passageToken}|${row.plan}|${row.difficulty}`, row]));
    const pairs = treatment.map((row) => {
      const control = controlIndex.get(`${row.passageToken}|${row.plan}|${row.difficulty}`);
      assert(control, `${profileId}: missing paired control`);
      return { treatment: row.wireBodyUtf8Bytes, control: control.wireBodyUtf8Bytes };
    });
    const treatmentSum = pairs.reduce((sum, pair) => sum + pair.treatment, 0);
    const controlSum = pairs.reduce((sum, pair) => sum + pair.control, 0);
    paired[profileId] = {
      controlProfileId: controlId,
      exactMatchedPairs: pairs.length,
      treatmentBodyUtf8Bytes: treatmentSum,
      matchedControlBodyUtf8Bytes: controlSum,
      deltaBodyUtf8Bytes: treatmentSum - controlSum,
      ratioToMatchedControl: Math.round(treatmentSum / controlSum * 1e6) / 1e6,
      reductionPercent: Math.round((1 - treatmentSum / controlSum) * 1e4) / 100,
    };
  }

  const costByProfile = Object.fromEntries(profileIds.map((profileId) => [
    profileId,
    costCeiling(rows.filter((row) => row.profileId === profileId)),
  ]));
  const core = {
    schemaVersion: "question-quality-s1-wire-size-stratification-v1",
    status: "OFFLINE_MEDIATOR_DIAGNOSTIC_NOT_QUALITY_EVIDENCE",
    source: { path: sourceRelative, sha256: expectedSourceSha256, assignments: rows.length },
    profileBodyBytes: group(rows, (row) => row.profileId),
    profilePlanBodyBytes: group(rows, (row) => `${row.profileId}|${row.plan}`),
    exactMatchedTreatmentVsControl: paired,
    illustrativeEmergencyCostCeilingByProfileAndPlan: costByProfile,
    interpretationGuardrails: [
      "Prompt byte reduction is a mediator and cost diagnostic, not evidence of quality gain.",
      "The profiles change representation and sometimes schema, not length alone.",
      "The ceilings use bytes as a deliberately conservative token upper bound plus 4,096 overhead tokens and fixed maximum output tokens.",
      "Only preregistered blind item outcomes may select a profile.",
    ],
    activity: { externalNetworkCalls: 0, providerCalls: 0, modelCalls: 0, apiCandidatesConsumed: 0, databaseCalls: 0, secretReads: 0 },
  };
  return { ...core, semanticSha256: sha256(JSON.stringify(core)) };
}

const mode = process.argv.slice(2);
assert(mode.length === 1 && (mode[0] === "--write" || mode[0] === "--check"), "choose --write or --check");
const report = `${JSON.stringify(compile(), null, 2)}\n`;
const reportPath = path.join(here, "report.json");
if (mode[0] === "--write") writeFileSync(reportPath, report, "utf8");
else assert.equal(readFileSync(reportPath, "utf8"), report, "report.json is not reproducible");

const manifestNames = ["README.md", "build.mts", "report.json", "verify.mts"] as const;
const manifest = `${manifestNames.map((name) => `${sha256(readFileSync(path.join(here, name)))}  experiments/question-quality-20260715/reviews/s1-wire-size-stratification-v1/${name}`).join("\n")}\n`;
const manifestPath = path.join(here, "MANIFEST.sha256");
if (mode[0] === "--write") writeFileSync(manifestPath, manifest, "utf8");
else assert.equal(readFileSync(manifestPath, "utf8"), manifest, "manifest drift");
process.stdout.write(`${JSON.stringify({ mode: mode[0], rows: 180, reportSha256: sha256(report), semanticSha256: JSON.parse(report).semanticSha256 })}\n`);
