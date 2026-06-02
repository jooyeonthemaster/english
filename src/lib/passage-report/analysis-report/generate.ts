import { generateQuestionText } from "@/lib/question-generation-llm";

import {
  buildAnalysisReportPrompt,
  buildLearningWorksheetInferencePrompt,
  buildLearningWorksheetPrompt,
  type BuildAnalysisReportPromptInput,
} from "./prompt";
import {
  analysisReportGenerationSchema,
  learningWorksheetCoreGenerationSectionSchema,
  learningWorksheetInferenceGenerationSchema,
  learningWorksheetGenerationSectionSchema,
  type AnalysisReport,
  type LearningWorksheetSection,
  type ReportThemeId,
} from "./schema";
import {
  consolidateWordOrders,
  normalizeStudentFacingMarkup,
  scrambleWordOrderChunks,
  studentFacingMarkupIssues,
  toStudentVocabularyClozePassage,
  vocabularyClozeSurfaceIssues,
  wordOrderItemIssues,
} from "./worksheet-surface";

/**
 * 지문 → PRIME ANALYSIS 보고서 생성 (Gemini, JSON 모드 + safeParse 폴백).
 * 기존 runFullAnalysis 패턴과 동일한 생성 컨벤션을 따른다.
 */
export interface GenerateAnalysisReportInput extends BuildAnalysisReportPromptInput {
  brand?: string;
  docNo?: string;
  themeId?: ReportThemeId;
}

export interface AnalysisReportUsage {
  usage: unknown;
  provider: string;
  modelId: string;
  durationMs: number;
}

export type GenerateAnalysisReportResult =
  | { ok: true; report: AnalysisReport; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown };

const ALLOWED_EXAM_TYPES = ["빈칸추론", "주제", "제목", "순서", "문장삽입", "함축의미", "지칭", "요약"];

/** exam-focus type 변형 철자/합성을 표준 8유형으로 정규화 (결정론적). */
function canonicalExamType(t: string): string {
  const s = (t ?? "").replace(/\s+/g, "");
  if (ALLOWED_EXAM_TYPES.includes(s)) return s;
  if (/빈칸/.test(s)) return "빈칸추론";
  if (/삽입/.test(s)) return "문장삽입";
  if (/순서/.test(s)) return "순서";
  if (/함축|함의/.test(s)) return "함축의미";
  if (/지칭|지시/.test(s)) return "지칭";
  if (/요약/.test(s)) return "요약";
  if (/제목/.test(s)) return "제목";
  if (/주제|요지/.test(s)) return "주제";
  return s; // 미상 → 원본 유지(스키마는 string 이라 통과)
}

/** 생성 결과 정규화 + 품질 경고(로그). 스키마 통과 후 호출. */
function normalizeAndAuditSections(sections: AnalysisReport["sections"]): void {
  for (const sec of sections) {
    if (sec.kind === "exam-focus") {
      for (const row of sec.rows) row.type = canonicalExamType(row.type);
    }
  }
  const g = sections.find((s) => s.kind === "grammar");
  if (g?.kind === "grammar") {
    const distinct = new Set(g.rows.map((r) => r.pointCode).filter(Boolean)).size;
    const noCode = g.rows.filter((r) => !r.pointCode).length;
    if (g.rows.length >= 5 && distinct < 4) console.warn(`[REPORT] grammar 코드 다양성 낮음: ${distinct} distinct / ${g.rows.length} rows`);
    if (noCode) console.warn(`[REPORT] grammar pointCode 누락 ${noCode}/${g.rows.length}`);
  }
  const e = sections.find((s) => s.kind === "exam-focus");
  if (e?.kind === "exam-focus") {
    const off = e.rows.filter((r) => !ALLOWED_EXAM_TYPES.includes(r.type)).map((r) => r.type);
    const noLoc = e.rows.filter((r) => !r.logicLocation).length;
    if (off.length) console.warn(`[REPORT] exam type off-list: ${off.join(", ")}`);
    if (noLoc) console.warn(`[REPORT] exam logicLocation 누락 ${noLoc}/${e.rows.length}`);
  }
}

/** 메인 보고서(passage~parsing)만 생성 — 학습지(워크북) 호출 없이 빠른 품질 검증용. */
export async function generateAnalysisReportCore(
  input: GenerateAnalysisReportInput,
): Promise<
  | { ok: true; report: AnalysisReport; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown }
