// 전역 동시성 governor — 여러 풀이 같은 기계를 나눠 쓴다.
//
// 왜 필요한가(실전 사고 26-07-28): 풀 4개를 각각 concurrency 5·15·8·10 으로 띄웠더니
// 합계가 38 이 되어 **codex 79 프로세스 · node 192 · CPU 100% · 여유메모리 1.8GB** 로 스래싱했다.
// `tasklist` 한 번이 120초를 넘겼다. 각 풀은 자기 상한만 지켰고, **아무도 합계를 보지 않았다.**
//
// ⚠ 1차 구현은 `tasklist` 로 프로세스를 셌는데 **부하가 높을 때 바로 타임아웃**했다(실측 `running:-1`).
//   즉 계기가 가장 필요한 순간에 정확히 고장 나는 설계였다. 부하와 무관하게 동작해야 하므로
//   **파일 기반 카운터**로 바꿨다 — 디렉토리 엔트리 수를 세는 것은 CPU 포화와 무관하게 빠르다.
//
// 사용:
//   import { acquireSlot } from "./slots.mjs";
//   const slot = await acquireSlot({ label: "TITLE@q20" });
//   try { ...작업... } finally { slot.release(); }
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const SLOT_DIR = path.join(ROOT, "qbank/.slots");

/**
 * 상한은 코어 수에서 유도한다 — 숫자를 손으로 박으면 다른 기계에서 다시 터진다.
 * codex 는 대부분 네트워크 대기라 코어보다 많이 띄울 수 있지만, 각자가 게이트(node)를
 * 부르는 순간 CPU 를 문다. 실측상 12코어에서 38기(3.2배)는 스래싱, 18기(1.5배)는 안정이었다.
 */
const CORES = os.cpus().length;
export const SLOT_CAP = Number(process.env.QBANK_SLOT_CAP || Math.max(4, Math.floor(CORES * 1.5)));

/** 죽은 워커가 남긴 락은 이 시간이 지나면 무시한다(하트비트 갱신이 멈춘 것으로 본다). */
const STALE_MS = 90_000;
const HEARTBEAT_MS = 30_000;

const ensureDir = () => fs.mkdirSync(SLOT_DIR, { recursive: true });

/** 살아 있는 락 수. 만료된 락은 지나가는 길에 청소한다. */
function liveCount() {
  ensureDir();
  const now = Date.now();
  let n = 0;
  for (const f of fs.readdirSync(SLOT_DIR)) {
    const p = path.join(SLOT_DIR, f);
    try {
      const st = fs.statSync(p);
      if (now - st.mtimeMs > STALE_MS) { fs.unlinkSync(p); continue; }
      n++;
    } catch { /* 경합으로 사라진 파일 — 무시 */ }
  }
  return n;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 여유 슬롯이 생길 때까지 대기하고 락을 잡는다.
 * 반환된 객체의 `release()` 를 **반드시 finally 에서** 부르라 — 안 부르면 만료까지 슬롯이 묶인다
 * (그래도 STALE_MS 후 자동 회수되므로 영구 누수는 없다).
 */
export async function acquireSlot({ label = "" } = {}) {
  ensureDir();
  let waited = 0;
  for (;;) {
    if (liveCount() < SLOT_CAP) break;
    if (waited % 60_000 === 0) {
      console.log(`[slots] 대기 ${Math.round(waited / 1000)}초 — ${liveCount()}/${SLOT_CAP} 사용 중${label ? ` (${label})` : ""}`);
    }
    await sleep(5000);
    waited += 5000;
  }
  const id = `${process.pid}-${Math.round(performance.now() * 1000)}-${label.replace(/[^\w.@-]/g, "_")}`;
  const file = path.join(SLOT_DIR, id);
  fs.writeFileSync(file, String(process.pid));
  const hb = setInterval(() => {
    try { fs.utimesSync(file, new Date(), new Date()); } catch { /* 이미 해제됨 */ }
  }, HEARTBEAT_MS);
  hb.unref?.();
  let released = false;
  return {
    waitedMs: waited,
    release() {
      if (released) return;
      released = true;
      clearInterval(hb);
      try { fs.unlinkSync(file); } catch { /* 이미 없음 */ }
    },
  };
}

export function slotStatus() {
  return { cap: SLOT_CAP, running: liveCount(), cores: CORES, dir: path.relative(ROOT, SLOT_DIR) };
}

// CLI: node qbank/harness/slots.mjs  → 현재 상태 출력
// ⚠ `node -e "import(...)"` 로 불릴 때는 argv[1] 이 없다 — 그래서 존재 확인이 먼저다.
//   URL 전문 비교는 Windows 에서 드라이브 문자 대소문자(D: vs d:) 때문에 안 맞는다(실측). 파일명으로 판정한다.
if (process.argv[1] && /[\\/]slots\.mjs$/.test(process.argv[1])) {
  console.log(JSON.stringify(slotStatus(), null, 1));
}
