import { TutorActivityPayloadSchema } from "@/lib/tutor/activity-payload-schema";
import { gradeRule } from "@/lib/tutor/grading/grade-rule";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log("PASS", name);
  } else {
    fail++;
    console.log("FAIL", name);
  }
}
function parse(p: unknown) {
  const r = TutorActivityPayloadSchema.safeParse(p);
  if (!r.success) {
    console.log("PAYLOAD INVALID:", JSON.stringify(r.error.issues));
    throw new Error("invalid payload");
  }
  return r.data;
}

const choice = parse({ form: "CHOICE", variant: "plain", prompt: "q", options: ["a", "b", "c", "d"], correctIndex: 2 });
check("choice correct", gradeRule(choice, { selectedIndex: 2 }, 10).isCorrect === true);
check("choice wrong", gradeRule(choice, { selectedIndex: 0 }, 10).isCorrect === false);

const chip = parse({
  form: "CHIP",
  variant: "rebuild",
  prompt: "order",
  chips: [{ id: 0, text: "To" }, { id: 1, text: "understand" }, { id: 2, text: "memory" }],
  correctOrder: [0, 1, 2],
});
check("chip correct order -> 100%", gradeRule(chip, { order: [0, 1, 2] }, 12).isCorrect === true);
const wrongChip = gradeRule(chip, { order: [2, 1, 0] }, 12);
check("chip wrong order -> not correct (REGRESSION FIX: any-order pass)", wrongChip.isCorrect === false);
check("chip wrong order -> not full score", wrongChip.scoreEarned < 12);

const span = parse({
  form: "SPAN",
  variant: "grammar_error",
  prompt: "find",
  spanTokens: ["Accessing", "this", "data", "depend", "on"],
  correctSpan: [3, 3],
  textFragment: "depend",
});
check("span exact", gradeRule(span, { span: [3, 3] }, 10).isCorrect === true);
check("span off", gradeRule(span, { span: [2, 3] }, 10).isCorrect === false);

const spell = parse({ form: "TEXT", variant: "spell", prompt: "보관소", gradeMode: "rule_exact", acceptedAnswers: ["archive"], inputMode: "short" });
check("spell exact", gradeRule(spell, { answer: "archive" }, 10).isCorrect === true);
check("spell near-miss rejected (REGRESSION FIX: substring pass)", gradeRule(spell, { answer: "archives" }, 10).isCorrect === false);

const tr = parse({ form: "TEXT", variant: "translate", prompt: "To understand memory...", gradeMode: "ai", inputMode: "long", modelAnswer: "기억을 이해하기 위해" });
const trRes = gradeRule(tr, { answer: "기억을 이해하려면" }, 10);
check("translate -> needsAi (defer to Gemini)", trRes.needsAi === true && trRes.ruleResolved === false);

const match = parse({ form: "MATCH", prompt: "연결", pairs: [{ left: "archive", right: "보관소" }, { left: "recall", right: "회상" }] });
check("match all correct", gradeRule(match, { matches: { archive: "보관소", recall: "회상" } }, 10).isCorrect === true);
const partial = gradeRule(match, { matches: { archive: "보관소", recall: "오답" } }, 10);
check("match partial -> not correct, half score", partial.isCorrect === false && partial.scoreEarned === 5);

// span/textFragment mismatch must be REJECTED at schema level (G5 generation-time gate)
const badSpan = TutorActivityPayloadSchema.safeParse({
  form: "SPAN",
  variant: "grammar_error",
  prompt: "find",
  spanTokens: ["Accessing", "this", "data", "depend", "on"],
  correctSpan: [0, 0],
  textFragment: "depend",
});
check("span/textFragment mismatch rejected by schema (G5)", badSpan.success === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
