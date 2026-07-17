// 자체 스모크 — round-2 신설 결정론 검출기(nonword-filler.ts)를 round-1(및 round-0)
// 실측 30문항에 돌려 실사례(q23 understoodly·q13 did be·q05 what삽입·q17/q19 필러)
// 적중과 정상 문항 오탐 여부를 확인한다. 실행:
//   npx tsx experiments/grammar-quality-20260714/smoke-nonword-filler.ts
import fs from "node:fs";
import path from "node:path";

import {
  findGrammarAnswerForcedNonword,
  findGrammarDecoyFillerSpan,
} from "@/lib/question-quality/validators/grammar/nonword-filler";

interface Marker {
  label?: string;
  expression?: string;
  errorExpression?: string;
  correction?: string;
  surroundingText?: string;
  pointCode?: string;
  isError?: boolean;
}

function run(roundDir: string) {
  const file = path.join(__dirname, roundDir, "results.jsonl");
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  let answerHits = 0;
  let decoyHits = 0;
  const hitLines: string[] = [];
  lines.forEach((line, i) => {
    const row = JSON.parse(line);
    const qid = `q${String(i + 1).padStart(2, "0")}`;
    const markers: Marker[] = row.question?.markedExpressions ?? [];
    for (const m of markers) {
      if (m.isError === true) {
        const msg = findGrammarAnswerForcedNonword(
          m.expression ?? "",
          m.errorExpression ?? "",
          m.surroundingText ?? "",
        );
        if (msg) {
          answerHits += 1;
          hitLines.push(
            `[${roundDir}/${qid}] ANSWER ${m.label} "${m.expression}"→"${m.errorExpression}" :: ${msg.slice(0, 110)}...`,
          );
        }
      } else {
        const msg = findGrammarDecoyFillerSpan(m.expression ?? "", m.surroundingText ?? "");
        if (msg) {
          decoyHits += 1;
          hitLines.push(
            `[${roundDir}/${qid}] DECOY  ${m.label} "${m.expression}" (pc=${m.pointCode}) :: ${msg.slice(0, 110)}`,
          );
        }
      }
    }
  });
  console.log(`\n=== ${roundDir}: answer-nonword hits=${answerHits}, decoy-filler hits=${decoyHits} (items=${lines.length}) ===`);
  for (const l of hitLines) console.log(l);
}

run("round-1");
run("round-0");
