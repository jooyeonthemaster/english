import { generateQuestionText } from "@/lib/question-generation-llm";
import { buildAnalysisReportPrompt, type BuildAnalysisReportPromptInput } from "./prompt";
import { extractJson } from "./generate";
import { stripWorksheetContentFields } from "./worksheet-core-gate";
import {
  reportMetaSchema,
  analysisReportSchema,
  type AnalysisReport,
  type AnalysisSection,
  type ReportMeta,
  type ReportThemeId,
} from "./schema";
import {
  buildSectionPrompt,
  deriveSectionContext,
  type SectionKind,
} from "./section-prompts";
import { coerceAndValidate } from "./section-coerce";

/**
 * 회복형(resilient) 지문 분석 생성기.
 *
 * 기존 generateAnalysisReportCore 는 "1회 호출 → 8섹션 전체 스키마 통과 아니면 전부 실패"의
 * all-or-nothing 이었다(부분 구제·재개 불가, 장문은 하드캡으로 영구 실패). 이 모듈은:
 *   1) 한 번의 전체 초안(holistic draft)을 시도해 통과하는 섹션을 **부분 구제**하고,
 *   2) 실패/누락된 섹션만 **정확히 골라 섹션 단위로 다시 생성**(직전 실패 사유를 교정 지시로 주입)하며,
 *   3) 완성된 섹션은 건너뛰고 — 매 진전마다 **체크포인트**를 남겨 다음 호출이 이어받게 하고,
 *   4) 예산/데드라인 안에서 **필수 섹션(passage)은 무조건 채워** 항상 렌더 가능한 보고서를 완성한다.
 *
 * 부수 효과로 모드B(60s 클램프×2=120s 타임아웃)도 회피한다: 섹션 단위 호출은 작아서 60s 안에 끝난다.
 */

// 값 수준 정본 — 클라이언트 안전 복제본(src/lib/studio/module-sections.ts
// FULL_ANALYSIS_SECTIONS)과의 일치를 단위 테스트가 강제한다.
export const ALL_SECTION_KINDS: readonly SectionKind[] = [
  "passage",
  "summary",
  "grammar",
  "exam-focus",
  "vocabulary",
  "parsing",
] as const;
const ALL_KINDS: SectionKind[] = [...ALL_SECTION_KINDS];

// 렌더가 구조적으로 요구하는 섹션(없으면 항상 결정론 폴백으로 채운다).
const REQUIRED_KINDS: SectionKind[] = ["passage"];

// ─── 생성 엔진 (26-08-12 luna 전환) ─────────────────────────────────────────
// "draft"    = 기존: 전체 초안(모놀리식 1콜, gemini) → 실패 섹션 수리.
// "parallel" = luna 맞춤: 결정론 문장 스파인 → 요약 선행(~6s) → 나머지 섹션+meta
//              전면 병렬(섹션 출력 0.3~6k tok — luna 의 느린 직렬 생성을 병렬로 상쇄).
//              실측(.tmp-final-qa/model-ab-luna-vs-g36.md C-2·C-3): 장문 97s·$0.035 로
//              gemini 초안(113s·$0.164)보다 빠르고 1/5 비용, 5렌즈 블라인드 품질 4:1 우세.
// 롤백: env WORKSHEET_CORE_ENGINE=draft (모델 롤백은 generate.ts 모놀리식 경로가 받는다).
export type WorksheetCoreEngine = "draft" | "parallel";
export function worksheetCoreEngine(): WorksheetCoreEngine {
  return process.env.WORKSHEET_CORE_ENGINE?.trim() === "draft" ? "draft" : "parallel";
}
const WORKSHEET_CORE_MODEL =
  process.env.WORKSHEET_CORE_MODEL?.trim() || "openai/gpt-5.6-luna";
// xhigh 는 코어 섹션 볼륨에서 OpenRouter 비스트리밍 벽(~300s)을 넘길 수 있어 high 가 기본.
const WORKSHEET_CORE_REASONING_EFFORT =
  process.env.WORKSHEET_CORE_REASONING_EFFORT?.trim() || "high";
// luna(OpenAI 계열)는 사고 토큰이 max_tokens 몫에서 빠진다 — 섹션 텍스트 예산에 얹는 여유.
const CORE_REASONING_HEADROOM_TOKENS = 12_000;
// 병렬 엔진 콜 상한 — luna 섹션 꼬리 실측 124s(grammar) + 여유. draft 엔진은 기존 60s 유지.
const PARALLEL_PER_CALL_TIMEOUT_MS = 150_000;