> {
  const prompt = buildAnalysisReportPrompt(input);

  const result = await generateQuestionText({
    prompt,
    generationPlan: "STANDARD",
    logPrefix: "REPORT",
    maxRetries: 1,
    maxTokens: 20000,
    omitMaxTokens: false, // 8섹션 대형 보고서 — 명시적 토큰 예산으로 끝부분(정답키) 절단 방지
    responseFormat: "json_object",
    isRecoverableJsonText: canRecover,
    thinkingBudget: 0,
    timeoutMs: 110_000,
    temperature: 0.1,
  });
  const primaryUsage: AnalysisReportUsage = {
    usage: result.usage,
    provider: result.provider,
    modelId: result.modelId,
    durationMs: result.durationMs,
  };

  const raw = result.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch (e) {
    return { ok: false, error: `JSON 파싱 실패: ${String(e)}`, raw };
  }

  normalizeKinds(parsed); // kind 오타/대소문자/구분자 정규화 (structure_map → structure-map 등)

  const validation = analysisReportGenerationSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      ok: false,
      error: `스키마 검증 실패: ${validation.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ")}`,
      raw,
      parsed,
    };
  }

  normalizeAndAuditSections(validation.data.sections);

  const report: AnalysisReport = {
    schemaVersion: 1,
    brand: input.brand ?? "ENGLISH READING LAB",
    docNo: input.docNo,
    themeId: input.themeId ?? "black-white",
    passageLayout: "hlc", // 01 원문 필기 캔버스(신규 레이아웃)
    meta: validation.data.meta,
    sections: validation.data.sections,
  };

  return { ok: true, report, raw, usage: primaryUsage };
}

export async function generateAnalysisReport(
  input: GenerateAnalysisReportInput,
): Promise<GenerateAnalysisReportResult> {
  const core = await generateAnalysisReportCore(input);
  if (!core.ok) return core;
  const { report, raw, usage: primaryUsage } = core;

  const worksheet = await generateLearningWorksheet(input, report);
  if (!worksheet.ok) {
    return {
      ok: false,
      error: `학습지 생성 실패: ${worksheet.error}`,
      raw: `${raw}\n\n--- learning-worksheet raw ---\n${worksheet.raw}`,
      parsed: worksheet.parsed,
    };
  }

  const finalReport: AnalysisReport = {
    ...report,
    sections: [...report.sections, worksheet.section],
  };
  return {
    ok: true,
    report: finalReport,
    raw: `${raw}\n\n--- learning-worksheet raw ---\n${worksheet.raw}`,
    usage: mergeUsage(primaryUsage, worksheet.usage),
  };
}

type GenerateLearningWorksheetResult =
  | { ok: true; section: LearningWorksheetSection; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown };

async function generateLearningWorksheet(
  input: GenerateAnalysisReportInput,
  report: AnalysisReport,
): Promise<GenerateLearningWorksheetResult> {
  const core = await generateLearningWorksheetCore(input, report);
  if (!core.ok) return core;

  const inference = await generateLearningWorksheetInference(input, report, core.section);
  if (!inference.ok) {
    return {
      ok: false,
      error: inference.error,
      raw: `${core.raw}\n\n--- learning-worksheet-inference raw ---\n${inference.raw}`,
      parsed: inference.parsed,
    };
  }

  const combined: LearningWorksheetSection = {
    ...core.section,
    inferenceSet: inference.inferenceSet,
    questions: core.section.questions ?? [],
  };
  normalizeWorkbookTestSurface(combined);
  normalizeInferenceQuestions(combined);
  normalizeInferenceAnswerPositions(combined);

  const validation = learningWorksheetGenerationSectionSchema.safeParse(combined);
  if (!validation.success) {
    return {
      ok: false,
      error: `통합 학습지 스키마 검증 실패: ${validation.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ")}`,
      raw: `${core.raw}\n\n--- learning-worksheet-inference raw ---\n${inference.raw}`,
      parsed: combined,
    };
  }

  const qualityIssues = validateLearningWorksheetQuality(validation.data);
  if (qualityIssues.length > 0) {
    return {
      ok: false,
      error: `통합 학습지 품질 검증 실패: ${qualityIssues.slice(0, 10).join(" | ")}`,
      raw: `${core.raw}\n\n--- learning-worksheet-inference raw ---\n${inference.raw}`,
      parsed: validation.data,
    };
  }

  return {
    ok: true,
    section: validation.data,
    raw: `${core.raw}\n\n--- learning-worksheet-inference raw ---\n${inference.raw}`,
    usage: mergeWorksheetStageUsage(core.usage, inference.usage),
  };
}

