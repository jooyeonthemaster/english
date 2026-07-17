/** 캠페인 코퍼스 조인: 빈칸 38 프레임의 지문을 DB에서 읽기 전용 조회 (contentHash 검증 포함) */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const base = path.join(process.cwd(), "experiments", "question-quality-20260715");
  const sel = JSON.parse(fs.readFileSync(path.join(base, "corpus/selected-source-history-v1/private/baseline-20260715-0745-private.json"), "utf8"));
  const gram = JSON.parse(fs.readFileSync(path.join(base, "corpus/cross-type-grammar-source-frame-v2/private/source-frame-private.json"), "utf8"));
  const blank = JSON.parse(fs.readFileSync(path.join(base, "corpus/cross-type-blank-source-frame-v2/private/source-frame-private.json"), "utf8"));
  const hash2text = new Map<string, string>();
  for (const r of gram.rows) if (r.passageText) hash2text.set(r.contentHash, r.passageText);
  const blankByFrame = new Map<string, { sourceRecordId: string; contentHash: string }>(
    blank.rows.map((r: { frameId: string; sourceRecordId: string; contentHash: string }) => [r.frameId, r]),
  );
  const needDb = sel.rows.filter((r: { contentHash: string }) => !hash2text.has(r.contentHash));
  const ids = [...new Set(needDb.map((r: { frameId: string }) => blankByFrame.get(r.frameId)?.sourceRecordId).filter(Boolean))] as string[];
  console.log("DB fetch passages:", ids.length);
  const rows = await prisma.passage.findMany({ where: { id: { in: ids } }, select: { id: true, content: true } });
  const byId = new Map(rows.map((r) => [r.id, r.content]));
  let hashMatched = 0, hashMismatch = 0;
  const joined: Record<string, unknown>[] = [];
  for (const row of sel.rows) {
    let text = hash2text.get(row.contentHash);
    if (!text) {
      const src = blankByFrame.get(row.frameId);
      text = src ? byId.get(src.sourceRecordId) ?? undefined : undefined;
    }
    if (!text) { console.error("MISSING TEXT:", row.frameId); continue; }
    const h1 = crypto.createHash("sha256").update(text).digest("hex");
    const h2 = crypto.createHash("sha256").update(text.trim()).digest("hex");
    if (h1 === row.contentHash || h2 === row.contentHash) hashMatched++; else hashMismatch++;
    joined.push({ frameId: row.frameId, focusType: row.focusType, split: row.split, contentHash: row.contentHash, historyClean: row.historyClean, passageText: text, words: text.split(/\s+/).length });
  }
  console.log("joined:", joined.length, "hashMatched:", hashMatched, "hashMismatch:", hashMismatch);
  const outDir = path.join(base, "runs/campaign-20260716/private");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "corpus-joined.private.json"), JSON.stringify({ schemaVersion: 1, builtAtKst: new Date().toISOString(), rows: joined }, null, 1));
  console.log("written", joined.length);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