const SECTION_MAX_TOKENS: Record<SectionKind, number> = {
  passage: 16000,
  vocabulary: 10000,
  grammar: 10000,
  "exam-focus": 8000,
  parsing: 8000,
  summary: 4000,
};

export interface ResilientCheckpoint {
  contentHash: string;
  meta: ReportMeta | null;
  sections: Partial<Record<SectionKind, AnalysisSection>>;
  errors: Partial<Record<SectionKind, string>>;
  updatedAt: number;
}

export interface ResilientOptions {
  brand?: string;
  docNo?: string;
  themeId?: ReportThemeId;
  /** 절대 데드라인(epoch ms). 이 시각을 넘기면 새 섹션 작업을 시작하지 않고 가진 것으로 마감. */
  deadlineAt?: number;
  /** 섹션 완성 라운드 상한(기본 3). */
  maxRounds?: number;
  /** 섹션 1회 호출 abort 상한(ms, 기본 60s — 섹션은 작아 충분). */
  perCallTimeoutMs?: number;
  /** 이어받기 시드(직전 부분 결과). contentHash 가 현재 본문과 일치할 때만 사용. */
  checkpoint?: ResilientCheckpoint | null;
  /** 현재 본문 해시(체크포인트 정합성 키). */
  contentHash: string;
  /**
   * 생성 엔진(기본: env worksheetCoreEngine — 현재 parallel/luna).
   * 단, engine 미지정 + llmText 주입 시엔 draft 로 간주한다 — 스트리밍 llmText 를
   * 병렬 콜에 물리면 델타가 뒤섞이고, 테스트 주입 계약(초안 흐름)도 깨지기 때문.
   */
  engine?: WorksheetCoreEngine;
  /** 섹션 생성 시작마다 호출(라벨=섹션 kind 또는 'draft'/'meta') — SSE phase 이벤트용. */
  onPhase?: (label: string) => void;
  /** 진전마다 호출 — 부분 결과 영속(잡 result 등)에 쓴다. */
  onCheckpoint?: (cp: ResilientCheckpoint) => void | Promise<void>;
  /** 목표 섹션 집합(기본 7개 전부). */
  targetKinds?: SectionKind[];
  logPrefix?: string;
  /** 모델 호출 주입(기본=prod generateQuestionText). 테스트/특수 경로용. */
  llmText?: LlmTextFn;
}

export interface ResilientResult {
  ok: boolean;
  report: AnalysisReport;
  completeness: {
    present: SectionKind[];
    missing: SectionKind[];
    fallback: SectionKind[];
    complete: boolean; // 목표 섹션을 전부 채웠는가
  };
  rounds: number;
  draftUsed: boolean;
  perSection: Partial<Record<SectionKind, { source: string; attempts: number; error?: string }>>;
  checkpoint: ResilientCheckpoint;
  timing: { totalMs: number; draftMs: number };
  /** 모든 LLM 호출(초안+섹션)의 usage — 라우트가 합산해 비용 회계에 기록. */
  usages: Array<{ label: string; usage: unknown; modelId?: string; provider?: string }>;
}

function localCanRecover(raw: string): boolean {
  try {
    JSON.parse(extractJson(raw));
    return true;
  } catch {
    return false;
  }
}

/**
 * 모델 텍스트 호출 추상화(주입 가능). 기본 구현은 prod 와 동일하게 generateQuestionText 를 호출한다.
 * 테스트/특수 경로에서 이 함수만 갈아끼우면 진짜 스키마·coercion·오케스트레이터는 그대로 검증된다.
 */
export interface LlmTextResult {
  text: string;
  usage?: unknown;
  modelId?: string;
  provider?: string;
}
export type LlmTextFn = (args: {
  prompt: string;
  label: string; // 'draft' 또는 섹션 kind
  maxTokens: number;
  timeoutMs: number;
  attempt: number; // 0-based
}) => Promise<LlmTextResult>;

/** parallel 엔진 전용 호출 — WORKSHEET_CORE_MODEL(luna) + 사고 여유 토큰.
 *  draft 경로(defaultLlmText)와 분리해 기존 gemini 롤백 경로는 바이트 불변으로 남긴다. */
