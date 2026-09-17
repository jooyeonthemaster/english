// 전 레인 스모크 — 24개 레인 각각에서 프로덕션 프롬프트가 조립되는지, 게이트가 예외 없이 도는지.
// 팬아웃 전에 반드시 통과해야 한다: 레인 하나가 던지면 그 유형 전량(4,537유닛)이 폐기된다.
// 실행: node_modules/.bin/tsx qbank/harness/_smoke-all-lanes.ts

import fs from "node:fs";
import path from "node:path";
import { getMdLane as getRegistryLane, MD_LANE_SUBTYPES } from "../../src/lib/md-qgen/lane-registry";
import { getCanonLane, CANON_SUBTYPES } from "./canon";
import { buildProductionPrompt, buildCtx, gateUnit } from "./qgen-core";

// 등록 레인 24 + 정본 2 = 26유형 전수
const ALL_SUBTYPES = [...MD_LANE_SUBTYPES, ...CANON_SUBTYPES];
const getMdLane = (st: string) => getRegistryLane(st) ?? getCanonLane(st);

const passages = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "src/data/exam-passages/passages.json"), "utf8"),
) as { id: string; text: string; wordCount: number; typeGroup: string; reconstructionKind: string }[];

// 대표 지문 3종 — 짧은 것 / 중간(중앙값) / 장문. 유형 적합성 경계를 함께 본다.
const sorted = [...passages].sort((a, b) => a.wordCount - b.wordCount);
const SAMPLES = [
  { tag: "짧음", p: sorted[Math.floor(sorted.length * 0.02)] },
  { tag: "중앙", p: sorted[Math.floor(sorted.length * 0.5)] },
  { tag: "장문", p: sorted[sorted.length - 3] },
];

console.log("등록 레인:", MD_LANE_SUBTYPES.length, "종\n");
for (const s of SAMPLES) console.log(`  ${s.tag}: ${s.p.id} (${s.p.wordCount}단어, ${s.p.typeGroup})`);
console.log("");

const rows: {
  subType: string;
  promptOk: boolean;
  promptLen: number;
  extras: number;
  eligible: boolean;
  gateRuns: boolean;
  operationType: string;
  retryEligible: boolean;
  err?: string;
}[] = [];

let hardFail = 0;

for (const subType of ALL_SUBTYPES) {
  const lane = getMdLane(subType)!;
  const row = {
    subType,
    promptOk: false,
    promptLen: 0,
    extras: 0,
    eligible: false,
    gateRuns: false,
    operationType: lane.operationType,
    retryEligible: lane.retryEligible,
    err: undefined as string | undefined,
  };
  const p = SAMPLES[1].p;
  try {
    const ctx = buildCtx({ subType, passage: p.text, difficulty: "KILLER" });
    row.eligible = lane.isEligible(ctx.resolved);
    const built = buildProductionPrompt({ subType, passage: p.text, difficulty: "KILLER" });
    if (built.ok) {
      row.promptOk = true;
      row.promptLen = built.prompt.length;
      row.extras = built.extras.length;
    } else {
      row.err = built.error;
    }
  } catch (e) {
    row.err = "프롬프트 예외: " + (e as Error).message;
  }

  // 게이트가 쓰레기 입력에도 예외 없이 "차단"을 반환하는지 (throw 하면 팬아웃이 죽는다)
  try {
    const r = gateUnit({
      subType,
      passageId: p.id,
      passage: p.text,
      source: "<!-- ITEM 1\ndifficulty: KILLER\npoint: 스모크\n-->\n의도적으로 형식을 지키지 않은 쓰레기 입력",
      minItems: 1,
    });
    row.gateRuns = true;
    if (r.ok) {
      row.err = (row.err ? row.err + " | " : "") + "⚠ 쓰레기 입력이 통과했다(게이트 무력)";
      hardFail += 1;
    }
  } catch (e) {
    row.err = (row.err ? row.err + " | " : "") + "게이트 예외: " + (e as Error).message;
    hardFail += 1;
  }

  if (!row.promptOk) hardFail += 1;
  rows.push(row);
}

console.log("subType".padEnd(28), "프롬프트".padEnd(10), "extras", "적격", "게이트", "과금");
console.log("─".repeat(92));
for (const r of rows) {
  console.log(
    r.subType.padEnd(28),
    (r.promptOk ? String(r.promptLen) + "자" : "실패").padEnd(10),
    String(r.extras).padEnd(6),
    (r.eligible ? "O" : "X").padEnd(4),
    (r.gateRuns ? "O" : "X").padEnd(6),
    r.operationType,
    r.err ? "  ← " + r.err.slice(0, 90) : "",
  );
}

const outPath = path.join(process.cwd(), "qbank/spec/lane-smoke.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), samples: SAMPLES.map((s) => ({ tag: s.tag, id: s.p.id, wordCount: s.p.wordCount })), rows }, null, 2));

console.log(`\n레인 ${rows.length}종 · 하드실패 ${hardFail}건`);
console.log("→", outPath);
if (hardFail > 0) process.exit(1);
