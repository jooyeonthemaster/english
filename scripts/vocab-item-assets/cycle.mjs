// ============================================================================
// 문항 자산 캠페인 — 게이트-클린 사이클 러너
//
// 정성 패널 확정 수리안: "생성→게이트→격리→재생성 루프가 critical 0 상태로만
// 종료되게 하라." 팩이 게이트를 안 거친 채 쌓이는 원자성 구멍(전량 런 실측:
// 193팩 미게이트 적치)의 봉인.
//
//   node scripts/vocab-item-assets/cycle.mjs [--dir packs] [--max 4] [--concurrency 12]
//
// 종료 코드 0 = 전 팩 게이트-클린. 루프 상한 도달 시 잔여는 quarantine.jsonl에
// 남는다(Claude 에이전트 레인 인계 대상 — 주로 기능어 거인).
// ============================================================================
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DIR = opt("dir", "experiments/vocab-item-assets/packs");
const MAX = Number(opt("max", 4));
const CONC = opt("concurrency", "12");

const run = (script, extra) => {
  const r = spawnSync("node", [`scripts/vocab-item-assets/${script}`, ...extra], {
    stdio: ["ignore", "pipe", "pipe"], encoding: "utf8",
  });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  return { code: r.status, out };
};

for (let round = 1; round <= MAX; round++) {
  // 결정론 교정 먼저 — luna 재롤은 비수렴 실측(168→180)이라 교정 잔여만 재생성한다
  console.log(`\n━━ 사이클 ${round}/${MAX} — 결정론 교정 ━━`);
  const rp = run("repair.mjs", ["--dir", DIR]);
  console.log(rp.out.trim().split("\n").slice(-2).join("\n"));

  console.log(`━━ 사이클 ${round}/${MAX} — 게이트 ━━`);
  const g = run("gate.mjs", ["--dir", DIR, "--quarantine"]);
  console.log(g.out.trim().split("\n").slice(-4).join("\n"));

  // 격리분(.rejected.json)에서 철자 회수 — 파일명은 손실 인코딩이라 JSON 내부가 정본
  const rejected = fs.readdirSync(DIR).filter((f) => f.endsWith(".rejected.json"));
  if (!rejected.length) {
    console.log(`\n✅ 게이트-클린 달성 (round ${round})`);
    process.exit(0);
  }
  const spellings = [...new Set(rejected.map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).spelling; }
    catch { return null; }
  }).filter(Boolean))];
  // 재생성 전 rejected 잔재 제거(멱등 스킵과 무관하지만 디렉터리 위생)
  for (const f of rejected) fs.unlinkSync(path.join(DIR, f));

  console.log(`━━ 사이클 ${round} — 재생성 ${spellings.length}철자 ━━`);
  const listFile = path.join(DIR, `.cycle-${round}.txt`);
  fs.writeFileSync(listFile, spellings.join("\n"));
  const gen = run("generate.mjs", ["--file", listFile, "--out", DIR, "--concurrency", CONC]);
  console.log(gen.out.trim().split("\n").slice(-3).join("\n"));
  fs.unlinkSync(listFile);
}

console.log(`\n⚠ 루프 상한(${MAX}) 도달 — 최종 교정+게이트로 잔여 확정`);
run("repair.mjs", ["--dir", DIR]);
const fin = run("gate.mjs", ["--dir", DIR, "--quarantine"]);
console.log(fin.out.trim().split("\n").slice(-4).join("\n"));
const left = fs.readdirSync(DIR).filter((f) => f.endsWith(".rejected.json"));
console.log(`잔여 불합격 ${left.length}팩 → Claude 레인 인계(quarantine.jsonl)`);
process.exit(left.length ? 2 : 0);
