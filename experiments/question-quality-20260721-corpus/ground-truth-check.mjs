// by-exam/*.json 의 reconstruction.suggestedCorrection = 기존 데이터셋이 이미 유도해둔 "정답".
// 내 AI 복원 캠페인 결과와 대조해 정확도를 실측한다.
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const BYEXAM = path.join(root, "english-exam-passages/by-exam");
const bundle = JSON.parse(fs.readFileSync(path.join(root, "src/data/exam-passages/passages.json"), "utf8"));
const byId = new Map(bundle.map((c) => [c.id, c]));

// by-exam 에서 (passageId, suggestedCorrection) 수집
const gt = new Map();
for (const f of fs.readdirSync(BYEXAM).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(fs.readFileSync(path.join(BYEXAM, f), "utf8"));
  for (const p of d.passages || []) {
    const q = (p.qNumbers || [])[0];
    if (q == null) continue;
    const label = (p.qNumbers || []).length > 1 ? `q${p.qNumbers[0]}-${p.qNumbers[p.qNumbers.length - 1]}` : `q${q}`;
    const id = `${d.examId}-${label}`;
    const sc = p.reconstruction?.suggestedCorrection;
    if (sc && sc.word) gt.set(id, { ...sc, type: p.type, examId: d.examId });
  }
}
console.log(`by-exam 정답(suggestedCorrection) 보유: ${gt.size}건`);

const norm = (s) => String(s || "").toLowerCase().trim();
let agree = 0, wordDiff = 0, posDiff = 0, missedByMe = 0, notInBundle = 0;
const rows = [];
for (const [id, sc] of gt) {
  const rec = byId.get(id);
  if (!rec) { notInBundle++; continue; }
  const mine = rec.plantedError;
  if (!mine) {
    // 나는 결함 없다고 판정했는데 정답은 결함이 있다고 함
    missedByMe++;
    rows.push({ id, type: sc.type, gt: `${sc.word}→${sc.shouldBe}`, mine: rec.errorAudit?.startsWith("clean") ? "CLEAN 판정" : rec.hasDeliberateError ? "미해결 보류" : "?", verdict: "MISS" });
    continue;
  }
  const samePos = norm(mine.planted) === norm(sc.word);
  const sameWord = norm(mine.original) === norm(sc.shouldBe);
  if (samePos && sameWord) { agree++; rows.push({ id, type: sc.type, gt: `${sc.word}→${sc.shouldBe}`, mine: `${mine.planted}→${mine.original}`, verdict: "AGREE" }); }
  else if (samePos) { wordDiff++; rows.push({ id, type: sc.type, gt: `${sc.word}→${sc.shouldBe}`, mine: `${mine.planted}→${mine.original}`, verdict: "WORD_DIFF" }); }
  else { posDiff++; rows.push({ id, type: sc.type, gt: `${sc.word}→${sc.shouldBe}`, mine: `${mine.planted}→${mine.original}`, verdict: "POS_DIFF" }); }
}
console.log(`\n대조 결과 (앱 번들에 있는 것만):`);
console.log(`  ✓ 완전 일치(위치+단어): ${agree}`);
console.log(`  △ 위치 일치, 단어 다름: ${wordDiff}`);
console.log(`  ✗ 위치 불일치:          ${posDiff}`);
console.log(`  ✗ 내가 놓침(정답엔 결함): ${missedByMe}`);
console.log(`  - 번들에 없음:           ${notInBundle}`);
const scored = agree + wordDiff + posDiff + missedByMe;
if (scored) console.log(`\n위치 정확도: ${(((agree + wordDiff) / scored) * 100).toFixed(1)}% | 완전 정확도: ${((agree / scored) * 100).toFixed(1)}%`);

console.log(`\n=== 불일치 상세 ===`);
for (const r of rows.filter((x) => x.verdict !== "AGREE")) {
  console.log(`[${r.verdict}] ${r.id} (${r.type})  정답: ${r.gt}  |  내판정: ${r.mine}`);
}
fs.writeFileSync(path.join(root, "experiments/question-quality-20260721-corpus/ground-truth-compare.json"), JSON.stringify(rows, null, 2));
