// 채점 전처리 — 블라인드화(오염 차단). results.jsonl → blind-items.jsonl + keymap.json
// 무결성 계약:
//  - 채점자에게 가는 아티팩트에는 암/모델/원가/시간/사다리 메타를 절대 싣지 않는다.
//  - 블라인드 ID 는 결정적 셔플(seed 고정) — 재실행해도 동일 매핑(재현성).
//  - keymap.json 은 채점 완료 후 조인 전용 — 채점 프롬프트에 노출 금지.
//  - 내부 메타(_ 접두)·설계 필드는 제거하되, 전 암 동일 규칙으로 제거한다(형상 동등).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 동일 키 재실행분은 마지막 행이 유효(타임아웃 정정 후 재실행 지원).
const byKey = new Map();
for (const l of fs.readFileSync(path.join(HERE, "results.jsonl"), "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(l);
  if (r.skipped) continue;
  byKey.set(`${r.arm}:${r.model}:${r.p}:${r.qtype}`, r);
}
const rows = [...byKey.values()].filter((r) => r.item);

const corpus = JSON.parse(fs.readFileSync(path.join(HERE, "..", "hg5-standard-spec", "hg3-corpus.json"), "utf8"));
const passageByIdx = new Map(corpus.map((p) => [p.idx, p]));

// 채점 대상 표면: 학생/검수자가 보는 필드 + 설계 검증에 필요한 축자 필드.
// 설계 메모(blankDesign·errorDesign·answerDesign)는 "의도 서술" 이라 암 간 문체
// 차이가 새어나갈 수 있어 전 암 공통 제거(형상 동등 원칙).
const DROP_KEYS = new Set(["blankDesign", "errorDesign", "answerDesign", "difficulty"]);
function sanitize(item) {
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (k.startsWith("_") || DROP_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// 결정적 셔플(seed 고정)
const SEED = "craft-ab-20260721";
function shuffleKey(r) {
  return crypto.createHash("sha256").update(`${SEED}:${r.arm}:${r.model}:${r.p}:${r.qtype}`).digest("hex");
}
rows.sort((a, b) => shuffleKey(a).localeCompare(shuffleKey(b)));

const blind = [];
const keymap = [];
rows.forEach((r, i) => {
  const bid = `T${String(i + 1).padStart(3, "0")}`;
  blind.push({
    bid,
    qtype: r.qtype,
    passage: passageByIdx.get(r.p)?.content ?? "",
    item: sanitize(r.item),
  });
  keymap.push({ bid, arm: r.arm, model: r.model, p: r.p, qtype: r.qtype, ok: r.ok, wallMs: r.wallMs, costUsd: r.costUsd, review: r.review?.status ?? null, adopted: r.review?.adopted ?? null });
});

fs.writeFileSync(path.join(HERE, "blind-items.jsonl"), blind.map((b) => JSON.stringify(b)).join("\n") + "\n");
fs.writeFileSync(path.join(HERE, "keymap.json"), JSON.stringify(keymap, null, 1));
console.log(`blind items: ${blind.length} | keymap rows: ${keymap.length}`);
const byArm = {};
for (const k of keymap) { const key = `${k.arm}×${k.model}×${k.qtype}`; byArm[key] = (byArm[key] ?? 0) + 1; }
console.log(JSON.stringify(byArm, null, 1));