type LearningWorksheetInferenceSet = NonNullable<LearningWorksheetSection["inferenceSet"]>;

type GenerateLearningWorksheetCoreResult =
  | { ok: true; section: LearningWorksheetSection; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown };

type GenerateLearningWorksheetInferenceResult =
  | { ok: true; inferenceSet: LearningWorksheetInferenceSet; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown };

async function generateLearningWorksheetCore(
  input: GenerateAnalysisReportInput,
  report: AnalysisReport,
): Promise<GenerateLearningWorksheetCoreResult> {
  const basePrompt = buildLearningWorksheetPrompt(input, report);
  let lastFailure = "";
  let lastRaw = "";
  let lastParsed: unknown;

  for (let qualityAttempt = 0; qualityAttempt < 2; qualityAttempt += 1) {
    const result = await runWorksheetTextGeneration(
      qualityAttempt === 0 ? basePrompt : buildRepairPrompt(basePrompt, lastFailure),
      qualityAttempt === 0 ? "REPORT_WORKSHEET_CORE" : "REPORT_WORKSHEET_CORE_REPAIR",
    ).catch((error: unknown) => {
      lastFailure = `모델 호출 실패: ${error instanceof Error ? error.message : String(error)}`;
      return null;
    });
    if (!result) continue;

    const raw = result.text;
    lastRaw = raw;
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (e) {
      lastFailure = `JSON 파싱 실패: ${String(e)}`;
      continue;
    }

    if (parsed && typeof parsed === "object") {
      (parsed as { kind?: string }).kind = "learning-worksheet";
      delete (parsed as { inferenceSet?: unknown }).inferenceSet;
      (parsed as { questions?: unknown[] }).questions = [];
    }
    lastParsed = parsed;

    const validation = learningWorksheetCoreGenerationSectionSchema.safeParse(parsed);
    if (!validation.success) {
      lastFailure = `스키마 검증 실패: ${validation.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ")}`;
      continue;
    }

    normalizeWorkbookTestSurface(validation.data);
    const qualityIssues = validateWorkbookQuality(validation.data);
    if (qualityIssues.length > 0) {
      lastFailure = `품질 검증 실패: ${qualityIssues.slice(0, 10).join(" | ")}`;
      lastParsed = validation.data;
      continue;
    }

    return {
      ok: true,
      section: validation.data,
      raw,
      usage: toAnalysisReportUsage(result),
    };
  }

  return { ok: false, error: lastFailure || "워크북형 학습지 품질 검증 실패", raw: lastRaw, parsed: lastParsed };
}

async function generateLearningWorksheetInference(
  input: GenerateAnalysisReportInput,
  report: AnalysisReport,
  worksheet: LearningWorksheetSection,
): Promise<GenerateLearningWorksheetInferenceResult> {
  const basePrompt = buildLearningWorksheetInferencePrompt(input, report, worksheet);
  let lastFailure = "";
  let lastRaw = "";
  let lastParsed: unknown;

  for (let qualityAttempt = 0; qualityAttempt < 2; qualityAttempt += 1) {
    const result = await runWorksheetTextGeneration(
      qualityAttempt === 0 ? basePrompt : buildRepairPrompt(basePrompt, lastFailure),
      qualityAttempt === 0 ? "REPORT_WORKSHEET_INFERENCE" : "REPORT_WORKSHEET_INFERENCE_REPAIR",
    ).catch((error: unknown) => {
      lastFailure = `모델 호출 실패: ${error instanceof Error ? error.message : String(error)}`;
      return null;
    });
    if (!result) continue;

    const raw = result.text;
    lastRaw = raw;
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (e) {
      lastFailure = `JSON 파싱 실패: ${String(e)}`;
      continue;
    }
    lastParsed = parsed;

    const validation = learningWorksheetInferenceGenerationSchema.safeParse(parsed);
    if (!validation.success) {
      lastFailure = `스키마 검증 실패: ${validation.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ")}`;
      continue;
    }

    const sectionForQuality: LearningWorksheetSection = {
      ...worksheet,
      inferenceSet: validation.data,
    };
    normalizeInferenceQuestions(sectionForQuality);
    normalizeInferenceAnswerPositions(sectionForQuality);
    const qualityIssues = validateInferenceQuality(sectionForQuality);
    if (qualityIssues.length > 0) {
      lastFailure = `품질 검증 실패: ${qualityIssues.slice(0, 10).join(" | ")}`;
      lastParsed = validation.data;
      continue;
    }
    const inferenceSet = sectionForQuality.inferenceSet;
    if (!inferenceSet) {
      lastFailure = "수능추론 세트가 정규화 후 사라졌습니다.";
      continue;
    }

    return {
      ok: true,
      inferenceSet,
      raw,
      usage: toAnalysisReportUsage(result),
    };
  }

  return { ok: false, error: lastFailure || "수능추론 문제 품질 검증 실패", raw: lastRaw, parsed: lastParsed };
}

