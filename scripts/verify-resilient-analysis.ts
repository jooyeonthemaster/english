/**
 * DETERMINISTIC REGRESSION TEST — resilient passage-analysis generation (CI-safe, no network).
 *
 * Exercises the REAL pipeline (real Zod schemas, real coercion, real orchestrator) while injecting
 * the model call (llmText) to reproduce the EXACT prod failure modes deterministically and prove the
 * resilient "fail a section → resume → complete" structure:
 *   A) long passage (52 sentences) breaks the OLD whole-schema but the NEW coercion truncates→passes.
 *   B) resilient completes a long passage via per-section generation, repairing schema-missed sections.
 *   C) RESUME: given a partial checkpoint, ONLY the missing sections are regenerated (precise pick-up).
 *   D) draft-salvage: a partial holistic draft is salvaged, missing sections completed per-section.
 *   F) graceful degradation: an unfixable section is omitted but the report still renders (ok+valid).
 *   G) a fallback section is excluded from the checkpoint so a resume regenerates the real one.
 *
 * Run: npx tsx scripts/verify-resilient-analysis.ts   (exits non-zero if any proof fails)
 */
import { hashContent } from "../src/lib/passage-utils";
import {
  generateAnalysisReportResilient,
  type ResilientCheckpoint,
  type LlmTextFn,
} from "../src/lib/passage-report/analysis-report/resilient-generate";
import {
  analysisReportSchema,
  analysisReportGenerationSchema,
  learningWorksheetSectionSchema,
  type LearningWorksheetSection,
} from "../src/lib/passage-report/analysis-report/schema";
import { coerceAndValidate } from "../src/lib/passage-report/analysis-report/section-coerce";
import {
  generateLearningWorksheetResilient,
  type LearningWorksheetInferenceSet,
} from "../src/lib/passage-report/analysis-report/generate";

// ── realistic section builders (shapes that match the real per-section schemas) ──
function passageSection(nSentences: number) {
  return {
    kind: "passage",
    sentences: Array.from({ length: nSentences }, (_, i) => ({
      n: i + 1,
      en: `This is original sentence number ${i + 1} about memory and learning.`,
      ko: `이것은 기억과 학습에 관한 ${i + 1}번째 원문 문장이에요.`,
    })),
    keywords: ["memory", "retrieval", "recall", "recognition", "spacing", "sleep"],
  };
}
function summarySection() {
  return { kind: "summary", sentences: ["기억은 여러 과정의 묶음이에요.", "인출 노력이 기억을 강화해요."], thesisEn: "Effortful retrieval strengthens memory." };
}
function grammarRow(ok: boolean) {
  const base = {
    sentenceNo: 3,
    excerpt: "search and reconstruct the past",
    pointCode: "i",
    point: "(i) 병렬 — search 와 reconstruct",
    trap: "⚠ 시험에선 reconstructing 으로 바꿔 밑줄 쳐요.",
    example: "We learn to search and reconstructing memories.",
    exampleWrong: "reconstructing",
    exampleCorrect: "reconstruct",
  } as Record<string, unknown>;
  if (ok) base.explanation = "이 자리는 동사를 원형으로 쓸지 고르는 자리예요. and 앞 search 와 짝(병렬: 앞뒤를 똑같은 모양으로)을 이뤄야 해서 reconstruct 가 정답이에요.";
  return base; // ok=false → explanation 누락 → coercion 이 drop
}
function grammarSection(okRows: number, badRows: number) {
  return {
    kind: "grammar",
    note: "※ ⚠ 는 함정",
    rows: [...Array.from({ length: okRows }, () => grammarRow(true)), ...Array.from({ length: badRows }, () => grammarRow(false))],
  };
}
function examFocusSection(okRows: number, badRows: number) {
  const ok = { sentenceNo: 4, type: "빈칸추론", asks: "핵심 개념어를 물어요.", logicLocation: "④ 대조축 뒤", strategy: "not A but B 구조라 논리로 추론해요." };
  const bad = { asks: "...", strategy: "..." }; // type 누락 → drop
  return { kind: "exam-focus", rows: [...Array.from({ length: okRows }, () => ok), ...Array.from({ length: badRows }, () => bad)] };
}
function vocabularySection() {
  return {
    kind: "vocabulary",
    rows: Array.from({ length: 12 }, (_, i) => ({ headword: `term${i}`, pronunciation: "텀", meaning: "본문 의미 뜻", tier: "test", difficulty: 3, synonyms: "syn", antonyms: "—" })),
  };
}
function parsingSection() {
  return { kind: "parsing", items: [{ sentenceNo: 5, en: "Because recognition supplies the cue, it is easier.", parts: [{ label: "[부사절]", text: "Because recognition supplies the cue" }, { label: "[주절]", text: "it is easier" }], translation: "→ 재인은 단서를 줘서 더 쉬워요." }] };
}
function learningWorksheetSection(rows: number) {
  return { kind: "learning-worksheet", title: "지문 논리 구조 분석", logicRows: Array.from({ length: rows }, (_, i) => ({ sentenceNo: i + 1, functionLabel: "주제 제시", keyPoint: "글의 핵심을 제시해요." })) };
}

