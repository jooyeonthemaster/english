import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 과목(국어/영어) 완전 분리 where 규약 검증 — TS + `@/...` 앨리어스 모듈이라
// tsx 하니스로 실행해 JSON 요약을 뽑는다(ko-text-core.test.mjs 하니스 패턴 미러).
//
// 계약(두 클러스터 공통):
//  - 지문: filters.subject === "KOREAN" → subject='KOREAN' 만 /
//    미지정(기본=영어) → subject 가 null 또는 'KOREAN' 아닌 것(NOT KOREAN).
//  - 문항: filters.subject === "KOREAN" → subType startsWith 'KO_' 만 /
//    미지정 → KO_ 제외(null subType 은 영어로 간주해 잔류).
const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import passageWhereMod from "@/actions/workbench/_passage-where";
import questionWhereMod from "@/actions/workbench/_question-where";
const { buildWorkbenchPassageWhere, buildPassageSubjectScopeWhere } =
  passageWhereMod;
const { buildWorkbenchQuestionWhere } = questionWhereMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
const json = (v) => JSON.stringify(v);

// ── 스코프 조각 단독 ──
check(
  "scope fragment: KOREAN → subject='KOREAN'",
  json(buildPassageSubjectScopeWhere("KOREAN")) === json({ subject: "KOREAN" }),
);
check(
  "scope fragment: default → OR [null, not KOREAN] (null 지문 잔류 필수)",
  json(buildPassageSubjectScopeWhere(undefined)) ===
    json({ OR: [{ subject: null }, { subject: { not: "KOREAN" } }] }),
);

// ── 지문 where: KOREAN 스코프 ──
const pKo = buildWorkbenchPassageWhere("acad1", { subject: "KOREAN" });
check("passage KOREAN: academy 스코프 유지", pKo.academyId === "acad1");
check(
  "passage KOREAN: AND 에 subject='KOREAN' 포함",
  Array.isArray(pKo.AND) &&
    pKo.AND.some((c) => json(c) === json({ subject: "KOREAN" })),
);
check(
  "passage KOREAN: 국어 제외 OR 조각 없음",
  !Array.isArray(pKo.AND) ||
    !pKo.AND.some((c) => json(c).includes('"not":"KOREAN"')),
);

// ── 지문 where: 기본(미지정)=영어 — 국어 제외 ──
const pDefault = buildWorkbenchPassageWhere("acad1");
check(
  "passage default: AND 에 NOT-KOREAN(OR null) 조각 포함",
  Array.isArray(pDefault.AND) &&
    pDefault.AND.some(
      (c) =>
        json(c) ===
        json({ OR: [{ subject: null }, { subject: { not: "KOREAN" } }] }),
    ),
);
check(
  "passage default: subject 직접 고정 없음(=KOREAN 강제 아님)",
  pDefault.subject === undefined,
);

// filters 객체는 주되 subject 만 비운 경우도 기본(영어)과 동일해야 한다.
const pEmptyFilters = buildWorkbenchPassageWhere("acad1", {});
check(
  "passage {} filters: 기본과 동일 population",
  json(pEmptyFilters) === json(pDefault),
);

// ── 지문 where: 검색 OR 과 스코프 AND 의 공존(클로버링 금지) ──
const pSearch = buildWorkbenchPassageWhere("acad1", { search: "지문" });
check(
  "passage search: where.OR 는 검색 조각 유지",
  Array.isArray(pSearch.OR) && json(pSearch.OR).includes("지문"),
);
check(
  "passage search: 스코프는 AND 로 합류(검색 OR 을 덮지 않음)",
  Array.isArray(pSearch.AND) &&
    pSearch.AND.some((c) => json(c).includes('"not":"KOREAN"')),
);

// analyzedOnly+includeDirectInput 은 기존에도 AND 를 쓰므로 배열 합류 검증.
const pCompose = buildWorkbenchPassageWhere("acad1", {
  analyzedOnly: true,
  includeDirectInput: true,
  subject: "KOREAN",
});
check(
  "passage compose: 기존 AND(analysis/direct-input) + 스코프 AND 공존",
  Array.isArray(pCompose.AND) &&
    pCompose.AND.length === 2 &&
    pCompose.AND.some((c) => json(c) === json({ subject: "KOREAN" })),
);

// ── 문항 where: KOREAN 스코프 → subType startsWith KO_ ──
const qKo = buildWorkbenchQuestionWhere("acad1", { subject: "KOREAN" });
check(
  "question KOREAN: AND 에 subType startsWith 'KO_' 포함",
  Array.isArray(qKo.AND) &&
    qKo.AND.some(
      (c) => json(c) === json({ subType: { startsWith: "KO_" } }),
    ),
);

// ── 문항 where: 기본(미지정)=영어 → KO_ 제외 + null subType 잔류 ──
const qDefault = buildWorkbenchQuestionWhere("acad1");
check(
  "question default: AND 에 (subType null OR NOT KO_) 포함",
  Array.isArray(qDefault.AND) &&
    qDefault.AND.some(
      (c) =>
        json(c) ===
        json({
          OR: [
            { subType: null },
            { NOT: { subType: { startsWith: "KO_" } } },
          ],
        }),
    ),
);
check("question default: 휴지통 게이트 보존(deletedAt null)", qDefault.deletedAt === null);

// ── 문항 where: 기존 subType 다중 필터와 스코프 공존 ──
const qMulti = buildWorkbenchQuestionWhere("acad1", {
  subject: "KOREAN",
  subType: "KO_FACTUAL_MATCH,KO_INFERENCE",
});
check(
  "question KOREAN+subType: 사용자가 고른 subType in 필터 유지",
  json(qMulti.subType) ===
    json({ in: ["KO_FACTUAL_MATCH", "KO_INFERENCE"] }),
);
check(
  "question KOREAN+subType: 스코프는 AND 로 별도 합류",
  Array.isArray(qMulti.AND) &&
    qMulti.AND.some(
      (c) => json(c) === json({ subType: { startsWith: "KO_" } }),
    ),
);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".subject-scope-where-harness.mts");
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

test("subject scope where: KOREAN/기본 population 분리 규약", () => {
  assert.equal(
    summary.failed,
    0,
    `subject-scope-where failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 12, `expected ≥12 checks, got ${summary.passed}`);
});
