// 브리지 「강사 확정 보존 병합」 계약 단위 테스트
// (src/lib/exam-scoring/internal-analysis.ts mergePreservingReviewed, 26-09-04).
//
// 왜 이 테스트가 있는가 — 실측된 막다른 길(docs/exam-analysis-v4-spec.md §8):
// 자체 시험지(INTERNAL)의 서술형(MANUAL_ONLY)은 기계가 영원히 UNKNOWN 을 낸다.
// 강사가 손으로 채점해도 재동기화(재채점·보강)가 응답을 통째로 갈아끼우면 UNKNOWN
// 으로 원복 → gradingConfirmed 가 false 로 되돌아가 5cr 리포트 생성이 영구 차단된다.
// 이 병합이 그 경로의 유일한 방어선이라, 축(할당 문항 집합)과 보존 규칙을 못 박는다.
//
// 검증 축:
//  1. reviewed:true 행은 기계 판정을 이긴다(정오·부분점수·메모·학생답 전부 보존).
//  2. reviewed:false/미상 행은 기계 판정으로 갱신된다(자동 채점 최신값 우선).
//  3. 축은 machine — 할당에서 빠진 옛 문항은 되살아나지 않고, 순서도 machine 을 따른다.
//  4. 번호 표기는 machine 정본(공백 차이는 같은 문항으로 조인).
//  5. 보존 대상이 없으면 machine 을 그대로(참조 동일) 돌려준다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as m from "@/lib/exam-scoring/internal-analysis";
const mod: any = (m as any).default ?? (m as any)["module.exports"] ?? m;
const { mergePreservingReviewed } = mod;

function r(number: string, over: any = {}) {
  return Object.assign({ number, status: "UNKNOWN", source: "AUTO", reviewed: false }, over);
}

const out: Record<string, any> = {};

// 1·2. reviewed 보존 / 미확정 갱신
out.basic = mergePreservingReviewed(
  [r("1", { status: "CORRECT" }), r("2", { status: "WRONG" }), r("3", { status: "UNKNOWN" })],
  [
    r("1", { status: "WRONG", reviewed: false }),          // 미확정 → 기계 승
    r("2", { status: "PARTIAL", reviewed: true, earnedPoints: 1.5, note: "철자", source: "MANUAL" }),
    r("3", { status: "CORRECT", reviewed: true, studentAnswer: "confusing the wind", earnedPoints: 4 }),
  ],
);

// 3. 축 = machine(할당 이탈 문항 부활 금지 + 순서 machine)
out.axis = mergePreservingReviewed(
  [r("2"), r("1")],
  [r("1", { status: "CORRECT", reviewed: true }), r("9", { status: "CORRECT", reviewed: true })],
);

// 4. 번호 표기는 machine 정본(공백 차이 조인)
out.numbering = mergePreservingReviewed(
  [r("서답형 3", { status: "UNKNOWN" })],
  [r("서답형3", { status: "CORRECT", reviewed: true })],
);

// 5. 보존 대상 없음 → machine 그대로(참조 동일)
const machine = [r("1", { status: "CORRECT" })];
out.passthroughSame = mergePreservingReviewed(machine, [r("1", { status: "WRONG" })]) === machine;
out.emptyExisting = mergePreservingReviewed(machine, []) === machine;
out.nullExisting = mergePreservingReviewed(machine, null) === machine;

console.log(JSON.stringify(out));
`;

function runHarness() {
  const dir = path.join(repoRoot, ".tmp-unit-report-bridge-merge");
  mkdirSync(dir, { recursive: true });
  const harnessPath = path.join(dir, "harness.ts");
  writeFileSync(harnessPath, harnessSource);
  try {
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    const line = raw.trim().split("\n").pop();
    return JSON.parse(line);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const R = runHarness();

test("강사 확정 행(reviewed)은 자동 채점을 이긴다 — 정오·부분점수·메모·학생답 보존", () => {
  const [q1, q2, q3] = R.basic;
  // 미확정 행은 기계 판정으로 갱신
  assert.equal(q1.status, "CORRECT");
  assert.equal(q1.reviewed, false);
  // 확정 행은 통째로 보존
  assert.equal(q2.status, "PARTIAL");
  assert.equal(q2.earnedPoints, 1.5);
  assert.equal(q2.note, "철자");
  assert.equal(q2.source, "MANUAL");
  assert.equal(q2.reviewed, true);
  // 서술형: 기계는 UNKNOWN 이지만 강사 확정이 이긴다(막다른 길 방어선)
  assert.equal(q3.status, "CORRECT");
  assert.equal(q3.studentAnswer, "confusing the wind");
  assert.equal(q3.earnedPoints, 4);
});

test("축은 machine — 할당 이탈 문항은 부활하지 않고 순서도 machine 을 따른다", () => {
  assert.deepEqual(R.axis.map((x) => x.number), ["2", "1"]);
  assert.equal(R.axis.find((x) => x.number === "1").status, "CORRECT");
  assert.equal(R.axis.some((x) => x.number === "9"), false);
});

test("번호 표기는 machine 정본 — 공백 차이는 같은 문항으로 조인한다", () => {
  assert.equal(R.numbering.length, 1);
  assert.equal(R.numbering[0].number, "서답형 3");
  assert.equal(R.numbering[0].status, "CORRECT");
});

test("보존 대상이 없으면 machine 을 그대로 돌려준다(불필요한 사본 금지)", () => {
  assert.equal(R.passthroughSame, true);
  assert.equal(R.emptyExisting, true);
  assert.equal(R.nullExisting, true);
});
