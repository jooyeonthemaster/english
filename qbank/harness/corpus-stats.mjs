// 코퍼스 실측 — LLM 미사용, 순수 계산. 배분 계획의 근거 데이터.
// 실행: node qbank/harness/corpus-stats.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, "src", "data", "exam-passages", "passages.json");
const OUT = path.join(ROOT, "qbank", "spec", "corpus-stats.json");

const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));
const rows = Array.isArray(raw) ? raw : raw.passages || raw.items;

const by = (fn) => {
  const m = new Map();
  for (const r of rows) {
    const k = fn(r);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Object.fromEntries([...m.entries()].sort((a, b) => (a[0] > b[0] ? 1 : -1)));
};

const byYear = by((r) => String(r.year));
const byGrade = by((r) => r.grade || "(없음)");
const byBoard = by((r) => r.board || "(없음)");
const byExam = by((r) => r.exam || "(없음)");
const byType = by((r) => r.type || "(없음)");
const byTypeGroup = by((r) => r.typeGroup || "(없음)");
const byRecon = by((r) => r.reconstructionKind || "(없음)");
const byConfidence = by((r) => r.confidence || "(없음)");

// 연도 x 학년 교차
const cross = {};
for (const r of rows) {
  const y = String(r.year);
  const g = r.grade || "(없음)";
  cross[y] = cross[y] || {};
  cross[y][g] = (cross[y][g] || 0) + 1;
}

// 단어수 분포
const wc = rows.map((r) => r.wordCount || 0).sort((a, b) => a - b);
const pct = (p) => wc[Math.min(wc.length - 1, Math.floor((wc.length - 1) * p))];
const wordStats = {
  n: wc.length,
  min: wc[0],
  p05: pct(0.05),
  p25: pct(0.25),
  p50: pct(0.5),
  p75: pct(0.75),
  p95: pct(0.95),
  max: wc[wc.length - 1],
  mean: Math.round(wc.reduce((a, b) => a + b, 0) / wc.length),
};

// 길이 버킷 — 유형 적합성 판정에 직결 (짧은 지문은 순서·삽입 불가)
const buckets = { "<80": 0, "80-109": 0, "110-139": 0, "140-179": 0, "180-249": 0, "250+": 0 };
for (const n of wc) {
  if (n < 80) buckets["<80"]++;
  else if (n < 110) buckets["80-109"]++;
  else if (n < 140) buckets["110-139"]++;
  else if (n < 180) buckets["140-179"]++;
  else if (n < 250) buckets["180-249"]++;
  else buckets["250+"]++;
}

// 오염 위험군 — 이미 변형된 지문(어법/어휘 출제 변형본이 저장된 케이스)
const hasDeliberate = rows.filter((r) => r.hasDeliberateError).length;
const reconNotNone = rows.filter((r) => r.reconstructionKind && r.reconstructionKind !== "none").length;

// 본문 중복 (같은 지문이 여러 회차에 재출제)
const textKey = (t) => (t || "").replace(/\s+/g, " ").trim().slice(0, 300).toLowerCase();
const dupMap = new Map();
for (const r of rows) {
  const k = textKey(r.text);
  if (!dupMap.has(k)) dupMap.set(k, []);
  dupMap.get(k).push(r.id);
}
const dupGroups = [...dupMap.values()].filter((v) => v.length > 1);
const dupPassages = dupGroups.reduce((a, g) => a + g.length, 0);

// 본문 위생 검사 — 마크다운/HTML/개행/한글 혼입 여부
const hygiene = { hasNewline: 0, hasHtml: 0, hasHangul: 0, hasMdMarker: 0, hasCircledNum: 0, empty: 0 };
for (const r of rows) {
  const t = r.text || "";
  if (!t.trim()) hygiene.empty++;
  if (/\n/.test(t)) hygiene.hasNewline++;
  if (/<[a-zA-Z/]/.test(t)) hygiene.hasHtml++;
  if (/[가-힣]/.test(t)) hygiene.hasHangul++;
  if (/(\*\*|__|```)/.test(t)) hygiene.hasMdMarker++;
  if (/[①-⑳]/.test(t)) hygiene.hasCircledNum++;
}

const out = {
  generatedFor: "qbank-20260728",
  source: "src/data/exam-passages/passages.json",
  total: rows.length,
  byYear,
  byGrade,
  byBoard,
  byExam,
  byTypeGroup,
  byType,
  byRecon,
  byConfidence,
  crossYearGrade: cross,
  wordStats,
  lengthBuckets: buckets,
  contamination: { hasDeliberateError: hasDeliberate, reconstructionNotNone: reconNotNone },
  duplicates: { groups: dupGroups.length, passagesInGroups: dupPassages },
  hygiene,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");

console.log("총 지문:", rows.length);
console.log("\n연도별:", JSON.stringify(byYear));
console.log("\n학년별:", JSON.stringify(byGrade));
console.log("\n출처별:", JSON.stringify(byBoard));
console.log("\n유형그룹별:", JSON.stringify(byTypeGroup));
console.log("\n단어수:", JSON.stringify(wordStats));
console.log("\n길이버킷:", JSON.stringify(buckets));
console.log("\n오염위험:", JSON.stringify(out.contamination));
console.log("중복:", JSON.stringify(out.duplicates));
console.log("본문위생:", JSON.stringify(hygiene));
console.log("\n→", OUT);
