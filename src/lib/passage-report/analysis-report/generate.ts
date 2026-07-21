import { generateQuestionText } from "@/lib/question-generation-llm";
import { stripWorksheetContentFields } from "./worksheet-core-gate";

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
  learningWorksheetSectionSchema,
  type AnalysisReport,
  type LearningWorksheetSection,
  type ReportThemeId,
} from "./schema";
import {
  clozePassageCoverageIssues,
  consolidateWordOrders,
  normalizeStudentFacingMarkup,
  restoreClozePassageOriginal,
  scrambleWordOrderChunks,
  studentFacingMarkupIssues,
  toStudentWorksheetWordBank,
  toStudentVocabularyClozePassage,
  vocabularyClozeSurfaceIssues,
  worksheetWordBankSurfaceIssues,
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
    // 26-07-22 학습지 3.6-flash 사고 high 전환 — 사고 시간만큼 1콜이 길어져
    // 110s→140s (재시도 1회 포함 최악 280s < 호출 라우트 300s 벽).
    timeoutMs: 140_000,
    temperature: 0.1,
    reasoningEffort: "high",
    applyReasoningEffortToGemini: true,
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

  // 기본 분석의 learning-worksheet 는 logicRows 표 전용 — 모델이 프롬프트 금지를
  // 어기고 실전 학습지 콘텐츠를 끼워 넣어도 여기서 결정론적으로 제거한다.
  // (미리보기의 "기본 학습지" 뷰와 같은 함수를 공유 — worksheet-core-gate.ts)
  const coreSections = stripWorksheetContentFields(validation.data.sections);

  const report: AnalysisReport = {
    schemaVersion: 1,
    brand: input.brand ?? "ENGLISH READING LAB",
    docNo: input.docNo,
    themeId: input.themeId ?? "black-white",
    passageLayout: "hlc", // 01 원문 필기 캔버스(신규 레이아웃)
    meta: validation.data.meta,
    sections: coreSections,
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

export type GenerateLearningWorksheetResult =
  | { ok: true; section: LearningWorksheetSection; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown };

export async function generateLearningWorksheet(
  input: GenerateAnalysisReportInput,
  report: AnalysisReport,
  opts?: { deadlineAt?: number },
): Promise<GenerateLearningWorksheetResult> {
  const core = await generateLearningWorksheetCore(input, report, opts?.deadlineAt);
  if (!core.ok) return core;

  const inference = await generateLearningWorksheetInference(input, report, core.section, opts?.deadlineAt);
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
  const originalSentences = passageSentencesOf(report);
  normalizeWorkbookTestSurface(combined, originalSentences);
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

  const qualityIssues = validateLearningWorksheetQuality(validation.data, originalSentences);
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

export type LearningWorksheetInferenceSet = NonNullable<LearningWorksheetSection["inferenceSet"]>;

export interface ResilientWorksheetResult {
  ok: true;
  /** 유효한 학습지 섹션. 유효한 것을 못 만들면 null — 호출자는 섹션을 비워야 한다(무효 섹션 저장 금지). */
  section: LearningWorksheetSection | null;
  /** 워크북·수능추론 두 유닛이 모두 완성됐는가. */
  complete: boolean;
  /** 확보한 유닛 목록(['workbook','inference']). */
  present: string[];
  rounds: number;
  usages: AnalysisReportUsage[];
}

/**
 * 회복형 실전 학습지 생성 — 코어 분석과 동일 철학.
 *
 * 기존 generateLearningWorksheet 는 워크북(1콜)→추론(1콜) 직렬에서 한 단계가 2시도 안에
 * 실패하면 학습지 '전체'가 실패(all-or-nothing)였다. 이 함수는:
 *   - 워크북·수능추론을 **독립 유닛**으로 보고, 실패한 유닛만 **다중 라운드로 다시 생성**(각 유닛
 *     호출은 내부에 2시도 교정 루프가 있어 라운드당 최대 2시도 → maxRounds 라운드).
 *   - 완성된 유닛은 건너뛰고, 데드라인 안에서 끝까지 시도한다.
 *   - 최종 조립은 **관대한 base 스키마**(learningWorksheetSectionSchema)로 검증 — 부분만 돼도
 *     항상 유효·렌더 가능한 섹션을 반환한다(절대 throw·fail 하지 않음). 둘 다 실패하면 코어
 *     분석의 logicRows-only 학습지(이미 유효)로 폴백.
 */
export async function generateLearningWorksheetResilient(
  input: GenerateAnalysisReportInput,
  report: AnalysisReport,
  opts?: {
    deadlineAt?: number;
    maxRounds?: number;
    /** 테스트 전용 유닛 주입(기본=실제 생성기). 오케스트레이션을 결정론으로 검증할 때만 쓴다. */
    _genWorkbook?: () => Promise<{ ok: boolean; section?: LearningWorksheetSection; usage?: AnalysisReportUsage }>;
    _genInference?: () => Promise<{ ok: boolean; inferenceSet?: LearningWorksheetInferenceSet; usage?: AnalysisReportUsage }>;
  },
): Promise<ResilientWorksheetResult> {
  const deadlineAt = opts?.deadlineAt;
  const maxRounds = opts?.maxRounds ?? 3;
  const baseLW = report.sections.find((s) => s.kind === "learning-worksheet");
  const baseSection: LearningWorksheetSection =
    baseLW && baseLW.kind === "learning-worksheet"
      ? baseLW
      : ({ kind: "learning-worksheet", title: "지문 논리 구조 분석", logicRows: [], hiddenAnswers: false } as unknown as LearningWorksheetSection);

  let workbookSection: LearningWorksheetSection | null = null;
  let inferenceSet: LearningWorksheetInferenceSet | null = null;
  const usages: AnalysisReportUsage[] = [];
  let rounds = 0;

  const genWorkbook =
    opts?._genWorkbook ?? (() => generateLearningWorksheetCore(input, report, deadlineAt));
  const genInference =
    opts?._genInference ??
    (() => generateLearningWorksheetInference(input, report, workbookSection ?? baseSection, deadlineAt));

  for (; rounds < maxRounds; rounds += 1) {
    if (deadlineAt && Date.now() >= deadlineAt) break;
    if (workbookSection && inferenceSet) break;

    // 유닛 1: 워크북(어법선택·어휘빈칸·배열·주제요지)
    if (!workbookSection) {
      const c = await genWorkbook();
      if (c.ok && c.section) {
        workbookSection = c.section;
        if (c.usage) usages.push(c.usage);
      }
    }
    if (deadlineAt && Date.now() >= deadlineAt) break;

    // 유닛 2: 수능추론 5문항(워크북 있으면 그걸, 없으면 코어 logicRows 를 컨텍스트로 — 디커플링)
    if (!inferenceSet) {
      const inf = await genInference();
      if (inf.ok && inf.inferenceSet) {
        inferenceSet = inf.inferenceSet;
        if (inf.usage) usages.push(inf.usage);
      }
    }
  }

  // 조립(관대) — 확보한 유닛만 얹는다. 둘 다 없으면 코어 logicRows-only 로 자연 폴백.
  const combined: LearningWorksheetSection = {
    ...(workbookSection ?? baseSection),
    inferenceSet: inferenceSet ?? undefined,
    questions: workbookSection?.questions ?? [],
  } as LearningWorksheetSection;
  const originalSentences = passageSentencesOf(report);
  normalizeWorkbookTestSurface(combined, originalSentences);
  if (inferenceSet) {
    normalizeInferenceQuestions(combined);
    normalizeInferenceAnswerPositions(combined);
  }
  const qualityIssues = validateLearningWorksheetQuality(combined, originalSentences);
  if (qualityIssues.length > 0) {
    console.warn(`[RESILIENT_WORKSHEET] 품질 경고(완성 우선, 비차단): ${qualityIssues.slice(0, 6).join(" | ")}`);
  }

  // 유효한 섹션만 반환한다. combined 가 base 스키마를 못 통과하면(예: baseLW 도 없고 두 유닛도
  // 실패해 logicRows 가 비어 min(3) 위반) 코어의 유효한 logicRows 섹션으로, 그것도 없으면 null —
  // 무효 섹션을 보고서에 끼워 넣어 저장 로더(analysisReportSchema)가 통째로 깨지는 것을 막는다.
  const v = learningWorksheetSectionSchema.safeParse(combined);
  let section: LearningWorksheetSection | null;
  if (v.success) {
    section = v.data;
  } else if (baseLW && baseLW.kind === "learning-worksheet" && learningWorksheetSectionSchema.safeParse(baseLW).success) {
    section = baseLW;
  } else {
    section = null;
  }
  const present = [workbookSection ? "workbook" : null, inferenceSet ? "inference" : null].filter(Boolean) as string[];
  return { ok: true, section, complete: Boolean(workbookSection && inferenceSet), present, rounds, usages };
}

type GenerateLearningWorksheetCoreResult =
  | { ok: true; section: LearningWorksheetSection; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown };

type GenerateLearningWorksheetInferenceResult =
  | { ok: true; inferenceSet: LearningWorksheetInferenceSet; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown };

async function generateLearningWorksheetCore(
  input: GenerateAnalysisReportInput,
  report: AnalysisReport,
  deadlineAt?: number,
): Promise<GenerateLearningWorksheetCoreResult> {
  const basePrompt = buildLearningWorksheetPrompt(input, report);
  let lastFailure = "";
  let lastRaw = "";
  let lastParsed: unknown;

  for (let qualityAttempt = 0; qualityAttempt < 2; qualityAttempt += 1) {
    // 재시도는 데드라인을 넘겼으면 시작하지 않는다(Vercel 벽 초과·잡 고아 방지).
    if (qualityAttempt > 0 && deadlineAt && Date.now() >= deadlineAt) break;
    const result = await runWorksheetTextGeneration(
      qualityAttempt === 0 ? basePrompt : buildRepairPrompt(basePrompt, lastFailure),
      qualityAttempt === 0 ? "REPORT_WORKSHEET_CORE" : "REPORT_WORKSHEET_CORE_REPAIR",
      deadlineAt,
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

    const originalSentences = passageSentencesOf(report);
    normalizeWorkbookTestSurface(validation.data, originalSentences);
    const qualityIssues = validateWorkbookQuality(validation.data, originalSentences);
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
  deadlineAt?: number,
): Promise<GenerateLearningWorksheetInferenceResult> {
  const basePrompt = buildLearningWorksheetInferencePrompt(input, report, worksheet);
  let lastFailure = "";
  let lastRaw = "";
  let lastParsed: unknown;

  for (let qualityAttempt = 0; qualityAttempt < 2; qualityAttempt += 1) {
    // 재시도는 데드라인을 넘겼으면 시작하지 않는다(Vercel 벽 초과·잡 고아 방지).
    if (qualityAttempt > 0 && deadlineAt && Date.now() >= deadlineAt) break;
    const result = await runWorksheetTextGeneration(
      qualityAttempt === 0 ? basePrompt : buildRepairPrompt(basePrompt, lastFailure),
      qualityAttempt === 0 ? "REPORT_WORKSHEET_INFERENCE" : "REPORT_WORKSHEET_INFERENCE_REPAIR",
      deadlineAt,
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

function runWorksheetTextGeneration(prompt: string, logPrefix: string, deadlineAt?: number) {
  // 데드라인이 있으면 호출 abort 를 남은 예산으로 좁힌다. 26-07-22 실전 학습지
  // 3.6-flash 사고 high 전환으로 무데드라인 기본·상한을 120s→140s 상향
  // (워크북+추론 2콜 최악 280s < 워크시트 라우트 300s 벽, deadlineAt 은 계속 존중).
  const timeoutMs = deadlineAt ? Math.max(1_000, Math.min(140_000, deadlineAt - Date.now())) : 140_000;
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
    timeoutMs,
    temperature: 0.12,
    reasoningEffort: "high",
    applyReasoningEffortToGemini: true,
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

/**
 * 요약문 완성 본문의 (A)/(B) 라벨 주변에 빈칸 밑줄이 전혀 없으면 라벨 뒤에 빈칸을 채운다.
 * AI가 "...(A) for generating..."처럼 라벨만 쓰고 빈칸 밑줄을 빠뜨리는 경우를 보정한다.
 * 이미 밑줄(3개 이상)이 붙어 있는 라벨은 그대로 둔다. (A)/(B) 외 본문은 건드리지 않는다.
 */
function ensureSummaryBlanksInPassage(passage: string): string {
  return passage
    .replace(
      /(_*)\s*\(\s*([AB])\s*\)\s*(_*)/g,
      (match, before: string, letter: string, after: string) =>
        before.length >= 3 || after.length >= 3 ? match : ` (${letter}) _____ `,
    )
    .replace(/ {2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function normalizeInferenceQuestions(section: LearningWorksheetSection): void {
  if (!section.inferenceSet?.questions || section.inferenceSet.questions.length !== INFERENCE_QUESTION_ORDER.length) return;
  section.inferenceSet.title = section.inferenceSet.title?.trim() || "수능추론 문제";
  section.inferenceSet.questions.forEach((question, index) => {
    const expected = INFERENCE_QUESTION_ORDER[index];
    question.no = index + 1;
    question.type = expected.type;
    question.typeLabel = expected.typeLabel;
    question.prompt = normalizeStudentFacingMarkup(question.prompt);
    if (question.passage) {
      question.passage = normalizeStudentFacingMarkup(question.passage);
      if (expected.type === "summary") {
        question.passage = ensureSummaryBlanksInPassage(question.passage);
      }
    }
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

/** 보고서 passage 섹션의 원문 영어 문장 배열(권위) — 원문 생략 복원의 기준. */
function passageSentencesOf(report: AnalysisReport): string[] {
  const p = report.sections.find((s) => s.kind === "passage");
  return p && p.kind === "passage" ? p.sentences.map((s) => s.en).filter((e) => e.trim().length > 0) : [];
}

function normalizeWorkbookTestSurface(section: LearningWorksheetSection, originalSentences: readonly string[] = []): void {
  normalizeWorksheetWordBanks(section);

  const workbook = section.workbookSet;
  if (!workbook) return;

  section.hiddenAnswers = false;

  // 원문 생략 방지 — AI 본문에서 빠진 원문 문장을 먼저 복원한 뒤, 선택지 셔플/빈칸 치환을 적용한다.
  // (누락이 없으면 입력 그대로 → 무회귀)
  if (originalSentences.length > 0) {
    workbook.grammarSelection.passage = restoreClozePassageOriginal(workbook.grammarSelection.passage, originalSentences);
    if (workbook.vocabularySelection) {
      workbook.vocabularySelection.passage = restoreClozePassageOriginal(workbook.vocabularySelection.passage, originalSentences);
    }
    workbook.vocabularyCloze.passage = restoreClozePassageOriginal(workbook.vocabularyCloze.passage, originalSentences);
  }

  // 정답 위치 결정론 셔플 — index 짝수는 정답을 뒤 옵션, 홀수는 앞 옵션으로 교대 배치해 '정답이
  // 한쪽으로만 몰리지 않게' 한다. 본문 [A / B] 도 replaceBracketOptions 로 동기 치환.
  const shuffleInlineChoicePositions = (
    passage: string,
    choices: { no: number; options: string[]; answer: string }[],
  ): string => {
    // 본문의 [ ... ] 브래킷을 '등장 순서'로 수집 → i번째 브래킷을 i번째 choice 에 위치 기반으로 매핑한다.
    // (동일 옵션쌍이 본문에 2회 이상 등장해도, 텍스트 first-match 로 엉뚱한 브래킷을 치환해 본문↔정답표가
    //  어긋나던 desync 를 막는다.) 브래킷 수와 choice 수가 일치할 때만 위치 매핑을 신뢰하고, 그 외에는
    // 기존 텍스트 매칭(replaceBracketOptions)으로 안전 폴백한다(무회귀).
    const spans: { start: number; end: number }[] = [];
    const bracketRe = /\[[^\][]*\]/g;
    let bm: RegExpExecArray | null;
    while ((bm = bracketRe.exec(passage)) !== null) spans.push({ start: bm.index, end: bm.index + bm[0].length });
    const positional = spans.length === choices.length;

    const replacements = new Map<number, string>(); // 브래킷 index → 새 텍스트(스왑된 경우만)
    let textFallback = passage;
    choices.forEach((choice, index) => {
      choice.no = index + 1;
      const answerIndex = choice.options.findIndex((option) => normalizeKey(option) === normalizeKey(choice.answer));
      if (answerIndex < 0 || choice.options.length < 2) return;

      const targetIndex = index % 2 === 0 ? Math.min(1, choice.options.length - 1) : 0;
      if (answerIndex === targetIndex) return; // 이미 목표 위치 → 브래킷 원문 표기 그대로 둔다

      const previousOptions = [...choice.options];
      const nextOptions = [...choice.options];
      [nextOptions[answerIndex], nextOptions[targetIndex]] = [nextOptions[targetIndex], nextOptions[answerIndex]];
      choice.options = nextOptions;
      if (positional) replacements.set(index, `[${nextOptions.join(" / ")}]`);
      else textFallback = replaceBracketOptions(textFallback, previousOptions, nextOptions);
    });

    if (!positional) return textFallback;
    if (replacements.size === 0) return passage;
    // 스왑된 브래킷만 정확한 위치에서 교체, 나머지 브래킷·본문은 원문 그대로 유지.
    let out = "";
    let cursor = 0;
    spans.forEach((span, i) => {
      const rep = replacements.get(i);
      if (rep === undefined) return;
      out += passage.slice(cursor, span.start) + rep;
      cursor = span.end;
    });
    out += passage.slice(cursor);
    return out;
  };

  workbook.grammarSelection.passage = shuffleInlineChoicePositions(
    workbook.grammarSelection.passage,
    workbook.grammarSelection.choices,
  );
  if (workbook.vocabularySelection) {
    workbook.vocabularySelection.passage = shuffleInlineChoicePositions(
      workbook.vocabularySelection.passage,
      workbook.vocabularySelection.choices,
    );
  }

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

function normalizeWorksheetWordBanks(section: LearningWorksheetSection): void {
  if (section.cloze?.wordBank) {
    const wordBank = toStudentWorksheetWordBank(section.cloze.wordBank, section.cloze.items);
    if (wordBank) section.cloze.wordBank = wordBank;
  }
  if (section.practice?.wordBank) {
    const wordBank = toStudentWorksheetWordBank(section.practice.wordBank, section.practice.items);
    if (wordBank) section.practice.wordBank = wordBank;
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

function validateLearningWorksheetQuality(section: LearningWorksheetSection, originalSentences: readonly string[] = []): string[] {
  return [...validateWorkbookQuality(section, originalSentences), ...validateInferenceQuality(section)];
}

const WEAK_GRAMMAR_FUNCTION_OPTIONS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "by",
  "of",
  "to",
  "for",
  "from",
  "with",
  "as",
]);

function normalizeGrammarOptionSurface(value: string): string {
  return normalizeKey(value).replace(/[^a-z]/g, "");
}

function isWeakGrammarFunctionOption(value: string): boolean {
  return WEAK_GRAMMAR_FUNCTION_OPTIONS.has(normalizeGrammarOptionSurface(value));
}

function validateWorkbookQuality(section: LearningWorksheetSection, originalSentences: readonly string[] = []): string[] {
  const issues: string[] = [];
  issues.push(...worksheetWordBankSurfaceIssues("key phrase cloze", section.cloze?.wordBank, section.cloze?.items));
  issues.push(...worksheetWordBankSurfaceIssues("practice cloze", section.practice?.wordBank, section.practice?.items));

  const workbook = section.workbookSet;
  if (!workbook) {
    issues.push("workbookSet이 없습니다.");
  } else {
    if (workbook.grammarSelection.choices.length < 4) {
      issues.push("어법 선택은 최소 4개 이상이어야 합니다.");
    }
    for (const choice of workbook.grammarSelection.choices) {
      if (
        choice.options.length >= 2 &&
        new Set(choice.options.map(normalizeGrammarOptionSurface)).size < choice.options.length
      ) {
        issues.push(`Grammar selection ${choice.no} has options that differ only by case, punctuation, or spacing.`);
      }
      if (choice.options.length >= 2 && choice.options.every(isWeakGrammarFunctionOption)) {
        issues.push(`Grammar selection ${choice.no} is too weak: both options are tiny function words, not a structural grammar frame.`);
      }
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

    // 어휘 선택 — 어법 선택과 동일한 품질 게이트(최소 개수·정답 존재·해설 길이·정답 위치 분포)에,
    // 어휘 전용 게이트(두 선택지가 문자만 다른 동일어가 아니어야 함)를 더한다. (base 스키마에선 optional)
    if (workbook.vocabularySelection) {
      if (workbook.vocabularySelection.choices.length < 4) {
        issues.push("어휘 선택은 최소 4개 이상이어야 합니다.");
      }
      for (const choice of workbook.vocabularySelection.choices) {
        if (!optionIncludes(choice.options, choice.answer)) {
          issues.push(`어휘 선택 ${choice.no}번 정답이 선택지 목록에 없습니다.`);
        }
        if (choice.explanation.trim().length < 14) {
          issues.push(`어휘 선택 ${choice.no}번 해설이 너무 짧습니다.`);
        }
        if (new Set(choice.options.map((option) => normalizeKey(option))).size < choice.options.length) {
          issues.push(`어휘 선택 ${choice.no}번 선택지에 사실상 같은 단어가 중복되어 있습니다.`);
        }
      }
      const vocabAnswerIndexes = workbook.vocabularySelection.choices.map((choice) =>
        choice.options.findIndex((option) => normalizeKey(option) === normalizeKey(choice.answer)),
      );
      if (vocabAnswerIndexes.length >= 4 && new Set(vocabAnswerIndexes).size < 2) {
        issues.push("어휘 선택 정답 위치가 한쪽으로만 몰려 있습니다.");
      }
      if (vocabAnswerIndexes.length >= 4 && vocabAnswerIndexes.filter((index) => index > 0).length < 2) {
        issues.push("어휘 선택 정답이 앞 선택지에 과도하게 몰려 있습니다.");
      }
    }

    if (workbook.vocabularyCloze.blanks.length < 8) {
      issues.push("어휘 빈칸은 최소 8개 이상이어야 합니다.");
    }
    issues.push(...vocabularyClozeSurfaceIssues(workbook.vocabularyCloze.passage, workbook.vocabularyCloze.blanks));
    // 원문 생략 가드 — 어휘빈칸/어법선택 본문이 원문 문장을 빠뜨리면 실패(정규화 복원 후 잔여 누락 검출).
    if (originalSentences.length > 0) {
      issues.push(...clozePassageCoverageIssues("어휘 빈칸 본문", workbook.vocabularyCloze.passage, originalSentences));
      issues.push(...clozePassageCoverageIssues("어법 선택 본문", workbook.grammarSelection.passage, originalSentences));
      if (workbook.vocabularySelection) {
        issues.push(...clozePassageCoverageIssues("어휘 선택 본문", workbook.vocabularySelection.passage, originalSentences));
      }
    }
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
      if (question.type === "summary") {
        // (A)/(B) 빈칸은 반드시 '본문(요약문)'에 있어야 한다. 선택지에는 항상 (A)/(B)가
        // 들어가므로 선택지까지 합쳐 검사하면, 본문에 요약문 빈칸이 통째로 빠져 있어도
        // 검증을 통과해 버린다(요약문 빈칸이 사라지던 버그). 본문만 보고 둘 다 요구한다.
        if (!/\(\s*A\s*\)/.test(promptAndPassage) || !/\(\s*B\s*\)/.test(promptAndPassage)) {
          issues.push("요약문 완성 문항의 본문(요약문)에 (A), (B) 빈칸이 모두 표시되어야 합니다.");
        }
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
