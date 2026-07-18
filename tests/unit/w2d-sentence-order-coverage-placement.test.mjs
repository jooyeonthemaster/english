// W2-D (26-07-18) findSentenceOrderSourceCoverageIssues 오탐 보정 회귀.
// indexOf 첫 등장 고정은 반복 구/부분 일치에서 한 단락 span 을 다른 단락 구간과 겹치게
// 잡아 가짜 누락/중복을 냈다(실측: B 단락 텍스트가 A 단락 안에도 substring 으로 존재하면
// 정상 지문인데 OLD 는 omitted gap=17 오발화). 서로 겹치지 않는 배치 탐색으로 보정하되,
// 진짜 누락(seam 문장 유실)·진짜 중복(단락 텍스트 재사용)은 그대로 검출한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import soVal from "@/lib/question-quality/validators/sentence-order";
const { findSentenceOrderSourceCoverageIssues } = soVal;
const run = (paras, passage) =>
  findSentenceOrderSourceCoverageIssues(paras, passage).map((f) => f.code);

// ── FP 벡터: B 단락("The river rose above its banks and flooded the fields")이 A 단락
//    안에도 substring 으로 존재(반복 절). OLD indexOf-first 는 B 를 A 내부로 잘못 배치해
//    가짜 omitted 를 냈다. 보정 후 서로 겹치지 않는 참 위치를 잡아 무결점 통과.
const A = "That spring the river rose above its banks and flooded the fields across the entire valley without any warning.";
const B = "The river rose above its banks and flooded the fields.";
const C = "Villagers slowly rebuilt their homes on higher ground the following summer season.";
const repeatedSubstring = run(
  [{ label: "(A)", text: A }, { label: "(B)", text: B }, { label: "(C)", text: C }],
  A + " " + B + " " + C,
);

const S = [
  "The old lighthouse guided ships safely along the rocky northern coast for over a century.",
  "Its powerful beam swept across the dark water every single night without ever failing once.",
  "A dropped middle sentence about the keeper sits here in the source between the two chunks.",
  "Eventually electric beacons replaced the aging lamp and the tower fell into quiet disrepair.",
  "Today tourists visit the restored structure to admire the view from its high windy balcony.",
];
// 진짜 누락: A 와 B 사이 원문 문장(S[2])이 통째로 빠짐.
const genuineOmission = run(
  [{ label: "(A)", text: S[0] + " " + S[1] }, { label: "(B)", text: S[3] }, { label: "(C)", text: S[4] }],
  S.join(" "),
);
// 진짜 중복: A 와 B 가 동일 텍스트(원문에 1회뿐이라 두 단락이 같은 구간을 씀).
const genuineDuplication = run(
  [{ label: "(A)", text: S[1] + " " + S[2] }, { label: "(B)", text: S[1] + " " + S[2] }, { label: "(C)", text: S[3] + " " + S[4] }],
  S.join(" "),
);
// 건강: 반복 없는 연속 3분할.
const healthy = run(
  [{ label: "(A)", text: S[0] + " " + S[1] }, { label: "(B)", text: S[2] + " " + S[3] }, { label: "(C)", text: S[4] }],
  S.join(" "),
);

process.stdout.write(JSON.stringify({ repeatedSubstring, genuineOmission, genuineDuplication, healthy }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".w2d-so-coverage-placement-harness.mts");
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

const result = runHarness();
const has = (codes, code) => codes.includes(code);

test("repeated-substring paragraph does not falsely flag omission/duplication (indexOf FP fixed)", () => {
  assert.deepEqual(result.repeatedSubstring, [], JSON.stringify(result.repeatedSubstring));
});

test("genuine dropped seam sentence is still flagged (omission preserved)", () => {
  assert.ok(
    has(result.genuineOmission, "sentence-order-source-sentence-omitted"),
    JSON.stringify(result.genuineOmission),
  );
});

test("genuine duplicated paragraph text is still flagged (duplication preserved)", () => {
  assert.ok(
    has(result.genuineDuplication, "sentence-order-source-sentence-duplicated"),
    JSON.stringify(result.genuineDuplication),
  );
});

test("healthy lossless split stays clean", () => {
  assert.deepEqual(result.healthy, [], JSON.stringify(result.healthy));
});
