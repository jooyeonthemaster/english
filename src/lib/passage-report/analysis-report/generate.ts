import { generateQuestionText } from "@/lib/question-generation-llm";

import { buildAnalysisReportPrompt, type BuildAnalysisReportPromptInput } from "./prompt";
import {
  analysisReportGenerationSchema,
  type AnalysisReport,
  type ReportThemeId,
} from "./schema";

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

export async function generateAnalysisReport(
  input: GenerateAnalysisReportInput,
): Promise<GenerateAnalysisReportResult> {
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
  const usage: AnalysisReportUsage = {
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

  const report: AnalysisReport = {
    schemaVersion: 1,
    brand: input.brand ?? "ENGLISH READING LAB",
    docNo: input.docNo,
    themeId: input.themeId ?? "veritas-navy",
    meta: validation.data.meta,
    sections: validation.data.sections,
  };
  return { ok: true, report, raw, usage };
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
