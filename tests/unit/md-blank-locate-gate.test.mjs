import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// 빈칸원문 축자 게이트 ↔ 후처리 탐색기 통일(26-09-08) 계약.
// 실측 재현: 지문 `… dimension of 'cyberspace.' We …`(마침표가 닫는 인용부호 안)에
// 모델이 빈칸원문 `… of 'cyberspace'` 를 내면 구판 게이트가 4/4 하드 반려(PH 9/2·9/8).
// 후처리(findExpressionInPassageFuzzy)는 같은 출력을 통과시켰다 → 게이트·어댑터·스냅이
// 같은 탐색기(locateBlankExpression)를 쓴다. 지문에 없는 표현은 여전히 반려.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import parser from "@/lib/md-qgen/parser";
import adapter from "@/lib/md-qgen/adapter";
const {
  gateMdQuestion,
  gateMdMultiBlank,
  locateBlankExpression,
  autoSnapBlankExpression,
  snapExpressionSpan,
  parseMdBlank,
} = parser;
const { adaptMdBlankToAiQuestion, adaptMdMultiBlankToAiQuestion } = adapter;

const passage =
  "Today the writing of code is no longer confined to the separate dimension of 'cyberspace.' We live among smart objects that decide for us.";
const md = [
  "빈칸원문: no longer confined to the separate dimension of 'cyberspace'",
  "① a", "② b", "③ c", "④ d", "⑤ e",
  "정답: ③",
  "해설: x.",
  "오답:",
  "① w1.", "② w2.", "④ w4.", "⑤ w5.",
].join("\\n");

let q = parseMdBlank(md);
const snapped = autoSnapBlankExpression(q, passage);
q = snapped.question;
const located = locateBlankExpression(passage, q.originalExpression);
const gate = gateMdQuestion(q, passage);
const adapted = adaptMdBlankToAiQuestion(q, passage, "KILLER");
const negGate = gateMdQuestion({ ...q, originalExpression: "confined to the separate universe of cyberspace" }, passage);
const negAdapt = adaptMdBlankToAiQuestion({ ...q, originalExpression: "confined to the separate universe of cyberspace" }, passage, "KILLER");
const snapNull = snapExpressionSpan(passage, "no longer confined to the separate dimension of 'cyberspace'");

const multi = {
  kind: "multiBlank",
  blanks: [
    { label: "(A)", expression: "writing of code" },
    { label: "(B)", expression: "of code is no longer" },
  ],
  options: [], answer: "", explanation: "", wrong: [],
};
const multiOverlap = gateMdMultiBlank(multi as any, passage, { blankCount: 2 });
const multiOk = {
  kind: "multiBlank",
  blanks: [
    { label: "(A)", expression: "writing of code" },
    { label: "(B)", expression: "dimension of 'cyberspace'" },
  ],
  options: [
    { label: "①", text: "a …… b", blankValues: ["a", "b"] },
    { label: "②", text: "a …… b", blankValues: ["a", "b"] },
    { label: "③", text: "a …… b", blankValues: ["a", "b"] },
    { label: "④", text: "a …… b", blankValues: ["a", "b"] },
    { label: "⑤", text: "a …… b", blankValues: ["a", "b"] },
  ],
  answer: "①", explanation: "x.", wrong: [
    { label: "②", text: "w." }, { label: "③", text: "w." }, { label: "④", text: "w." }, { label: "⑤", text: "w." },
  ],
};
const multiGate = gateMdMultiBlank(multiOk as any, passage, { blankCount: 2 });
const multiAdapt = adaptMdMultiBlankToAiQuestion(multiOk as any, passage, "KILLER", "PARAPHRASE");

console.log(JSON.stringify({
  located, gate, adaptOk: adapted.ok, adaptErr: adapted.error ?? null,
  surrounding: (adapted.aiQuestion as any)?.surroundingText ?? "",
  corrections: snapped.corrections,
  negGate, negAdaptOk: negAdapt.ok, snapNull,
  multiOverlap, multiGate, multiAdaptOk: multiAdapt.ok, multiAdaptErr: multiAdapt.error ?? null,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".md-blank-locate-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const r = runHarness();

test("인용부호 안 마침표('cyberspace.')는 빈칸원문 'cyberspace' 와 축자로 본다 — 게이트 통과", () => {
  assert.ok(r.located, "locate 실패");
  assert.equal(r.located.text, "no longer confined to the separate dimension of 'cyberspace");
  assert.deepEqual(r.gate, []);
});

test("어댑터도 같은 판정 — 원문 좌표에서 surroundingText 를 절취한다", () => {
  assert.equal(r.adaptOk, true, r.adaptErr ?? "");
  assert.ok(r.surrounding.includes("cyberspace"), r.surrounding);
});

test("스냅은 개입하지 않는다(탐색기가 찾는 표현은 스냅 불요)", () => {
  assert.equal(r.snapNull, null);
  assert.deepEqual(r.corrections, []);
});

test("지문에 없는 표현은 여전히 반려된다(게이트·어댑터 동일)", () => {
  assert.ok(r.negGate.includes("빈칸원문이 지문에 축자로 없음"), r.negGate.join(","));
  assert.equal(r.negAdaptOk, false);
});

test("다중 빈칸 — 원문 좌표로 겹침을 판정하고, 인용부호 마침표 표현도 통과", () => {
  assert.ok(r.multiOverlap.some((s) => s.includes("겹침")), r.multiOverlap.join(","));
  assert.ok(!r.multiGate.some((s) => s.includes("축자로 없음")), r.multiGate.join(","));
  assert.equal(r.multiAdaptOk, true, r.multiAdaptErr ?? "");
});
