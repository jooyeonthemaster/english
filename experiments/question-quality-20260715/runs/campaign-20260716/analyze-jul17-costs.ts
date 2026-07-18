/** 7/17 배치 원가 구조 분해: 셀별 통계 + 잡별 콜 이벤트(모델/용도) + E-gate 흔적. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = join(process.cwd(), "experiments/question-quality-20260715/runs/campaign-20260716");
const batch = JSON.parse(readFileSync(join(BASE, "private/prod-jul17-batch.private.json"), "utf8")) as Array<{
  job: {
    id: string; status: string; plan: string; type: string; difficulty: string;
    costKrw: number; costUsd: number; calls: number; inputTokens: number; outputTokens: number;
    costEvents: Array<{ detail: string; model: string; krw: number; usd: unknown; calls: number; inTok: number; outTok: number; metadata: unknown }>;
    timing?: Record<string, unknown>;
  };
  questions: Array<Record<string, unknown>>;
}>;

const done = batch.filter((b) => b.job.status === "COMPLETED");
const cells = new Map<string, typeof done>();
for (const b of done) {
  const k = `${b.job.plan}/${b.job.type}`;
  (cells.get(k) ?? cells.set(k, []).get(k)!).push(b);
}

console.log("=== 셀별 요약 (KILLER, 문항 1개/잡) ===");
const sell = (plan: string) => (plan === "PREMIUM" ? "292~528" : "146~264");
for (const [k, g] of [...cells.entries()].sort()) {
  const costs = g.map((b) => b.job.costKrw).sort((a, b) => a - b);
  const calls = g.map((b) => b.job.calls).sort((a, b) => a - b);
  const attempts = g.map((b) => Number(b.job.timing?.generationAttempts ?? 0));
  const med = costs[Math.floor(costs.length / 2)]!;
  const over146 = costs.filter((c) => c > (k.startsWith("PREMIUM") ? 292 : 146)).length;
  console.log(`${k.padEnd(26)} n=${g.length} cost 중앙 ${med}원 범위 ${costs[0]}~${costs[costs.length - 1]}원 | calls ${calls[0]}~${calls[calls.length - 1]} | attempts ${JSON.stringify(attempts)} | 판매가 ${sell(b0(k))}원 최저가초과 ${over146}/${g.length}`);
}
function b0(k: string) { return k.split("/")[0]!; }

console.log("\n=== 잡별 콜 이벤트 분해 ===");
for (const b of done) {
  const t = b.job.timing ?? {};
  console.log(`\n${b.job.plan}/${b.job.type} ${b.job.costKrw}원 calls=${b.job.calls} attempts=${t.generationAttempts} genMs=${t.generationMs} job=${b.job.id}`);
  for (const e of b.job.costEvents) {
    const md = (typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata) as Record<string, unknown> | null;
    console.log(`  ${e.detail} ${e.model} ${e.krw}원 in/out=${e.inTok}/${e.outTok} calls=${e.calls} qualityMode=${md?.qualityMode ?? "?"} attempts=${md?.attempts ?? "?"}`);
  }
  for (const q of b.questions) {
    const sd = typeof q.structuredData === "string" ? JSON.parse(q.structuredData as string) : (q.structuredData as Record<string, unknown>) ?? {};
    const warn = sd._qualityWarnings;
    if (warn) console.log(`  Q warnings: ${JSON.stringify(warn).slice(0, 400)}`);
    if (sd._explanationRepaired) console.log(`  Q explanationRepaired: true`);
    if (sd._reviewRecommended) console.log(`  Q reviewRecommended: ${JSON.stringify(sd._reviewRecommended).slice(0, 200)}`);
  }
}
