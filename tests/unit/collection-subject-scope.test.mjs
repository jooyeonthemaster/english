import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 폴더(컬렉션) 과목 분리 where 규약 검증 — TS + `@/...` 앨리어스 모듈이라
// tsx 하니스로 실행해 JSON 요약을 뽑는다(subject-scope-where.test.mjs 패턴 미러).
//
// 계약(passages.subject 규약 1:1 미러):
//  - subject === "KOREAN" → { subject: 'KOREAN' } 만.
//  - 미지정(기본=영어) → subject 가 null(기존 폴더 전부=영어 간주) 또는
//    'KOREAN' 아닌 것 — Prisma `not` 이 NULL 행을 탈락시키므로 null 을 OR 로
//    명시해 기존 폴더가 영어 목록에서 절대 빠지지 않아야 한다.
//  - P2022(컬럼 미반영 DB) 판별자는 code === "P2022" 만 강등 게이트로 삼는다.
const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import collectionWhereMod from "@/actions/workbench/_collection-where";
const { buildCollectionSubjectScopeWhere, isMissingColumnError } =
  collectionWhereMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
const json = (v) => JSON.stringify(v);

// ── 스코프 조각 ──
check(
  "collection scope: KOREAN → subject='KOREAN'",
  json(buildCollectionSubjectScopeWhere("KOREAN")) ===
    json({ subject: "KOREAN" }),
);
check(
  "collection scope: default → OR [null, not KOREAN] (기존 null 폴더 잔류 필수)",
  json(buildCollectionSubjectScopeWhere(undefined)) ===
    json({ OR: [{ subject: null }, { subject: { not: "KOREAN" } }] }),
);
check(
  "collection scope: 인자 생략도 default 와 동일",
  json(buildCollectionSubjectScopeWhere()) ===
    json(buildCollectionSubjectScopeWhere(undefined)),
);

// ── academyId 와의 합성(액션이 스프레드로 합류시키는 형태) ──
const koWhere = { academyId: "acad1", ...buildCollectionSubjectScopeWhere("KOREAN") };
check(
  "KOREAN 합성: academy 스코프 유지 + subject 고정",
  koWhere.academyId === "acad1" && koWhere.subject === "KOREAN",
);
const defaultWhere = { academyId: "acad1", ...buildCollectionSubjectScopeWhere() };
check(
  "default 합성: academy 스코프 유지 + subject 직접 고정 없음",
  defaultWhere.academyId === "acad1" && defaultWhere.subject === undefined,
);
check(
  "default 합성: OR 조각이 국어 폴더를 배제",
  Array.isArray(defaultWhere.OR) &&
    json(defaultWhere.OR) ===
      json([{ subject: null }, { subject: { not: "KOREAN" } }]),
);

// ── passages.subject 규약과의 1:1 미러(두 스코프 조각 shape 동일성) ──
import passageWhereMod from "@/actions/workbench/_passage-where";
const { buildPassageSubjectScopeWhere } = passageWhereMod;
check(
  "규약 미러: KOREAN 조각이 지문 스코프와 shape 동일",
  json(buildCollectionSubjectScopeWhere("KOREAN")) ===
    json(buildPassageSubjectScopeWhere("KOREAN")),
);
check(
  "규약 미러: default 조각이 지문 스코프와 shape 동일",
  json(buildCollectionSubjectScopeWhere()) ===
    json(buildPassageSubjectScopeWhere(undefined)),
);

// ── P2022 강등 판별자 ──
check("P2022: code 일치 → 강등", isMissingColumnError({ code: "P2022" }) === true);
check(
  "P2022: 다른 Prisma 에러는 강등 금지",
  isMissingColumnError({ code: "P2002" }) === false,
);
check("P2022: null/원시값 안전", isMissingColumnError(null) === false && isMissingColumnError("P2022") === false);
check(
  "P2022: 일반 Error 는 강등 금지",
  isMissingColumnError(new Error("boom")) === false,
);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".collection-subject-scope-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // Run through a shell so Windows resolves `npx` (only exists as npx.cmd);
    // execSync takes a single quoted command string (no DEP0190 args warning).
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

test("collection subject scope where: 국어/영어 폴더 population 분리 규약", () => {
  assert.equal(
    summary.failed,
    0,
    `collection-subject-scope failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 10, `expected ≥10 checks, got ${summary.passed}`);
});
