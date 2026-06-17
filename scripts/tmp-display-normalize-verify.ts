/**
 * (scratch, read-only, DB 불필요) 문제 관리 structured 정규화 검증.
 * normalizeStructuredQuestionForDisplay 가 어법·어휘·반의어의 마커/라벨/정답/보기를
 * 출현순으로 정본화하는지, 동형·비대상은 그대로 통과하는지 합성 데이터로 확인한다.
 * Run: npx tsx scripts/tmp-display-normalize-verify.ts
 */
import { normalizeStructuredQuestionForDisplay } from "../src/components/exams/paper-builder/render-model";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}
const markerOrder = (s: string) =>
  [...String(s).matchAll(/__\(?([A-Ea-e])\)?\s/g)].map((m) => m[1].toUpperCase()).join("");

// ── G1: 어법, source 재유도 (저장 순서 ≠ 출현 순서) ────────────────────────────
{
  console.log("\n[G1] GRAMMAR_ERROR — source 재유도, 출현순 정본화");
  const source = "She decided to run fast. He likes to jump high. They want to swim daily.";
  const q: any = {
    _typeId: "GRAMMAR_ERROR",
    direction: "어법상 틀린 것은?",
    correctAnswer: "(B)",
    passageWithMarkers: "She decided to __(A) swim__ ...",
    markedExpressions: [
      { label: "(A)", expression: "swim", isError: false },
      { label: "(B)", expression: "run", isError: true, errorExpression: "runs" },
      { label: "(C)", expression: "jump", isError: false },
    ],
    options: [
      { label: "①", text: "(A)" },
      { label: "②", text: "(B)" },
      { label: "③", text: "(C)" },
    ],
  };
  const out: any = normalizeStructuredQuestionForDisplay(q, source);
  check("passage 출현순 = ABC (run→A, jump→B, swim→C)", markerOrder(out.passageWithMarkers) === "ABC", markerOrder(out.passageWithMarkers));
  check("정답이 첫 출현(run=오류) → (A)", out.correctAnswer === "(A)", out.correctAnswer);
  check("분석 (A) = run(오류)", out.markedExpressions[0].expression === "run" && out.markedExpressions[0].isError === true && out.markedExpressions[0].label === "(A)", out.markedExpressions[0]);
  check("분석 (B) = jump", out.markedExpressions[1].expression === "jump" && out.markedExpressions[1].label === "(B)", out.markedExpressions[1]);
  check("분석 (C) = swim", out.markedExpressions[2].expression === "swim" && out.markedExpressions[2].label === "(C)", out.markedExpressions[2]);
  check("오류 표면형(runs)이 지문에", out.passageWithMarkers.includes("runs"), out.passageWithMarkers);
}

// ── G2: 어법, baked 폴백 (source 없음), 라벨 뒤죽 ─────────────────────────────
{
  console.log("\n[G2] GRAMMAR_ERROR — baked 폴백, 라벨 뒤죽(B,A) → 출현순(A,B)");
  const q: any = {
    _typeId: "GRAMMAR_ERROR",
    direction: "어법상 틀린 것은?",
    correctAnswer: "(B)",
    passageWithMarkers: "The cat __(B) runs__ fast and __(A) jumps__ high.",
    markedExpressions: [
      { label: "(A)", expression: "jumps", isError: false },
      { label: "(B)", expression: "run", isError: true, errorExpression: "runs" },
    ],
    options: [
      { label: "①", text: "(A)" },
      { label: "②", text: "(B)" },
    ],
  };
  const out: any = normalizeStructuredQuestionForDisplay(q); // source 없음
  check("passage 출현순 = AB", markerOrder(out.passageWithMarkers) === "AB", markerOrder(out.passageWithMarkers));
  check("정답 = (A) (runs 가 첫 출현)", out.correctAnswer === "(A)", out.correctAnswer);
  check("분석 (A) = run(오류, 원래 B)", out.markedExpressions[0].expression === "run" && out.markedExpressions[0].isError === true, out.markedExpressions[0]);
  check("분석 (B) = jumps(원래 A)", out.markedExpressions[1].expression === "jumps", out.markedExpressions[1]);
}

