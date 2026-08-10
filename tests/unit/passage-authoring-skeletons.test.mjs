import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// AI 지문 생성 — 골격 배분(prompts.assignSkeletons) 계약.
//
//  ① 결정론. 배분 결과는 잡 스냅샷에 저장되고 복구 시 그대로 되살아난다. 여기에
//     Math.random 이 한 번이라도 끼면 "결과 카드의 골격 뱃지"와 "실제로 그 편을
//     만들 때 쓴 골격"이 갈라진다. 함수 호출 반복 + 골든 벡터 + 소스 스캔
//     세 겹으로 잠근다(같은 프로세스 반복만으로는 시각·난수 의존을 못 잡는다).
//  ② 반박형(S2/S7)이 배치 절반을 넘지 않는다 — AUTO 배분에 한해서. 넘으면 한 세트가
//     통째로 "not X but Y" 가 되어 서로를 부정하는 지문 묶음이 나온다.
//  ③ spec.skeleton 이 지정되면 전 편이 그 골격. 사용자가 "통념→반박"을 고르고 3편을
//     요청했는데 서버가 말없이 섞으면 그건 수리가 아니라 배신이다(반박형 상한은
//     AUTO 에만 건다).
// ============================================================================

const harnessSource = `
import { readFileSync } from "node:fs";
import path from "node:path";

import promptsMod from "@/lib/passage-authoring/prompts";
import schemaMod from "@/lib/passage-authoring/schema";

const { assignSkeletons } = promptsMod as any;
const { PASSAGE_SKELETONS, MAX_PASSAGES_PER_RUN, DEFAULT_AUTHORING_SPEC } = schemaMod as any;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

const REBUTTAL = new Set(["S2", "S7"]);
const CODES: string[] = PASSAGE_SKELETONS.filter((c: string) => c !== "AUTO");
const AUTO_SPEC = { skeleton: "AUTO" };

// ── ① 결정론 ──────────────────────────────────────────────────────────────
// (a) 같은 입력을 반복 호출하면 같은 출력
let deterministic = true;
for (let count = 0; count <= 24; count += 1) {
  for (const diversify of [true, false]) {
    for (const skeleton of ["AUTO", ...CODES]) {
      const a = JSON.stringify(assignSkeletons(count, diversify, { skeleton }));
      for (let rep = 0; rep < 3; rep += 1) {
        if (JSON.stringify(assignSkeletons(count, diversify, { skeleton })) !== a) {
          deterministic = false;
        }
      }
    }
  }
}
check("결정론: 같은 입력 → 같은 출력 (0~24편 × 2모드 × 13골격)", deterministic);

// (b) 골든 벡터 — 프로세스가 달라도 같은 값이어야 한다. 회전 순서를 의도적으로
//     바꾸는 변경이라면 이 벡터도 함께 고쳐야 한다(조용한 표류 차단).
const GOLDEN: Record<string, string[]> = {
  "1|true": ["S1"],
  "2|true": ["S1", "S10"],
  "3|true": ["S1", "S10", "S3"],
  "6|true": ["S1", "S10", "S3", "S5", "S8", "S2"],
  "1|false": ["S1"],
  "3|false": ["S1", "S10", "S5"],
  "6|false": ["S1", "S10", "S5", "S8", "S3", "S9"],
};
for (const [key, expected] of Object.entries(GOLDEN)) {
  const [countRaw, mode] = key.split("|");
  const got = assignSkeletons(Number(countRaw), mode === "true", AUTO_SPEC);
  check(\`골든 벡터 \${key}\`, JSON.stringify(got) === JSON.stringify(expected));
}

// (c) 소스 스캔 — 난수·시각·순서 의존이 배분 규칙에 끼어들지 않았는가.
const promptsSrc = readFileSync(
  path.join(process.cwd(), "src", "lib", "passage-authoring", "prompts.ts"),
  "utf8",
).replace(/\\r\\n/g, "\\n");
const regionStart = promptsSrc.indexOf("const REBUTTAL_SPINES");
const regionEndMark = "return assigned;\\n}";
const regionEnd = promptsSrc.indexOf(regionEndMark, regionStart);
check("소스 스캔 구간을 찾았다", regionStart > 0 && regionEnd > regionStart);
const region = promptsSrc.slice(regionStart, regionEnd + regionEndMark.length);
check("배분 규칙에 Math.random 없음", !/Math\\.random/.test(region));
check("배분 규칙에 Date.now·시각 의존 없음", !/Date\\.now|new Date|performance\\.now/.test(region));
check("배분 규칙에 crypto 없음", !/crypto/.test(region));
check("반박형 정의는 S2·S7 두 개", /REBUTTAL_SPINES[^=]*=\\s*new Set\\(\\["S2", "S7"\\]\\)/.test(region));

// ── ② 반박형 상한 (AUTO 배분 한정) ────────────────────────────────────────
let capHeld = true;
let capDetail = "";
for (let count = 1; count <= 24; count += 1) {
  for (const diversify of [true, false]) {
    const got: string[] = assignSkeletons(count, diversify, AUTO_SPEC);
    const rebuttals = got.filter((c) => REBUTTAL.has(c)).length;
    if (rebuttals * 2 > got.length) {
      capHeld = false;
      capDetail = count + "/" + diversify + " → " + got.join(",");
    }
  }
}
check("반박형(S2/S7)이 배치 절반을 넘지 않는다" + (capDetail ? " [" + capDetail + "]" : ""), capHeld);

// 실사용 상한(MAX_PASSAGES_PER_RUN)에서는 반박형이 최대 1편이다 — 6편 세트가
// "전부 통념 반박"이 되는 것이 이 상한이 막으려는 실제 결말이다.
const maxRun: string[] = assignSkeletons(MAX_PASSAGES_PER_RUN, true, AUTO_SPEC);
check(
  \`\${MAX_PASSAGES_PER_RUN}편 배치의 반박형 ≤ 1\`,
  maxRun.filter((c) => REBUTTAL.has(c)).length <= 1,
);
// diversify=false 는 같은 소재를 여러 각도로 보는 발주 — 반박형을 아예 쓰지 않는다.
let sameSubjectClean = true;
for (let count = 1; count <= 24; count += 1) {
  if (assignSkeletons(count, false, AUTO_SPEC).some((c: string) => REBUTTAL.has(c))) {
    sameSubjectClean = false;
  }
}
check("diversify=false 배치에는 반박형이 없다", sameSubjectClean);

// ── ③ spec.skeleton 지정 → 전 편 동일 ─────────────────────────────────────
let pinned = true;
let pinnedLen = true;
for (const skeleton of CODES) {
  for (const diversify of [true, false]) {
    for (const count of [1, 2, 3, 6, 12]) {
      const got: string[] = assignSkeletons(count, diversify, { skeleton });
      if (!got.every((c) => c === skeleton)) pinned = false;
      if (got.length !== count) pinnedLen = false;
    }
  }
}
check("지정 골격은 전 편에 그대로 배정된다", pinned);
check("지정 골격 배치의 편수가 요청과 같다", pinnedLen);
// 반박형을 명시적으로 고른 발주는 상한을 적용받지 않는다(사용자 선택 우선).
const allRebuttal: string[] = assignSkeletons(6, true, { skeleton: "S2" });
check("사용자가 고른 반박형은 6편 전부 유지(상한은 AUTO 전용)", allRebuttal.every((c) => c === "S2"));
check("기본 spec 의 skeleton 은 AUTO", DEFAULT_AUTHORING_SPEC.skeleton === "AUTO");
check(
  "기본 spec 을 그대로 넘겨도 AUTO 배분",
  JSON.stringify(assignSkeletons(6, true, DEFAULT_AUTHORING_SPEC)) === JSON.stringify(GOLDEN["6|true"]),
);

// ── 공통 불변식 ───────────────────────────────────────────────────────────
let shapeOk = true;
let noAuto = true;
for (let count = 1; count <= 24; count += 1) {
  for (const diversify of [true, false]) {
    const got: string[] = assignSkeletons(count, diversify, AUTO_SPEC);
    if (got.length !== count) shapeOk = false;
    if (got.some((c) => !CODES.includes(c))) noAuto = false;
  }
}
check("편수만큼 배정된다", shapeOk);
check("AUTO·미지의 코드는 절대 배정되지 않는다", noAuto);
// 자리를 비우지 않는다 — 0·음수·소수도 최소 1편으로 접는다(호출부 방어).
check("count=0 → 1편", assignSkeletons(0, true, AUTO_SPEC).length === 1);
check("count=-3 → 1편", assignSkeletons(-3, true, AUTO_SPEC).length === 1);
check("count=3.7 → 3편(내림)", assignSkeletons(3.7, true, AUTO_SPEC).length === 3);

console.log(JSON.stringify({ passed, failures }));
`;

test("passage-authoring skeleton assignment contract", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-passage-authoring");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".skeletons-harness.mts");
  let raw;
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(harnessPath, { force: true });
  }
  const lines = raw.trim().split(/\r?\n/);
  const result = JSON.parse(lines[lines.length - 1]);
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed > 20, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});
