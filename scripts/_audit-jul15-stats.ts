import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "scripts", "_gen_audit_out", "jul15-dawn-questions.json");
const rows = JSON.parse(fs.readFileSync(OUT, "utf8")) as any[];

const CIRCLED = /[①②③④⑤⑥]/;
const summary = rows.map((q) => {
  const sd = q.structuredData || {};
  const opts = (sd.options || []) as any[];
  const labels = opts.map((o) => o.label).join(",");
  const labelStyle = opts.length === 0 ? "-" : CIRCLED.test(labels) ? "circled" : /^\(/.test(opts[0].label) ? "paren" : "plain";
  const warns = (sd._qualityWarnings || []).map((w: any) => w.code);
  // vocab marker order check
  let markerOrder = "-";
  if (sd.markedWords) {
    const passage: string = sd.passageWithMarkers || "";
    const idx = sd.markedWords.map((m: any) => passage.indexOf(`__${m.label}`));
    const sorted = [...idx].sort((a, b) => a - b);
    const inOrder = idx.every((v: number, i: number) => v === sorted[i]);
    const labelSeq = sd.markedWords.map((m: any) => m.label).join("");
    markerOrder = inOrder ? `ok(${labelSeq})` : `OUT_OF_ORDER(${labelSeq})`;
  }
  return {
    id: q.id.slice(-6),
    type: q.subType,
    plan: sd._generationPlan,
    diff: q.difficulty,
    passage: q.passageId.slice(-6),
    label: labelStyle,
    relaxed: sd._qualityMode === "relaxed" ? "RELAXED" : "",
    review: sd._reviewRecommended ? "REVIEW_FLAG" : "",
    warns: warns.join("|"),
    markerOrder,
  };
});

console.table(summary);

const withWarn = summary.filter((s) => s.warns).length;
const relaxed = summary.filter((s) => s.relaxed).length;
const plain = summary.filter((s) => s.label === "plain").length;
const warnCounts: Record<string, number> = {};
for (const s of summary) for (const w of s.warns.split("|").filter(Boolean)) warnCounts[w] = (warnCounts[w] || 0) + 1;

console.log("\n=== 집계 ===");
console.log("총 문항:", summary.length);
console.log("품질경고 달고 출하:", withWarn);
console.log("relaxed(완화) 출하:", relaxed);
console.log("선지번호 1~5(비원문자):", plain);
console.log("경고 코드별:", warnCounts);
console.log("지문별 문항수:", summary.reduce((a: any, s) => ((a[s.passage] = (a[s.passage] || 0) + 1), a), {}));