// ── V1: 어휘, baked, 라벨 뒤죽 ───────────────────────────────────────────────
{
  console.log("\n[V1] VOCAB_CHOICE — baked, 부적절 어휘 첫 출현");
  const q: any = {
    _typeId: "VOCAB_CHOICE",
    direction: "문맥상 적절하지 않은 것은?",
    correctAnswer: "2",
    passageWithMarkers: "I felt __(b) happy__ then became __(a) sad__ later.",
    markedWords: [
      { label: "(a)", word: "sad", originalWord: "sad", isInappropriate: false },
      { label: "(b)", word: "happy", originalWord: "happy", isInappropriate: true, betterWord: "upset" },
    ],
    options: [
      { label: "①", text: "(a)" },
      { label: "②", text: "(b)" },
    ],
  };
  const out: any = normalizeStructuredQuestionForDisplay(q);
  check("passage 출현순 = ab", markerOrder(out.passageWithMarkers) === "AB", markerOrder(out.passageWithMarkers));
  check("정답 = 1 (happy 부적절이 첫 출현)", out.correctAnswer === "1", out.correctAnswer);
  check("분석 ① = happy(부적절)", out.markedWords[0].word === "happy" && out.markedWords[0].isInappropriate === true && out.markedWords[0].label === "①", out.markedWords[0]);
  check("분석 ② = sad", out.markedWords[1].word === "sad" && out.markedWords[1].label === "②", out.markedWords[1]);
}

// ── A1: 반의어, source, 보기/지문/정답 동시 재정렬 ───────────────────────────
{
  console.log("\n[A1] ANTONYM — source, 보기·지문·정답 출현순 동시 정본화");
  const source = "The hero was brave but the villain was cruel while the king stayed wise.";
  const q: any = {
    _typeId: "ANTONYM",
    direction: "단어-반의어 짝이 옳지 않은 것은?",
    correctAnswer: "2",
    passageWithMarkers: "...",
    markedWords: [
      { label: "(A)", word: "wise", antonym: "foolish" },
      { label: "(B)", word: "brave", antonym: "cowardly", isIncorrectPair: true },
      { label: "(C)", word: "cruel", antonym: "kind" },
    ],
    options: [
      { label: "①", text: "wise - foolish" },
      { label: "②", text: "brave - cowardly" },
      { label: "③", text: "cruel - kind" },
    ],
  };
  const out: any = normalizeStructuredQuestionForDisplay(q, source);
  check("passage 출현순 = ABC (brave,cruel,wise)", markerOrder(out.passageWithMarkers) === "ABC", markerOrder(out.passageWithMarkers));
  check("보기 출현순 재정렬 — ①=(A) brave", /^\(A\)\s*brave/.test(out.options[0].text) && out.options[0].label === "①", out.options[0]);
  check("보기 ②=(B) cruel", /^\(B\)\s*cruel/.test(out.options[1].text), out.options[1]);
  check("보기 ③=(C) wise", /^\(C\)\s*wise/.test(out.options[2].text), out.options[2]);
  check("정답 = ① (brave 짝이 오류, 첫 출현)", out.correctAnswer === "①", out.correctAnswer);
  check("분석 (A) = brave", out.markedWords[0].word === "brave" && out.markedWords[0].label === "(A)", out.markedWords[0]);
}

// ── S1: 동형 — faithful 유지(미정규화) ───────────────────────────────────────
{
  console.log("\n[S1] 동형(_similarQuestionGenJobId) — 미정규화(원본 그대로)");
  const q: any = {
    _typeId: "GRAMMAR_ERROR",
    _similarQuestionGenJobId: "job_1",
    direction: "d",
    correctAnswer: "(B)",
    passageWithMarkers: "The cat __(B) runs__ fast and __(A) jumps__ high.",
    markedExpressions: [{ label: "(B)", expression: "run", isError: true, errorExpression: "runs" }],
  };
  const out: any = normalizeStructuredQuestionForDisplay(q);
  check("동형은 입력 객체 그대로 반환(identity)", out === q);
}

// ── N1: 비대상 유형 — 그대로 통과 ────────────────────────────────────────────
{
  console.log("\n[N1] 비대상(TOPIC) — identity");
  const q: any = { _typeId: "TOPIC", direction: "d", options: [], correctAnswer: "1" };
  const out: any = normalizeStructuredQuestionForDisplay(q, "some passage");
  check("비대상은 identity 반환", out === q);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
