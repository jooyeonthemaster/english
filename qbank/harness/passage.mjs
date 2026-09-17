// 지문 조회 — 저작·검수 에이전트가 지문 원문을 정확히 얻는 유일한 경로.
// 실행: node qbank/harness/passage.mjs <passageId> [--meta]
//
// 왜 이 스크립트를 쓰나: 지문을 손으로 옮겨 적으면 한 글자만 달라도
// 「지문 재구성 불일치」로 유닛 전체가 반려된다. 항상 여기서 받아라.

import fs from "node:fs";
import path from "node:path";

const id = process.argv[2];
if (!id || id.startsWith("--")) {
  console.error("사용법: node qbank/harness/passage.mjs <passageId> [--meta]");
  process.exit(2);
}

const rows = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "src/data/exam-passages/passages.json"), "utf8"),
);
const p = rows.find((r) => r.id === id);
if (!p) {
  console.error(`지문 없음: ${id}`);
  process.exit(2);
}

if (process.argv.includes("--meta")) {
  console.log(
    JSON.stringify(
      {
        id: p.id,
        year: p.year,
        grade: p.grade,
        board: p.board,
        exam: p.exam,
        originalType: p.type,
        typeGroup: p.typeGroup,
        originalAnswer: p.answer,
        reconstructionKind: p.reconstructionKind,
        confidence: p.confidence,
        wordCount: p.wordCount,
      },
      null,
      1,
    ),
  );
  console.log("");
}
console.log(p.text);
