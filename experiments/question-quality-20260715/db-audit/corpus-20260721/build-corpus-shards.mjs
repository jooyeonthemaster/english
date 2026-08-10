// O211 코퍼스 복원 캠페인 1단계 — src/data/exam-passages/passages.json 의 심긴 오류 지문 샤드 생성
// 대상 A: hasDeliberateError=true (573)
// 대상 B: 오류 유발 유형인데 미플래그 (어법/어휘/장문 중 false) — 플래그 신뢰도 검사
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const OUT = path.join(root, "experiments/question-quality-20260715/db-audit/corpus-20260721");
const SH = path.join(OUT, "shards");
fs.rmSync(SH, { recursive: true, force: true });
fs.mkdirSync(SH, { recursive: true });

const all = JSON.parse(fs.readFileSync(path.join(root, "src/data/exam-passages/passages.json"), "utf8"));
const ERR_TYPES = (t) => t === "어법" || t === "어휘" || /장문/.test(t);

const A = all.filter((p) => p.hasDeliberateError);
const B = all.filter((p) => !p.hasDeliberateError && ERR_TYPES(p.type) && (p.reconstructionKind === "grammar_error" || p.reconstructionKind === "vocab_error"));
console.log(`A: hasDeliberateError=true → ${A.length}`);
console.log(`B: 미플래그인데 recon=grammar/vocab_error → ${B.length}`);

const targets = [...A.map((p) => ({ ...p, cls: "A" })), ...B.map((p) => ({ ...p, cls: "B" }))];
// 유형별 분포
const byType = {};
for (const t of targets) byType[t.type] = (byType[t.type] || 0) + 1;
console.log("대상 유형 분포:", JSON.stringify(byType));

const PER = 6;
const manifest = [];
for (let i = 0; i < targets.length; i += PER) {
  const chunk = targets.slice(i, i + PER);
  const sid = `C${String(manifest.length + 1).padStart(3, "0")}`;
  let md = `# SHARD ${sid} — ${chunk.length} passages\n\n`;
  chunk.forEach((p, j) => {
    md += `## P${j + 1}  ${p.id}\n`;
    md += `- 유형: **${p.type}** / 시험: ${p.year} ${p.exam} ${p.grade || ""} ${p.board || ""}\n`;
    md += `- 문항번호: ${(p.qNumbers || []).join(",")} / **정답 선지: ${p.answer}** / 복원종류: ${p.reconstructionKind} / 신뢰도: ${p.confidence}\n\n`;
    md += "```\n" + String(p.text).trim() + "\n```\n\n";
  });
  fs.writeFileSync(path.join(SH, `${sid}.md`), md);
  manifest.push({
    shard: sid,
    n: chunk.length,
    keys: chunk.map((p, j) => ({ p: `P${j + 1}`, id: p.id, type: p.type, answer: p.answer, cls: p.cls })),
  });
}
fs.writeFileSync(path.join(OUT, "corpus-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n샤드 ${manifest.length}개 (지문 ${PER}개/샤드), 총 대상 ${targets.length}`);
console.log(JSON.stringify(manifest.map((m) => m.shard)));