const parallelLlmText: LlmTextFn = async ({ prompt, label, maxTokens, timeoutMs }) => {
  const res = await generateQuestionText({
    prompt,
    generationPlan: "STANDARD",
    modelId: WORKSHEET_CORE_MODEL,
    logPrefix: `RESILIENT:${label}`,
    maxRetries: 0,
    maxTokens: maxTokens + CORE_REASONING_HEADROOM_TOKENS,
    omitMaxTokens: false,
    responseFormat: "json_object",
    isRecoverableJsonText: localCanRecover,
    thinkingBudget: 0,
    timeoutMs,
    temperature: 0.15,
    reasoningEffort: WORKSHEET_CORE_REASONING_EFFORT,
    applyReasoningEffortToGemini: true,
  });
  return { text: res.text, usage: res.usage, modelId: res.modelId, provider: res.provider };
};

/** 비스트리밍 기본 호출 — 스트리밍 구현(stream-llm.ts)의 폴백으로도 쓴다. */
export const defaultLlmText: LlmTextFn = async ({ prompt, label, maxTokens, timeoutMs }) => {
  const res = await generateQuestionText({
    prompt,
    generationPlan: "STANDARD",
    logPrefix: `RESILIENT:${label}`,
    maxRetries: label === "draft" ? 1 : 0,
    maxTokens,
    omitMaxTokens: false,
    responseFormat: "json_object",
    isRecoverableJsonText: localCanRecover,
    thinkingBudget: 0,
    timeoutMs,
    temperature: label === "draft" ? 0.1 : 0.15,
    // 26-07-25: 사고 high 를 이 경로에도 건다. 401e3fae("학습지·실전 학습지 사고
    // high 고정")가 generate.ts 만 바꾸고 여기(회복형 경로의 실제 LLM 호출부)를
    // 빠뜨려, 지문 큐 기본값(use-passage-queue fast:true)으로 들어온 분석 본체가
    // 전역 env(OPENROUTER_GEMINI_REASONING_EFFORT=low)로 떨어지고 있었다.
    // 그 위에 얹히는 실전 학습지만 high 인 비대칭 상태였다.
    reasoningEffort: "high",
    applyReasoningEffortToGemini: true,
  });
  return { text: res.text, usage: res.usage, modelId: res.modelId, provider: res.provider };
};

function normalizeKind(k: unknown): string {
  return typeof k === "string" ? k.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
}

interface DraftResult {
  meta: ReportMeta | null;
  sections: Partial<Record<SectionKind, AnalysisSection>>;
  errors: Partial<Record<SectionKind, string>>;
}

