import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const read = (...segs) => readFileSync(path.join(repoRoot, ...segs), "utf8");

// ============================================================================
// KO 적대검수 2차 확정결함 수정 회귀 고정 (F1-actions 클러스터)
//  - EN-REG-1: 영어 PREMIUM generationMaxTokens 4배 상향 무회귀 위반 → HEAD 원식 환원
//  - EN-REG-2: addQuestionsToExam 배점 승계 → KO 게이트(영어는 1점 원복)
//  - EN-REG-3/ISO-1: getExams none 절 deletedAt 비대칭 → 고아 시험지 소멸
//  - ISO-8: Passage.subject='KOREAN' 전파는 잡 명시 metadata.subject 에서만
// ============================================================================

// ── EN-REG-1: 소스 가드 ─────────────────────────────────────────────────────

test("EN-REG-1: generationMaxTokens 에 PREMIUM 16_384 바닥 절이 없다(HEAD 원식)", () => {
  const src = read(
    "src",
    "app",
    "api",
    "ai",
    "generate-questions-auto",
    "_lib",
    "run-question-generation.ts",
  );
  assert.ok(
    !/(?<!koMod && )effectiveGenerationPlan === "PREMIUM"\s*\?\s*16_?384/.test(src),
    "PREMIUM ? 16_384 : 0 바닥 절이 되살아남 — 영어 PREMIUM maxTokens 무회귀 위반",
  );
  // 원식 구조 보존: Math.min(20_000, Math.max(floor, typeCount*floor))
  const formula = src.match(
    /const generationMaxTokens = Math\.min\(([\s\S]*?)\);/,
  );
  assert.ok(formula, "generationMaxTokens 계산식을 찾을 수 없음");
  assert.ok(
    formula[1].includes("20_000") &&
      formula[1].includes("perQuestionTokenFloor") &&
      formula[1].includes("(Number(typeCount) || 1) * perQuestionTokenFloor"),
    "원식(Math.min(20_000, Math.max(floor, typeCount*floor))) 구조 훼손",
  );
  assert.ok(
    (!formula[1].includes("16_384") && !formula[1].includes("16384")) ||
      formula[1].includes('koMod && effectiveGenerationPlan === "PREMIUM" ? 16_384 : 0'),
    "계산식에 16_384 상수 잔존",
  );
});

// ── EN-REG-2: 소스 가드 (2벌 동일 규약) ─────────────────────────────────────

for (const [label, segs] of [
  ["exams/questions.ts", ["src", "actions", "exams", "questions.ts"]],
  ["exam-questions.ts (데드카피)", ["src", "actions", "exam-questions.ts"]],
]) {
  test(`EN-REG-2: addQuestionsToExam(${label}) 배점 승계가 KO 게이트를 탄다`, () => {
    const src = read(...segs);
    assert.ok(
      src.includes('import { isKoQuestionType } from "@/lib/korean/registry"'),
      "isKoQuestionType import 누락",
    );
    // KO 만 저장 배점 승계 + 0점 클램프, 영어는 1 고정
    assert.ok(
      src.includes(
        "isKoQuestionType(q.subType) ? Math.max(1, q.points ?? 1) : 1",
      ),
      "KO 게이트 배점 식(isKoQuestionType ? Math.max(1, points) : 1) 누락",
    );
    // 게이트 판정에 필요한 subType 이 select 에 포함
    assert.ok(
      /select:\s*\{[^}]*points:\s*true[^}]*subType:\s*true[^}]*\}/.test(src) ||
        /select:\s*\{[^}]*subType:\s*true[^}]*points:\s*true[^}]*\}/.test(src),
      "points+subType select 누락",
    );
    // 무게이트 승계(회귀 원본 `points: pointsById.get(qId)` 에 raw q.points 맵) 금지
    assert.ok(
      !src.includes("map((q) => [q.id, q.points])"),
      "무게이트 raw points 맵 잔존 — 영어 배점 승계 회귀",
    );
  });
}

// ── EN-REG-3/ISO-1: 소스 가드 ───────────────────────────────────────────────

