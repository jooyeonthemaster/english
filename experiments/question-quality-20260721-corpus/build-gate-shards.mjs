// 3차 게이트용 샤드: (A) 수렴 299건 적대 검수 (B) 미탐 219건 2차 의견(놓쳤는지 재확인)
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const CO = path.join(root, "experiments/question-quality-20260715/db-audit/corpus-20260721");
const OUT = path.join(root, "experiments/question-quality-20260721-corpus");
fs.mkdirSync(path.join(OUT, "gateA"), { recursive: true });
fs.mkdirSync(path.join(OUT, "gateB"), { recursive: true });

const corpus = JSON.parse(fs.readFileSync(path.join(root, "src/data/exam-passages/passages.json"), "utf8"));
const byId = new Map(corpus.map((c) => [c.id, c]));
const res = JSON.parse(fs.readFileSync(path.join(CO, "restoration-results.json"), "utf8"));
const notFound = JSON.parse(fs.readFileSync(path.join(CO, "both-not-found.json"), "utf8"));

// ── A: 수렴 건 검수 ──
const PER_A = 6;
const manA = [];
for (let i = 0; i < res.converged.length; i += PER_A) {
  const chunk = res.converged.slice(i, i + PER_A);
  const sid = `A${String(manA.length + 1).padStart(3, "0")}`;
  let md = `# GATE-A ${sid} — 복원안 ${chunk.length}건 검수\n\n`;
  chunk.forEach((c, j) => {
    const p = byId.get(c.id);
    md += `## R${j + 1}  ${c.id}\n`;
    md += `- 유형 **${p.type}** / ${p.year} ${p.exam} ${p.grade || ""} / 정답 선지 **${p.answer}**\n`;
    md += `- 제안: **"${c.plantedText}" → "${c.correctedText}"**\n`;
    md += `- 근거(1차): ${c.reason}\n\n`;
    md += "```\n" + String(p.text).trim() + "\n```\n\n";
  });
  fs.writeFileSync(path.join(OUT, "gateA", `${sid}.md`), md);
  manA.push({ shard: sid, keys: chunk.map((c, j) => ({ r: `R${j + 1}`, id: c.id, planted: c.plantedText, corrected: c.correctedText })) });
}

// ── B: 미탐 건 재확인 ──
const PER_B = 6;
const manB = [];
for (let i = 0; i < notFound.length; i += PER_B) {
  const chunk = notFound.slice(i, i + PER_B);
  const sid = `B${String(manB.length + 1).padStart(3, "0")}`;
  let md = `# GATE-B ${sid} — 미탐 ${chunk.length}건 재확인\n\n`;
  chunk.forEach((id, j) => {
    const p = byId.get(id);
    md += `## P${j + 1}  ${id}\n`;
    md += `- 유형 **${p.type}** / ${p.year} ${p.exam} ${p.grade || ""} / 정답 선지 **${p.answer}** / era ${p.era}\n\n`;
    md += "```\n" + String(p.text).trim() + "\n```\n\n";
  });
  fs.writeFileSync(path.join(OUT, "gateB", `${sid}.md`), md);
  manB.push({ shard: sid, keys: chunk.map((id, j) => ({ p: `P${j + 1}`, id })) });
}

fs.writeFileSync(path.join(OUT, "gate-manifest.json"), JSON.stringify({ A: manA, B: manB }, null, 2));
console.log(`GATE-A 샤드 ${manA.length} (복원안 ${res.converged.length})`);
console.log(`GATE-B 샤드 ${manB.length} (미탐 ${notFound.length})`);
console.log("A:", JSON.stringify(manA.map((m) => m.shard)));
console.log("B:", JSON.stringify(manB.map((m) => m.shard)));
