import { generateQuestionText } from "@/lib/question-generation-llm";
import { KO_PASSAGE_KIND_LABELS } from "@/lib/korean/core/passage-meta";

import { extractJson } from "./generate";
import {
  koAnalysisReportSchema,
  koReportMetaSchema,
  type KoAnalysisReport,
  type KoAnalysisSection,
  type KoReportMeta,
} from "./ko-schema";
import type { ReportThemeId } from "./schema";
import {
  buildKoAnalysisReportPrompt,
  buildKoSectionPrompt,
  deriveKoSectionContext,
  koReportTargetKinds,
  type BuildKoAnalysisReportPromptInput,
  type KoGenSectionKind,
} from "./ko-section-prompts";
import { coerceAndValidateKo } from "./ko-section-coerce";

/**
 * PRIME_KO 회복형 생성기 — 영어 resilient-generate.ts 의 오케스트레이션 골격
 * (홀리스틱 초안 부분구제 → 실패 섹션만 단위 재생성 → 체크포인트 → 데드라인 완주)을
 * 국어 섹션 집합으로 미러한다. 영어 파일은 무접촉(무회귀).
 *
 * 모델 호출은 기존 OpenRouter 경로(generateQuestionText)만 사용한다 — 공통 원칙.
 */

const KO_SECTION_MAX_TOKENS: Record<KoGenSectionKind, number> = {
  "ko-overview": 4000,
  "ko-paragraph": 8000,
  "ko-concept-vocab": 8000,
  "ko-structure": 6000,
  "ko-literary-device": 6000,
  "ko-speaker": 5000,
  "ko-exam-points": 8000,
  "ko-check-quiz": 6000,
};

/** 렌더가 구조적으로 요구하는 섹션 — 없으면 결정론 폴백으로 채운다. */
const KO_REQUIRED_KINDS: KoGenSectionKind[] = ["ko-overview"];

export interface KoResilientCheckpoint {
  contentHash: string;
  meta: KoReportMeta | null;
  sections: Partial<Record<KoGenSectionKind, KoAnalysisSection>>;
  errors: Partial<Record<KoGenSectionKind, string>>;
  updatedAt: number;
}

export interface KoLlmTextResult {
  text: string;
  usage?: unknown;
  modelId?: string;
  provider?: string;
}
export type KoLlmTextFn = (args: {
  prompt: string;
  label: string; // 'draft' 또는 섹션 kind
  maxTokens: number;
  timeoutMs: number;
  attempt: number;
}) => Promise<KoLlmTextResult>;

export interface KoResilientOptions {
  brand?: string;
  docNo?: string;
  themeId?: ReportThemeId;
  deadlineAt?: number;
  maxRounds?: number;
  perCallTimeoutMs?: number;
  checkpoint?: KoResilientCheckpoint | null;
  contentHash: string;
  onCheckpoint?: (cp: KoResilientCheckpoint) => void | Promise<void>;
  targetKinds?: KoGenSectionKind[];
  logPrefix?: string;
  /** 모델 호출 주입(기본=prod generateQuestionText). 테스트/검증 스크립트용. */
  llmText?: KoLlmTextFn;
}