/** 전체 초안 1회 → 통과하는 섹션을 부분 구제. */
async function runHolisticDraft(
  input: BuildAnalysisReportPromptInput,
  targets: SectionKind[],
  llmText: LlmTextFn,
): Promise<DraftResult | null> {
  const prompt = buildAnalysisReportPrompt(input);
  let text: string;
  try {
    text = (await llmText({ prompt, label: "draft", maxTokens: 20000, timeoutMs: 110_000, attempt: 0 })).text;
  } catch {
    return null; // 초안 호출 실패 → 섹션 단위 경로가 받는다
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;

  const metaParse = reportMetaSchema.safeParse(root.meta);
  const meta = metaParse.success ? metaParse.data : null;

  const sections: Partial<Record<SectionKind, AnalysisSection>> = {};
  const errors: Partial<Record<SectionKind, string>> = {};
  const rawSections = Array.isArray(root.sections) ? root.sections : [];
  for (const rawSection of rawSections) {
    if (!rawSection || typeof rawSection !== "object") continue;
    const kind = normalizeKind((rawSection as Record<string, unknown>).kind) as SectionKind;
    if (!targets.includes(kind) || sections[kind]) continue;
    const v = coerceAndValidate(kind, { ...(rawSection as object), kind });
    if (v.ok) sections[kind] = v.section;
    else errors[kind] = v.error;
  }
  return { meta, sections, errors };
}

interface SectionGenResult {
  ok: boolean;
  section?: AnalysisSection;
  error?: string;
  attempts: number;
}

/** 섹션 하나만 생성(내부 2회: 기본 → 직전 실패 교정 재생성). coerce → validate 통과만 채택. */
async function generateOneSection(
  kind: SectionKind,
  input: BuildAnalysisReportPromptInput,
  ctx: Parameters<typeof buildSectionPrompt>[2],
  perCallTimeoutMs: number,
  deadlineAt: number,
  llmText: LlmTextFn,
): Promise<SectionGenResult> {
  let priorError = ctx?.priorError;
  let attempts = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // 재시도(attempt>0)는 데드라인을 넘겼으면 시작하지 않는다 — 벽 초과·고아 방지.
    if (attempt > 0 && Date.now() >= deadlineAt) break;
    // 매 호출 abort 를 남은 예산으로 좁힌다(고정 60s 가 데드라인을 넘기지 않게).
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) break;
    const callTimeoutMs = Math.max(1_000, Math.min(perCallTimeoutMs, remaining));
    attempts += 1;
    const prompt = buildSectionPrompt(kind, input, { ...ctx, priorError });
    let text: string;
    try {
      const r = await llmText({
        prompt,
        label: kind,
        maxTokens: SECTION_MAX_TOKENS[kind],
        timeoutMs: callTimeoutMs,
        attempt,
      });
      text = r.text;
    } catch (e) {
      priorError = `모델 호출 실패: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(text));
    } catch (e) {
      priorError = `JSON 파싱 실패: ${String(e)}`;
      continue;
    }
    const v = coerceAndValidate(kind, parsed);
    if (v.ok) return { ok: true, section: v.section, attempts };
    priorError = v.error;
  }
  return { ok: false, error: priorError, attempts };
}

/** 결정론 문장 분할 — 폴백 passage 와 parallel 엔진 번호 스파인의 단일 진실원. */
export function splitPassageSentences(passageContent: string): string[] {
  const raw = passageContent.replace(/\s+/g, " ").trim();
  const pieces = raw
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
  return pieces.length ? pieces : [raw];
}

/** 본문 텍스트를 결정론적으로 문장 분할한 최소 passage 섹션(최후 폴백 — 항상 렌더 가능 보장). */
function fallbackPassage(input: BuildAnalysisReportPromptInput): AnalysisSection {
  const sentences = splitPassageSentences(input.passageContent).map((en, i) => ({ n: i + 1, en, ko: "" }));
  return { kind: "passage", sentences, keywords: [] } as unknown as AnalysisSection;
}

/** parallel 엔진 meta 생성 — 표제 정보만 소형 콜로. 실패해도 무해(synthMeta 폴백). */
async function generateMetaViaLlm(
  input: BuildAnalysisReportPromptInput,
  llmText: LlmTextFn,
  timeoutMs: number,
): Promise<ReportMeta | null> {
  const prompt = `당신은 한국 최상위 영어 학원의 수석 교재 편집장이다. 아래 지문의 A4 분석 보고서에 쓸 표제 메타 정보만 JSON 객체 하나로 출력하라(코드펜스·설명 금지).
{
  "eyebrow": "PRIME PASSAGE ANALYSIS · 심층 지문 분석",
  "titleKo": "지문 핵심을 담은 한국어 제목",
  "titleEn": "영어 부제",
  "category": "분류 (예: '비문학 · 설명문')",
  "theme": "소재",
  "difficulty": 1~5 정수(수능 기준 체감 난이도),
  "difficultyNote": "(수능 N점)",
  "solveTime": "권장 풀이시간 (예: '3분 30초')",
  "examTypes": "핵심 출제유형 (예: '빈칸추론·어법·요약')"
}
# 지문
"""
${input.passageContent}
"""`;
  try {
    const r = await llmText({ prompt, label: "meta", maxTokens: 2000, timeoutMs, attempt: 0 });
    const parsed = reportMetaSchema.safeParse(JSON.parse(extractJson(r.text)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** meta.examTypes 를 실제 exam-focus 섹션에서 결정론 파생 — 병렬 생성에서 meta 콜이
 *  본문 섹션과 따로 돌아 유형이 어긋나던 것(블라인드 패널 C-3 ①)의 봉합. exam-focus 가
 *  있으면 어느 엔진이든 실제 유형이 정본이다(초안 경로의 경미한 불일치도 함께 고침). */
function reconcileMetaExamTypes(
  meta: ReportMeta,
  sections: Partial<Record<SectionKind, AnalysisSection>>,
): ReportMeta {
  const exam = sections["exam-focus"];
  if (!exam || exam.kind !== "exam-focus" || exam.rows.length === 0) return meta;
  const types = Array.from(new Set(exam.rows.map((r) => r.type))).slice(0, 5).join("·");
  return types ? { ...meta, examTypes: types } : meta;
}

/** 필기 앵커 축자 게이트 — layout.anchorText 가 그 행의 문장 en 안에 글자 그대로 없으면
 *  드롭한다(행 유지, 카드는 rail 배치로 자연 강등). 병렬 생성에서 "however / Instead" 식
 *  합성 앵커가 나오던 것(블라인드 패널 C-3 ②)의 봉합 — 비축자 앵커는 어느 엔진에서든
 *  오배치 위험이라 모델 불문 방어로 둔다. */
function reconcileAnchors(sections: Partial<Record<SectionKind, AnalysisSection>>): void {
  const passage = sections.passage;
  if (!passage || passage.kind !== "passage") return;
  const byN = new Map(passage.sentences.map((s) => [s.n, s.en] as const));
  const gate = (rows: Array<{ sentenceNo?: number; layout?: { anchorText?: string } }> | undefined) => {
    for (const row of rows ?? []) {
      const anchor = row.layout?.anchorText;
      if (!anchor || !row.layout) continue;
      const en = typeof row.sentenceNo === "number" ? byN.get(row.sentenceNo) : undefined;
      if (!en || !en.includes(anchor)) delete row.layout.anchorText;
    }
  };
  const grammar = sections.grammar;
  if (grammar?.kind === "grammar") gate(grammar.rows);
  const exam = sections["exam-focus"];
  if (exam?.kind === "exam-focus") gate(exam.rows);
}

/** 누락 시 결정론적 메타(완성 보장). */
function synthMeta(
  input: BuildAnalysisReportPromptInput,
  sections: Partial<Record<SectionKind, AnalysisSection>>,
): ReportMeta {
  const exam = sections["exam-focus"];
  const examTypes =
    exam && exam.kind === "exam-focus"
      ? Array.from(new Set(exam.rows.map((r) => r.type))).slice(0, 4).join("·")
      : "";
  const first = input.passageContent.replace(/\s+/g, " ").trim().slice(0, 28);
  return reportMetaSchema.parse({
    titleKo: "지문 분석",
    titleEn: first,
    category: "",
    theme: "",
    difficulty: 3,
    solveTime: "",
    examTypes,
  });
}

/** 의존 섹션 sentenceNo 가 passage 실제 문장 수를 넘으면 마지막 문장으로 클램프(허위 참조 방지). */
function reconcileSentenceRefs(sections: Partial<Record<SectionKind, AnalysisSection>>): void {
  const passage = sections.passage;
  if (!passage || passage.kind !== "passage") return;
  const maxN = passage.sentences.reduce((m, s) => Math.max(m, s.n), 0);
  if (maxN <= 0) return;
  const clampRows = (rows: Array<{ sentenceNo?: number }> | undefined) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (typeof row.sentenceNo === "number" && row.sentenceNo > maxN) row.sentenceNo = maxN;
    }
  };
  const grammar = sections.grammar;
  if (grammar?.kind === "grammar") clampRows(grammar.rows);
  const exam = sections["exam-focus"];
  if (exam?.kind === "exam-focus") clampRows(exam.rows);
  const parsing = sections.parsing;
  if (parsing?.kind === "parsing") clampRows(parsing.items);
}

function assembleReport(
  meta: ReportMeta,
  sections: Partial<Record<SectionKind, AnalysisSection>>,
  opts: ResilientOptions,
): AnalysisReport {
  const ordered = ALL_KINDS.filter((k) => sections[k]).map((k) => sections[k] as AnalysisSection);
  const coreSections = stripWorksheetContentFields(ordered);
  return {
    schemaVersion: 1,
    brand: opts.brand ?? "ENGLISH READING LAB",
    docNo: opts.docNo,
    themeId: opts.themeId ?? "black-white",
    passageLayout: "hlc",
    meta,
    sections: coreSections,
  } as AnalysisReport;
}

export async function generateAnalysisReportResilient(
  input: BuildAnalysisReportPromptInput,
  opts: ResilientOptions,
): Promise<ResilientResult> {
  const startedAt = Date.now();
  const targets = opts.targetKinds ?? ALL_KINDS;
  const maxRounds = opts.maxRounds ?? 3;
  // engine 미지정 + llmText 주입 = draft 호환 모드(스트리밍/테스트 주입 계약 보존).
  const engine: WorksheetCoreEngine = opts.engine ?? (opts.llmText ? "draft" : worksheetCoreEngine());
  const perCallTimeoutMs =
    opts.perCallTimeoutMs ?? (engine === "parallel" ? PARALLEL_PER_CALL_TIMEOUT_MS : 60_000);
  const deadlineAt = opts.deadlineAt ?? startedAt + 240_000;
  const baseLlm = opts.llmText ?? (engine === "parallel" ? parallelLlmText : defaultLlmText);
  const usages: ResilientResult["usages"] = [];
  const llmText: LlmTextFn = async (args) => {
    opts.onPhase?.(args.label);
    const r = await baseLlm(args);
    if (r.usage) usages.push({ label: args.label, usage: r.usage, modelId: r.modelId, provider: r.provider });
    return r;
  };

  // 이어받기: contentHash 일치 시에만 직전 부분 결과를 시드로 채택.
  const resumable = opts.checkpoint && opts.checkpoint.contentHash === opts.contentHash ? opts.checkpoint : null;
  const sections: Partial<Record<SectionKind, AnalysisSection>> = {};
  const errors: Partial<Record<SectionKind, string>> = { ...(resumable?.errors ?? {}) };
  const perSection: ResilientResult["perSection"] = {};
  // 재개 섹션은 그대로 신뢰하지 않고 현재 스키마로 재검증 — 통과분만 채택, 나머지는 재생성.
  if (resumable?.sections) {
    for (const k of Object.keys(resumable.sections) as SectionKind[]) {
      const seeded = resumable.sections[k];
      const v = seeded ? coerceAndValidate(k, seeded) : ({ ok: false, error: "empty" } as const);
      if (v.ok) {
        sections[k] = v.section;
        perSection[k] = { source: "resumed", attempts: 0 };
      } else {
        errors[k] = v.error;
      }
    }
  }
  // 재개 meta 도 현재 스키마로 검증 — 깨졌으면 버리고 나중에 합성.
  let meta: ReportMeta | null = null;
  if (resumable?.meta) {
    const mp = reportMetaSchema.safeParse(resumable.meta);
    meta = mp.success ? mp.data : null;
  }

  // 결정론 폴백으로 채운 섹션 목록(완성 보장용 — 체크포인트에는 '확정 섹션'으로 넣지 않는다).
  const fallback: SectionKind[] = [];

  // 체크포인트는 '확정된 진짜 섹션'만 담는다 — 폴백 섹션(예: ko 빈 deterministic passage)을
  // 완료로 저장하면 다음 시도가 그걸 이어받아 진짜 섹션을 영영 재생성하지 않는다. 폴백은 errors 로.
  const makeCheckpoint = (): ResilientCheckpoint => {
    const cpSections: Partial<Record<SectionKind, AnalysisSection>> = {};
    for (const k of Object.keys(sections) as SectionKind[]) {
      if (!fallback.includes(k)) cpSections[k] = sections[k];
    }
    const cpErrors: Partial<Record<SectionKind, string>> = { ...errors };
    for (const k of fallback) cpErrors[k] = cpErrors[k] ?? "fallback used — regenerate";
    return {
      contentHash: opts.contentHash,
      meta,
      sections: cpSections,
      errors: cpErrors,
      updatedAt: Date.now(),
    };
  };
  const emit = async () => {
    if (opts.onCheckpoint) await opts.onCheckpoint(makeCheckpoint());
  };

  // 장문(>3000자)·이미 일부 확보 시 전체 초안을 건너뛰고 바로 섹션 단위로 — 초안은 장문에서
  // 60s 클램프에 걸려 시간만 낭비하므로. 부분 목표(targetKinds ⊂ 전체)도 항상 건너뛴다 —
  // 초안 프롬프트는 전체 6섹션용이라 소수 섹션 요청에 전체급 원가가 나가고 비대상 산출은
  // 폐기된다(섹션 종량제 §3.4.1-10).
  const longPassage = input.passageContent.length > 3000;
  const partialTargets = targets.length < ALL_KINDS.length;
  const alreadyHave = (Object.keys(sections) as SectionKind[]).filter((k) => targets.includes(k)).length;
  const skipDraft = longPassage || partialTargets || alreadyHave >= Math.ceil(targets.length / 2);

  // parallel 엔진의 passage 콜은 결정론 스파인의 번호·경계를 그대로 따르게 지시한다 —
  // 다른 섹션들이 같은 스파인으로 sentenceNo 를 매기므로, passage 가 다르게 쪼개면
  // 문서 전체의 번호 기준이 어긋난다(수리 라운드의 passage 재생성에도 동일 적용).
  const spineCtx = splitPassageSentences(input.passageContent).map((en, i) => ({ n: i + 1, en, ko: "" }));
  const segDirective = `문장 분할(sentences[].n/en)은 반드시 아래 번호·경계를 글자 그대로 따르라(다르게 쪼개면 실패 처리된다):\n${spineCtx.map((s) => `${s.n}. ${s.en}`).join("\n")}`;
  const passageGenInput: BuildAnalysisReportPromptInput =
    engine === "parallel"
      ? { ...input, customPrompt: [input.customPrompt?.trim(), segDirective].filter(Boolean).join("\n\n") }
      : input;

  let draftUsed = false;
  let draftMs = 0;
  if (engine === "parallel") {
    // ── 병렬 웨이브: 요약 선행(~6s, 개념·용어 공유 기반) → 나머지 섹션+meta 전면 병렬 ──
    if (targets.includes("summary") && !sections.summary && Date.now() < deadlineAt) {
      const r = await generateOneSection(
        "summary",
        input,
        { sentences: spineCtx, priorError: errors.summary },
        perCallTimeoutMs,
        deadlineAt,
        llmText,
      );
      if (r.ok && r.section) {
        sections.summary = r.section;
        delete errors.summary;
        perSection.summary = { source: "section-gen", attempts: r.attempts };
      } else {
        errors.summary = r.error;
        perSection.summary = { source: "section-gen", attempts: r.attempts, error: r.error };
      }
    }
    const summaryCtx = deriveSectionContext({
      sections: Object.values(sections) as AnalysisReport["sections"],
    }).summary;
    const waveKinds = targets.filter((k) => k !== "summary" && !sections[k]);
    if (waveKinds.length > 0 && Date.now() < deadlineAt) {
      const metaPromise: Promise<ReportMeta | null> = meta
        ? Promise.resolve(null)
        : generateMetaViaLlm(
            input,
            llmText,
            Math.max(10_000, Math.min(60_000, deadlineAt - Date.now())),
          );
      const [metaResult, waveResults] = await Promise.all([
        metaPromise,
        Promise.all(
          waveKinds.map((k) =>
            generateOneSection(
              k,
              k === "passage" ? passageGenInput : input,
              { sentences: spineCtx, summary: summaryCtx, priorError: errors[k] },
              perCallTimeoutMs,
              deadlineAt,
              llmText,
            ).then((r) => ({ k, r })),
          ),
        ),
      ]);
      if (!meta && metaResult) meta = metaResult;
      for (const { k, r } of waveResults) {
        const prev = perSection[k]?.attempts ?? 0;
        if (r.ok && r.section) {
          sections[k] = r.section;
          delete errors[k];
          perSection[k] = { source: "section-gen", attempts: prev + r.attempts };
        } else {
          errors[k] = r.error;
          perSection[k] = { source: "section-gen", attempts: prev + r.attempts, error: r.error };
        }
      }
    }
    await emit();
  } else if (!skipDraft) {
    const dStart = Date.now();
    const draft = await runHolisticDraft(input, targets, llmText);
    draftMs = Date.now() - dStart;
    if (draft) {
      draftUsed = true;
      if (!meta && draft.meta) meta = draft.meta;
      for (const k of targets) {
        if (!sections[k] && draft.sections[k]) {
          sections[k] = draft.sections[k];
          perSection[k] = { source: "draft", attempts: 1 };
        } else if (!sections[k] && draft.errors[k]) {
          errors[k] = draft.errors[k];
        }
      }
    }
    await emit();
  }

  // 섹션 단위 완성 루프 — passage 는 의존 섹션의 기준점이라 항상 먼저 확보.
  let rounds = 0;
  for (; rounds < maxRounds; rounds += 1) {
    if (Date.now() >= deadlineAt) break;
    const missing = targets.filter((k) => !sections[k]);
    if (missing.length === 0) break;

    // 1) passage 우선(있어야 다른 섹션이 sentenceNo 기준을 받음)
    if (missing.includes("passage")) {
      const r = await generateOneSection("passage", passageGenInput, { priorError: errors.passage }, perCallTimeoutMs, deadlineAt, llmText);
      const prev = perSection.passage?.attempts ?? 0;
      if (r.ok && r.section) {
        sections.passage = r.section;
        delete errors.passage;
        perSection.passage = { source: "section-gen", attempts: prev + r.attempts };
      } else {
        // passage 생성 실패 → 의존 섹션이 기준 문장 없이 생성되지 않도록 결정론 폴백을
        // 즉시 적용(문장 번호 기준 확보). fallback 표식 → 라우트 품질게이트가 환불 처리.
        errors.passage = r.error;
        sections.passage = fallbackPassage(input);
        if (!fallback.includes("passage")) fallback.push("passage");
        perSection.passage = { source: "fallback", attempts: prev + r.attempts, error: r.error };
      }
      await emit();
    }

    // 2) 나머지 누락 섹션 병렬 생성(현재 확보분을 컨텍스트로)
    const ctxBase = deriveSectionContext({ sections: Object.values(sections) as AnalysisReport["sections"] });
    const rest = targets.filter((k) => k !== "passage" && !sections[k]);
    if (rest.length > 0 && Date.now() < deadlineAt) {
      const results = await Promise.all(
        rest.map(async (kind) => {
          if (Date.now() >= deadlineAt) return { kind, r: { ok: false, error: "deadline", attempts: 0 } as SectionGenResult };
          const r = await generateOneSection(kind, input, { ...ctxBase, priorError: errors[kind] }, perCallTimeoutMs, deadlineAt, llmText);
          return { kind, r };
        }),
      );
      for (const { kind, r } of results) {
        const prev = perSection[kind]?.attempts ?? 0;
        if (r.ok && r.section) {
          sections[kind] = r.section;
          delete errors[kind];
          perSection[kind] = { source: "section-gen", attempts: prev + r.attempts };
        } else {
          errors[kind] = r.error;
          perSection[kind] = { source: "section-gen", attempts: prev + r.attempts, error: r.error };
        }
      }
      await emit();
    }
  }

  // 완성 보장: 필수 섹션(passage) 결정론 폴백(루프에서 처리 못 했을 경우의 안전망).
  for (const k of REQUIRED_KINDS) {
    if (!sections[k] && k === "passage") {
      sections.passage = fallbackPassage(input);
      if (!fallback.includes("passage")) fallback.push("passage");
      perSection.passage = { source: "fallback", attempts: perSection.passage?.attempts ?? 0 };
    }
  }
  if (!meta) meta = synthMeta(input, sections);
  // meta.examTypes 는 실제 exam-focus 유형에서 결정론 파생(블라인드 패널 C-3 ① 봉합).
  meta = reconcileMetaExamTypes(meta, sections);

  // 의존 섹션의 sentenceNo 가 (절단된) passage 길이를 넘으면 마지막 실제 문장으로 클램프 —
  // 표/파생데이터의 허위 번호·범위초과 인덱스 방지(렌더 캔버스는 이미 무효 참조를 버린다).
  reconcileSentenceRefs(sections);
  // 비축자 필기 앵커 드롭(오배치 방지 — C-3 ② 봉합, 모델 불문).
  reconcileAnchors(sections);

  let report = assembleReport(meta, sections, opts);
  // 최종 전체 검증(렌더/저장 로더 호환). 혹시 실패하면 개별 통과 섹션만 + 유효 meta 로 재조립.
  if (!analysisReportSchema.safeParse(report).success) {
    const safe: Partial<Record<SectionKind, AnalysisSection>> = {};
    for (const k of ALL_KINDS) {
      if (sections[k] && coerceAndValidate(k, sections[k]).ok) safe[k] = sections[k];
    }
    if (!safe.passage) safe.passage = fallbackPassage(input);
    const safeMeta = reconcileMetaExamTypes(
      reportMetaSchema.safeParse(meta).success ? meta : synthMeta(input, safe),
      safe,
    );
    reconcileSentenceRefs(safe);
    reconcileAnchors(safe);
    report = assembleReport(safeMeta, safe, opts);
  }

  const present = targets.filter((k) => sections[k]);
  const missing = targets.filter((k) => !sections[k]);
  const checkpoint = makeCheckpoint();
  await emit();

  return {
    ok: true,
    report,
    completeness: { present, missing, fallback, complete: missing.length === 0 },
    rounds,
    draftUsed,
    perSection,
    checkpoint,
    timing: { totalMs: Date.now() - startedAt, draftMs },
    usages,
  };
}