function buildRepairPrompt(basePrompt: string, lastFailure: string): string {
  return `${basePrompt}

# 재생성 지시
직전 출력은 아래 품질 기준을 통과하지 못했습니다.
${lastFailure}

이번 출력은 누락 없이 수정해서 JSON 객체 하나만 다시 생성하세요.`;
}

function runWorksheetTextGeneration(prompt: string, logPrefix: string) {
  return generateQuestionText({
    prompt,
    generationPlan: "STANDARD",
    logPrefix,
    maxRetries: 0,
    maxTokens: 14000,
    omitMaxTokens: false,
    responseFormat: "json_object",
    isRecoverableJsonText: canRecover,
    thinkingBudget: 0,
    timeoutMs: 120_000,
    temperature: 0.12,
  });
}

function toAnalysisReportUsage(result: Awaited<ReturnType<typeof generateQuestionText>>): AnalysisReportUsage {
  return {
    usage: result.usage,
    provider: result.provider,
    modelId: result.modelId,
    durationMs: result.durationMs,
  };
}

const INFERENCE_QUESTION_ORDER = [
  { type: "main-idea", typeLabel: "주제 추론" },
  { type: "title", typeLabel: "제목 추론" },
  { type: "implication", typeLabel: "함축의미 추론" },
  { type: "blank", typeLabel: "빈칸추론" },
  { type: "summary", typeLabel: "요약문 완성" },
] as const;

function normalizeInferenceQuestions(section: LearningWorksheetSection): void {
  if (!section.inferenceSet?.questions || section.inferenceSet.questions.length !== INFERENCE_QUESTION_ORDER.length) return;
  section.inferenceSet.title = section.inferenceSet.title?.trim() || "수능추론 문제";
  section.inferenceSet.questions.forEach((question, index) => {
    const expected = INFERENCE_QUESTION_ORDER[index];
    question.no = index + 1;
    question.type = expected.type;
    question.typeLabel = expected.typeLabel;
    question.prompt = normalizeStudentFacingMarkup(question.prompt);
    if (question.passage) question.passage = normalizeStudentFacingMarkup(question.passage);
    if (question.answerText) question.answerText = normalizeStudentFacingMarkup(question.answerText);
    question.explanation = normalizeStudentFacingMarkup(question.explanation);
    question.choices = question.choices.map((choice) => ({
      ...choice,
      text: normalizeStudentFacingMarkup(choice.text),
    }));
    question.distractors = question.distractors?.map((distractor) => ({
      ...distractor,
      reason: normalizeStudentFacingMarkup(distractor.reason),
    }));
  });
}

const CHOICE_LABELS = ["①", "②", "③", "④", "⑤"] as const;
const INFERENCE_ANSWER_LABEL_PATTERN = ["②", "④", "①", "⑤", "③"] as const;