export interface KoResilientResult {
  ok: boolean;
  report: KoAnalysisReport;
  completeness: {
    present: KoGenSectionKind[];
    missing: KoGenSectionKind[];
    fallback: KoGenSectionKind[];
    complete: boolean;
  };
  rounds: number;
  draftUsed: boolean;
  perSection: Partial<Record<KoGenSectionKind, { source: string; attempts: number; error?: string }>>;
  checkpoint: KoResilientCheckpoint;
  timing: { totalMs: number; draftMs: number };
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

/** 비스트리밍 기본 호출(국어) — 스트리밍 구현의 폴백으로도 쓴다. */
export const koDefaultLlmText: KoLlmTextFn = async ({ prompt, label, maxTokens, timeoutMs }) => {
  const res = await generateQuestionText({
    prompt,
    generationPlan: "STANDARD",
    logPrefix: `RESILIENT_KO:${label}`,
    maxRetries: label === "draft" ? 1 : 0,
    maxTokens,
    omitMaxTokens: false,
    responseFormat: "json_object",
    isRecoverableJsonText: localCanRecover,
    thinkingBudget: 0,
    timeoutMs,
    temperature: label === "draft" ? 0.1 : 0.15,
  });
  return { text: res.text, usage: res.usage, modelId: res.modelId, provider: res.provider };
};

function normalizeKind(k: unknown): string {
  return typeof k === "string" ? k.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
}

interface KoDraftResult {
  meta: KoReportMeta | null;
  sections: Partial<Record<KoGenSectionKind, KoAnalysisSection>>;
  errors: Partial<Record<KoGenSectionKind, string>>;
}

/** 전체 초안 1회 → 통과하는 섹션을 부분 구제. */
async function runKoHolisticDraft(
  input: BuildKoAnalysisReportPromptInput,
  targets: KoGenSectionKind[],
  llmText: KoLlmTextFn,
): Promise<KoDraftResult | null> {
  const prompt = buildKoAnalysisReportPrompt(input);
  let text: string;
  try {
    text = (await llmText({ prompt, label: "draft", maxTokens: 20000, timeoutMs: 110_000, attempt: 0 })).text;
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;

  const metaParse = koReportMetaSchema.safeParse(root.meta);
  const meta = metaParse.success ? metaParse.data : null;

  const sections: Partial<Record<KoGenSectionKind, KoAnalysisSection>> = {};
  const errors: Partial<Record<KoGenSectionKind, string>> = {};
  const rawSections = Array.isArray(root.sections) ? root.sections : [];
  for (const rawSection of rawSections) {
    if (!rawSection || typeof rawSection !== "object") continue;
    const kind = normalizeKind((rawSection as Record<string, unknown>).kind) as KoGenSectionKind;
    if (!targets.includes(kind) || sections[kind]) continue;
    const v = coerceAndValidateKo(kind, { ...(rawSection as object), kind }, { passage: input.passageContent });
    if (v.ok) sections[kind] = v.section;
    else errors[kind] = v.error;
  }
  return { meta, sections, errors };
}

interface KoSectionGenResult {
  ok: boolean;
  section?: KoAnalysisSection;
  error?: string;
  attempts: number;
}

/** 섹션 하나만 생성(내부 2회: 기본 → 직전 실패 교정 재생성). */
async function generateOneKoSection(
  kind: KoGenSectionKind,
  input: BuildKoAnalysisReportPromptInput,
  ctx: Parameters<typeof buildKoSectionPrompt>[2],
  perCallTimeoutMs: number,
  deadlineAt: number,
  llmText: KoLlmTextFn,
): Promise<KoSectionGenResult> {
  let priorError = ctx?.priorError;
  let attempts = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0 && Date.now() >= deadlineAt) break;
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) break;
    const callTimeoutMs = Math.max(1_000, Math.min(perCallTimeoutMs, remaining));
    attempts += 1;
    const prompt = buildKoSectionPrompt(kind, input, { ...ctx, priorError });
    let text: string;
    try {
      const r = await llmText({
        prompt,
        label: kind,
        maxTokens: KO_SECTION_MAX_TOKENS[kind],
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
    const v = coerceAndValidateKo(kind, parsed, { passage: input.passageContent });
    if (v.ok) return { ok: true, section: v.section, attempts };
    priorError = v.error;
  }
  return { ok: false, error: priorError, attempts };
}

/** 원문 섹션 — AI 아님. Passage.content 를 개행 보존으로 결정론 주입(시/희곡 행 구분 유지). */
export function buildKoPassageSection(passageContent: string): KoAnalysisSection {
  const text = passageContent.replace(/\r\n?/g, "\n").trim();
  return { kind: "ko-passage", text } as KoAnalysisSection;
}

/** ko-overview 결정론 폴백 (최후 안전망 — 렌더 가능 보장, 내용 창작 없음). */
function fallbackKoOverview(input: BuildKoAnalysisReportPromptInput): KoAnalysisSection {
  const genre = input.koKind ? KO_PASSAGE_KIND_LABELS[input.koKind] : "";
  return {
    kind: "ko-overview",
    genre,
    genreDetail: undefined,
    subjectMatter: "",
    theme: "",
    commentary: "",
  } as KoAnalysisSection;
}

/** 누락 시 결정론적 메타(완성 보장). */
function synthKoMeta(
  input: BuildKoAnalysisReportPromptInput,
  sections: Partial<Record<KoGenSectionKind, KoAnalysisSection>>,
): KoReportMeta {
  const overview = sections["ko-overview"];
  const genre =
    overview?.kind === "ko-overview" && overview.genre
      ? overview.genre
      : input.koKind
        ? KO_PASSAGE_KIND_LABELS[input.koKind]
        : "";
  const theme = overview?.kind === "ko-overview" ? overview.subjectMatter : "";
  const first = input.passageContent.replace(/\s+/g, " ").trim().slice(0, 28);
  return koReportMetaSchema.parse({
    titleKo: first ? `${first}…` : "국어 지문 분석",
    titleEn: "",
    category: genre,
    theme,
    difficulty: 3,
    solveTime: "",
    examTypes: "",
  });
}

/** KO 섹션 조립 순서 — ko-passage(결정론) 를 항상 맨 앞에 둔다. */
const KO_ASSEMBLE_ORDER: Array<"ko-passage" | KoGenSectionKind> = [
  "ko-passage",
  "ko-overview",
  "ko-paragraph",
  "ko-concept-vocab",
  "ko-structure",
  "ko-literary-device",
  "ko-speaker",
  "ko-exam-points",
  "ko-check-quiz",
];

function assembleKoReport(
  meta: KoReportMeta,
  input: BuildKoAnalysisReportPromptInput,
  sections: Partial<Record<KoGenSectionKind, KoAnalysisSection>>,
  opts: KoResilientOptions,
): KoAnalysisReport {
  const all: Partial<Record<string, KoAnalysisSection>> = {
    ...sections,
    "ko-passage": buildKoPassageSection(input.passageContent),
  };
  const ordered = KO_ASSEMBLE_ORDER.filter((k) => all[k]).map((k) => all[k] as KoAnalysisSection);
  return {
    schemaVersion: 1,
    subject: "KOREAN",
    brand: opts.brand ?? "KOREAN READING LAB",
    docNo: opts.docNo,
    themeId: opts.themeId ?? "black-white",
    meta,
    sections: ordered,
  } as KoAnalysisReport;
}

export async function generateKoAnalysisReportResilient(
  input: BuildKoAnalysisReportPromptInput,
  opts: KoResilientOptions,
): Promise<KoResilientResult> {
  const startedAt = Date.now();
  const targets = opts.targetKinds ?? koReportTargetKinds(input);
  const maxRounds = opts.maxRounds ?? 3;
  const perCallTimeoutMs = opts.perCallTimeoutMs ?? 60_000;
  const deadlineAt = opts.deadlineAt ?? startedAt + 240_000;
  const baseLlm = opts.llmText ?? koDefaultLlmText;
  const usages: KoResilientResult["usages"] = [];
  const llmText: KoLlmTextFn = async (args) => {
    const r = await baseLlm(args);
    if (r.usage) usages.push({ label: args.label, usage: r.usage, modelId: r.modelId, provider: r.provider });
    return r;
  };

  // 이어받기: contentHash 일치 시에만 직전 부분 결과를 시드로 채택 + 현재 스키마로 재검증.
  const resumable = opts.checkpoint && opts.checkpoint.contentHash === opts.contentHash ? opts.checkpoint : null;
  const sections: Partial<Record<KoGenSectionKind, KoAnalysisSection>> = {};
  const errors: Partial<Record<KoGenSectionKind, string>> = { ...(resumable?.errors ?? {}) };
  const perSection: KoResilientResult["perSection"] = {};
  if (resumable?.sections) {
    for (const k of Object.keys(resumable.sections) as KoGenSectionKind[]) {
      const seeded = resumable.sections[k];
      const v = seeded
        ? coerceAndValidateKo(k, seeded, { passage: input.passageContent })
        : ({ ok: false, error: "empty" } as const);
      if (v.ok) {
        sections[k] = v.section;
        perSection[k] = { source: "resumed", attempts: 0 };
      } else {
        errors[k] = v.error;
      }
    }
  }
  let meta: KoReportMeta | null = null;
  if (resumable?.meta) {
    const mp = koReportMetaSchema.safeParse(resumable.meta);
    meta = mp.success ? mp.data : null;
  }

  // 폴백 섹션은 체크포인트에 '확정'으로 넣지 않는다(다음 시도가 진짜 섹션을 재생성하도록).
  const fallback: KoGenSectionKind[] = [];
  const makeCheckpoint = (): KoResilientCheckpoint => {
    const cpSections: Partial<Record<KoGenSectionKind, KoAnalysisSection>> = {};
    for (const k of Object.keys(sections) as KoGenSectionKind[]) {
      if (!fallback.includes(k)) cpSections[k] = sections[k];
    }
    const cpErrors: Partial<Record<KoGenSectionKind, string>> = { ...errors };
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

  // 장문·이미 절반 이상 확보 시 초안 생략(영어판과 동일 휴리스틱).
  const longPassage = input.passageContent.length > 3000;
  const alreadyHave = (Object.keys(sections) as KoGenSectionKind[]).filter((k) => targets.includes(k)).length;
  const skipDraft = longPassage || alreadyHave >= Math.ceil(targets.length / 2);

  let draftUsed = false;
  let draftMs = 0;
  if (!skipDraft) {
    const dStart = Date.now();
    const draft = await runKoHolisticDraft(input, targets, llmText);
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

  // 섹션 단위 완성 루프 — ko-paragraph 를 먼저 확보(구조도·출제 포인트의 번호 기준점).
  let rounds = 0;
  for (; rounds < maxRounds; rounds += 1) {
    if (Date.now() >= deadlineAt) break;
    const missing = targets.filter((k) => !sections[k]);
    if (missing.length === 0) break;

    if (missing.includes("ko-paragraph")) {
      const r = await generateOneKoSection(
        "ko-paragraph",
        input,
        { priorError: errors["ko-paragraph"] },
        perCallTimeoutMs,
        deadlineAt,
        llmText,
      );
      const prev = perSection["ko-paragraph"]?.attempts ?? 0;
      if (r.ok && r.section) {
        sections["ko-paragraph"] = r.section;
        delete errors["ko-paragraph"];
        perSection["ko-paragraph"] = { source: "section-gen", attempts: prev + r.attempts };
      } else {
        errors["ko-paragraph"] = r.error;
        perSection["ko-paragraph"] = { source: "section-gen", attempts: prev + r.attempts, error: r.error };
      }
      await emit();
    }

    const ctxBase = deriveKoSectionContext(Object.values(sections) as KoAnalysisSection[]);
    const rest = targets.filter((k) => k !== "ko-paragraph" && !sections[k]);
    if (rest.length > 0 && Date.now() < deadlineAt) {
      const results = await Promise.all(
        rest.map(async (kind) => {
          if (Date.now() >= deadlineAt) {
            return { kind, r: { ok: false, error: "deadline", attempts: 0 } as KoSectionGenResult };
          }
          const r = await generateOneKoSection(
            kind,
            input,
            { ...ctxBase, priorError: errors[kind] },
            perCallTimeoutMs,
            deadlineAt,
            llmText,
          );
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

  // 완성 보장: 필수 섹션(ko-overview) 결정론 폴백.
  for (const k of KO_REQUIRED_KINDS) {
    if (!sections[k] && k === "ko-overview") {
      sections["ko-overview"] = fallbackKoOverview(input);
      if (!fallback.includes("ko-overview")) fallback.push("ko-overview");
      perSection["ko-overview"] = { source: "fallback", attempts: perSection["ko-overview"]?.attempts ?? 0 };
    }
  }
  if (!meta) meta = synthKoMeta(input, sections);

  let report = assembleKoReport(meta, input, sections, opts);
  // 최종 전체 검증 — 실패 시 개별 통과 섹션만 + 유효 meta 로 재조립.
  if (!koAnalysisReportSchema.safeParse(report).success) {
    const safe: Partial<Record<KoGenSectionKind, KoAnalysisSection>> = {};
    for (const k of targets) {
      if (sections[k] && coerceAndValidateKo(k, sections[k], { passage: input.passageContent }).ok) {
        safe[k] = sections[k];
      }
    }
    if (!safe["ko-overview"]) safe["ko-overview"] = fallbackKoOverview(input);
    const safeMeta = koReportMetaSchema.safeParse(meta).success ? meta : synthKoMeta(input, safe);
    report = assembleKoReport(safeMeta, input, safe, opts);
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

export type GenerateKoAnalysisReportResult =
  | { ok: true; report: KoAnalysisReport; usages: KoResilientResult["usages"]; completeness: KoResilientResult["completeness"] }
  | { ok: false; error: string; usages: KoResilientResult["usages"]; completeness?: KoResilientResult["completeness"] };

/**
 * PRIME_KO 코어 생성 — 회복형 오케스트레이터를 기본 옵션으로 구동하고,
 * 실질 실패(개관 폴백 또는 목표 섹션 절반 미만)면 ok:false 로 강등한다.
 * prime 라우트 POST·trigger 워커(비대화형 1샷 경로)가 사용.
 */
export async function generateKoAnalysisReportCore(
  input: BuildKoAnalysisReportPromptInput,
  opts?: Partial<KoResilientOptions> & { contentHash?: string },
): Promise<GenerateKoAnalysisReportResult> {
  const contentHash = opts?.contentHash ?? `ko:${input.passageContent.length}`;
  const result = await generateKoAnalysisReportResilient(input, {
    ...opts,
    contentHash,
    deadlineAt: opts?.deadlineAt ?? Date.now() + 240_000,
  });
  const targets = opts?.targetKinds ?? koReportTargetKinds(input);
  const degraded =
    result.completeness.fallback.includes("ko-overview") ||
    result.completeness.present.length < Math.ceil(targets.length / 2);
  if (degraded) {
    const missing = result.completeness.missing.join(", ") || "(없음)";
    return {
      ok: false,
      error: `PRIME_KO 생성 미완성 — 누락 섹션: ${missing}`,
      usages: result.usages,
      completeness: result.completeness,
    };
  }
  return { ok: true, report: result.report, usages: result.usages, completeness: result.completeness };
}