const LONG = "Memory is reconstructive and effortful retrieval strengthens it. ".repeat(60); // >3000 chars → skipDraft
const SHORT = "Memory is reconstructive. Effortful retrieval strengthens it. Sleep consolidates it.";

// scripted DI stub: per (label, attempt) -> JSON string. Records call counts.
function makeStub(plan: Partial<Record<string, (attempt: number) => unknown | null>>) {
  const calls: Record<string, number> = {};
  const fn: LlmTextFn = async ({ label, attempt }) => {
    calls[label] = (calls[label] ?? 0) + 1;
    const make = plan[label];
    if (!make) throw new Error(`stub: no plan for ${label}`);
    const out = make(attempt);
    if (out === null) throw new Error(`stub: forced throw for ${label} attempt ${attempt}`);
    return { text: JSON.stringify(out) };
  };
  return { fn, calls };
}

function ok(b: boolean) {
  return b ? "PASS" : "FAIL";
}

async function main() {
  const results: Array<[string, boolean]> = [];

  // ── A) OLD whole-schema vs NEW coercion on a 52-sentence passage ─────────────
  console.log(`\n=== A) long passage: OLD whole-schema vs NEW coercion ===`);
  const bigReport = { meta: { titleKo: "t", titleEn: "t", category: "c", theme: "th", difficulty: 3, solveTime: "3분", examTypes: "빈칸추론" }, sections: [passageSection(52), summarySection()] };
  const oldParse = analysisReportGenerationSchema.safeParse(bigReport);
  const newCoerce = coerceAndValidate("passage", passageSection(52));
  const coercedCount = newCoerce.ok && newCoerce.section.kind === "passage" ? newCoerce.section.sentences.length : -1;
  console.log(`  OLD analysisReportGenerationSchema(52 sentences): success=${oldParse.success} (expect false — passage.sentences max 40)`);
  console.log(`  NEW coerce('passage', 52 sentences): ok=${newCoerce.ok}, sentences=${coercedCount} (expect 40)`);
  results.push(["A old-fails-new-coerces", !oldParse.success && newCoerce.ok && coercedCount === 40]);

  // ── B) resilient completes long passage; repairs schema-missed sections ──────
  console.log(`\n=== B) resilient completes long passage (per-section repair) ===`);
  const stubB = makeStub({
    passage: () => passageSection(52), // over cap → coerced to 40
    summary: () => summarySection(),
    grammar: (a) => (a === 0 ? grammarSection(0, 1) : grammarSection(6, 0)), // a0: all bad→empty→fail; a1: valid (repair)
    "exam-focus": () => examFocusSection(3, 1), // 3 good + 1 bad → keep 3 (partial salvage), valid a0
    vocabulary: () => vocabularySection(),
    parsing: () => parsingSection(),
    "learning-worksheet": (a) => (a === 0 ? learningWorksheetSection(2) : learningWorksheetSection(5)), // a0: min3 fail; a1 valid
  });
  const resB = await generateAnalysisReportResilient({ passageContent: LONG, schoolType: "HIGH", grade: 2 }, { contentHash: hashContent(LONG), llmText: stubB.fn });
  const wholeB = analysisReportSchema.safeParse(resB.report);
  console.log(`  complete=${resB.completeness.complete}, draftUsed=${resB.draftUsed}, rounds=${resB.rounds}`);
  console.log(`  present=[${resB.completeness.present.join(", ")}]`);
  console.log(`  per-section attempts: ${Object.entries(resB.perSection).map(([k, v]) => `${k}:${v?.attempts}`).join("  ")}`);
  console.log(`  grammar repaired (2 attempts)=${resB.perSection.grammar?.attempts === 2}, worksheet repaired=${resB.perSection["learning-worksheet"]?.attempts === 2}`);
  console.log(`  WHOLE-REPORT analysisReportSchema valid=${wholeB.success}`);
  results.push(["B resilient-completes-long", resB.completeness.complete && wholeB.success && resB.perSection.grammar?.attempts === 2]);

  // ── C) RESUME precision: seed 4 sections, expect only 3 missing regenerated ──
  console.log(`\n=== C) resume from partial checkpoint (4 done, 3 missing) ===`);
  const seeded: ResilientCheckpoint = {
    contentHash: hashContent(LONG),
    meta: resB.checkpoint.meta,
    sections: {
      passage: resB.checkpoint.sections.passage,
      summary: resB.checkpoint.sections.summary,
      vocabulary: resB.checkpoint.sections.vocabulary,
      "learning-worksheet": resB.checkpoint.sections["learning-worksheet"],
    },
    errors: {},
    updatedAt: 0,
  };
  const stubC = makeStub({
    grammar: () => grammarSection(6, 0),
    "exam-focus": () => examFocusSection(3, 0),
    parsing: () => parsingSection(),
    // NOTE: no plan for passage/summary/vocab/worksheet → if called, stub throws (proves they are NOT called)
  });
  const resC = await generateAnalysisReportResilient({ passageContent: LONG, schoolType: "HIGH", grade: 2 }, { contentHash: hashContent(LONG), checkpoint: seeded, llmText: stubC.fn });
  const calledKinds = Object.keys(stubC.calls).sort();
  const expectedCalled = ["exam-focus", "grammar", "parsing"];
  console.log(`  model CALLED for: [${calledKinds.join(", ")}]  (expect exactly ${expectedCalled.join(", ")})`);
  console.log(`  complete=${resC.completeness.complete}, whole valid=${analysisReportSchema.safeParse(resC.report).success}`);
  const cPass = resC.completeness.complete && JSON.stringify(calledKinds) === JSON.stringify(expectedCalled) && analysisReportSchema.safeParse(resC.report).success;
  results.push(["C resume-regenerates-only-missing", cPass]);

  // ── D) draft-salvage path (short passage → holistic draft) ───────────────────
  console.log(`\n=== D) holistic draft salvage (short passage) ===`);
  const stubD = makeStub({
    draft: () => ({
      meta: { titleKo: "기억", titleEn: "Memory", category: "비문학", theme: "인지", difficulty: 3, solveTime: "3분", examTypes: "빈칸추론" },
      sections: [passageSection(8), summarySection(), vocabularySection(), parsingSection(), learningWorksheetSection(5), grammarSection(0, 1) /* bad→salvage drops→missing */],
      // exam-focus entirely absent from draft → must be completed per-section
    }),
    grammar: () => grammarSection(6, 0), // completed per-section
    "exam-focus": () => examFocusSection(4, 0), // completed per-section
  });
  const resD = await generateAnalysisReportResilient({ passageContent: SHORT, schoolType: "HIGH", grade: 2 }, { contentHash: hashContent(SHORT), llmText: stubD.fn });
  console.log(`  draftUsed=${resD.draftUsed}, complete=${resD.completeness.complete}`);
  console.log(`  sources: ${Object.entries(resD.perSection).map(([k, v]) => `${k}:${v?.source}`).join("  ")}`);
  const dPass = resD.draftUsed && resD.completeness.complete && resD.perSection.passage?.source === "draft" && resD.perSection["exam-focus"]?.source === "section-gen" && analysisReportSchema.safeParse(resD.report).success;
  results.push(["D draft-salvage+complete-missing", dPass]);

  // ── F) graceful degradation: parsing unfixable → omitted but report renders ──
  console.log(`\n=== F) graceful degradation (unfixable section omitted, report still valid) ===`);
  const stubF = makeStub({
    passage: () => passageSection(10),
    summary: () => summarySection(),
    grammar: () => grammarSection(6, 0),
    "exam-focus": () => examFocusSection(3, 0),
    vocabulary: () => vocabularySection(),
    "learning-worksheet": () => learningWorksheetSection(5),
    parsing: () => ({ kind: "parsing", items: [] }), // always invalid (min1) — unfixable
  });
  const resF = await generateAnalysisReportResilient({ passageContent: LONG, schoolType: "HIGH", grade: 2 }, { contentHash: hashContent(LONG), maxRounds: 2, llmText: stubF.fn });
  const wholeF = analysisReportSchema.safeParse(resF.report);
  console.log(`  ok=${resF.ok}, complete=${resF.completeness.complete} (expect false), missing=[${resF.completeness.missing.join(", ")}]`);
  console.log(`  WHOLE-REPORT still valid/renderable=${wholeF.success} (expect true)`);
  results.push(["F graceful-degradation-still-renders", resF.ok && !resF.completeness.complete && resF.completeness.missing.includes("parsing") && wholeF.success]);

  // ── G) fallback passage EXCLUDED from checkpoint → resume regenerates the real passage ──
  console.log(`\n=== G) fallback passage excluded from checkpoint; resume regenerates it ===`);
  const stubG1 = makeStub({
    passage: () => ({ kind: "passage", sentences: [] }), // always invalid (min1) → deterministic fallback
    summary: () => summarySection(),
    grammar: () => grammarSection(6, 0),
    "exam-focus": () => examFocusSection(3, 0),
    vocabulary: () => vocabularySection(),
    parsing: () => parsingSection(),
    "learning-worksheet": () => learningWorksheetSection(5),
  });
  const resG1 = await generateAnalysisReportResilient({ passageContent: LONG, schoolType: "HIGH", grade: 2 }, { contentHash: hashContent(LONG), maxRounds: 2, llmText: stubG1.fn });
  const cpHasPassage = "passage" in resG1.checkpoint.sections;
  const cpErrHasPassage = "passage" in resG1.checkpoint.errors;
  console.log(`  passage source=${resG1.perSection.passage?.source} (expect fallback), completeness.fallback=[${resG1.completeness.fallback.join(", ")}]`);
  console.log(`  checkpoint.sections has passage=${cpHasPassage} (expect false), checkpoint.errors has passage=${cpErrHasPassage} (expect true)`);
  const stubG2 = makeStub({ passage: () => passageSection(10) }); // only passage should be regenerated
  const resG2 = await generateAnalysisReportResilient({ passageContent: LONG, schoolType: "HIGH", grade: 2 }, { contentHash: hashContent(LONG), checkpoint: resG1.checkpoint, llmText: stubG2.fn });
  const g2Called = Object.keys(stubG2.calls).sort();
  console.log(`  resume CALLED for: [${g2Called.join(", ")}] (expect only passage)`);
  console.log(`  resume: passage source=${resG2.perSection.passage?.source}, complete=${resG2.completeness.complete}, fallback=[${resG2.completeness.fallback.join(", ")}]`);
  const gPass = !cpHasPassage && cpErrHasPassage && JSON.stringify(g2Called) === JSON.stringify(["passage"]) && resG2.perSection.passage?.source === "section-gen" && resG2.completeness.complete && resG2.completeness.fallback.length === 0 && analysisReportSchema.safeParse(resG2.report).success;
  results.push(["G fallback-excluded-resume-regenerates-passage", gPass]);

  // ── H) resilient WORKSHEET: units regenerate independently, multi-round, never structurally fail ──
  console.log(`\n=== H) resilient worksheet: independent units, multi-round regen, always renders ===`);
  const wsInput = { passageContent: SHORT, schoolType: "HIGH" as const, grade: 2 };
  const fxWorkbook = () =>
    ({
      kind: "learning-worksheet",
      title: "실전 학습지",
      logicRows: [
        { sentenceNo: 1, functionLabel: "주제 제시", keyPoint: "주제를 제시해요." },
        { sentenceNo: 2, functionLabel: "통념", keyPoint: "통념을 제시해요." },
        { sentenceNo: 3, functionLabel: "반박", keyPoint: "통념을 반박해요." },
      ],
      workbookSet: {
        title: "EBS 워크북",
        topicGist: { title: "주제 / 요지", topicTitle: "Memory", gist: "기억은 재구성적이에요." },
        grammarSelection: {
          title: "어법 선택",
          passage: "Memory [is / are] reconstructive and retrieval [strengthen / strengthens] it.",
          choices: [
            { no: 1, options: ["is", "are"], answer: "is", explanation: "주어가 단수라 is 가 맞아요." },
            { no: 2, options: ["strengthen", "strengthens"], answer: "strengthens", explanation: "주어가 단수라 strengthens 가 맞아요." },
          ],
        },
        vocabularySelection: {
          title: "어휘 선택",
          passage:
            "Memory is actively [preserved / reconstructed]; formation is not [immediate / gradual] but takes time; it is [loosely / intimately] tied to the self, so losing access feels [trivial / devastating].",
          choices: [
            { no: 1, options: ["preserved", "reconstructed"], answer: "reconstructed", explanation: "능동적으로 다시 만든다는 문맥이라 재구성이 맞아요." },
            { no: 2, options: ["immediate", "gradual"], answer: "immediate", explanation: "부정어 not 때문에 극성이 반전돼 즉각적이 정답이에요." },
            { no: 3, options: ["loosely", "intimately"], answer: "intimately", explanation: "자아와 밀접히 연결된다는 문맥이라 intimately 예요." },
            { no: 4, options: ["trivial", "devastating"], answer: "devastating", explanation: "접근 상실이 파괴적이라는 문맥이라 devastating 이에요." },
          ],
        },
        vocabularyCloze: {
          title: "어휘 빈칸 완성",
          passage: "Memory is (1)____, (2)____ retrieval (3)____ it, and (4)____ aids (5)____ plus (6)____.",
          blanks: [
            { no: 1, answer: "reconstructive", meaning: "재구성적인" },
            { no: 2, answer: "effortful", meaning: "노력이 드는" },
            { no: 3, answer: "strengthens", meaning: "강화하다" },
            { no: 4, answer: "sleep", meaning: "수면" },
            { no: 5, answer: "consolidation", meaning: "공고화" },
            { no: 6, answer: "encoding", meaning: "부호화" },
          ],
        },
        wordOrders: [
          { no: 1, korean: "기억은 재구성적이에요.", chunks: ["Memory", "is", "reconstructive", "indeed"], answer: "Memory is reconstructive indeed" },
        ],
      },
      questions: [],
      hiddenAnswers: false,
    }) as unknown as LearningWorksheetSection;
  const fxInference = () =>
    ({
      title: "수능추론 문제",
      questions: [1, 2, 3, 4, 5].map((no) => ({
        no,
        type: "main-idea",
        typeLabel: "추론",
        prompt: "윗글의 주제로 가장 적절한 것은?",
        passage: "Memory is reconstructive. → It is (A) _____ not (B) _____.",
        choices: ["①", "②", "③", "④", "⑤"].map((label, i) => ({ label, text: `(A) word${i} — (B) word${i}` })),
        answerLabel: "①",
        answerText: "(A) word0 — (B) word0",
        explanation: "원문 근거로 적절해요.",
        distractors: ["②", "③", "④", "⑤"].map((label) => ({ label, type: "오답", reason: "근거가 부족해요." })),
      })),
    }) as unknown as LearningWorksheetInferenceSet;
  const hasField = (s: unknown, f: string) => Boolean(s && (s as Record<string, unknown>)[f]);

  // H1: workbook fails round 0 then succeeds; inference ok → complete, both units present (multi-round)
  let wbCalls = 0;
  const h1 = await generateLearningWorksheetResilient(wsInput, resB.report, {
    _genWorkbook: async () => {
      wbCalls += 1;
      return wbCalls === 1 ? { ok: false } : { ok: true, section: fxWorkbook() };
    },
    _genInference: async () => ({ ok: true, inferenceSet: fxInference() }),
  });
  const h1ok = h1.complete && h1.present.includes("workbook") && h1.present.includes("inference") && wbCalls === 2 && hasField(h1.section, "workbookSet") && hasField(h1.section, "inferenceSet") && learningWorksheetSectionSchema.safeParse(h1.section).success;
  console.log(`  H1 workbook-retry+inference: complete=${h1.complete}, present=[${h1.present.join(",")}], wbCalls=${wbCalls} (expect 2), valid=${learningWorksheetSectionSchema.safeParse(h1.section).success}`);

  // H2: workbook ok, inference fails ALL rounds → partial kept (workbook), valid, never throws
  const h2 = await generateLearningWorksheetResilient(wsInput, resB.report, {
    maxRounds: 3,
    _genWorkbook: async () => ({ ok: true, section: fxWorkbook() }),
    _genInference: async () => ({ ok: false }),
  });
  const h2ok = !h2.complete && h2.present.length === 1 && h2.present[0] === "workbook" && hasField(h2.section, "workbookSet") && learningWorksheetSectionSchema.safeParse(h2.section).success;
  console.log(`  H2 workbook-only (inference unfixable): complete=${h2.complete}, present=[${h2.present.join(",")}], hasWorkbook=${hasField(h2.section, "workbookSet")}, valid=${learningWorksheetSectionSchema.safeParse(h2.section).success}`);

  // H3: both units fail ALL → degrade to logicRows-only base, still valid/renderable, never throws
  const h3 = await generateLearningWorksheetResilient(wsInput, resB.report, {
    maxRounds: 2,
    _genWorkbook: async () => ({ ok: false }),
    _genInference: async () => ({ ok: false }),
  });
  const h3ok = !h3.complete && h3.present.length === 0 && !hasField(h3.section, "workbookSet") && learningWorksheetSectionSchema.safeParse(h3.section).success;
  console.log(`  H3 both-fail → logicRows-only: complete=${h3.complete}, present=[${h3.present.join(",")}], valid=${learningWorksheetSectionSchema.safeParse(h3.section).success}`);

  // H4: report has NO learning-worksheet AND both units fail → section must be null (never emit an
  // invalid logicRows:[] section that would make the stored report fail analysisReportSchema).
  const reportNoLW = { ...resB.report, sections: resB.report.sections.filter((s) => s.kind !== "learning-worksheet") } as typeof resB.report;
  const h4 = await generateLearningWorksheetResilient(wsInput, reportNoLW, {
    maxRounds: 1,
    _genWorkbook: async () => ({ ok: false }),
    _genInference: async () => ({ ok: false }),
  });
  const h4ok = h4.section === null && h4.present.length === 0 && !h4.complete;
  console.log(`  H4 no-baseLW + both-fail → section=${h4.section === null ? "null" : "NOT-null"} (expect null — no invalid section emitted)`);
  results.push(["H worksheet-resilient-units-complete-or-degrade", h1ok && h2ok && h3ok && h4ok]);

  // ── verdicts ─────────────────────────────────────────────────────────────────
  console.log(`\n================ VERDICTS ================`);
  for (const [name, pass] of results) console.log(`  ${ok(pass).padEnd(5)} ${name}`);
  const allPass = results.every(([, p]) => p);
  console.log(`==========================================`);
  console.log(allPass ? "ALL STRUCTURAL PROOFS PASS ✅" : "SOME PROOFS FAILED ❌");
  if (!allPass) process.exitCode = 1;
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exitCode = 1;
});
