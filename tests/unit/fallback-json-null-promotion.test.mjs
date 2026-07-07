import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// H1 (26-07-06 실측): SUMMARY_WRITING PREMIUM KILLER 가 forceJsonFallback 경로에서
// 3연속 "Forced prompt-inlined JSON generation failed (parse/schema validation)"로
// 유일한 생성 실패 셀이었다. 캡처 raw(픽스처) 진단:
//   finishReason=stop(절단 아님), 펜스 정상, JSON 정상 —
//   유일 이슈 = questions.0.koreanGloss: expected string, received null.
// 프롬프트 인라인 JSON 모드는 provider 문법 강제가 없어 모델이 해당 없는 optional
// 필드를 null 로 채우고, z.string().optional() 은 null 을 거부한다.
// 수정 계약(폴백 파스 헬퍼 내부만):
//  A) safeParsePromotingNullOptionals — zod "received null" 이슈 경로의 객체 속성
//     null 만 제거(undefined 승격) 후 재검증. 필수 필드 null 은 구제 불가(안전).
//  B) parseJsonLoose — 1차 파스 실패 시에만 trailing comma 보수 후 2차 파스.
const harnessSource = `
import { z } from "zod";
import { readFileSync } from "node:fs";
import llmMod from "@/lib/question-generation-llm";
const { parseJsonLoose, safeParsePromotingNullOptionals } = llmMod;
import schemasMod from "@/lib/question-ai-schemas-mc";
const { getAiResponseSchema } = schemasMod;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

// ── (1) 실캡처 픽스처: SW PREMIUM KILLER 폴백 raw (26-07-06) ──
const raw = readFileSync(
  "tests/fixtures/sw-premium-killer-fallback-raw-20260706.txt",
  "utf8",
);
const candidate = parseJsonLoose(raw);
check("픽스처: 펜스 포함 raw 가 파스된다", candidate !== undefined);

const swEnvelope = getAiResponseSchema("SUMMARY_WRITING") as z.ZodType;
const strict = swEnvelope.safeParse(candidate);
check(
  "픽스처: 종전 순수 safeParse 는 koreanGloss null 로 실패(회귀 재현)",
  strict.success === false &&
    strict.error!.issues.some(
      (i) => i.path.join(".") === "questions.0.koreanGloss",
    ),
);

const promoted = safeParsePromotingNullOptionals(
  swEnvelope,
  parseJsonLoose(raw),
);
check("픽스처: null 승격 후 검증 통과(H1 수정 계약)", promoted.success === true);
if (promoted.success) {
  const q = (promoted.data as { questions: Record<string, unknown>[] })
    .questions[0];
  check("승격은 키 제거(undefined) — null 잔존 금지", !("koreanGloss" in q));
  check(
    "다른 필드는 무손상(modelAnswer 보존)",
    typeof q.modelAnswer === "string" && (q.modelAnswer as string).length > 0,
  );
}

// ── (2) 안전성: 필수 필드 null 은 승격으로 구제되지 않는다 ──
const reqSchema = z.object({
  must: z.string(),
  opt: z.string().optional(),
});
const reqBad = safeParsePromotingNullOptionals(reqSchema, {
  must: null,
  opt: null,
});
check("필수 필드 null 은 여전히 실패(F급 오통과 없음)", reqBad.success === false);
const optOnly = safeParsePromotingNullOptionals(reqSchema, {
  must: "x",
  opt: null,
});
check("optional null 만 승격 통과", optOnly.success === true);

// nullable 필드는 이슈가 아니므로 무접촉(null 보존).
const nullableSchema = z.object({ n: z.string().nullable() });
const kept = safeParsePromotingNullOptionals(nullableSchema, { n: null });
check(
  "nullable 필드 null 은 보존",
  kept.success === true && (kept.data as { n: unknown }).n === null,
);

// 배열 원소 null 은 건드리지 않는다(인덱스 밀림 방지) — 실패 유지.
const arrSchema = z.object({ a: z.array(z.string()) });
const arrBad = safeParsePromotingNullOptionals(arrSchema, { a: ["x", null] });
check("배열 원소 null 은 승격 대상 아님(실패 유지)", arrBad.success === false);

// 중첩 optional null (2패스 커버리지).
const nested = z.object({
  outer: z
    .object({ inner: z.string().optional(), keep: z.string() })
    .optional(),
});
const nestedOk = safeParsePromotingNullOptionals(nested, {
  outer: { inner: null, keep: "y" },
});
check("중첩 optional null 승격", nestedOk.success === true);

// ── (3) parseJsonLoose trailing comma 보수(2차 시도 한정) ──
check(
  "trailing comma 객체 보수",
  JSON.stringify(parseJsonLoose('{"a": 1, "b": [1, 2,], }')) ===
    JSON.stringify({ a: 1, b: [1, 2] }),
);
check(
  "유효 JSON 은 1차 파스로 무접촉(문자열 내 ',}' 보존)",
  (parseJsonLoose('{"s": "x, ] y,} z"}') as { s: string }).s === "x, ] y,} z",
);
check("여전히 못 고치는 파손은 undefined", parseJsonLoose('{"a": ') === undefined);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".fallback-json-null-promotion-harness.mts");
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

const summary = runHarness();

test("H1: 폴백 JSON null-optional 승격 + trailing comma 보수 (실캡처 픽스처)", () => {
  assert.equal(
    summary.failed,
    0,
    `fallback-json-null-promotion failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 12, `expected ≥12 checks, got ${summary.passed}`);
});
