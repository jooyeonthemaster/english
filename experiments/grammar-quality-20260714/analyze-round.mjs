// 라운드 결정론 분석기 (작성: Fable) — LLM 없이 계산 가능한 품질 신호 전부.
// 실행: node experiments/grammar-quality-20260714/analyze-round.mjs <roundName>
import fs from "node:fs";
import path from "node:path";

const round = process.argv[2] || "round-0";
const DIR = path.join(process.cwd(), "experiments", "grammar-quality-20260714");
const rows = fs.readFileSync(path.join(DIR, round, "results.jsonl"), "utf8").trim().split("\n").map(JSON.parse);

const S_TIER = new Set(["a", "d", "e", "c", "b", "i", "f"]);
const A_TIER = new Set(["g", "k", "h", "j"]);

const ok = rows.filter((r) => r.ok && r.question);
const stats = {
  round, total: rows.length, ok: ok.length, failed: rows.length - ok.length,
  relaxed: rows.filter((r) => r.relaxedFallback === true).length,
  avgAttempts: ok.length ? +(ok.reduce((s, r) => s + (r.attempts || 0), 0) / ok.length).toFixed(2) : null,
  answers: { S: 0, A: 0, B: 0 },
  answerCodeDist: {},
  decoyCodeDist: {},
  dupAnswerDecoy: [],       // 정답과 같은 코드의 미끼 존재 문항
  dupDecoyPairs: [],        // 미끼끼리 코드 중복 문항
  decoySTierShare: [],      // 문항별 미끼 중 S/A급 비율
  posLastUnder07: [],       // 마지막 마커가 70% 이전에서 끝나는 문항
  firstSentenceAnswer: [],  // 정답이 첫 문장
  answerBefore20pct: [],    // 정답이 지문 앞 20% 이전 (기준서 §2 배치 규칙)
  sameSentenceCrowd: [],    // 같은 문장에 밑줄 ≥2 (기준서 §2-③ 정렬)
  answerSentenceCrowd: [],  // 정답 포함 문장에 밑줄 ≥2 (시선 집중 유출)
  answerFirstMarker: 0,     // 정답이 (A)
  answerLabelDist: {},
};

for (const r of ok) {
  const me = r.question.markedExpressions || [];
  const ans = me.find((m) => m.isError);
  const decoys = me.filter((m) => !m.isError);
  if (ans?.pointCode) {
    stats.answerCodeDist[ans.pointCode] = (stats.answerCodeDist[ans.pointCode] || 0) + 1;
    if (S_TIER.has(ans.pointCode)) stats.answers.S++;
    else if (A_TIER.has(ans.pointCode)) stats.answers.A++;
    else stats.answers.B++;
  }
  for (const d of decoys) if (d.pointCode) stats.decoyCodeDist[d.pointCode] = (stats.decoyCodeDist[d.pointCode] || 0) + 1;
  if (ans && decoys.some((d) => d.pointCode === ans.pointCode)) stats.dupAnswerDecoy.push(`${r.passageId}(${r.difficulty})`);
  const codes = decoys.map((d) => d.pointCode).filter(Boolean);
  if (new Set(codes).size < codes.length) stats.dupDecoyPairs.push(`${r.passageId}(${r.difficulty})`);
  const good = decoys.filter((d) => S_TIER.has(d.pointCode) || A_TIER.has(d.pointCode)).length;
  stats.decoySTierShare.push(+(good / Math.max(1, decoys.length)).toFixed(2));
  const p = r.positions;
  if (p) {
    if (typeof p.lastMarkerRelPos === "number" && p.lastMarkerRelPos < 0.7) stats.posLastUnder07.push(r.passageId);
    // 기준서 §2-③ 정렬(26-07-14): '같은 문장에 밑줄 2개 이상' — 종전 정의(distinctSentences<4)가 느슨해 리뷰어 12건 vs 지표 0건 불일치 발생
    const bySent = {};
    for (const m of p.markers) if (m.sentenceIndex >= 0) (bySent[m.sentenceIndex] = bySent[m.sentenceIndex] || []).push(m);
    const crowded = Object.values(bySent).filter((g) => g.length >= 2);
    if (crowded.length > 0) stats.sameSentenceCrowd.push(r.passageId);
    if (crowded.some((g) => g.some((m) => m.isError))) stats.answerSentenceCrowd.push(r.passageId);
    const ansPos = p.markers.find((m) => m.isError);
    if (ansPos && ansPos.sentenceIndex === 0) stats.firstSentenceAnswer.push(r.passageId);
    if (ansPos && typeof ansPos.relPos === "number" && ansPos.relPos < 0.2) stats.answerBefore20pct.push(r.passageId);
  }
  if (ans?.label === "(A)") stats.answerFirstMarker++;
  if (ans?.label) stats.answerLabelDist[ans.label] = (stats.answerLabelDist[ans.label] || 0) + 1;
}
stats.avgDecoyGoodShare = stats.decoySTierShare.length
  ? +(stats.decoySTierShare.reduce((a, b) => a + b, 0) / stats.decoySTierShare.length).toFixed(2)
  : null;
delete stats.decoySTierShare;

fs.writeFileSync(path.join(DIR, round, "det-stats.json"), JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
