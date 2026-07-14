// 검수 패킷 생성기 (작성: Fable) — 라운드 결과를 리뷰어용 2단 패킷으로 분해.
// blind: 지문(마커)+발문만 (정답·해설·코드 스포일러 제거) / full: 전체 레코드.
// 실행: node experiments/grammar-quality-20260714/make-packets.mjs <roundName>
import fs from "node:fs";
import path from "node:path";

const round = process.argv[2] || "round-0";
const DIR = path.join(process.cwd(), "experiments", "grammar-quality-20260714");
const rows = fs.readFileSync(path.join(DIR, round, "results.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const pkDir = path.join(DIR, round, "packets");
fs.mkdirSync(pkDir, { recursive: true });

let made = 0;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const n = String(i + 1).padStart(2, "0");
  if (!r.ok || !r.question) {
    fs.writeFileSync(path.join(pkDir, `q${n}-FAILED.json`), JSON.stringify(r, null, 2));
    continue;
  }
  const q = r.question;
  const blind = [
    `# 문항 q${n} — ${r.difficulty} (블라인드: 먼저 직접 푸시오)`,
    ``,
    `**발문**: ${q.direction ?? "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?"}`,
    ``,
    `**지문(밑줄 = (A)~(E) 마커 뒤 표현)**:`,
    ``,
    q.passageWithMarkers ?? "(누락)",
    ``,
    `먼저 답과 그 이유를 확정한 뒤에만 q${n}-full.json 을 열 것.`,
  ].join("\n");
  fs.writeFileSync(path.join(pkDir, `q${n}-blind.md`), blind);
  fs.writeFileSync(
    path.join(pkDir, `q${n}-full.json`),
    JSON.stringify({
      passageId: r.passageId, difficulty: r.difficulty, meta: r.meta,
      attempts: r.attempts, relaxedFallback: r.relaxedFallback,
      errors: r.errors, warnings: r.warnings, topReject: r.topReject,
      layout: r.layout, positions: r.positions,
      originalPassage: r.passageText,
      question: q,
    }, null, 2),
  );
  made++;
}
console.log(`packets: ${made} ok + ${rows.length - made} failed → ${pkDir}`);
