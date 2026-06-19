/**
 * AI 문제 수정 — 결정론 가드(모델 호출 없음). 회귀 방지용 영구 검증.
 *   npx tsx scripts/verify-question-ai-edit.ts
 *
 * 검증 항목:
 *   A) 모든 구조화 유형에 빠른 포커스 프리셋 존재
 *   B) buildEditPrompt 가 모든 유형에서 무throw + 잠금계약/유형/지시/베이스라인 포함
 *   C) getAiResponseSchema 가 파생옵션으로 무throw 해석
 *   D) deriveEditSchemaOptions 가 베이스라인에서 카운트 정확 파생
 *   E) computeEditChanges 의 added/removed/changed/reordered/none 판정
 *   F) 누설 가드: SUMMARY_WRITING 학생 직렬화(buildGeneratedQuestionText)에 정답 미포함,
 *      서버 직렬화(serializeBaselineForEdit)에는 정답 포함
 */
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import { AI_QUESTION_SCHEMAS, getAiResponseSchema } from "../src/lib/question-ai-schemas-mc";
import { QUESTION_SCHEMAS } from "../src/lib/question-schemas";
import { buildGeneratedQuestionText } from "../src/lib/question-generation-persistence";
import { getEditFocusPresets } from "../src/lib/question-ai-edit/focus-presets";
import { buildEditPrompt } from "../src/lib/question-ai-edit/build-edit-prompt";
import { deriveEditSchemaOptions } from "../src/lib/question-ai-edit/derive-type-settings";
import { computeEditChanges } from "../src/lib/question-ai-edit/change-summary";
import { computeDetailedDiff } from "../src/lib/question-ai-edit/detailed-diff";
import { serializeBaselineForEdit } from "../src/lib/question-ai-edit/serialize-baseline";

type Rec = Record<string, unknown>;

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

// 지원 유형 = AI 스키마 또는 구조 스키마가 있는 모든 유형.
const SUPPORTED_TYPES = Array.from(
  new Set([...Object.keys(AI_QUESTION_SCHEMAS), ...Object.keys(QUESTION_SCHEMAS)]),
).filter((t) => t !== "CUSTOM_LAYOUT");

// 유형별 대표 베이스라인(최소). 카운트 파생/직렬화/프롬프트 빌드 검증용.
function sampleBaseline(subType: string): Rec {
  const common: Rec = {
    _typeId: subType,
    direction: "다음 글에 대한 문제입니다.",
    difficulty: "INTERMEDIATE",
    explanation: "정답 해설입니다.",
    keyPoints: ["포인트1", "포인트2", "포인트3"],
    tags: ["테스트"],
  };
  const fiveOptions = [1, 2, 3, 4, 5].map((n) => ({ label: String(n), text: `선택지 ${n}` }));
  switch (subType) {
    case "GRAMMAR_ERROR":
      return {
        ...common,
        markedExpressions: ["A", "B", "C", "D", "E"].map((l, i) => ({
          label: l,
          expression: `expr${i}`,
          isError: i === 2,
          pointCode: "a",
        })),
        options: fiveOptions,
        correctAnswer: "3",
      };
    case "VOCAB_CHOICE":
    case "ANTONYM":
      return {
        ...common,
        markedWords: ["A", "B", "C", "D", "E"].map((l, i) => ({ label: l, word: `w${i}` })),
        options: fiveOptions,
        correctAnswer: "3",
      };
    case "SUMMARY_WRITING":
      return {
        ...common,
        summaryWithBlanks: "The author argues that (A) leads to (B).",
        koreanGloss: "저자는 (A)가 (B)로 이어진다고 주장한다.",
        blanks: [
          { label: "A", answer: "CURIOSITY", firstLetterHint: "C" },
          { label: "B", answer: "INNOVATION", firstLetterHint: "I" },
        ],
        modelAnswer: "The author argues that CURIOSITY leads to INNOVATION.",
        correctAnswer: "The author argues that CURIOSITY leads to INNOVATION.",
      };
    case "SUMMARY_COMPLETE":
      return {
        ...common,
        summaryWithBlanks: "Summary with (A) and (B).",
        blanks: [
          { label: "A", answer: "alpha" },
          { label: "B", answer: "beta" },
        ],
        correctAnswer: "(A) alpha, (B) beta",
      };
    case "SUMMARY_COMPLETE_MC":
      return {
        ...common,
        summaryWithBlanks: "Summary with (A) and (B).",
        blanks: [
          { label: "A", answer: "alpha" },
          { label: "B", answer: "beta" },
        ],
        options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), blankA: `a${n}`, blankB: `b${n}` })),
        correctAnswer: "3",
      };
    case "CONTENT_MATCH":
      return { ...common, options: fiveOptions, correctAnswer: "3", matchType: "불일치" };
    case "SENTENCE_INSERT":
      return { ...common, givenSentence: "Inserted sentence.", options: fiveOptions, correctAnswer: "3" };
    case "GRAMMAR_CORRECTION":
      return {
        ...common,
        underlinedSegments: [
          { label: "A", sourceText: "he go", displayedText: "he go", isError: true, errorPart: "go", correctedPart: "goes" },
        ],
        correctAnswer: "(A) goes",
      };
    case "BLANK_INFERENCE":
      return {
        ...common,
        originalExpression: "the key idea",
        options: fiveOptions,
        correctAnswer: "3",
        blankAnswerMode: "SOURCE_EXACT",
      };
    case "WORD_ORDER":
      return { ...common, scrambledWords: ["is", "this", "test", "a"], modelAnswer: "this is a test" };
    case "CONDITIONAL_WRITING":
    case "SENTENCE_TRANSFORM":
      return { ...common, conditions: ["조건1", "조건2"], modelAnswer: "Model answer sentence." };
    case "FILL_BLANK_KEY":
      return { ...common, sentenceWithBlank: "The _____ is important.", answer: "key idea" };
    case "SYNONYM":
    case "CONTEXT_MEANING":
      return { ...common, targetWord: "vivid", options: fiveOptions, correctAnswer: "3" };
    default:
      return { ...common, options: fiveOptions, correctAnswer: "3" };
  }
}

