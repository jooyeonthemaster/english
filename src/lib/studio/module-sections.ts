// ============================================================================
// 클래스 스튜디오 — 모듈 단위 분석(섹션 종량제) 계약 정본
//
// 사용자 지시(2026-08-10): "한 번에 다 분석하는 게 아니라 나눠서 분석하게 하라.
// 어휘만 분석할 수 있고, 직독직해만 추출할 수 있어야 한다."
//
// 이 파일이 단일 소스다 — 모듈↔분석 섹션 매핑·가격 계산을 라우트(fast)·서버
// 액션(getStudioPassageDetail)·클라이언트 카드가 전부 여기서 import 한다.
// 규범: docs/class-studio-spec.md §3.4 · §3.4.1.
//
// 클라이언트 번들에 실린다 — 순수 상수·순수 함수만 둘 것(서버 의존 금지).
// ============================================================================

import type { SectionKind } from "@/lib/passage-report/analysis-report/section-prompts";
import type { StudioModuleId } from "./modules";

/** 섹션 1개 생성 단가(크레딧). 조정은 사용자 결정(스펙 §14-1). */
export const SECTION_CREDIT_COST = 1;
/** 부분 분석 1회 과금 상한 — 빈 지문 전체(6섹션)가 기존 일괄가 5크레딧과 같아지는 캡. */
export const PARTIAL_ANALYSIS_CREDIT_CAP = 5;

/**
 * 분석 리포트의 전체 섹션 집합(순서 = resilient-generate ALL_KINDS 와 동일).
 * 값 수준 정본은 서버 전용 모듈(resilient-generate)에 있어 여기 복제한다 —
 * 단위 테스트가 두 목록의 일치를 강제한다(불일치 = 게이트 RED).
 */
export const FULL_ANALYSIS_SECTIONS: readonly SectionKind[] = [
  "passage",
  "summary",
  "grammar",
  "exam-focus",
  "vocabulary",
  "parsing",
] as const;

const SECTION_KIND_SET: ReadonlySet<string> = new Set(FULL_ANALYSIS_SECTIONS);

export function isSectionKind(v: unknown): v is SectionKind {
  return typeof v === "string" && SECTION_KIND_SET.has(v);
}

/** 실전 문제 모듈은 분석 섹션이 아니라 실전 학습지 생성물이 원천(스펙 §3.4 특례). */
export type SectionBackedModuleId = Exclude<StudioModuleId, "exam">;

/**
 * 모듈 → 필요 섹션(빌더가 아이템 생산에 실제 소비하는 섹션만 — 스펙 §3.4 표 정본).
 * passage 는 모든 모듈의 공통 토대(문장·해석·의미 청크)이자 생성기의 REQUIRED 섹션.
 */
export const MODULE_REQUIRED_SECTIONS: Record<SectionBackedModuleId, readonly SectionKind[]> = {
  vocab: ["passage", "vocabulary"],
  reading: ["passage", "summary"],
  grammar: ["passage", "grammar"],
  cloze: ["passage"],
  order: ["passage"],
  production: ["passage"],
};

export function isSectionBackedModuleId(v: unknown): v is SectionBackedModuleId {
  return typeof v === "string" && v !== "exam" && v in MODULE_REQUIRED_SECTIONS;
}

/** target 중 아직 없는 섹션 — 순서는 FULL_ANALYSIS_SECTIONS 기준(결정론). */
export function missingSections(
  target: readonly SectionKind[],
  present: ReadonlySet<string>,
): SectionKind[] {
  const want = new Set(target);
  return FULL_ANALYSIS_SECTIONS.filter((k) => want.has(k) && !present.has(k));
}

/**
 * 부분 분석 1회 가격 = min(부족 × 단가, 상한 − min(보유, 상한)). 부족 0 = 0크레딧.
 *
 * 상한을 요청 단위가 아니라 **지문(콘텐츠 해시) 누적 보유 기준**으로 걸어야
 * "순차 구매 총액 = 일괄 구매 총액(항상 ≤ 상한)" 불변식이 성립한다(스펙 §3.4 가격 정본,
 * 검수 L1-F4 — 구식 min(missing, 5) 는 부분 2 + 남은 전체 5 = 7크레딧으로 불변식을 깼다).
 * 스테일(본문 수정)은 호출측이 보유 0 으로 넘긴다 — 새 본문 = 새 작업, 전액 정당.
 */
export function partialAnalysisCreditCost(missingCount: number, presentCount: number): number {
  if (missingCount <= 0) return 0;
  const remainingCap =
    PARTIAL_ANALYSIS_CREDIT_CAP - Math.min(Math.max(presentCount, 0), PARTIAL_ANALYSIS_CREDIT_CAP);
  return Math.max(0, Math.min(missingCount * SECTION_CREDIT_COST, remainingCap));
}

export interface ModuleSectionState {
  moduleId: SectionBackedModuleId;
  /** 필요 섹션 전부 보유 — 카드 즉시 "사용 가능" */
  ready: boolean;
  /** 부족 섹션(생성 요청의 targetSections 재료) */
  missing: SectionKind[];
  /** 이 모듈만 분석할 때의 가격(크레딧) — ready 면 0 */
  creditCost: number;
}

/** 보유 섹션 집합 → 섹션 기반 6모듈의 상태·가격 일괄 계산. */
export function moduleSectionStates(present: ReadonlySet<string>): ModuleSectionState[] {
  const presentCount = FULL_ANALYSIS_SECTIONS.filter((k) => present.has(k)).length;
  return (Object.keys(MODULE_REQUIRED_SECTIONS) as SectionBackedModuleId[]).map((moduleId) => {
    const missing = missingSections(MODULE_REQUIRED_SECTIONS[moduleId], present);
    return {
      moduleId,
      ready: missing.length === 0,
      missing,
      creditCost: partialAnalysisCreditCost(missing.length, presentCount),
    };
  });
}