test("EN-REG-3: getExams KO 제외 none 절에 deletedAt:null 이 있다(국어 some 절 대칭)", () => {
  const src = read("src", "actions", "exams", "crud.ts");
  assert.ok(
    /none:\s*\{\s*question:\s*\{\s*deletedAt:\s*null,\s*subType:\s*\{\s*startsWith:\s*"KO_"\s*\}\s*\}\s*\}/.test(
      src,
    ),
    "none 절이 { deletedAt: null, subType: startsWith KO_ } 형태가 아님 — 휴지통 KO 문항이 시험지를 양쪽 목록에서 실종시킴",
  );
  // 국어 목록의 some 절과 동일 모집단인지(대칭 계약) 상대편도 고정
  const koList = read(
    "src",
    "app",
    "(director)",
    "director",
    "korean",
    "exams",
    "page.tsx",
  );
  assert.ok(
    koList.includes('getExams(staff.academyId, { subject: "KOREAN" })') ||
      /some:\s*\{\s*question:\s*\{\s*deletedAt:\s*null,\s*subType:\s*\{\s*startsWith:\s*"KO_"/.test(
        koList,
      ),
    "국어 목록 some 절(deletedAt null + KO_)이 변경됨 — none/some 대칭 재확인 필요",
  );
});

// ── ISO-8: 소스 가드 ────────────────────────────────────────────────────────

test("ISO-8: 커밋 승급이 SourceMaterial.subject 대신 잡 명시 metadata.subject 를 쓴다", () => {
  const src = read(
    "src",
    "app",
    "api",
    "extraction",
    "jobs",
    "[jobId]",
    "commit",
    "_lib",
    "create-or-reuse-passage.ts",
  );
  assert.ok(
    src.includes(
      'import { readRequestedSubject } from "@/lib/extraction/requested-subject"',
    ),
    "readRequestedSubject import 누락",
  );
  assert.ok(
    src.includes("readRequestedSubject(job.metadata)"),
    "잡 metadata 기반 과목 게이트 누락",
  );
  assert.ok(
    !src.includes("tx.sourceMaterial.findUnique"),
    "OCR 추정 SourceMaterial.subject 조회 잔존 — 영어 추출 지문 KOREAN 이탈 회귀",
  );
});

test("ISO-8: M1 승급이 잡 metadata 를 select 하고 그 기준으로만 KOREAN 전파한다", () => {
  const src = read("src", "lib", "extraction", "promote-m1-drafts.ts");
  assert.ok(
    src.includes("readRequestedSubject(draft.job.metadata)"),
    "M1 승급 과목 게이트가 잡 metadata 기준이 아님",
  );
  assert.ok(
    /job:\s*\{[^}]*select:\s*\{[^}]*metadata:\s*true/.test(src),
    "PROMOTABLE_DRAFT_INCLUDE.job.select 에 metadata 누락",
  );
  assert.ok(
    !src.includes("sourceMaterial?.subject"),
    "OCR 추정 SourceMaterial.subject 전파 잔존",
  );
});

// ── ISO-8: readRequestedSubject 동작 하니스 (tsx — @/ 앨리어스 TS 모듈) ──────

const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import requestedSubjectMod from "@/lib/extraction/requested-subject";
const { readRequestedSubject } = requestedSubjectMod;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

// 국어 라우트 잡: metadata.subject="KOREAN" → KOREAN 전파
check(
  "명시 KOREAN → 'KOREAN'",
  readRequestedSubject({ subject: "KOREAN" }) === "KOREAN",
);
check(
  "originPath 등 다른 키와 공존해도 KOREAN 판독",
  readRequestedSubject({ originPath: "/director/korean", subject: "KOREAN" }) ===
    "KOREAN",
);

// 영어 경로 잡: metadata 부재/무관 → null (Passage.subject 미기록 = 영어 관례)
check("metadata null → null", readRequestedSubject(null) === null);
check("metadata undefined → null", readRequestedSubject(undefined) === null);
check("subject 키 없음 → null", readRequestedSubject({ originPath: "/x" }) === null);
check(
  "OCR 파서식 ENGLISH → null(전파 없음)",
  readRequestedSubject({ subject: "ENGLISH" }) === null,
);
check("배열 metadata → null", readRequestedSubject(["KOREAN"]) === null);
check("문자열 metadata → null", readRequestedSubject("KOREAN") === null);
check(
  "subject 비문자열 → null",
  readRequestedSubject({ subject: { nested: "KOREAN" } }) === null,
);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".requested-subject-harness.mts");
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

test("ISO-8: readRequestedSubject — 잡 명시 KOREAN 만 전파, OCR 추정/결손은 null", () => {
  const summary = runHarness();
  assert.equal(
    summary.failed,
    0,
    `requested-subject failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 9, `expected ≥9 checks, got ${summary.passed}`);
});
