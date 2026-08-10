// O210 전수 스윕 1단계: 미판정 지문 전량을 스크리너 샤드 파일로 굽는다.
// 대상 (a) passages 영어 미판정 (b) ExtractionItem.PASSAGE_BODY 전량
// 각 샤드 = 지문 12개. 스크리너 에이전트 1개가 샤드 1개를 읽고 결함 후보만 뱉는다.
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import("file:///" + root + "/node_modules/@prisma/client/default.js");
const prisma = new PrismaClient();

const DIR = path.join(root, "experiments/question-quality-20260715/db-audit/campaign-20260721");
const SHARD_DIR = path.join(DIR, "sweep-shards");
fs.rmSync(SHARD_DIR, { recursive: true, force: true });
fs.mkdirSync(SHARD_DIR, { recursive: true });

const groups = JSON.parse(fs.readFileSync(path.join(DIR, "groups-final.json"), "utf8"));
const examined = new Set(groups.flatMap((g) => g.memberIds));

const wordCount = (c) => (c.match(/[A-Za-z]+/g) || []).length;

// ── (a) passages 미판정 ──
const passages = await prisma.passage.findMany({
  select: { id: true, title: true, tags: true, subject: true, content: true },
});
const pRows = passages
  .filter((p) => p.subject !== "KOREAN" && !examined.has(p.id) && wordCount(p.content) >= 60)
  .map((p) => ({ src: "passage", id: p.id, title: p.title, content: p.content }));

// ── (b) ExtractionItem PASSAGE_BODY ──
const items = await prisma.extractionItem.findMany({
  where: { blockType: "PASSAGE_BODY" },
  select: { id: true, title: true, content: true, rawText: true, examMeta: true, status: true },
});
const eRows = items
  .filter((e) => wordCount(e.content || "") >= 60)
  .map((e) => ({
    src: "extraction",
    id: e.id,
    title: e.title || (e.examMeta ? JSON.stringify(e.examMeta).slice(0, 60) : ""),
    content: e.content,
  }));

console.log(`passages 미판정 실지문: ${pRows.length}`);
console.log(`ExtractionItem PASSAGE_BODY 실지문: ${eRows.length}`);

// ── 내용 중복 제거(같은 지문 여러 사본은 1개만 스크리닝) ──
const norm = (c) => c.replace(/[^A-Za-z]+/g, " ").toLowerCase().trim().replace(/\s+/g, " ");
const seen = new Map(); // normalized full text -> representative
const dupes = new Map(); // repIndex -> [ids]
const uniq = [];
for (const r of [...pRows, ...eRows]) {
  const k = norm(r.content).slice(0, 400);
  if (seen.has(k)) {
    dupes.get(seen.get(k)).push(`${r.src}:${r.id}`);
    continue;
  }
  seen.set(k, uniq.length);
  dupes.set(uniq.length, [`${r.src}:${r.id}`]);
  uniq.push(r);
}
console.log(`내용 dedup 후 고유 지문: ${uniq.length} (사본 포함 총 ${pRows.length + eRows.length}행)`);

// ── 샤드 굽기 ──
const PER = 12;
const manifest = [];
for (let i = 0; i < uniq.length; i += PER) {
  const chunk = uniq.slice(i, i + PER);
  const sid = `S${String(manifest.length + 1).padStart(3, "0")}`;
  let md = `# SHARD ${sid} — ${chunk.length} passages\n\n각 지문을 독립적으로 검사하라. 지문 번호(P1, P2 …)로 결과를 보고한다.\n\n`;
  chunk.forEach((r, j) => {
    md += `## P${j + 1}  [${r.src}] ${r.id}\n`;
    if (r.title) md += `title: ${String(r.title).slice(0, 80)}\n`;
    md += "```\n" + r.content.trim() + "\n```\n\n";
  });
  fs.writeFileSync(path.join(SHARD_DIR, `${sid}.md`), md);
  manifest.push({
    shard: sid,
    path: `experiments/question-quality-20260715/db-audit/campaign-20260721/sweep-shards/${sid}.md`,
    n: chunk.length,
    keys: chunk.map((r, j) => ({ p: `P${j + 1}`, src: r.src, id: r.id, copies: dupes.get(i + j) })),
  });
}
fs.writeFileSync(path.join(DIR, "sweep-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n샤드 ${manifest.length}개 생성 (지문 ${PER}개/샤드)`);
console.log(`총 사본 커버리지: ${[...dupes.values()].reduce((s, a) => s + a.length, 0)}행`);
await prisma.$disconnect();