function normalizeWorkbookTestSurface(section: LearningWorksheetSection): void {
  const workbook = section.workbookSet;
  if (!workbook) return;

  section.hiddenAnswers = true;

  let grammarPassage = workbook.grammarSelection.passage;
  workbook.grammarSelection.choices.forEach((choice, index) => {
    choice.no = index + 1;
    const answerIndex = choice.options.findIndex((option) => normalizeKey(option) === normalizeKey(choice.answer));
    if (answerIndex < 0 || choice.options.length < 2) return;

    const targetIndex = index % 2 === 0 ? Math.min(1, choice.options.length - 1) : 0;
    if (answerIndex !== targetIndex) {
      const previousOptions = [...choice.options];
      const nextOptions = [...choice.options];
      [nextOptions[answerIndex], nextOptions[targetIndex]] = [nextOptions[targetIndex], nextOptions[answerIndex]];
      choice.options = nextOptions;
      grammarPassage = replaceBracketOptions(grammarPassage, previousOptions, nextOptions);
    }
  });
  workbook.grammarSelection.passage = grammarPassage;

  workbook.vocabularyCloze.blanks.forEach((blank, index) => {
    blank.no = index + 1;
  });
  workbook.vocabularyCloze.passage = toStudentVocabularyClozePassage(
    workbook.vocabularyCloze.passage,
    workbook.vocabularyCloze.blanks,
  );

  const mergedWordOrders = consolidateWordOrders(workbook.wordOrders, section.drills?.wordOrders ?? []);
  workbook.wordOrders = mergedWordOrders.slice(0, 4);
  workbook.wordOrders.forEach((item) => {
    item.chunks = scrambleWordOrderChunks(item.chunks, item.answer);
  });

  section.drills?.grammarChoices?.forEach((item, index) => {
    item.no = index + 1;
  });
  section.drills?.wordOrders?.forEach((item) => {
    item.chunks = scrambleWordOrderChunks(item.chunks, item.answer);
  });
  if (section.drills?.wordOrders?.length) {
    section.drills.wordOrders = [];
  }
}

function normalizeInferenceAnswerPositions(section: LearningWorksheetSection): void {
  const questions = section.inferenceSet?.questions;
  if (!questions || questions.length === 0) return;

  questions.forEach((question, index) => {
    const targetLabel = INFERENCE_ANSWER_LABEL_PATTERN[index % INFERENCE_ANSWER_LABEL_PATTERN.length];
    const originalChoices = question.choices.map((choice) => ({ ...choice }));
    const correctIndex = originalChoices.findIndex((choice) => choice.label === question.answerLabel);
    const fallbackCorrectIndex = originalChoices.findIndex((choice) => normalizeKey(choice.text) === normalizeKey(question.answerText ?? ""));
    const finalCorrectIndex = correctIndex >= 0 ? correctIndex : fallbackCorrectIndex;
    if (finalCorrectIndex < 0) return;

    const correctEntry = originalChoices[finalCorrectIndex];
    const otherEntries = originalChoices.filter((_, choiceIndex) => choiceIndex !== finalCorrectIndex);
    const labelMap = new Map<string, string>();
    const nextChoices = CHOICE_LABELS.map((label) => {
      const source = label === targetLabel ? correctEntry : otherEntries.shift();
      if (!source) return { label, text: "" };
      labelMap.set(source.label, label);
      return { label, text: source.text };
    }).filter((choice) => choice.text);

    question.choices = nextChoices;
    question.answerLabel = targetLabel;
    question.answerText = correctEntry.text;
    question.distractors = nextChoices
      .filter((choice) => choice.label !== targetLabel)
      .map((choice) => {
        const oldLabel = [...labelMap.entries()].find(([, newLabel]) => newLabel === choice.label)?.[0];
        const previous = question.distractors?.find((d) => d.label === oldLabel) ?? question.distractors?.find((d) => d.label === choice.label);
        return {
          label: choice.label,
          type: previous?.type ?? "오답",
          reason: previous?.reason ?? "정답의 핵심 논리와 맞지 않습니다.",
        };
      });
  });
}

function replaceBracketOptions(passage: string, previousOptions: string[], nextOptions: string[]): string {
  const previousText = `[${previousOptions.join(" / ")}]`;
  const nextText = `[${nextOptions.join(" / ")}]`;
  if (passage.includes(previousText)) return passage.replace(previousText, nextText);

  const pattern = new RegExp(`\\[\\s*${previousOptions.map(escapeRegExp).join("\\s*/\\s*")}\\s*\\]`);
  return passage.replace(pattern, nextText);
}

function validateLearningWorksheetQuality(section: LearningWorksheetSection): string[] {
  return [...validateWorkbookQuality(section), ...validateInferenceQuality(section)];
}

