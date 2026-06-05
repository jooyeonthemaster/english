import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// Verifies the billing/credit vs transient-rate-limit split in
// src/lib/extraction/error-classifier.ts. Billing exhaustion must be terminal
// (retryable:false → page goes DEAD) so the extraction reaper never re-dispatches
// it forever; transient 429/quota must stay retryable.
const harnessSource = `
import errorClassifier from "@/lib/extraction/error-classifier";

const classifyGeminiError =
  errorClassifier.classifyGeminiError ?? errorClassifier.default?.classifyGeminiError;

const cases = {
  prepaymentDepleted: classifyGeminiError(
    new Error("[GoogleGenerativeAI Error]: prepayment credits are depleted"),
  ),
  insufficientCredit: classifyGeminiError(
    new Error("insufficient credit balance for this request"),
  ),
  paymentRequired: classifyGeminiError(new Error("Payment required to continue")),
  rateLimit: classifyGeminiError(new Error("rate limit exceeded, please retry")),
  quota: classifyGeminiError(new Error("You exceeded your current quota")),
  resourceExhaustedMsg: classifyGeminiError(new Error("resource_exhausted")),
  resourceExhaustedCode: classifyGeminiError({
    code: "RESOURCE_EXHAUSTED",
    message: "Resource has been exhausted",
  }),
  status429: classifyGeminiError({ status: 429, message: "Too Many Requests" }),
  status401: classifyGeminiError({ status: 401, message: "API key invalid" }),
};

console.log(JSON.stringify(cases));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".gemini-error-classification-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const r = runHarness();

test("billing/credit exhaustion classifies as non-retryable INSUFFICIENT_CREDITS", () => {
  for (const key of ["prepaymentDepleted", "insufficientCredit", "paymentRequired"]) {
    assert.equal(r[key].code, "INSUFFICIENT_CREDITS", `${key} code`);
    assert.equal(r[key].retryable, false, `${key} retryable`);
  }
});

test("transient rate-limit / quota / resource-exhausted stay retryable GEMINI_RATE_LIMIT", () => {
  for (const key of [
    "rateLimit",
    "quota",
    "resourceExhaustedMsg",
    "resourceExhaustedCode",
    "status429",
  ]) {
    assert.equal(r[key].code, "GEMINI_RATE_LIMIT", `${key} code`);
    assert.equal(r[key].retryable, true, `${key} retryable`);
  }
});

test("auth errors stay non-retryable GEMINI_AUTH", () => {
  assert.equal(r.status401.code, "GEMINI_AUTH");
  assert.equal(r.status401.retryable, false);
});
