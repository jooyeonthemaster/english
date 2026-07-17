/** 프로덕션 실빈도 조회(읽기 전용): 7/14 품질 대공사 배포 이후 문제생성 잡의
 *  문항당 실청구 원가 분포와 재시도 꼬리를 계측한다. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const since = new Date("2026-07-14T00:00:00+09:00");

  const jobs = await prisma.workbenchAiJob.findMany({
    where: { createdAt: { gte: since }, questionType: { not: null }, status: "COMPLETED" },
    select: { id: true, questionType: true, generationPlan: true, difficulty: true, requestedCount: true, successCount: true, createdAt: true },
  });
  console.log(`completed jobs since 7/14: ${jobs.length}`);
  if (jobs.length === 0) { await prisma.$disconnect(); return; }

  const ids = jobs.map((j) => j.id);
  const costs = await prisma.platformApiUsageCost.findMany({
    where: { sourceId: { in: ids } },
    select: { sourceId: true, costKrw: true, costUsd: true, calls: true, inputTokens: true, outputTokens: true },
  });
  const byJob = new Map<string, { krw: number; calls: number }>();
  for (const c of costs) {
    const cur = byJob.get(c.sourceId) ?? { krw: 0, calls: 0 };
    cur.krw += c.costKrw;
    cur.calls += c.calls;
    byJob.set(c.sourceId, cur);
  }

  type Row = { key: string; perQ: number; callsPerQ: number };
  const rows: Row[] = [];
  for (const j of jobs) {
    const c = byJob.get(j.id);
    if (!c || !j.successCount) continue;
    const key = `${j.generationPlan}/${j.questionType === "GRAMMAR_ERROR" ? "GRAMMAR" : j.questionType === "BLANK_INFERENCE" ? "BLANK" : "OTHER"}`;
    rows.push({ key, perQ: c.krw / j.successCount, callsPerQ: c.calls / j.successCount });
  }
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    (groups.get(r.key) ?? groups.set(r.key, []).get(r.key)!).push(r);
  }
  const pct = (arr: number[], p: number) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  };
  console.log(`\n${"플랜/유형".padEnd(18)} n(문항단위 잡) p50원 p90원 p99원 max원  calls/Q(p50/p90)  >판매가 비율`);
  for (const [key, g] of [...groups.entries()].sort()) {
    const per = g.map((x) => x.perQ);
    const calls = g.map((x) => x.callsPerQ);
    // 판매가: STANDARD 2cr, PREMIUM 4cr × 최저 크레딧단가 73원(엔터프라이즈)
    const sell = key.startsWith("PREMIUM") ? 292 : 146;
    const over = per.filter((v) => v > sell).length;
    console.log(
      `${key.padEnd(18)} ${String(g.length).padStart(5)} ${pct(per, 50).toFixed(0).padStart(5)} ${pct(per, 90).toFixed(0).padStart(5)} ${pct(per, 99).toFixed(0).padStart(5)} ${Math.max(...per).toFixed(0).padStart(5)}  ${pct(calls, 50).toFixed(1)}/${pct(calls, 90).toFixed(1).padStart(4)}      ${(100 * over / g.length).toFixed(1)}% (${over}/${g.length})`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
