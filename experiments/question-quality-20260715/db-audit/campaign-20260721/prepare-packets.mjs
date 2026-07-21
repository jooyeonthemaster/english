// 캠페인 2단계: 그룹별 전 사본 수집(내용 앵커 확장) + 변형본 정리 → 판정 패킷 생성 (읽기 전용)
// - risk-groups.json 의 memberIds 는 "신호가 잡힌" 행만 포함 — 무해 제목 사본(O208-b "Literature" 판례)을
//   내용 앵커 contains 쿼리로 추가 수집한다 (자카드 0.8 검증 통과분만 사본 인정).
// - 변형본(정확 일치 dedup) 단위로 패킷 md 를 쓰고, 수정 단계용 최종 사본 목록 JSON 을 남긴다.
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
const PACKET_DIR = path.join(DIR, "packets");
fs.mkdirSync(PACKET_DIR, { recursive: true });
const groups = JSON.parse(fs.readFileSync(path.join(DIR, "risk-groups.json"), "utf8"));

function normWords(c) {
  return c.replace(/[^A-Za-z]+/g, " ").toLowerCase().trim().replace(/\s+/g, " ");
}
function wordSet(c) {
  return new Set(normWords(c).split(" ").filter((w) => w.length > 3));
}
function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
// 대표 본문에서 마커·비ASCII 없는 순수 영문 앵커(40~60자) 추출 — 서로 다른 두 지점
function pickAnchors(content) {
  const anchors = [];
  const clean = content.replace(/\r/g, "");
  const re = /[A-Za-z][A-Za-z ,'’-]{45,70}[A-Za-z]/g;
  const found = [];
  let m;
  while ((m = re.exec(clean)) !== null) {
    if (!/[①-⑳]/.test(m[0])) found.push(m[0]);
  }
  if (found.length === 0) return anchors;
  anchors.push(found[Math.floor(found.length * 0.25)]);
  if (found.length > 2) anchors.push(found[Math.floor(found.length * 0.7)]);
  return [...new Set(anchors)];
}

const finalGroups = [];
let expandedTotal = 0;
for (const g of groups) {
  // 1) 알려진 멤버 로드
  const members = await prisma.passage.findMany({
    where: { id: { in: g.memberIds } },
    select: { id: true, academyId: true, title: true, tags: true, source: true, content: true, updatedAt: true },
  });
  const repr = members.find((m) => m.id === g.representativeId) || members[0];
  const reprWords = wordSet(repr.content);

  // 2) 내용 앵커 확장 — 무해 제목 사본 수집
  const knownIds = new Set(members.map((m) => m.id));
  const anchors = pickAnchors(repr.content);
  const extras = [];
  for (const anchor of anchors) {
    let rows = [];
    try {
      rows = await prisma.passage.findMany({
        where: { id: { notIn: [...knownIds] }, content: { contains: anchor } },
        select: { id: true, academyId: true, title: true, tags: true, source: true, content: true, updatedAt: true },
        take: 30,
      });
    } catch { continue; }
    for (const r of rows) {
      if (knownIds.has(r.id)) continue;
      if (jaccard(reprWords, wordSet(r.content)) > 0.8) {
        knownIds.add(r.id);
        extras.push(r);
      }
    }
  }
  expandedTotal += extras.length;
  const all = [...members, ...extras];

  // 3) 변형본 dedup (공백 정규화 후 정확 일치)
  const variants = new Map();
  for (const m of all) {
    const key = m.content.replace(/\s+/g, " ").trim();
    if (!variants.has(key)) variants.set(key, { content: m.content, rows: [] });
    variants.get(key).rows.push(m);
  }
  const varList = [...variants.values()].sort((a, b) => b.rows.length - a.rows.length);

  // 4) 패킷 md 작성
  const label = String.fromCharCode; // A, B, C...
  let md = `# ${g.groupId} — ${g.examSig}\n\n`;
  md += `- copies: ${all.length} rows across ${new Set(all.map((m) => m.academyId)).size} academies (anchor-expanded: +${extras.length})\n`;
  md += `- signals: ${g.signals.join(", ")}\n`;
  md += `- titles: ${[...new Set(all.map((m) => m.title))].slice(0, 8).join(" / ")}\n`;
  md += `- variants: ${varList.length}\n\n`;
  varList.forEach((v, i) => {
    const hasMarker = /[①-⑳]/.test(v.content);
    md += `## VARIANT ${label(65 + i)} (${v.rows.length} rows${hasMarker ? ", ⚠ CIRCLED MARKERS PRESENT" : ""})\n`;
    md += `rows: ${v.rows.map((r) => `${r.id}("${(r.title || "").slice(0, 30)}")`).join(", ")}\n\n`;
    md += "```\n" + v.content.trim() + "\n```\n\n";
  });
  fs.writeFileSync(path.join(PACKET_DIR, `${g.groupId}.md`), md);

  finalGroups.push({
    groupId: g.groupId,
    examSig: g.examSig,
    signals: g.signals,
    packetPath: `experiments/question-quality-20260715/db-audit/campaign-20260721/packets/${g.groupId}.md`,
    copyCount: all.length,
    variantCount: varList.length,
    anchorExpanded: extras.map((e) => `${e.id}("${(e.title || "").slice(0, 30)}")`),
    memberIds: all.map((m) => m.id),
    hasMarkerCopy: varList.some((v) => /[①-⑳]/.test(v.content)),
  });
  console.log(`${g.groupId} [${g.examSig}] rows=${all.length}(+${extras.length}) variants=${varList.length}`);
}

fs.writeFileSync(path.join(DIR, "groups-final.json"), JSON.stringify(finalGroups, null, 2));
console.log(`\ntotal groups: ${finalGroups.length}, anchor-expanded rows: +${expandedTotal}`);
console.log(`multi-variant groups: ${finalGroups.filter((g) => g.variantCount > 1).map((g) => `${g.groupId}(${g.variantCount})`).join(", ") || "none"}`);
await prisma.$disconnect();
