// adaptive-poll 의 2가지 증분 계약 검증(26-08-18 — "다 만들어졌는데 큐가 안 사라진다" 대응).
//
//  ① idleMs 를 **함수**로 줄 수 있고, 그 상한이 **매 틱 다시 적용**된다.
//     유휴 중 늘어난 delay(예: 320ms)가 작업 시작 후에도 그대로 남으면, 낮아진
//     상한이 다음 백오프까지 효력이 없어 "끝난 작업이 화면에 남는" 시간이 그만큼
//     길어진다. 실제 결선에서 이 값이 5분 vs 20초의 차이다.
//  ② 반환 핸들의 bump() 가 즉시 1회 폴한다(+빠른 주기 복귀). 발사 직후처럼
//     "서버 서명은 아직 그대로지만 확인이 필요한" 순간의 유일한 수단이다.
//
// 타이밍 테스트라 허용오차를 넉넉히 잡는다(단정은 "상한을 넘지 않는다" 방향만).
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as adaptivePollModule from "@/lib/adaptive-poll";
// tsx 의 CJS 상호운용 — 다른 하네스(tests/unit/clipboard-passage)와 같은 관용구.
const mod: any =
  (adaptivePollModule as any).default ??
  (adaptivePollModule as any)["module.exports"] ??
  adaptivePollModule;
const { startAdaptivePoll } = mod;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 상수 idleMs — 서명이 안 변하면 백오프가 상한에서 멈춘다. */
async function staticCap() {
  const times: number[] = [];
  const t0 = Date.now();
  const stop = startAdaptivePoll({
    activeMs: 20,
    idleMs: 100,
    run: async () => {
      times.push(Date.now() - t0);
      return "same";
    },
  });
  await sleep(700);
  stop();
  return times;
}

/** 함수 idleMs — 도중에 상한이 낮아지면 그 뒤 주기가 상한 안으로 들어온다. */
async function dynamicCap() {
  let active = false;
  const times: number[] = [];
  const t0 = Date.now();
  const stop = startAdaptivePoll({
    activeMs: 20,
    idleMs: () => (active ? 60 : 5_000),
    run: async () => {
      times.push(Date.now() - t0);
      return "same";
    },
  });
  await sleep(220); // 여기까지 백오프로 delay 가 상한(5s) 쪽으로 자란다
  active = true;
  const flipAt = Date.now() - t0;
  await sleep(500);
  stop();
  return { times, flipAt };
}

/** bump() — 오래 자고 있던 루프를 즉시 깨운다. */
async function bumpWakesLoop() {
  const times: number[] = [];
  const t0 = Date.now();
  const stop = startAdaptivePoll({
    activeMs: 20,
    idleMs: 5_000,
    run: async () => {
      times.push(Date.now() - t0);
      return "same";
    },
  });
  await sleep(300); // 다음 tick 은 한참 뒤로 예약된 상태
  const beforeCount = times.length;
  const bumpAt = Date.now() - t0;
  stop.bump();
  await sleep(80);
  const afterCount = times.length;
  stop();
  return { times, beforeCount, afterCount, bumpAt };
}

const out = {
  staticCap: await staticCap(),
  dynamicCap: await dynamicCap(),
  bump: await bumpWakesLoop(),
};
console.log(JSON.stringify(out));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".adaptive-poll-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw.trim().split("\n").pop());
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      /* ignore */
    }
  }
}

const r = runHarness();

const gaps = (times) => times.slice(1).map((t, i) => t - times[i]);

test("상수 idleMs: 백오프가 상한에서 멈춘다", () => {
  const g = gaps(r.staticCap);
  assert.ok(r.staticCap.length >= 5, `폴 횟수 부족: ${JSON.stringify(r.staticCap)}`);
  // 상한 100ms + 타이머/실행 오차. 상한을 무시하고 계속 배가되면 여기서 깨진다.
  assert.ok(
    g.every((x) => x <= 220),
    `상한 초과 간격: ${JSON.stringify(g)}`,
  );
});

test("함수 idleMs: 상한이 낮아지면 이후 주기가 상한 안으로 들어온다", () => {
  const { times, flipAt } = r.dynamicCap;
  const after = times.filter((t) => t > flipAt);
  // 상한이 5s 로 계속 남았다면 flip 이후 500ms 창에서 폴이 1회도 어렵다.
  assert.ok(
    after.length >= 3,
    `상한 하향이 반영되지 않음(폴 ${after.length}회): ${JSON.stringify(times)}`,
  );
  const tailGaps = gaps(after).slice(-2);
  assert.ok(
    tailGaps.every((x) => x <= 180),
    `상한(60ms) 대비 간격 과대: ${JSON.stringify(tailGaps)}`,
  );
  // 하한도 본다 — 함수 idleMs 를 숫자로만 다루던 구현에서는 Math.min(delay*2, fn)
  // 이 NaN 이 돼 setTimeout(NaN)=즉시가 되고, 폴이 폭주하면서 "간격이 작다"는
  // 위 단정만 우연히 통과한다(가짜 GREEN 차단).
  assert.ok(
    tailGaps.every((x) => x >= 10),
    `백오프가 붕괴(폭주): ${JSON.stringify(tailGaps)}`,
  );
});

test("bump(): 자고 있던 루프를 즉시 깨운다", () => {
  const { times, beforeCount, afterCount, bumpAt } = r.bump;
  assert.ok(
    afterCount > beforeCount,
    `bump 후 폴이 없었다: ${JSON.stringify(times)}`,
  );
  const woken = times[beforeCount];
  assert.ok(
    woken - bumpAt <= 60,
    `bump 반응이 느리다(${woken - bumpAt}ms): ${JSON.stringify(times)}`,
  );
});
