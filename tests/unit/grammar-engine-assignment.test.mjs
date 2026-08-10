import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 어법 엔진 assignment 취약 가중 편성 계약 (docs/director-console-v3-design.md §D2-4):
//  - sortPoolByMastery: (개념 숙달도 asc, 난이도 asc) 안정 정렬 — 동일 스펙이라도
//    학생 mastery 가 다르면 취약 개념 문항이 선두에 온다. 미기록 개념은 0점(최약).
//  - orderCandidates(=pickItems 순수 코어): preserveOrder 미지정 시 기존 동작
//    (미출제층 shuffle) 불변, 지정 시 미출제층만 입력 순서 보존.
//  - 층위 우선순위(미출제 → 마지막 오답 → 오래전 정답) 는 두 모드 모두 유지.
//
// engine.ts 는 server-only·prisma 를 끌고 오므로 하니스는 react-server 조건으로
// 실행한다(server-only → empty.js). 순수 함수만 호출하므로 DB 는 닿지 않는다.
const harnessSource = `
import engineMod from "@/lib/grammar-drill/engine";
const { orderCandidates, sortPoolByMastery } = engineMod as any;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " :: " + detail : name);
}

const item = (id: string, conceptId: string, difficulty: number) =>
  ({ id, unitId: "u01", conceptId, difficulty, type: "CHOICE" }) as any;
const ids = (arr: any[]) => arr.map((x) => x.id).join(",");

// ── (a) 동일 스펙(풀)·상이 mastery → 취약 개념 문항 선두 ──
const pool = [
  item("q1", "c-strong", 2),
  item("q2", "c-weak", 3),
  item("q3", "c-weak", 1),
  item("q4", "c-strong", 1),
];
const weakIsWeak = sortPoolByMastery(
  pool,
  new Map([["c-weak", 20], ["c-strong", 80]]),
);
check("취약 개념(c-weak) 선두 + 난이도 asc", ids(weakIsWeak) === "q3,q2,q4,q1", ids(weakIsWeak));
const strongIsWeak = sortPoolByMastery(
  pool,
  new Map([["c-weak", 80], ["c-strong", 20]]),
);
check("mastery 반전 → 편성 반전(동일 스펙)", ids(strongIsWeak) === "q4,q1,q3,q2", ids(strongIsWeak));
check("입력 풀 무변이(순수)", ids(pool) === "q1,q2,q3,q4");

// preserveOrder 파이프라인: 정렬 결과가 그대로 서빙 순서가 된다(전원 미출제).
const served = orderCandidates(weakIsWeak, new Map(), 4, { preserveOrder: true });
check("preserveOrder: 취약 정렬 순서 그대로 서빙", ids(served) === "q3,q2,q4,q1", ids(served));

// 미기록 개념 = 0점(최약) — drill 분기 scoreOf 관용과 동일.
const withNew = sortPoolByMastery(
  [...pool, item("q5", "c-new", 4)],
  new Map([["c-weak", 20], ["c-strong", 80]]),
);
check("미기록 개념이 최약으로 선두", withNew[0].id === "q5", ids(withNew));

// 안정 정렬 — 동점(같은 개념·난이도)은 입력 순서 보존.
const tie = sortPoolByMastery(
  [item("t1", "c", 2), item("t2", "c", 2), item("t3", "c", 1)],
  new Map(),
);
check("동점 안정성: 난이도 우선 + 입력 순서 보존", ids(tie) === "t3,t1,t2", ids(tie));

// ── (b) preserveOrder 미지정 → 기존 동작(미출제층 shuffle) 불변 ──
const big = Array.from({ length: 30 }, (_, i) => item("b" + i, "c", 1));
const bigIds = ids(big);
let sawDifferent = false;
for (let run = 0; run < 60 && !sawDifferent; run++) {
  const out = orderCandidates(big, new Map(), 30);
  if (ids(out) !== bigIds) sawDifferent = true;
  check("기본: 멤버십 보존 run" + run, [...out].map((x: any) => x.id).sort().join() === [...big].map((x: any) => x.id).sort().join());
}
check("기본: 미출제층 shuffle 동작(입력 순서와 달라짐)", sawDifferent);
check("기본: n 절단", orderCandidates(big, new Map(), 7).length === 7);
// preserveOrder 는 셔플만 바꾼다 — 60회 모두 입력 순서 그대로.
let allSame = true;
for (let run = 0; run < 60; run++) {
  if (ids(orderCandidates(big, new Map(), 30, { preserveOrder: true })) !== bigIds) allSame = false;
}
check("preserveOrder: 60회 전부 입력 순서 보존", allSame);

// ── (c) 층위 우선순위 유지: 미출제 → 마지막 오답 → 오래전 정답 ──
const stats = new Map<string, any>([
  ["w1", { count: 2, lastCorrect: false, lastAt: new Date("2026-07-01") }],
  ["s-old", { count: 1, lastCorrect: true, lastAt: new Date("2026-06-01") }],
  ["s-new", { count: 1, lastCorrect: true, lastAt: new Date("2026-07-10") }],
]);
const cands = [
  item("s-new", "c", 1),
  item("w1", "c", 1),
  item("u1", "c", 1),
  item("s-old", "c", 1),
  item("u2", "c", 1),
];
const layeredP = orderCandidates(cands, stats, 5, { preserveOrder: true });
check("층위(preserveOrder): 미출제→오답→오래전", ids(layeredP) === "u1,u2,w1,s-old,s-new", ids(layeredP));
const layered = orderCandidates(cands, stats, 5);
check("층위(기본): 미출제 2건 선두", new Set([layered[0].id, layered[1].id]).size === 2 && ["u1", "u2"].includes(layered[0].id) && ["u1", "u2"].includes(layered[1].id), ids(layered));
check("층위(기본): 오답 재출제 3번째", layered[2].id === "w1", ids(layered));
check("층위(기본): 정답층은 오래전 우선", layered[3].id === "s-old" && layered[4].id === "s-new", ids(layered));
check("층위 + n 절단(중복 없이)", ids(orderCandidates(cands, stats, 3, { preserveOrder: true })) === "u1,u2,w1");

console.log(JSON.stringify({ passed, failures }));
`;