function validateWorkbookQuality(section: LearningWorksheetSection): string[] {
  const issues: string[] = [];
  const workbook = section.workbookSet;
  if (!workbook) {
    issues.push("workbookSet이 없습니다.");
  } else {
    if (workbook.grammarSelection.choices.length < 4) {
      issues.push("어법 선택은 최소 4개 이상이어야 합니다.");
    }
    for (const choice of workbook.grammarSelection.choices) {
      if (!optionIncludes(choice.options, choice.answer)) {
        issues.push(`어법 선택 ${choice.no}번 정답이 선택지 목록에 없습니다.`);
      }
      if (choice.explanation.trim().length < 14) {
        issues.push(`어법 선택 ${choice.no}번 해설이 너무 짧습니다.`);
      }
    }
    const grammarAnswerIndexes = workbook.grammarSelection.choices.map((choice) =>
      choice.options.findIndex((option) => normalizeKey(option) === normalizeKey(choice.answer)),
    );
    if (grammarAnswerIndexes.length >= 4 && new Set(grammarAnswerIndexes).size < 2) {
      issues.push("어법 선택 정답 위치가 한쪽으로만 몰려 있습니다.");
    }
    if (grammarAnswerIndexes.length >= 4 && grammarAnswerIndexes.filter((index) => index > 0).length < 2) {
      issues.push("어법 선택 정답이 앞 선택지에 과도하게 몰려 있습니다.");
    }

    if (workbook.vocabularyCloze.blanks.length < 8) {
      issues.push("어휘 빈칸은 최소 8개 이상이어야 합니다.");
    }
    issues.push(...vocabularyClozeSurfaceIssues(workbook.vocabularyCloze.passage, workbook.vocabularyCloze.blanks));
    for (const blank of workbook.vocabularyCloze.blanks) {
      if (!blank.meaning?.trim()) {
        issues.push(`어휘 빈칸 ${blank.no}번 뜻이 없습니다.`);
      }
      if (!blank.clue?.trim()) {
        issues.push(`어휘 빈칸 ${blank.no}번 문맥 단서가 없습니다.`);
      }
    }

    for (const order of workbook.wordOrders) {
      issues.push(...wordOrderItemIssues(order));
    }
  }

  return issues;
}

