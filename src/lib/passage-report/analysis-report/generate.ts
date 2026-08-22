import { createHash } from "node:crypto";

import { generateQuestionText } from "@/lib/question-generation-llm";
import {
  generateAnalysisReportResilient,
  worksheetCoreEngine,
} from "./resilient-generate";
import {
  analysisPhaseLabel,
  streamAnalysisText,
  type AnalysisStreamEvent,
} from "./stream-llm";

/** 실전 학습지 콜의 스트리밍 훅 — 단계 라벨과 프레임 싱크. */
type WorksheetStreamHook = {
  emit: (event: AnalysisStreamEvent) => void;
  label: string;
};

/**
 * 학습지 텍스트 콜의 공통 반환 계약 — 비스트리밍(generateQuestionText)과
 * 스트리밍(streamAnalysisText) 두 구현이 모두 만족한다. 스트리밍 실패 시
 * 자기 자신을 비스트리밍으로 재호출하므로 명시 타입이 없으면 추론이 순환한다.
 */
type WorksheetTextResult = {
  text: string;
  usage?: unknown;
  provider?: string;
  modelId?: string;
  durationMs: number;
};
import { stripWorksheetContentFields } from "./worksheet-core-gate";

import {
  buildAnalysisReportPrompt,
  buildLearningWorksheetInferencePrompt,
  buildLearningWorksheetPrompt,
  buildWorkbookPartPrompts,
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
  MIN_ANTONYM_COVERAGE,
  normalizeVocabularyRows,
  remapVocabExcludedKeys,
  vocabRowKey,
} from "./vocab-normalize";
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

/** 모델 실험용 오버라이드(스모크 하네스 전용, 26-08-12 luna A/B) — 미지정 시 기존
 *  경로와 바이트 동일. 프로덕션 호출부는 이 옵션을 넘기지 않는다. */
export type WorksheetModelOverrides = {
  modelId?: string;
  reasoningEffort?: string;
  maxTokens?: number;
  timeoutMs?: number;
};

// ─── 실전 학습지(워크북·수능추론) 유닛별 모델 — 26-08-12~13 실측 확정 ─────────────
// · 추론(수능추론 5문항): luna 전환 — 순통과 2/2(45~69s)·블라인드 패널 출제 논리 우세.
// · 워크북: **split 엔진(3분할 병렬)로 luna 전환(26-08-13, A/B 정본 부록 E)** —
//   메가콜 luna 는 1차 게이트 탈락 2/3(topicGist 누락·wordOrders 재조립)이었으나,
//   어법/어휘2종/프레임 분할+검산 규칙으로 75~108s·전 게이트 1라운드 2/2 실측.
// 롤백/실험 env:
//   WORKSHEET_WORKBOOK_ENGINE=mono → 구 메가콜(모델은 WORKSHEET_WORKBOOK_MODEL,
//     빈값=플랜 기본 gemini — 26-08-12 검증 상태 그대로 복원).
//   WORKSHEET_WORKBOOK_MODEL / WORKSHEET_INFERENCE_MODEL / WORKSHEET_UNITS_REASONING_EFFORT.
const WORKSHEET_WORKBOOK_ENGINE =
  process.env.WORKSHEET_WORKBOOK_ENGINE?.trim() === "mono" ? "mono" : "split";
const WORKSHEET_WORKBOOK_MODEL = process.env.WORKSHEET_WORKBOOK_MODEL?.trim() || "";
const WORKSHEET_INFERENCE_MODEL =
  process.env.WORKSHEET_INFERENCE_MODEL?.trim() || "openai/gpt-5.6-luna";
const WORKSHEET_UNITS_REASONING_EFFORT =
  process.env.WORKSHEET_UNITS_REASONING_EFFORT?.trim() || "high";
// maxTokens 기본 26k: luna 사고 토큰 몫 + gemini 에도 절단 방어(코어 20k 절단 4/4 실측
// 과 같은 계열의 예방). 콜 상한은 luna 만 200s(워크북 꼬리 134s 실측), 그 외 기존 140s.
const WORKSHEET_UNITS_MAX_TOKENS = 26_000;
// 분할 파트별 상한(사고 여유 포함) — 어휘는 지문 재작성 2회라 가장 큼. 실측 프로브 값.
const WORKBOOK_PART_MAX_TOKENS = { grammar: 16_000, vocab: 20_000, frame: 16_000 } as const;
type WorkbookPartKey = keyof typeof WORKBOOK_PART_MAX_TOKENS;

