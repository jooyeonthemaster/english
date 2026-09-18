// ============================================================================
// 게이트 G2 — 유입 분류기·UA 파서·정화기 단위 검증을 `npm run test:unit` 안으로 들인다.
//
// 왜 이 파일이 존재하는가
// ---------------------------------------------------------------------------
// 케이스 100건은 이미 scripts/analytics-gate-classify.ts 에 있었지만, CI(.github/workflows/ci.yml)
// 의 `npm run test:unit` 은 tests/unit 아래 파일만 열거한다(scripts/run-unit-tests.mjs).
// 즉 **머지 이후 CI 에서 0회 실행**이었다. 이 래퍼가 그 간극을 메운다.
//
// 왜 케이스를 여기로 복사하지 않는가
// ---------------------------------------------------------------------------
// 케이스를 이 파일에 옮겨 적으면 정본이 둘이 되고, 분류 규칙을 고치는 사람은 스크립트만
// 고친다(= 테스트는 옛 규칙을 계속 통과시킨다). 그래서 **케이스 정본은 스크립트 한 곳**에
// 두고, 여기서는 그것을 실제로 실행해 전건 통과와 케이스 수 하한을 확인한다.
// 분류기·정화기는 순수 TS 모듈이라 .mjs 에서 직접 import 할 수 없어 tsx 로 띄운다 —
// tests/unit/exam-bank-bundles.test.mjs:69 가 쓰는 것과 같은 리포 관례이고,
// tsx 는 devDependencies(^4.21.0)라 CI(npm ci)에도 있다.
//
// 음성테스트(2026-09-18 실측): 게이트 사본에서 기대값 1건을 일부러 어긋나게 하고 GATE 를
// 그 사본으로 돌리면 이 테스트가 FAIL 본문을 싣고 RED 가 된다. 되돌리면 GREEN.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** 케이스 정본. 여기를 바꾸면 무엇을 검증하는지가 바뀐다 — 함부로 다른 파일을 가리키지 말 것. */
const GATE = path.join(process.cwd(), "scripts", "analytics-gate-classify.ts");

/** 케이스 수 하한 — 누군가 케이스를 지워 게이트를 공허하게 만드는 것을 막는다(2026-09-18 실측 100건). */
const MIN_CASES = 100;

test("analytics G2: 유입 분류기·UA 파서·정화기 케이스가 전건 통과한다", () => {
  assert.ok(existsSync(GATE), `게이트 스크립트가 없다: ${GATE}`);

  let out = "";
  try {
    out = execFileSync(process.execPath, ["--import=tsx", GATE], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 120_000,
    });
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    // status 2 = 케이스 0건(계기 고장), 1 = 실패 있음, null = spawn 실패(tsx 없음 등)
    assert.fail(`analytics-gate-classify 실패(exit ${err.status ?? "spawn"})\n${text}`);
  }

  const summary = out.match(/analytics-gate-classify: (\d+)\/(\d+) pass/);
  assert.ok(summary, `게이트 요약 줄을 찾지 못했다 — 출력 형식이 바뀌었나:\n${out}`);

  const passed = Number(summary[1]);
  const total = Number(summary[2]);
  assert.equal(passed, total, `분류 케이스 ${total - passed}건 실패:\n${out}`);
  assert.ok(
    total >= MIN_CASES,
    `케이스가 ${total}건으로 줄었다(하한 ${MIN_CASES}) — 게이트 공허화:\n${out}`,
  );
  assert.ok(!out.includes("FAIL "), `게이트 출력에 FAIL 이 남아 있다:\n${out}`);
});

// ============================================================================
// 상수 동기화 — 표시 임계(PENDING_STALE_MINUTES)와 서버 자동 대사 임계(STALE_PENDING_MINUTES)
// 가 갈라지면, 화면은 「진행 중」인데 서버는 이미 취소한 주문이 생긴다(병합 26-09-18 실측 60 vs 30).
// 두 모듈은 한쪽이 server-only(prisma)라 import 로 묶을 수 없어 값으로만 맞춘다 → 여기서 대조한다.
// ============================================================================
test("결제 대기 임계: 표시(admin-revenue-constants)와 서버 자동 대사(stale-topup-reconcile)가 같은 값", () => {
  const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const display = read("src/lib/admin-revenue-constants.ts").match(
    /export const PENDING_STALE_MINUTES\s*=\s*(\d+)/,
  );
  const server = read("src/lib/stale-topup-reconcile.ts").match(
    /export const STALE_PENDING_MINUTES\s*=\s*(\d+)/,
  );
  assert.ok(display, "PENDING_STALE_MINUTES 선언을 찾지 못했다(이름이 바뀌었나)");
  assert.ok(server, "STALE_PENDING_MINUTES 선언을 찾지 못했다(이름이 바뀌었나)");
  assert.equal(
    Number(display[1]),
    Number(server[1]),
    `표시 임계 ${display[1]}분 vs 서버 자동 대사 ${server[1]}분 — 한쪽만 바꾸면 화면이 거짓말을 한다`,
  );
});