test("grammar engine assignment weak-first contract", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-grammar-engine");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".engine-harness.mts");
  let raw;
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // server-only → empty.js (react-server 조건). 순수 함수만 실행한다.
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --conditions=react-server`.trim(),
      },
    });
  } finally {
    rmSync(harnessPath, { force: true });
  }
  const lines = raw.trim().split(/\r?\n/);
  const result = JSON.parse(lines[lines.length - 1]);
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed > 10, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});

// 배선 검증(소스 계약) — buildQueue 는 prisma 를 끌고 와 직접 실행이 무거우므로,
// assignment 분기 배선과 타 모드 무접촉(구조 보증)은 소스 텍스트로 고정한다.
test("grammar engine assignment wiring — 타 모드 무접촉 구조 보증", () => {
  const source = readFileSync(
    path.join(repoRoot, "src", "lib", "grammar-drill", "engine.ts"),
    "utf8",
  );
  const branchAt = source.indexOf('if (mode === "assignment")');
  assert.ok(branchAt > 0, "assignment 분기 존재");
  const branch = source.slice(branchAt);
  const before = source.slice(0, branchAt);

  // assignment 분기: mastery 1회 조회 → 취약 정렬 → preserveOrder 서빙.
  assert.match(branch, /grammarDrillMastery\.findMany/, "assignment 분기에서 mastery 조회");
  assert.match(branch, /sortPoolByMastery\(pool/, "취약 가중 정렬 배선");
  assert.match(branch, /preserveOrder:\s*true/, "preserveOrder 서빙 배선");

  // 구조 보증: smart/review/drill 등 assignment 이전 경로는 preserveOrder 무접촉.
  assert.doesNotMatch(before, /preserveOrder:\s*true/, "타 모드 preserveOrder 미사용");
  const uses = source.match(/preserveOrder:\s*true/g) ?? [];
  assert.equal(uses.length, 1, "preserveOrder: true 는 assignment 분기 1곳뿐");
});
