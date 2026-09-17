// P0 지문 무결성 감사 배치 생성기 — 기계 스크리닝이 좁힌 후보를 LLM 감사 배치로 나눈다.
//
// 실행:
//   node qbank/harness/audit-batch.mjs --limit 120 --size 10 --out qbank/work/audit-001.json
//   node qbank/harness/audit-batch.mjs --limit 60 --size 10 --kind grammar_error
//   node qbank/harness/audit-batch.mjs --year 2027 --size 8
//
// 우선순위(스크리닝이 정한 auditQueue 순):
//   1) RECON_WORD_LEVEL  — 어법·어휘 복원. 한 단어를 되돌리는 일이라 기계가 절대 못 본다
//   2) SEAM_ARTIFACT     — 접합 흔적이 실제로 보인다
//   3) RECON_SENTENCE_LEVEL — 순서·삽입·무관 복원
//   4) 나머지
// 이미 _passage.json 이 있는 지문은 자동으로 빠진다(중단내성).

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCREEN = path.join(ROOT, "qbank/spec/passage-screen.json");
const CORPUS = path.join(ROOT, "src/data/exam-passages/passages.json");
const OUT = path.join(ROOT, "qbank/out");

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf("--" + n);
  return i === -1 ? d : argv[i + 1];
};

// ── 슬라이스 조회 모드 — 감사 에이전트가 자기 배치를 받아 가는 경로 ──────────
// 이미 만들어진 배치 파일에서 N번째 슬라이스만 출력한다.
// 배치 파일이 고정돼 있으므로 재개해도 배정이 흔들리지 않는다.
//   node qbank/harness/audit-batch.mjs --slice 3 --from qbank/work/audit-001.json
{
  const sliceArg = arg("slice");
  if (sliceArg !== null && sliceArg !== undefined) {
    const from = arg("from", "qbank/work/audit-001.json");
    const file = JSON.parse(fs.readFileSync(path.join(ROOT, from), "utf8"));
    const b = file.batches[Number(sliceArg)];
    if (!b) {
      console.error(`슬라이스 ${sliceArg} 없음 (총 ${file.batches.length}개)`);
      process.exit(2);
    }
    console.log(JSON.stringify(b, null, 1));
    process.exit(0);
  }
}

if (!fs.existsSync(SCREEN)) {
  console.error("passage-screen.json 이 없다. `node qbank/harness/passage-screen.mjs --write` 를 먼저 돌려라.");
  process.exit(2);
}
const screen = JSON.parse(fs.readFileSync(SCREEN, "utf8"));
const passages = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
const byId = new Map(passages.map((p) => [p.id, p]));
const resultById = new Map(screen.results.map((r) => [r.id, r]));

const done = (id) => {
  const p = byId.get(id);
  if (!p) return true;
  return fs.existsSync(path.join(OUT, String(p.year), id, "_passage.json"));
};

let queue = screen.auditQueue.filter((id) => !done(id));

const kind = arg("kind");
if (kind) queue = queue.filter((id) => byId.get(id)?.reconstructionKind === kind);

const year = arg("year");
if (year) queue = queue.filter((id) => String(byId.get(id)?.year) === String(year));

const limit = Number(arg("limit", 120));
queue = queue.slice(0, limit);

const size = Number(arg("size", 10));
const batches = [];
for (let i = 0; i < queue.length; i += size) {
  batches.push(
    queue.slice(i, i + size).map((id) => {
      const p = byId.get(id);
      const r = resultById.get(id);
      return {
        id,
        year: p.year,
        kind: p.reconstructionKind || "none",
        wordCount: p.wordCount,
        screenIssues: (r?.issues || []).map((x) => x.code),
      };
    }),
  );
}

const out = {
  label: arg("label") || `audit-${kind || "all"}-${queue.length}`,
  batches,
};

const outPath = arg("out");
if (outPath) {
  fs.mkdirSync(path.dirname(path.join(ROOT, outPath)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, outPath), JSON.stringify(out, null, 1), "utf8");
}

const kindCount = {};
for (const b of batches) for (const p of b) kindCount[p.kind] = (kindCount[p.kind] || 0) + 1;

console.error(`[감사배치] ${out.label}`);
console.error(`[감사배치] 큐 잔여 ${screen.auditQueue.filter((id) => !done(id)).length} · 선정 ${queue.length} · 배치 ${batches.length}(크기 ${size})`);
console.error(`[감사배치] 복원 종류: ${JSON.stringify(kindCount)}`);
if (outPath) console.error(`[감사배치] → ${outPath}`);
else console.log(JSON.stringify(out));
