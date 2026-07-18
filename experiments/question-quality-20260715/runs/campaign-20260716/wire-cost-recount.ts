/** wire.jsonl 기반 원가 재계산(권위 소스): item별 실청구 usage.cost 합산. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = join(process.cwd(), "experiments/question-quality-20260715/runs/campaign-20260716/batches");
const batchIds = process.argv.slice(2);

for (const batchId of batchIds) {
  const wirePath = join(BASE, batchId, "wire.jsonl");
  if (!existsSync(wirePath)) { console.log(`${batchId}: no wire.jsonl`); continue; }
  const lines = readFileSync(wirePath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const byItem = new Map<string, { usd: number; calls: number; missing: number }>();
  for (const w of lines) {
    const item = w.item ?? "?";
    const cur = byItem.get(item) ?? { usd: 0, calls: 0, missing: 0 };
    cur.calls += 1;
    let cost: number | null = null;
    try {
      const body = JSON.parse(w.response);
      if (typeof body?.usage?.cost === "number") cost = body.usage.cost;
    } catch { /* truncated response */ }
    if (cost === null) cur.missing += 1;
    else cur.usd += cost;
    byItem.set(item, cur);
  }
  console.log(`════ ${batchId} (wire ${lines.length} calls) ════`);
  const armTotals = new Map<string, { usd: number; n: number }>();
  const itemsPath = join(BASE, batchId, "items.jsonl");
  const armOf = new Map<string, string>();
  if (existsSync(itemsPath)) {
    for (const l of readFileSync(itemsPath, "utf8").trim().split("\n")) {
      const it = JSON.parse(l);
      armOf.set(it.itemId, it.armId);
    }
  }
  for (const [item, v] of [...byItem.entries()].sort()) {
    console.log(`  ${item}: ${(v.usd * 1390).toFixed(0)}원 ($${v.usd.toFixed(4)}) calls=${v.calls}${v.missing ? ` missing=${v.missing}` : ""}`);
    const arm = armOf.get(item) ?? "?";
    const at = armTotals.get(arm) ?? { usd: 0, n: 0 };
    at.usd += v.usd; at.n += 1;
    armTotals.set(arm, at);
  }
  for (const [arm, t] of [...armTotals.entries()].sort()) {
    console.log(`  ── ${arm}: 평균 ${(t.usd / t.n * 1390).toFixed(0)}원/item (n=${t.n})`);
  }
}
