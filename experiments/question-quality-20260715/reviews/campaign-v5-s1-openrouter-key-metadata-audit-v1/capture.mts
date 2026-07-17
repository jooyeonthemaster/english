import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const endpoint = "https://openrouter.ai/api/v1/key";
const reservationUsd = 44.16;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath: string): string {
  return sha256(readFileSync(filePath));
}

function localEnvValue(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  const envPath = path.join(repoRoot, ".env.local");
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/u)
    .find((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (!line) return undefined;
  let value = line.slice(line.indexOf("=") + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  return value || undefined;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

async function main(): Promise<void> {
  const key = localEnvValue("OPENROUTER_API_KEY");
  assert.ok(key, "OPENROUTER_API_KEY is unavailable");
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });
  assert.equal(response.status, 200, `OpenRouter key metadata returned ${response.status}`);
  const raw = (await response.json()) as {
    data?: Record<string, unknown>;
  };
  assert.ok(raw.data && typeof raw.data === "object");
  const data = raw.data;
  const label = typeof data.label === "string" ? data.label : "";
  const limit = data.limit === null ? null : finiteNumber(data.limit, "limit");
  const remaining =
    data.limit_remaining === null
      ? null
      : finiteNumber(data.limit_remaining, "limit_remaining");
  const usage = finiteNumber(data.usage, "usage");
  const usageDaily = finiteNumber(data.usage_daily, "usage_daily");
  const usageWeekly = finiteNumber(data.usage_weekly, "usage_weekly");
  const usageMonthly = finiteNumber(data.usage_monthly, "usage_monthly");
  const resultCore = {
    schemaVersion: "campaign-v5-s1-openrouter-key-metadata-audit-v1",
    capturedAtUtc: new Date().toISOString(),
    endpoint,
    verdict: "BLOCK_NOT_A_DEDICATED_ZERO_USAGE_HARD_CAPPED_S1_CREDENTIAL",
    authorization: {
      generationAuthorized: false,
      apiCandidateCount: 0,
      globalCandidateLimit: 1_000,
    },
    credentialAttestation: {
      plaintextCredentialPersisted: false,
      credentialHashPersisted: false,
      credentialLabelPersisted: false,
      metadataHttpStatus: response.status,
      dedicatedCampaignLabelPatternMatched: /(?:^|[-_ ])(?:s1|campaign-v5)(?:$|[-_ ])/iu.test(
        label,
      ),
      finitePositiveLimitAtOrBelowReservation:
        limit !== null && limit > 0 && limit <= reservationUsd,
      limitResetNever: data.limit_reset === null,
      remainingEqualsLimit:
        limit !== null && remaining !== null && Math.abs(limit - remaining) < 1e-9,
      zeroPriorUsage:
        usage === 0 && usageDaily === 0 && usageWeekly === 0 && usageMonthly === 0,
      includeByokInLimit: data.include_byok_in_limit === true,
      providerNoOverrunSemanticsPubliclyDocumented: false,
      reservationUsd,
    },
    safety: {
      metadataRequests: 1,
      modelRequests: 0,
      generationRequests: 0,
      accountMutations: 0,
      databaseCalls: 0,
      credentialValuesPrinted: 0,
      credentialValuesPersisted: 0,
    },
  };
  const result = {
    ...resultCore,
    artifactSemanticSha256: sha256(JSON.stringify(resultCore)),
  };
  const outPath = path.join(here, "audit-result.json");
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  const manifestFiles = ["capture.mts", "verify.mjs", "README.md", "audit-result.json"];
  writeFileSync(
    path.join(here, "MANIFEST.sha256"),
    `${manifestFiles
      .map((relativePath) => `${fileSha256(path.join(here, relativePath))}  ${relativePath}`)
      .join("\n")}\n`,
    "utf8",
  );
  process.stdout.write(
    `${JSON.stringify({
      verdict: result.verdict,
      ...result.credentialAttestation,
      safety: result.safety,
    }, null, 2)}\n`,
  );
}

await main();