function validateInferenceQuality(section: LearningWorksheetSection): string[] {
  const issues: string[] = [];
  const inference = section.inferenceSet;
  if (!inference || inference.questions.length !== INFERENCE_QUESTION_ORDER.length) {
    issues.push("수능추론 5문항 세트가 없습니다.");
  } else {
    const answerLabels = inference.questions.map((question) => question.answerLabel);
    if (new Set(answerLabels).size < 3) {
      issues.push("수능추론 정답 번호가 지나치게 한쪽으로 몰려 있습니다.");
    }
    inference.questions.forEach((question, index) => {
      const expected = INFERENCE_QUESTION_ORDER[index];
      if (question.type !== expected.type) {
        issues.push(`수능추론 Q${index + 1} 유형이 ${expected.type}이 아닙니다.`);
      }
      if (question.choices.length !== 5) {
        issues.push(`수능추론 Q${index + 1}이 5지선다가 아닙니다.`);
      }
      if (new Set(question.choices.map((choice) => normalizeKey(choice.text))).size !== question.choices.length) {
        issues.push(`수능추론 Q${index + 1} 선택지에 중복이 있습니다.`);
      }
      if (!question.choices.some((choice) => choice.label === question.answerLabel)) {
        issues.push(`수능추론 Q${index + 1} 정답 번호가 선택지에 없습니다.`);
      }
      if (!question.answerText?.trim()) {
        issues.push(`수능추론 Q${index + 1} 정답 선택지 원문이 없습니다.`);
      }
      if (!question.distractors || question.distractors.length < 4) {
        issues.push(`수능추론 Q${index + 1} 오답 분석이 4개 미만입니다.`);
      }
      if (question.explanation.trim().length < 24) {
        issues.push(`수능추론 Q${index + 1} 정답 해설이 너무 짧습니다.`);
      }

      issues.push(...studentFacingMarkupIssues(question.prompt, `inference Q${index + 1} prompt`));
      if (question.passage) {
        issues.push(...studentFacingMarkupIssues(question.passage, `inference Q${index + 1} passage`));
      }
      question.choices.forEach((choice) => {
        issues.push(...studentFacingMarkupIssues(choice.text, `inference Q${index + 1} choice ${choice.label}`));
      });

      const promptAndPassage = `${question.prompt} ${question.passage ?? ""}`;
      if (question.type === "implication" && !/[“”"'‘’_]|밑줄|함축/.test(promptAndPassage)) {
        issues.push("함축의미 추론 문항에 대상 표현이 명확히 표시되지 않았습니다.");
      }
      if (question.type === "blank" && !/_{3,}|빈칸|\(\s*\)/.test(promptAndPassage)) {
        issues.push("빈칸추론 문항에 빈칸 위치가 명확히 표시되지 않았습니다.");
      }
      if (question.type === "summary" && !/\(A\)|\(B\)/.test(`${promptAndPassage} ${question.choices.map((c) => c.text).join(" ")}`)) {
        issues.push("요약문 완성 문항이 (A), (B) 두 칸 구조가 아닙니다.");
      }
    });
  }

  return issues;
}

function optionIncludes(options: string[], answer: string): boolean {
  const answerKey = normalizeKey(answer);
  return options.some((option) => normalizeKey(option) === answerKey);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeWorksheetStageUsage(core: AnalysisReportUsage, inference: AnalysisReportUsage): AnalysisReportUsage {
  const coreTokens = readUsageTokens(core.usage);
  const inferenceTokens = readUsageTokens(inference.usage);
  return {
    usage: {
      inputTokens: coreTokens.inputTokens + inferenceTokens.inputTokens,
      outputTokens: coreTokens.outputTokens + inferenceTokens.outputTokens,
      calls: [
        { phase: "learning-worksheet-core", usage: core.usage, modelId: core.modelId, durationMs: core.durationMs },
        { phase: "learning-worksheet-inference", usage: inference.usage, modelId: inference.modelId, durationMs: inference.durationMs },
      ],
    },
    provider: core.provider,
    modelId: core.modelId,
    durationMs: core.durationMs + inference.durationMs,
  };
}

function mergeUsage(primary: AnalysisReportUsage, worksheet: AnalysisReportUsage): AnalysisReportUsage {
  const primaryTokens = readUsageTokens(primary.usage);
  const worksheetTokens = readUsageTokens(worksheet.usage);
  return {
    usage: {
      inputTokens: primaryTokens.inputTokens + worksheetTokens.inputTokens,
      outputTokens: primaryTokens.outputTokens + worksheetTokens.outputTokens,
      calls: [
        { phase: "analysis-report", usage: primary.usage, modelId: primary.modelId, durationMs: primary.durationMs },
        { phase: "learning-worksheet", usage: worksheet.usage, modelId: worksheet.modelId, durationMs: worksheet.durationMs },
      ],
    },
    provider: primary.provider,
    modelId: primary.modelId,
    durationMs: primary.durationMs + worksheet.durationMs,
  };
}

function readUsageTokens(usage: unknown): { inputTokens: number; outputTokens: number } {
  const record = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  return {
    inputTokens: Number(record.inputTokens ?? record.promptTokens ?? 0) || 0,
    outputTokens: Number(record.outputTokens ?? record.completionTokens ?? 0) || 0,
  };
}

function canRecover(raw: string): boolean {
  try {
    JSON.parse(extractJson(raw));
    return true;
  } catch {
    return false;
  }
}

/** 모델이 kind 를 'structure_map'/'StructureMap' 등으로 내도 discriminatedUnion 이 인식하게 정규화. */
function normalizeKinds(parsed: unknown): void {
  if (!parsed || typeof parsed !== "object") return;
  const sections = (parsed as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return;
  for (const sec of sections) {
    if (sec && typeof sec === "object" && typeof (sec as { kind?: unknown }).kind === "string") {
      (sec as { kind: string }).kind = (sec as { kind: string }).kind
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-");
    }
  }
}

/** 모델 응답에서 JSON 본체만 추출 — 코드펜스/서두 설명 제거. */
export function extractJson(raw: string): string {
  let s = raw.trim();
  // ```json ... ``` 코드펜스 제거
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // 첫 '{' 부터 마지막 '}' 까지
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s;
}