/** 유닛별 기본 모델/사고량/예산 해석 — 명시 오버라이드(스모크 A/B)가 필드 단위로 이긴다. */
function resolveUnitOverrides(
  unit: "workbook" | "inference",
  o?: WorksheetModelOverrides,
): WorksheetModelOverrides {
  const defaultModel =
    unit === "workbook"
      ? WORKSHEET_WORKBOOK_MODEL ||
        (WORKSHEET_WORKBOOK_ENGINE === "split" ? "openai/gpt-5.6-luna" : "")
      : WORKSHEET_INFERENCE_MODEL;
  const modelId = o?.modelId ?? (defaultModel || undefined);
  const isLuna = (modelId ?? "").includes("luna");
  return {
    ...(modelId ? { modelId } : {}),
    reasoningEffort: o?.reasoningEffort ?? WORKSHEET_UNITS_REASONING_EFFORT,
    maxTokens: o?.maxTokens ?? WORKSHEET_UNITS_MAX_TOKENS,
    timeoutMs: o?.timeoutMs ?? (isLuna ? 200_000 : 140_000),
  };
}

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
    if (sec.kind === "vocabulary") {
      // 관계어(동의어·반의어) 결정론 정규화 — 이 경로(PRIME 수동 생성·Trigger 잡)는
      // section-coerce 를 거치지 않으므로 회복형과 같은 규칙을 여기서 적용한다.
      // (순수·멱등 — vocab-normalize.ts 가 단일 진실원)
      const rawRows = sec.rows as unknown as Record<string, unknown>[];
      const beforeKeys = rawRows.map((row) => vocabRowKey(row));
      const norm = normalizeVocabularyRows(rawRows);
      sec.rows = norm.rows as unknown as typeof sec.rows;
      // synonyms 가 바뀌면 편집기의 '시험지에서 제외' 키가 어긋난다 — 재매핑.
      const remapped = remapVocabExcludedKeys(beforeKeys, norm.rows, sec.vocabTestExcludedKeys);
      if (remapped) sec.vocabTestExcludedKeys = remapped;
      // 커버리지는 계측만 한다(저장 차단 없음). 프롬프트 하한은 70%.
      if (norm.stats.rows >= 10 && norm.stats.antCoverage < MIN_ANTONYM_COVERAGE) {
        console.warn(
          `[REPORT] vocabulary 반의어 커버리지 낮음: ${Math.round(norm.stats.antCoverage * 100)}% (${norm.stats.rows}행)`,
        );
      }
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

/** 모놀리식 소비자(트리거 워커·prime 수동재생성) → 회복형 parallel 엔진 어댑터.
 *  기존 반환 계약(ok:false = 실패·환불)을 지키기 위해, 회복형이 폴백/누락으로 마감한
 *  결과는 실패로 번역한다(불완전 보고서를 성공으로 인도하지 않는다 — 무회귀). */
async function generateAnalysisReportCoreViaParallel(
  input: GenerateAnalysisReportInput,
): Promise<GenerateAnalysisReportResult> {
  const contentHash = createHash("sha256").update(input.passageContent).digest("hex");
  const startedAt = Date.now();
  const r = await generateAnalysisReportResilient(input, {
    contentHash,
    engine: "parallel",
    brand: input.brand,
    docNo: input.docNo,
    themeId: input.themeId,
    // 모놀리식 소비자의 벽: 트리거 워커 600s·prime 수동재생성 300s — 보수적으로 240s.
    deadlineAt: startedAt + 240_000,
  });
  if (!r.completeness.complete || r.completeness.fallback.length > 0) {
    const detail = Object.entries(r.checkpoint.errors)
      .slice(0, 4)
      .map(([k, e]) => `${k}: ${String(e).slice(0, 120)}`)
      .join(" | ");
    return {
      ok: false,
      error: `병렬 코어 섹션 미완 — 누락 [${r.completeness.missing.join(",")}] 폴백 [${r.completeness.fallback.join(",")}]${detail ? ` — ${detail}` : ""}`,
      raw: "",
    };
  }
  const tokens = r.usages.reduce(
    (acc, u) => {
      const t = readUsageTokens(u.usage);
      acc.inputTokens += t.inputTokens;
      acc.outputTokens += t.outputTokens;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0 },
  );
  const first = r.usages.find((u) => u.modelId);
  return {
    ok: true,
    report: r.report,
    raw: JSON.stringify(r.report),
    usage: {
      usage: { ...tokens, calls: r.usages },
      provider: first?.provider ?? "OPENROUTER",
      modelId: first?.modelId ?? "",
      durationMs: r.timing.totalMs,
    },
  };
}

/** 메인 보고서(passage~parsing)만 생성 — 학습지(워크북) 호출 없이 빠른 품질 검증용. */
export async function generateAnalysisReportCore(
  input: GenerateAnalysisReportInput,
  overrides?: WorksheetModelOverrides,
): Promise<
  | { ok: true; report: AnalysisReport; raw: string; usage: AnalysisReportUsage }
  | { ok: false; error: string; raw: string; parsed?: unknown }
> {
  // 26-08-12 luna 전환: 명시 오버라이드(스모크 A/B 전용)가 없으면 회복형 parallel
  // 엔진에 위임한다 — 트리거 워커·prime 수동재생성 등 모놀리식 소비자 전원이 콜사이트
  // 변경 없이 luna 병렬 생성(97~124s·$0.035, 5렌즈 품질 4:1 우세)을 받는다.
  // 아래 모놀리식 1콜은 WORKSHEET_CORE_ENGINE=draft 롤백·A/B 실험 경로로만 남는다.
  if (!overrides && worksheetCoreEngine() === "parallel") {
    return generateAnalysisReportCoreViaParallel(input);
  }

  const prompt = buildAnalysisReportPrompt(input);

  const result = await generateQuestionText({
    prompt,
    generationPlan: "STANDARD",
    ...(overrides?.modelId ? { modelId: overrides.modelId } : {}),
    logPrefix: "REPORT",
    maxRetries: 1,
    // 20k→30k(26-08-12): 장문+사고 high 조합에서 20k 절단으로 4/4 실패 실측(JSON 미완).
    // 30k 는 완성 케이스 비용을 늘리지 않는 상한 증액이다(절단만 방지).
    maxTokens: overrides?.maxTokens ?? 30000,
    omitMaxTokens: false, // 8섹션 대형 보고서 — 명시적 토큰 예산으로 끝부분(정답키) 절단 방지
    responseFormat: "json_object",
    isRecoverableJsonText: canRecover,
    thinkingBudget: 0,
    // 26-07-22 학습지 3.6-flash 사고 high 전환 — 사고 시간만큼 1콜이 길어져
    // 110s→140s (재시도 1회 포함 최악 280s < 호출 라우트 300s 벽).
    timeoutMs: overrides?.timeoutMs ?? 140_000,
    temperature: 0.1,
    reasoningEffort: overrides?.reasoningEffort ?? "high",
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

  // 기본 분석은 learning-worksheet 섹션을 아예 만들지 않는다(26-08-21 '지문 논리 구조
  // 분석' 폐지). 모델이 프롬프트 금지를 어기고 실전 학습지 콘텐츠를 끼워 넣어도 여기서
  // 결정론적으로 제거한다.
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
  opts?: { deadlineAt?: number } & WorksheetModelOverrides,
): Promise<GenerateLearningWorksheetResult> {
  const core = await generateLearningWorksheetCore(input, report, opts?.deadlineAt, undefined, opts);
  if (!core.ok) return core;

  const inference = await generateLearningWorksheetInference(input, report, core.section, opts?.deadlineAt, undefined, opts);
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
 *     분석의 기존 학습지 섹션(있으면)으로 폴백.
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
    /** 지정 시 게이트웨이 SSE 를 직접 읽어 사고/본문 델타를 흘린다(로딩 카드 미리보기). */
    stream?: { emit: (event: AnalysisStreamEvent) => void };
  },
): Promise<ResilientWorksheetResult> {
  const deadlineAt = opts?.deadlineAt;
  const maxRounds = opts?.maxRounds ?? 3;
  const baseLW = report.sections.find((s) => s.kind === "learning-worksheet");
  const baseSection: LearningWorksheetSection =
    baseLW && baseLW.kind === "learning-worksheet"
      ? baseLW
      : ({ kind: "learning-worksheet", title: "실전 학습지", logicRows: [], questions: [], hiddenAnswers: false } as LearningWorksheetSection);

  let workbookSection: LearningWorksheetSection | null = null;
  let inferenceSet: LearningWorksheetInferenceSet | null = null;
  const usages: AnalysisReportUsage[] = [];
  let rounds = 0;

  const genWorkbook =
    opts?._genWorkbook ??
    (() =>
      generateLearningWorksheetCore(
        input,
        report,
        deadlineAt,
        opts?.stream ? { emit: opts.stream.emit, label: "workbook" } : undefined,
      ));
  const genInference =
    opts?._genInference ??
    (() =>
      generateLearningWorksheetInference(
        input,
        report,
        workbookSection ?? baseSection,
        deadlineAt,
        opts?.stream ? { emit: opts.stream.emit, label: "inference" } : undefined,
      ));
  // 병렬 웨이브용 — 디커플링 컨텍스트(코어 logicRows) 고정 + 비스트리밍(워크북 델타와
  // 인터리브 방지). 이미 지원되던 "워크북 실패 시 추론이 logicRows 로 생성" 모드와 동일 계약.
  const genInferenceDecoupled =
    opts?._genInference ??
    (() => generateLearningWorksheetInference(input, report, baseSection, deadlineAt, undefined));
  // 26-08-12 luna 전환: 두 유닛이 모두 없으면 동시 생성 — luna(콜당 70~125s)의 직렬
  // 합계가 fast 라우트 잔여 예산을 넘던 것을 max(워크북, 추론)로 붕괴. 끄기: env=off.
  const unitsParallel = process.env.WORKSHEET_UNITS_PARALLEL?.trim() !== "off";

  for (; rounds < maxRounds; rounds += 1) {
    if (deadlineAt && Date.now() >= deadlineAt) break;
    if (workbookSection && inferenceSet) break;

    if (!workbookSection && !inferenceSet && unitsParallel) {
      const [c, inf] = await Promise.all([genWorkbook(), genInferenceDecoupled()]);
      if (c.ok && c.section) {
        workbookSection = c.section;
        if (c.usage) usages.push(c.usage);
      }
      if (inf.ok && inf.inferenceSet) {
        inferenceSet = inf.inferenceSet;
        if (inf.usage) usages.push(inf.usage);
      }
      continue;
    }

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

  // 유효한 섹션만 반환한다. combined 가 base 스키마를 못 통과하면 코어 섹션으로,
  // 그것도 없으면 null —
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

/** 워크북 3분할 병렬 생성기(26-08-13 luna 전환 — A/B 정본 부록 E).
 *  어법(지문 재작성1)/어휘 2종(재작성2)/프레임(재작성 없음) 3콜 병렬 → 조립 →
 *  기존 결정론 게이트 전량 통과 검증 → 게이트 이슈를 책임 파트로 라우팅해 해당
 *  서브콜만 수리 1라운드. 실측 75~108s·전 게이트 1라운드 2/2 (메가콜 114~196s 대비). */
async function generateLearningWorksheetCoreSplit(
  input: GenerateAnalysisReportInput,
  report: AnalysisReport,
  deadlineAt?: number,
  stream?: WorksheetStreamHook,
): Promise<GenerateLearningWorksheetCoreResult> {
  const prompts = buildWorkbookPartPrompts(input, report);
  const unit = resolveUnitOverrides("workbook", undefined);
  const originalSentences = passageSentencesOf(report);
  // 파트 병렬이라 델타 스트림은 걸 수 없다(인터리브) — 단계 라벨만 흘린다.
  stream?.emit({ t: "phase", label: analysisPhaseLabel("workbook") });
  const usages: AnalysisReportUsage[] = [];

  const callPart = async (
    key: WorkbookPartKey,
    priorError?: string,
  ): Promise<{ ok: boolean; parsed?: Record<string, unknown>; error?: string }> => {
    const remaining = deadlineAt ? deadlineAt - Date.now() : Number.POSITIVE_INFINITY;
    if (remaining <= 1_000) return { ok: false, error: "deadline" };
    const base = prompts[key === "grammar" ? "grammar" : key === "vocab" ? "vocab" : "frame"];
    try {
      const r = await generateQuestionText({
        prompt: priorError ? buildRepairPrompt(base, priorError) : base,
        generationPlan: "STANDARD",
        ...(unit.modelId ? { modelId: unit.modelId } : {}),
        logPrefix: `REPORT_WORKBOOK_${key.toUpperCase()}${priorError ? "_REPAIR" : ""}`,
        maxRetries: 0,
        maxTokens: WORKBOOK_PART_MAX_TOKENS[key],
        omitMaxTokens: false,
        responseFormat: "json_object",
        isRecoverableJsonText: canRecover,
        thinkingBudget: 0,
        timeoutMs: Math.max(1_000, Math.min(unit.timeoutMs ?? 200_000, remaining)),
        temperature: 0.12,
        reasoningEffort: unit.reasoningEffort ?? "high",
        applyReasoningEffortToGemini: true,
      });
      usages.push(toAnalysisReportUsage(r));
      return { ok: true, parsed: JSON.parse(extractJson(r.text)) as Record<string, unknown> };
    } catch (e) {
      return { ok: false, error: `모델 호출 실패: ${e instanceof Error ? e.message : String(e)}` };
    }
  };

  const assemble = (
    g: Record<string, unknown>,
    v: Record<string, unknown>,
    f: Record<string, unknown>,
  ): Record<string, unknown> => ({
    kind: "learning-worksheet",
    title: (typeof f.title === "string" && f.title) || "실전 학습지",
    ...(f.note ? { note: f.note } : {}),
    logicRows: f.logicRows ?? [],
    cloze: f.cloze,
    practice: f.practice,
    drills: f.drills,
    workbookSet: {
      title: "유형별 워크북 훈련",
      topicGist: f.topicGist,
      grammarSelection: g.grammarSelection,
      vocabularySelection: v.vocabularySelection,
      vocabularyCloze: v.vocabularyCloze,
      wordOrders: f.wordOrders ?? [],
    },
    questions: [],
    hiddenAnswers: false,
    hiddenClozeTranslations: false,
  });

  const parts: Record<WorkbookPartKey, Record<string, unknown> | null> = {
    grammar: null,
    vocab: null,
    frame: null,
  };
  const callErrors: Partial<Record<WorkbookPartKey, string>> = {};
  const keys: WorkbookPartKey[] = ["grammar", "vocab", "frame"];
  const first = await Promise.all(keys.map((k) => callPart(k)));
  keys.forEach((k, i) => {
    if (first[i].ok && first[i].parsed) parts[k] = first[i].parsed ?? null;
    else callErrors[k] = first[i].error;
  });

  const validateAssembled = (): {
    ok: boolean;
    issues: string[];
    candidate?: Record<string, unknown>;
    data?: LearningWorksheetSection;
  } => {
    const missing = keys.filter((k) => !parts[k]);
    if (missing.length > 0) {
      return { ok: false, issues: missing.map((k) => `${k} 파트 호출 실패: ${callErrors[k] ?? "?"}`) };
    }
    const candidate = assemble(parts.grammar!, parts.vocab!, parts.frame!);
    const v = learningWorksheetCoreGenerationSectionSchema.safeParse(candidate);
    if (!v.success) {
      return {
        ok: false,
        issues: v.error.issues.slice(0, 8).map((i) => `스키마 ${i.path.join(".")}: ${i.message}`),
        candidate,
      };
    }
    normalizeWorkbookTestSurface(v.data, originalSentences);
    const issues = validateWorkbookQuality(v.data, originalSentences);
    return { ok: issues.length === 0, issues, candidate, data: v.data };
  };

  let verdict = validateAssembled();
  if (!verdict.ok) {
    // 게이트 이슈 → 책임 파트 라우팅(해당 서브콜만 수리 — 프레임 수리 실측 52s).
    const routed: Record<WorkbookPartKey, string[]> = { grammar: [], vocab: [], frame: [] };
    for (const issue of verdict.issues) {
      if (/어법 선택|Grammar selection|grammarSelection/i.test(issue)) routed.grammar.push(issue);
      else if (/어휘|vocabular/i.test(issue)) routed.vocab.push(issue);
      else routed.frame.push(issue);
    }
    for (const k of keys) if (!parts[k] && routed[k].length === 0) routed[k].push(callErrors[k] ?? "재생성 필요");
    console.warn(
      `[REPORT_WORKBOOK_SPLIT] 1라운드 게이트 ${verdict.issues.length}건 — 수리 라우팅 grammar:${routed.grammar.length} vocab:${routed.vocab.length} frame:${routed.frame.length}`,
    );
    const repairs = await Promise.all(
      keys.map((k) => (routed[k].length ? callPart(k, routed[k].join(" | ")) : Promise.resolve(null))),
    );
    keys.forEach((k, i) => {
      const r = repairs[i];
      if (r?.ok && r.parsed) parts[k] = r.parsed;
    });
    verdict = validateAssembled();
  }

  if (!verdict.ok || !verdict.data) {
    return {
      ok: false,
      error: `워크북(3분할) 품질 검증 실패: ${verdict.issues.slice(0, 10).join(" | ")}`,
      raw: JSON.stringify(verdict.candidate ?? parts),
      parsed: verdict.data ?? verdict.candidate,
    };
  }

  const tokens = usages.reduce(
    (acc, u) => {
      const t = readUsageTokens(u.usage);
      acc.inputTokens += t.inputTokens;
      acc.outputTokens += t.outputTokens;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0 },
  );
  return {
    ok: true,
    section: verdict.data,
    raw: JSON.stringify(verdict.data),
    usage: {
      usage: {
        ...tokens,
        calls: usages.map((u, i) => ({ phase: `workbook-part-${i}`, usage: u.usage, modelId: u.modelId, durationMs: u.durationMs })),
      },
      provider: usages[0]?.provider ?? "",
      modelId: usages[0]?.modelId ?? "",
      durationMs: usages.reduce((s, u) => Math.max(s, u.durationMs), 0),
    },
  };
}

async function generateLearningWorksheetCore(
  input: GenerateAnalysisReportInput,
  report: AnalysisReport,
  deadlineAt?: number,
  stream?: WorksheetStreamHook,
  overrides?: WorksheetModelOverrides,
): Promise<GenerateLearningWorksheetCoreResult> {
  // 26-08-13 luna 전환: 명시 모델 오버라이드(스모크 A/B 전용)가 없으면 3분할 병렬 엔진.
  // ❗overrides 인자는 호출부(generateLearningWorksheet)가 opts({deadlineAt})를 그대로
  // 넘기므로 객체 존재가 아니라 **모델 필드 존재**로 판정한다(deadlineAt만 있으면 split).
  // 메가콜은 WORKSHEET_WORKBOOK_ENGINE=mono 롤백·A/B 실험 경로로만 남는다.
  const hasModelOverrides = Boolean(
    overrides &&
      (overrides.modelId || overrides.reasoningEffort || overrides.maxTokens || overrides.timeoutMs),
  );
  if (!hasModelOverrides && WORKSHEET_WORKBOOK_ENGINE === "split") {
    return generateLearningWorksheetCoreSplit(input, report, deadlineAt, stream);
  }
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
      stream,
      resolveUnitOverrides("workbook", overrides),
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
      // 탈락 사유를 로그로 남긴다 — 모델별 실패 양상 진단(26-08-12 luna 워크북 조사에서
      // 사유가 어디에도 안 남아 장님 상태였던 것의 재발 방지).
      console.warn(`[REPORT_WORKSHEET_CORE] attempt ${qualityAttempt} ${lastFailure}`);
      continue;
    }

    const originalSentences = passageSentencesOf(report);
    normalizeWorkbookTestSurface(validation.data, originalSentences);
    const qualityIssues = validateWorkbookQuality(validation.data, originalSentences);
    if (qualityIssues.length > 0) {
      lastFailure = `품질 검증 실패: ${qualityIssues.slice(0, 10).join(" | ")}`;
      console.warn(`[REPORT_WORKSHEET_CORE] attempt ${qualityAttempt} ${lastFailure}`);
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
  stream?: WorksheetStreamHook,
  overrides?: WorksheetModelOverrides,
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
      stream,
      resolveUnitOverrides("inference", overrides),
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

function runWorksheetTextGeneration(
  prompt: string,
  logPrefix: string,
  deadlineAt?: number,
  stream?: WorksheetStreamHook,
  overrides?: WorksheetModelOverrides,
): Promise<WorksheetTextResult> {
  // 26-08-12 유닛별 차등: 호출부(generateLearningWorksheetCore/Inference)가
  // resolveUnitOverrides 로 해석해 넘긴다 — modelId 미지정이면 플랜 STANDARD(gemini 핀).
  const modelId = overrides?.modelId;
  const reasoningEffort = overrides?.reasoningEffort ?? WORKSHEET_UNITS_REASONING_EFFORT;
  const maxTokens = overrides?.maxTokens ?? WORKSHEET_UNITS_MAX_TOKENS;
  // 데드라인이 있으면 호출 abort 를 남은 예산으로 좁힌다(deadlineAt 은 계속 존중).
  const baseTimeoutMs = overrides?.timeoutMs ?? 140_000;
  const timeoutMs = deadlineAt ? Math.max(1_000, Math.min(baseTimeoutMs, deadlineAt - Date.now())) : baseTimeoutMs;
  if (stream) {
    // 스트리밍 요청(지문 큐 미리보기) — 실패하면 아래 비스트리밍 경로로 폴백한다.
    stream.emit({ t: "phase", label: analysisPhaseLabel(stream.label) });
    return streamAnalysisText({
      prompt,
      ...(modelId ? { modelId } : {}),
      reasoningEffort,
      maxTokens,
      timeoutMs,
      temperature: 0.12,
      emit: stream.emit,
    }).catch((error: unknown) => {
      console.warn(
        `[analysis-stream] ${logPrefix} 스트리밍 실패 — 비스트리밍 폴백`,
        error instanceof Error ? error.message : error,
      );
      return runWorksheetTextGeneration(prompt, logPrefix, deadlineAt, undefined, overrides);
    });
  }
  return generateQuestionText({
    prompt,
    generationPlan: "STANDARD",
    ...(modelId ? { modelId } : {}),
    logPrefix,
    maxRetries: 0,
    maxTokens,
    omitMaxTokens: false,
    responseFormat: "json_object",
    isRecoverableJsonText: canRecover,
    thinkingBudget: 0,
    timeoutMs,
    temperature: 0.12,
    reasoningEffort,
    applyReasoningEffortToGemini: true,
  });
}

function toAnalysisReportUsage(result: WorksheetTextResult): AnalysisReportUsage {
  return {
    usage: result.usage,
    provider: result.provider ?? "",
    modelId: result.modelId ?? "",
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

// ── 수능추론 정답 위치 셔플 유틸 (korean/core/shuffle.ts 정본 이식) ──────────────
// 셔플이 선지 라벨을 재배치하면 **해설 산문 속 원문자 지칭도 함께 재매핑**해야 한다 —
// 안 하면 answerLabel ②/해설 "③이 정답" desync 가 저장돼 학생 정답지가 모순된다
// (2026-08-11 실측: 기존 문서 4/5문항 전수 불일치. 어휘선택 셔플 desync 전례와 동일 교훈).

/** FNV-1a 32bit — 결정론 시드 파생용 문자열 해시. */
function hashInferenceSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — 시드 고정 PRNG (결정론 Fisher–Yates 용). */
function inferenceRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열 안의 원문자 '선지' 지칭을 순열 맵으로 동시 치환한다.
 *  "⑤번 문장" 같은 **지문 문장 번호 지칭은 제외**한다(선지 라벨과 같은 원문자를 쓰는
 *  실측 관행 — 기존 문서 수리 때 모순 가드가 잡아낸 함정. 치환하면 문장 참조가 깨진다). */
function remapCircledLabels(text: string, labelMap: Map<string, string>): string {
  return text.replace(/[①②③④⑤](?!\s*번?\s*문장)/g, (ch) => labelMap.get(ch) ?? ch);
}

/**
 * 문서 단위 결정론 정답 라벨 배열 — 구 고정 패턴(②④①⑤③)은 모든 PRIME 학습지의
 * 정답 배열이 동일해 학생이 암기할 수 있었다. 문서 내용 시드 Fisher–Yates 로
 * 라벨 5종을 1회씩 소진해 '분산 보장 + 문서마다 다른 배열 + 재생성 시 재현'을 얻는다.
 */
function inferenceTargetLabels(seedText: string): string[] {
  const rand = inferenceRng(hashInferenceSeed(seedText));
  const labels = [...CHOICE_LABELS];
  for (let i = labels.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return labels;
}

/** 보고서 passage 섹션의 원문 영어 문장 배열(권위) — 원문 생략 복원의 기준. */
function passageSentencesOf(report: AnalysisReport): string[] {
  const p = report.sections.find((s) => s.kind === "passage");
  return p && p.kind === "passage" ? p.sentences.map((s) => s.en).filter((e) => e.trim().length > 0) : [];
}

/** export: 결정론 검증 스크립트(.tmp-worksheet-qa)가 동일 로직을 재사용한다(수리 도구 선례). */
export function normalizeWorkbookTestSurface(section: LearningWorksheetSection, originalSentences: readonly string[] = []): void {
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

/** export: 결정론 검증 스크립트(.tmp-worksheet-qa)와 수리 도구가 동일 로직을 재사용한다. */
export function normalizeInferenceAnswerPositions(section: LearningWorksheetSection): void {
  const questions = section.inferenceSet?.questions;
  if (!questions || questions.length === 0) return;

  // 문서 내용 시드 결정론 라벨 배열 — 문항 index 마다 서로 다른 라벨 1개씩.
  const targetLabels = inferenceTargetLabels(questions.map((q) => `${q.prompt}${q.answerText ?? ""}`).join(""));

  questions.forEach((question, index) => {
    const targetLabel = targetLabels[index % targetLabels.length];
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
    // ★ 라벨 재배치의 반쪽이던 부분 — 해설·오답 사유 '산문 속' 원문자 지칭도 같은 순열로
    // 동기 재매핑한다. 이걸 빼먹으면 answerLabel ② / 해설 "③이 정답" desync 가 저장된다.
    question.explanation = remapCircledLabels(question.explanation, labelMap);
    question.distractors = nextChoices
      .filter((choice) => choice.label !== targetLabel)
      .map((choice) => {
        const oldLabel = [...labelMap.entries()].find(([, newLabel]) => newLabel === choice.label)?.[0];
        // 구 폴백(find(d.label === choice.label))은 labelMap 미스 시 '엉뚱한 선지의 오답 사유'를
        // 붙였다 — 미스면 기본 문구로 강등하는 것이 정직하다.
        const previous = oldLabel ? question.distractors?.find((d) => d.label === oldLabel) : undefined;
        return {
          label: choice.label,
          type: previous?.type ?? "오답",
          reason: previous ? remapCircledLabels(previous.reason, labelMap) : "정답의 핵심 논리와 맞지 않습니다.",
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

/** export: 결정론 검증 스크립트(.tmp-worksheet-qa)가 동일 게이트를 재사용한다. */
export function validateWorkbookQuality(section: LearningWorksheetSection, originalSentences: readonly string[] = []): string[] {
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
      // 해설 ↔ 정답 번호 정합 게이트(2026-08-11 desync 실측 재발 방지):
      // (a) "정답은 ③"/"③번이 가장 적절" 류의 정답 단정이 answerLabel 과 다르면 불합격.
      const assertedAnswer = question.explanation.match(
        /([①②③④⑤])\s*번?\s*[가이은는의]?\s*(?:정답|가장\s*적절)/,
      );
      if (assertedAnswer && assertedAnswer[1] !== question.answerLabel) {
        issues.push(
          `수능추론 Q${index + 1} 해설이 단정하는 정답 번호(${assertedAnswer[1]})가 answerLabel(${question.answerLabel})과 다릅니다.`,
        );
      }
      // (b) 선지를 평숫자("3번")로 지칭하면 셔플 재매핑이 불가능하다 — 원문자만 허용.
      if (/[1-5]\s*번(?:\s*(?:선지|선택지|이|가|은|을))/.test(question.explanation)) {
        issues.push(`수능추론 Q${index + 1} 해설이 선지를 평숫자("N번")로 지칭합니다 — 원문자(①~⑤)만 허용.`);
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
