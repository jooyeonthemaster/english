// W2-D 정정(26-07-18, 지휘관 판정: 리뷰어 옳음) 회귀:
// T9/T10 구조형 무결성 게이트 + 빈칸 span-carve + 어휘 치환 이음매 게이트의 F급 결함
// 코드가 RELAXED_BLOCKING_QUALITY_CODES 에 등재돼 전 레인(strict/relaxed/scarce/salvage)
// 에서 차단되는지 검증한다. 미등재 error 는 relaxed 폴백에서 warning 으로 강등돼 그대로
// 출하되므로(KO 코드 선례와 동일 근거), 이들은 반드시 등재되어야 하고 SALVAGE/SCARCE
// relaxable 에는 절대 들어가면 안 된다(= notice 로도 출하 금지).
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// F급 무결성 결함 코드 — 전 레인 차단 대상(임무 W2-D 명세).
const INTEGRITY_F_CODES = [
  "vocab-substitution-seam-particle",
  "vocab-substitution-unauthorized-mutation",
  "sentence-order-source-sentence-omitted",
  "sentence-order-source-sentence-duplicated",
  "sentence-insert-marker-mid-sentence",
  "sentence-insert-marker-empty-gap",
  "irrelevant-marking-count-mismatch",
  "irrelevant-nonconsecutive-marking",
  "irrelevant-marking-sentence-desync",
  "blank-span-full-sentence",
  "blank-span-clause-carve",
];

const harnessSource = String.raw`
// tsx 는 이 모듈을 CJS-interop 로 해석하므로(형제 테스트와 동일) default import 후
// 구조분해로 named export 에 접근한다.
import constants from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";
const {
  RELAXED_BLOCKING_QUALITY_CODES,
  SALVAGE_RELAXABLE_CODES,
  GRAMMAR_SCARCE_RELAXABLE_CODES,
} = constants;

// run-question-generation.ts 의 isBlockingInMode 판정 로직을 그대로 재현한다.
function isBlockingInMode(code, qualityMode) {
  if (qualityMode === "strict") return true;
  if (!RELAXED_BLOCKING_QUALITY_CODES.has(code)) return false;
  if (qualityMode === "scarce" && SALVAGE_RELAXABLE_CODES.has(code)) return false;
  return true;
}

const codes = ${JSON.stringify(INTEGRITY_F_CODES)};
const report = {};
for (const code of codes) {
  report[code] = {
    inRelaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
    inSalvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
    inScarceRelaxable: GRAMMAR_SCARCE_RELAXABLE_CODES.has(code),
    blocksStrict: isBlockingInMode(code, "strict"),
    blocksRelaxed: isBlockingInMode(code, "relaxed"),
    blocksScarce: isBlockingInMode(code, "scarce"),
  };
}
process.stdout.write(JSON.stringify(report));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".w2d-integrity-lane-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`node node_modules/tsx/dist/cli.mjs "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const report = runHarness();

test("all 11 integrity F-codes are registered in RELAXED_BLOCKING_QUALITY_CODES", () => {
  for (const code of INTEGRITY_F_CODES) {
    assert.equal(
      report[code].inRelaxedBlocking,
      true,
      `${code} must be in RELAXED_BLOCKING_QUALITY_CODES: ${JSON.stringify(report[code])}`,
    );
  }
});

test("none of the 11 codes are in SALVAGE/SCARCE relaxable lists (F급 전 레인 차단)", () => {
  for (const code of INTEGRITY_F_CODES) {
    assert.equal(
      report[code].inSalvageRelaxable,
      false,
      `${code} must NOT be salvage-relaxable: ${JSON.stringify(report[code])}`,
    );
    assert.equal(
      report[code].inScarceRelaxable,
      false,
      `${code} must NOT be scarce-relaxable: ${JSON.stringify(report[code])}`,
    );
  }
});

test("each F-code blocks in strict, relaxed, AND scarce/salvage lanes", () => {
  for (const code of INTEGRITY_F_CODES) {
    const r = report[code];
    assert.equal(r.blocksStrict, true, `${code} must block in strict`);
    assert.equal(r.blocksRelaxed, true, `${code} must block in relaxed`);
    assert.equal(r.blocksScarce, true, `${code} must block in scarce/salvage`);
  }
});
