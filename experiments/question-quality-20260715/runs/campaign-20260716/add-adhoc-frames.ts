/** jul17 실전 지문(장문 서사·요약문·문장삽입 등 비정형)을 adhoc 프레임으로
 *  코퍼스에 추가한다 — grok 대규모 라운드용. 기존 행은 불변. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = join(process.cwd(), "experiments/question-quality-20260715/runs/campaign-20260716");
const CORPUS = join(BASE, "private/corpus-joined.private.json");
const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { rows: Array<Record<string, unknown>> };

if (corpus.rows.some((r) => String(r.frameId).startsWith("adhoc-prod-"))) {
  console.log("adhoc frames already present — no-op");
  process.exit(0);
}

const batch = JSON.parse(readFileSync(join(BASE, "private/prod-jul17-batch.private.json"), "utf8")) as Array<{
  passage: { id: string; title: string; content: string } | null;
}>;
const seen = new Map<string, { title: string; content: string }>();
for (const b of batch) {
  if (!b.passage?.content) continue;
  if (!seen.has(b.passage.id)) seen.set(b.passage.id, { title: b.passage.title, content: b.passage.content });
}

let i = 0;
for (const [, p] of seen) {
  i += 1;
  const frameId = `adhoc-prod-${String(i).padStart(2, "0")}`;
  corpus.rows.push({
    frameId,
    focusType: "ADHOC",
    split: "adhoc",
    contentHash: createHash("sha256").update(p.content, "utf8").digest("hex"),
    historyClean: false,
    passageText: p.content,
    words: p.content.split(/\s+/).length,
    adhocTitle: p.title,
  });
  console.log(`${frameId}: ${p.title} (${p.content.split(/\s+/).length} words)`);
}
writeFileSync(CORPUS, JSON.stringify(corpus, null, 1), "utf8");
console.log(`added ${i} adhoc frames → total rows ${corpus.rows.length}`);
