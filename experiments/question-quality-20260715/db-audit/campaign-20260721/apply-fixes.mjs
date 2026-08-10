// 캠페인 3단계: 확정 오염 일괄 수정 — 백업 → \b 1회 검증 치환 → 잔존 0 재검증
// 사용: node apply-fixes.mjs <confirmed-fixes.json> [--dry]
// confirmed-fixes.json: [{groupId, examSig, plantedText, correctedText, plantedExcerpt}]
// 대상 행은 groups-final.json 의 memberIds (앵커 확장 포함 전 사본).
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import(
  "file:///" + root + "/node_modules/@prisma/client/default.js"
);
const prisma = new PrismaClient();

const DIR = path.join(root, "experiments/question-quality-20260715/db-audit/campaign-20260721");
const fixesPath = process.argv[2];
const DRY = process.argv.includes("--dry");
if (!fixesPath) { console.error("usage: node apply-fixes.mjs <confirmed-fixes.json> [--dry]"); process.exit(1); }
const fixes = JSON.parse(fs.readFileSync(fixesPath, "utf8"));
const groups = JSON.parse(fs.readFileSync(path.join(DIR, "groups-final.json"), "utf8"));
const byId = new Map(groups.map((g) => [g.groupId, g]));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 타이포그래피 변종 관용: 따옴표·대시·소프트하이픈은 사본마다 다르다
const TYPO = [
  [/['‘’ʼ]/g, "['‘’ʼ]"],
  [/["“”]/g, '["“”]'],
  [/[-‐‑‒–—―−]/g, "[-‐‑‒–—―−]"],
];
function typoTolerant(escaped) {
  let out = escaped;
  for (const [re, cls] of TYPO) out = out.replace(re, cls);
  return out;
}
// 단어 경계: 앞뒤가 영문자가 아니어야 함 (구두점 포함 구절도 지원)
const wordRe = (t, flags = "g") =>
  new RegExp(`(?<![A-Za-z])${typoTolerant(esc(t))}(?![A-Za-z])`, flags);
// 발췌 관용 매칭: 공백/개행/원형숫자/소프트하이픈 허용
const excerptRe = (ex) => {
  const tokens = ex.replace(/[­​]/g, "").replace(/[①-⑳]/g, " ").trim()
    .split(/\s+/).map((t) => typoTolerant(esc(t)));
  return new RegExp(tokens.join("(?:[\\s\\u00AD\\u200B]|[①-⑳])+"), "g");
};
const count = (content, re) => (content.match(re) || []).length;

const backup = [];
const report = [];
// 행 단위 작업장: 같은 행에 fix 여러 건이 걸려도 working content 위에 체이닝 (덮어쓰기 방지)
const workspace = new Map(); // id -> {row, working, applied: [{plantedText, correctedText, how, oldCount}]}

for (const fix of fixes) {
  const g = byId.get(fix.groupId);
  if (!g) { report.push({ groupId: fix.groupId, status: "GROUP_NOT_FOUND" }); continue; }
  const rows = await prisma.passage.findMany({
    where: { id: { in: g.memberIds } },
    select: { id: true, academyId: true, title: true, content: true, updatedAt: true },
  });
  for (const row of rows) {
    const ws = workspace.get(row.id) || { row, working: row.content, applied: [] };
    const wordHits = count(ws.working, wordRe(fix.plantedText));
    // ⚠ 항상 발췌 구간에 앵커링한다. 행 전체 단어 카운트만 믿으면, 이미 깨끗한 사본에
    //   같은 흔한 단어가 다른 자리에 있을 때 그 자리를 오손한다(G040 "more" 판례).
    const spans = [...ws.working.matchAll(excerptRe(fix.plantedExcerpt))];
    if (spans.length === 0) {
      report.push({
        groupId: fix.groupId, id: row.id,
        status: wordHits > 0 ? "NO_DEFECT_SPAN(word elsewhere — untouched)" : "ALREADY_CLEAN",
        wordHits,
      });
      continue;
    }
    if (spans.length > 1) {
      report.push({ groupId: fix.groupId, id: row.id, status: "SKIP_EXCERPT_AMBIGUOUS", excerptHits: spans.length });
      continue;
    }
    const span = spans[0][0];
    const inSpan = count(span, wordRe(fix.plantedText));
    if (inSpan !== 1) {
      report.push({ groupId: fix.groupId, id: row.id, status: "SKIP_WORD_NOT_1_IN_SPAN", inSpan, wordHits });
      continue;
    }
    const fixedSpan = span.replace(wordRe(fix.plantedText, ""), fix.correctedText);
    const newContent = ws.working.replace(span, fixedSpan);
    const how = `excerpt-anchored(row-wide word x${wordHits})`;
    ws.working = newContent;
    ws.applied.push({ groupId: fix.groupId, plantedText: fix.plantedText, correctedText: fix.correctedText, how, oldCount: wordHits });
    workspace.set(row.id, ws);
  }
}

const planned = [...workspace.values()]
  .filter((ws) => ws.applied.length > 0)
  .map((ws) => ({
    id: ws.row.id, groupId: ws.applied[0].groupId, title: ws.row.title, academyId: ws.row.academyId,
    how: ws.applied.map((a) => `${a.how}:"${a.plantedText}"→"${a.correctedText}"`).join(" + "),
    oldCount: ws.applied.reduce((s, a) => s + a.oldCount, 0),
    plantedText: ws.applied[0].plantedText, correctedText: ws.applied[0].correctedText,
    fixCount: ws.applied.length,
    contentBefore: ws.row.content, contentAfter: ws.working,
  }));

console.log(`\n=== PLAN (${DRY ? "DRY-RUN" : "LIVE"}): ${planned.length} row fixes across ${new Set(planned.map((p) => p.groupId)).size} groups ===`);
// 실제 변경 지점을 before/after 공통 접두·접미로 산출 — 첫 단어 출현 위치가 아니라 진짜 바뀐 자리
function diffContext(before, after, pad = 55) {
  let s = 0;
  while (s < before.length && s < after.length && before[s] === after[s]) s++;
  let e = 0;
  while (e < before.length - s && e < after.length - s && before[before.length - 1 - e] === after[after.length - 1 - e]) e++;
  const bMid = before.slice(s, before.length - e);
  const aMid = after.slice(s, after.length - e);
  const pre = before.slice(Math.max(0, s - pad), s).replace(/\s+/g, " ");
  const post = before.slice(before.length - e, before.length - e + pad).replace(/\s+/g, " ");
  return { pre, post, bMid: bMid.replace(/\s+/g, " "), aMid: aMid.replace(/\s+/g, " ") };
}
for (const p of planned) {
  const d = diffContext(p.contentBefore, p.contentAfter);
  console.log(`${p.groupId} ${p.id} [${p.how}]`);
  console.log(`    …${d.pre}⟦${d.bMid} ⇒ ${d.aMid}⟧${d.post}…`);
}
for (const r of report) console.log(`NOTE ${r.groupId} ${r.id || ""} ${r.status} ${JSON.stringify({ ...r, groupId: undefined, id: undefined, status: undefined })}`);

if (DRY) {
  console.log("\nDRY-RUN — no writes performed.");
  await prisma.$disconnect();
  process.exit(0);
}

// ── 백업 (쓰기 전) ──
for (const p of planned) {
  backup.push({ id: p.id, title: p.title, academyId: p.academyId, groupId: p.groupId, contentBefore: p.contentBefore, fixes: p.how });
}
const backupPath = path.join(root, "experiments/question-quality-20260715/passage-fix-backup-20260721-campaign.json");
// 기존 백업 파일이 있으면 병합(append) — 덮어쓰기 금지
let existing = [];
if (fs.existsSync(backupPath)) existing = JSON.parse(fs.readFileSync(backupPath, "utf8"));
fs.writeFileSync(backupPath, JSON.stringify([...existing, ...backup], null, 2));
console.log(`\nbackup written: +${backup.length} rows -> ${path.basename(backupPath)} (total ${existing.length + backup.length})`);

// ── 적용 ──
let applied = 0;
for (const p of planned) {
  await prisma.passage.update({ where: { id: p.id }, data: { content: p.contentAfter } });
  applied++;
}
console.log(`applied: ${applied} rows`);

// ── 재검증: 수정 행 재조회 + 그룹 전체 잔존 스캔 ──
const appliedIndex = new Map(); // groupId|plantedText -> Set(rowIds)
for (const ws of workspace.values()) {
  for (const a of ws.applied) {
    const k = `${a.groupId}|${a.plantedText}`;
    if (!appliedIndex.has(k)) appliedIndex.set(k, new Set());
    appliedIndex.get(k).add(ws.row.id);
  }
}
let bad = 0;
for (const fix of fixes) {
  const g = byId.get(fix.groupId);
  if (!g) continue;
  const rows = await prisma.passage.findMany({
    where: { id: { in: g.memberIds } },
    select: { id: true, content: true },
  });
  const fixedIds = appliedIndex.get(`${fix.groupId}|${fix.plantedText}`) || new Set();
  let residual = 0;
  for (const row of rows) {
    if (!fixedIds.has(row.id)) continue;
    const c = count(row.content, wordRe(fix.plantedText));
    if (c > 0) { console.log(`✗ RESIDUAL ${fix.groupId} ${row.id}: "${fix.plantedText}" still x${c}`); residual += c; bad++; }
    if (!row.content.includes(fix.correctedText.trim())) { console.log(`✗ MISSING-CORRECTION ${fix.groupId} ${row.id}`); bad++; }
  }
  console.log(`VERIFY ${fix.groupId} "${fix.plantedText}"→"${fix.correctedText}": fixed=${fixedIds.size} residual-in-fixed=${residual}`);
}
console.log(bad === 0 ? "\n✓ ALL VERIFIED — residual 0 in fixed rows" : `\n✗ ${bad} problems — inspect above`);
await prisma.$disconnect();
