import {
  buildKoAnalysisReportPrompt,
  isKoLiteraryKind,
  KO_OUTPUT_RULES,
  KO_SECTION_SPECS,
  KO_STYLE_CHARTER,
  type BuildKoAnalysisReportPromptInput,
} from "./ko-prompt";
import type { KoAnalysisSection, KoAnalysisSectionKind } from "./ko-schema";

/**
 * PRIME_KO 섹션 단위(per-section) 프롬프트 — 회복형 생성기(ko-resilient-generate)가
 * "실패한 섹션 하나만 정확히 다시 만들 때" 쓰는 좁은 프롬프트.
 * 영어 section-prompts.ts 의 골격(공통 헌장 + 컨텍스트 + 섹션 스펙 + 단일 JSON 출력)을
 * 미러하되 내용은 전면 국어 신작. 스펙 본문은 홀리스틱 프롬프트(ko-prompt.ts)와
 * 글자 그대로 공유해 품질 저하를 막는다.
 */

/** AI 가 생성하는 KO 섹션 종류 (ko-passage 는 서버 결정론 주입이라 제외). */
export type KoGenSectionKind = Exclude<KoAnalysisSectionKind, "ko-passage">;

export const KO_ALL_GEN_KINDS: KoGenSectionKind[] = [
  "ko-overview",
  "ko-paragraph",
  "ko-concept-vocab",
  "ko-structure",
  "ko-literary-device",
  "ko-speaker",
  "ko-exam-points",
  "ko-check-quiz",
];

/** 문학 전용 섹션 — 갈래가 문학일 때만 목표 집합에 포함. */
export const KO_LITERARY_ONLY_KINDS: KoGenSectionKind[] = ["ko-literary-device", "ko-speaker"];

/** 갈래에 따른 생성 목표 섹션 집합. */
export function koReportTargetKinds(input: Pick<BuildKoAnalysisReportPromptInput, "koKind">): KoGenSectionKind[] {
  if (isKoLiteraryKind(input.koKind)) return [...KO_ALL_GEN_KINDS];
  return KO_ALL_GEN_KINDS.filter((k) => !KO_LITERARY_ONLY_KINDS.includes(k));
}

export interface KoSectionPromptContext {
  /** 이미 확정된 문단/연별 요지 — 구조도·출제 포인트의 번호 기준점. */
  paragraphRows?: Array<{ no: number; heading?: string; gist: string }>;
  /** 이미 확정된 개관 — 갈래·주제 참조. */
  overview?: { genre: string; theme: string };
  /** 직전 시도 실패 사유 — 재생성 시 교정 지시로 주입. */
  priorError?: string;
}

function levelHint(schoolType?: "MIDDLE" | "HIGH" | null, grade?: number | null): string {
  const lv = schoolType === "MIDDLE" ? "중학교" : schoolType === "HIGH" ? "고등학교" : "고등학교";
  const g = grade ? `${grade}학년` : "";
  return `${lv} ${g}`.trim();
}

function paragraphContextBlock(ctx: KoSectionPromptContext): string {
  if (!ctx.paragraphRows?.length) return "";
  const lines = ctx.paragraphRows
    .map((r) => `${r.no}. ${r.heading ? `[${r.heading}] ` : ""}${r.gist}`)
    .join("\n");
  return `\n# 이미 확정된 문단/연별 요지 (no 는 반드시 이 번호와 일치시켜라)\n${lines}\n`;
}

function overviewContextBlock(ctx: KoSectionPromptContext): string {
  if (!ctx.overview) return "";
  return `\n# 확정된 개관 (참고)\n- 갈래: ${ctx.overview.genre}\n- 주제: ${ctx.overview.theme}\n`;
}

function repairBlock(ctx: KoSectionPromptContext): string {
  if (!ctx.priorError?.trim()) return "";
  return `\n# ❗ 재생성 교정 지시
직전 출력이 아래 품질·형식 기준을 통과하지 못했다. 이 문제를 반드시 고쳐서 다시 생성하라:
${ctx.priorError.trim()}
\n`;
}

/** 컨텍스트가 필요한 섹션 매핑 — 문단 요지가 번호 기준점. */
const NEEDS_PARAGRAPH_CTX: Record<KoGenSectionKind, boolean> = {
  "ko-overview": false,
  "ko-paragraph": false,
  "ko-concept-vocab": false,
  "ko-structure": true,
  "ko-literary-device": false,
  "ko-speaker": false,
  "ko-exam-points": true,
  "ko-check-quiz": false,
};

/** KO 섹션 하나만 생성하는 좁은 프롬프트. */
export function buildKoSectionPrompt(
  kind: KoGenSectionKind,
  input: BuildKoAnalysisReportPromptInput,
  ctx: KoSectionPromptContext = {},
): string {
  const level = levelHint(input.schoolType, input.grade);
  const extra = input.customPrompt?.trim() ? `\n[강사 추가 지시]\n${input.customPrompt.trim()}\n` : "";
  const ctxBlock = NEEDS_PARAGRAPH_CTX[kind] ? paragraphContextBlock(ctx) : "";
  const ovBlock = kind === "ko-exam-points" || kind === "ko-check-quiz" ? overviewContextBlock(ctx) : "";

  return `당신은 한국 최상위 국어 학원의 수석 교재 편집장이다.
주어진 국어 지문으로 A4 지문분석 학습지의 **"${kind}" 섹션 하나**만 정밀하게 작성한다.
대상 학습자 수준: ${level}.

${KO_STYLE_CHARTER}

${KO_OUTPUT_RULES}
- ❗ 최상위 kind 값은 정확히 "${kind}" 이어야 한다. 다른 섹션을 만들지 마라.
${repairBlock(ctx)}${ctxBlock}${ovBlock}
# 작성할 섹션 명세
${KO_SECTION_SPECS[kind]}
${extra}
# 분석할 지문
"""
${input.passageContent}
"""

위 명세대로 "${kind}" 섹션 JSON 객체 하나만 출력하라.`;
}

/** 확보된 부분 섹션들 → 다음 섹션 생성 컨텍스트. */
export function deriveKoSectionContext(sections: KoAnalysisSection[]): KoSectionPromptContext {
  const paragraph = sections.find((s) => s.kind === "ko-paragraph");
  const overview = sections.find((s) => s.kind === "ko-overview");
  return {
    paragraphRows:
      paragraph?.kind === "ko-paragraph"
        ? paragraph.rows.map((r) => ({ no: r.no, heading: r.heading, gist: r.gist }))
        : undefined,
    overview:
      overview?.kind === "ko-overview" ? { genre: overview.genre, theme: overview.theme } : undefined,
  };
}

// 홀리스틱 초안 빌더 재노출 — 오케스트레이터가 이 모듈만 import 해도 되게.
export { buildKoAnalysisReportPrompt };
export type { BuildKoAnalysisReportPromptInput };
