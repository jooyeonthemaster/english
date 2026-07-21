// 캠페인 1단계: 위험군 전수 추출 (읽기 전용)
// (a) 제목/태그에 어법·어휘·29/30/42 신호가 있는 기출 지문
// (b) 본문에 원형숫자 마커(①~⑤) 잔존
// (c) 본문에 발문 잔재("어법상 틀린", "문맥상 낱말" 등)
// → 내용 dedup(정규화 head) → 고유 지문 × 시험 목록 JSON 출력
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

const OUT_DIR = path.join(root, "experiments/question-quality-20260715/db-audit/campaign-20260721");

// ── 전체 통계 ──
const total = await prisma.passage.count();
console.log(`total passages: ${total}`);

// ── 위험군 후보 쿼리 ──
const MARKERS = ["①", "②", "③", "④", "⑤"];
const or = [
  // (a) 제목 신호
  { title: { contains: "어법" } },
  { title: { contains: "어휘" } },
  { title: { contains: "29" } },
  { title: { contains: "30" } },
  { title: { contains: "42" } },
  { title: { contains: "41" } },
  // (a') 태그 신호
  { tags: { contains: "어법" } },
  { tags: { contains: "어휘" } },
  // (b) 마커 잔존
  ...MARKERS.map((mk) => ({ content: { contains: mk } })),
  // (c) 발문 잔재
  { content: { contains: "어법상" } },
  { content: { contains: "문맥상" } },
  { content: { contains: "적절하지 않은" } },
  { content: { contains: "밑줄 친" } },
];

const rows = await prisma.passage.findMany({
  where: { OR: or },
  select: {
    id: true,
    academyId: true,
    title: true,
    source: true,
    grade: true,
    tags: true,
    subject: true,
    contentHash: true,
    extractionOutput: true,
    createdAt: true,
    updatedAt: true,
    content: true,
  },
});
console.log(`risk candidates (broad): ${rows.length}`);

// 국어 지문 제외 (영어 기출 오염 캠페인)
const eng = rows.filter((r) => r.subject !== "KOREAN");
console.log(`after excluding KOREAN: ${eng.length}`);

// ── 신호 분류 ──
const CIRCLED = /[①-⑳]/; // ①~⑳
function signals(r) {
  const s = [];
  const t = (r.title || "") + " | " + (r.tags || "");
  if (/어법/.test(t)) s.push("tag어법");
  if (/어휘/.test(t)) s.push("tag어휘");
  if (/(^|[^0-9])(29|30|41|42)([^0-9]|$)/.test(r.title || "")) s.push("title번호");
  if (CIRCLED.test(r.content)) s.push("마커잔존");
  if (/어법상|문맥상|적절하지 않은|밑줄 친/.test(r.content)) s.push("발문잔재");
  return s;
}

// ── 내용 정규화 & dedup 키 ──
function normalize(c) {
  return c
    .replace(/[①-⑳]/g, " ") // 원형숫자 제거
    .replace(/\((?:[A-Ea-e])\)/g, " ") // (A)~(e) 밑줄 라벨 제거
    .replace(/[^A-Za-z]+/g, " ") // 영단어만 남김 (한글 발문·구두점 제거)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
function headKey(c) {
  return normalize(c).slice(0, 60);
}
function wordSet(c) {
  return new Set(normalize(c).split(" ").filter((w) => w.length > 3));
}
function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

const risky = eng
  .map((r) => ({ ...r, signals: signals(r) }))
  .filter((r) => r.signals.length > 0);
console.log(`with >=1 signal: ${risky.length}`);

// 신호별 카운트
const sigCount = {};
for (const r of risky) for (const s of r.signals) sigCount[s] = (sigCount[s] || 0) + 1;
console.log("signal counts:", JSON.stringify(sigCount));

// ── dedup: head 키 1차 → 자카드 0.85 병합 2차 ──
const groups = new Map();
for (const r of risky) {
  const k = headKey(r.content);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
let glist = [...groups.entries()].map(([key, members]) => ({
  key,
  members,
  words: wordSet(members[0].content),
}));
// 2차 병합
let merged = true;
while (merged) {
  merged = false;
  outer: for (let i = 0; i < glist.length; i++) {
    for (let j = i + 1; j < glist.length; j++) {
      if (jaccard(glist[i].words, glist[j].words) > 0.85) {
        glist[i].members.push(...glist[j].members);
        glist.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
}
console.log(`unique passage groups: ${glist.length}`);

// ── 시험 시그니처 파싱 (제목·태그·source 에서) ──
function examSig(members) {
  const texts = members.map((m) => `${m.title || ""} ${m.tags || ""} ${m.source || ""}`);
  const joined = texts.join(" | ");
  const grade = (joined.match(/고\s*([123])/) || [])[1];
  const year = (joined.match(/20(2[0-9])/) || [])[0];
  const month = (joined.match(/([0-9]{1,2})\s*월/) || [])[1];
  const kind = (joined.match(/모의평가|모평|학평|학력평가|수능|모의고사/) || [])[0];
  const qnum = (joined.match(/(^|[^0-9])(29|30|41|42)\s*번?/) || [])[2];
  return [year, month ? month + "월" : null, grade ? "고" + grade : null, kind, qnum ? qnum + "번" : null]
    .filter(Boolean)
    .join(" ") || "(미상)";
}

const out = glist.map((g, i) => {
  const rep = g.members.slice().sort((a, b) => (CIRCLED.test(b.content) ? 1 : 0) - (CIRCLED.test(a.content) ? 1 : 0))[0];
  return {
    groupId: `G${String(i + 1).padStart(3, "0")}`,
    examSig: examSig(g.members),
    copyCount: g.members.length,
    signals: [...new Set(g.members.flatMap((m) => m.signals))],
    hasMarkerCopy: g.members.some((m) => CIRCLED.test(m.content)),
    representativeId: rep.id,
    titles: [...new Set(g.members.map((m) => m.title))].slice(0, 5),
    memberIds: g.members.map((m) => m.id),
    academies: [...new Set(g.members.map((m) => m.academyId))].length,
    contentLen: rep.content.length,
    // 대표 본문: 마커 사본 우선(심긴 자리 증거)
    representativeContent: rep.content,
    markerCopyId: g.members.find((m) => CIRCLED.test(m.content))?.id || null,
  };
});

// 시험별 정렬
out.sort((a, b) => a.examSig.localeCompare(b.examSig) || b.copyCount - a.copyCount);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "risk-groups.json"), JSON.stringify(out, null, 2));
// 본문 제외 요약본
fs.writeFileSync(
  path.join(OUT_DIR, "risk-groups-summary.json"),
  JSON.stringify(out.map(({ representativeContent, memberIds, ...rest }) => ({ ...rest, memberSample: memberIds.slice(0, 3) })), null, 2),
);
console.log(`\nwritten: risk-groups.json (${out.length} groups)`);
for (const g of out.slice(0, 60)) {
  console.log(`${g.groupId} [${g.examSig}] copies=${g.copyCount} marker=${g.hasMarkerCopy ? "Y" : "-"} sig=${g.signals.join(",")} :: ${g.titles[0]}`);
}
if (out.length > 60) console.log(`... and ${out.length - 60} more`);
await prisma.$disconnect();