async function main() {
  console.log(`Supported structured types: ${SUPPORTED_TYPES.length}`);

  // A) 프리셋 커버리지
  console.log("\n[A] focus presets coverage");
  for (const t of SUPPORTED_TYPES) {
    const presets = getEditFocusPresets(t);
    check(`presets:${t}`, presets.length > 0 && presets.every((p) => p.label && p.instruction));
  }

  // B) buildEditPrompt 무throw + 핵심 포함
  console.log("\n[B] buildEditPrompt integrity");
  for (const t of SUPPORTED_TYPES) {
    try {
      const baseline = sampleBaseline(t);
      const { system, prompt } = buildEditPrompt({
        subType: t,
        schoolType: "고등학교",
        passageContent: "This is a sample passage. It has two sentences.",
        baseline,
        instruction: "테스트 지시: 오답을 더 매력적으로.",
        difficulty: "INTERMEDIATE",
        generationPlan: "STANDARD",
      });
      const text = `${system ?? ""}\n${prompt}`;
      check(`prompt-build:${t}`, !!system && !!prompt);
      check(`prompt-has-lock:${t}`, text.includes("수정 계약") && text.includes("고정"));
      check(`prompt-has-instruction:${t}`, text.includes("테스트 지시"));
      check(`prompt-has-baseline:${t}`, text.includes("현재 문제"));
    } catch (e) {
      check(`prompt-build:${t}`, false, e instanceof Error ? e.message : String(e));
    }
  }

  // C) getAiResponseSchema 무throw (파생옵션 적용)
  console.log("\n[C] schema resolution with derived options");
  for (const t of SUPPORTED_TYPES) {
    try {
      const baseline = sampleBaseline(t);
      const opts = deriveEditSchemaOptions(t, baseline);
      if (AI_QUESTION_SCHEMAS[t]) {
        const schema = getAiResponseSchema(t, opts);
        check(`schema:${t}`, !!schema);
      } else {
        check(`schema:${t}`, !!QUESTION_SCHEMAS[t]);
      }
    } catch (e) {
      check(`schema:${t}`, false, e instanceof Error ? e.message : String(e));
    }
  }

  // D) deriveEditSchemaOptions 카운트 정확
  console.log("\n[D] derive type-settings counts");
  check(
    "derive:GRAMMAR_ERROR markers=5",
    deriveEditSchemaOptions("GRAMMAR_ERROR", sampleBaseline("GRAMMAR_ERROR")).grammarMarkerCount === 5,
  );
  check(
    "derive:SUMMARY_WRITING blanks=2",
    deriveEditSchemaOptions("SUMMARY_WRITING", sampleBaseline("SUMMARY_WRITING")).summaryWritingBlankCount === 2,
  );
  check(
    "derive:SENTENCE_INSERT slots=5",
    deriveEditSchemaOptions("SENTENCE_INSERT", sampleBaseline("SENTENCE_INSERT")).sentenceInsertSlotCount === 5,
  );
  check(
    "derive:CONTENT_MATCH options=5",
    deriveEditSchemaOptions("CONTENT_MATCH", sampleBaseline("CONTENT_MATCH")).contentMatchOptionCount === 5,
  );

  // E) computeEditChanges
  console.log("\n[E] change-summary detection");
  const before: Rec = { direction: "A", options: [{ label: "1", text: "x" }, { label: "2", text: "y" }], correctAnswer: "1" };
  check("change:none", computeEditChanges(before, { ...before }).length === 0);
  check(
    "change:direction",
    computeEditChanges(before, { ...before, direction: "B" }).some((c) => c.field === "direction" && c.kind === "changed"),
  );
  check(
    "change:answer",
    computeEditChanges(before, { ...before, correctAnswer: "2" }).some((c) => c.label === "정답" && c.kind === "changed"),
  );
  check(
    "change:reordered",
    computeEditChanges(before, {
      ...before,
      options: [{ label: "1", text: "y" }, { label: "2", text: "x" }],
    }).some((c) => c.field === "options" && c.kind === "reordered"),
  );
  check(
    "change:removed",
    computeEditChanges(before, { ...before, options: undefined }).some((c) => c.field === "options" && c.kind === "removed"),
  );

  // F) 누설 가드 — SUMMARY_WRITING
  console.log("\n[F] SUMMARY_WRITING leak guard");
  const sw = sampleBaseline("SUMMARY_WRITING");
  const studentText = buildGeneratedQuestionText(sw);
  check("leak:student-no-CURIOSITY", !studentText.includes("CURIOSITY"), studentText.slice(0, 120));
  check("leak:student-no-INNOVATION", !studentText.includes("INNOVATION"));
  check("leak:student-no-modelAnswer", !studentText.includes(String(sw.modelAnswer)));
  const serverText = serializeBaselineForEdit(sw);
  check("baseline:server-includes-answer", serverText.includes("CURIOSITY") && serverText.includes("INNOVATION"));

  // G) 상세 변경 내역 — 필드/항목별 before→after
  console.log("\n[G] detailed diff (per-field/item)");
  {
    const before: Rec = {
      _typeId: "GRAMMAR_ERROR",
      direction: "어법상 틀린 것은?",
      options: [
        { label: "1", text: "alpha" },
        { label: "2", text: "beta" },
        { label: "3", text: "gamma" },
      ],
      correctAnswer: "2",
      explanation: "원래 해설입니다.",
      markedExpressions: [
        { label: "A", expression: "go", isError: false, pointCode: "a" },
        { label: "B", expression: "runs", isError: true, pointCode: "d" },
      ],
    };
    // 선지 ② 텍스트 변경 + 정답 2→3 + 해설 변경 + 밑줄 B 변경.
    const after: Rec = {
      ...before,
      options: [
        { label: "1", text: "alpha" },
        { label: "2", text: "BETA-changed" },
        { label: "3", text: "gamma" },
      ],
      correctAnswer: "3",
      explanation: "원래 해설입니다 더 자세히.",
      markedExpressions: [
        { label: "A", expression: "go", isError: false, pointCode: "a" },
        { label: "B", expression: "run", isError: true, pointCode: "d" },
      ],
    };
    const d = computeDetailedDiff(before, after);
    const find = (cat: string, ref?: string) =>
      d.find((e) => e.category === cat && (ref === undefined || e.ref === ref));
    check("diff:option ② changed", !!find("선택지", "②") && find("선택지", "②")!.kind === "changed");
    check("diff:option ② before/after", find("선택지", "②")?.before === "beta" && find("선택지", "②")?.after === "BETA-changed");
    check("diff:answer changed ②→③", !!find("정답") && find("정답")!.before === "②" && find("정답")!.after === "③");
    check("diff:explanation changed", !!find("해설") && find("해설")!.kind === "changed");
    check("diff:marked B changed", !!find("밑줄 표현", "(B)"));
    check("diff:no spurious option ① change", !d.some((e) => e.category === "선택지" && e.ref === "①"));

    // 순서만 변경 → reordered 한 줄.
    const reBefore: Rec = { _typeId: "SENTENCE_ORDER", options: [{ label: "1", text: "x" }, { label: "2", text: "y" }] };
    const reAfter: Rec = { _typeId: "SENTENCE_ORDER", options: [{ label: "1", text: "y" }, { label: "2", text: "x" }] };
    const rd = computeDetailedDiff(reBefore, reAfter);
    check("diff:reordered single entry", rd.filter((e) => e.category === "선택지").length === 1 && rd[0]?.kind === "reordered");

    // 변화 없음 → 빈 배열.
    check("diff:identical → empty", computeDetailedDiff(before, before).length === 0);
  }

  console.log(`\n========== RESULT: ${pass} pass / ${fail} fail ==========`);
  if (fail > 0) {
    console.log("FAILURES:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
