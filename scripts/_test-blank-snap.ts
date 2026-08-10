// autoSnapBlankExpression 결정론 검증 (26-07-22)
import { autoSnapBlankExpression, type MdBlankQuestion } from "../src/lib/md-qgen/parser";

const passage =
  "The brain constantly filters incoming information to protect its limited processing capacity. " +
  "When readers encounter a novel argument, they must reorganize their existing mental frameworks to accommodate it. " +
  "This reorganization demands sustained attention and effort. The brain resists such demands.";

function q(oe: string): MdBlankQuestion {
  return {
    kind: "blank",
    originalExpression: oe,
    options: [],
    answer: "①",
    explanation: "x",
    wrong: [],
  } as unknown as MdBlankQuestion;
}

const cases: Array<[string, string, boolean]> = [
  // [설명, 모델 인용, 스냅 기대 여부]
  ["정확 일치 → 무변경", "reorganize their existing mental frameworks to accommodate it", false],
  ["내부 1단어 어긋남 → 스냅", "reorganize their current mental frameworks to accommodate it", true],
  ["내부 어순·관사 어긋남 → 스냅", "reorganize their existing mental framework to accommodate it", true],
  ["짧은 구(3단어) → 스냅 금지", "The brain resists", false],
  ["머리가 아예 다름 → 스냅 실패(반려 유지)", "restructure your existing mental frameworks to accommodate it", false],
];

let pass = 0;
for (const [name, oe, expectSnap] of cases) {
  const r = autoSnapBlankExpression(q(oe), passage);
  const snapped = r.corrections.length > 0;
  const verbatimAfter = passage.includes(r.question.originalExpression ?? "");
  const ok = snapped === expectSnap && (!snapped || verbatimAfter);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — snapped=${snapped}${snapped ? ` → "${r.question.originalExpression}"` : ""}`);
  if (ok) pass += 1;
}
console.log(`\n${pass}/${cases.length} 통과`);
if (pass !== cases.length) process.exit(1);
