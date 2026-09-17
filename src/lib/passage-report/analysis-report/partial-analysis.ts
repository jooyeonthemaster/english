// ============================================================================
// 섹션 종량제 부분 분석 — 플랜 산출·시드 변환·보존 병합 (스펙 §3.4.1)
//
// fast 라우트(U1)와 스튜디오 서버 액션(U4)이 공유하는 순수 계층이다.
// 목록·가격의 정본은 src/lib/studio/module-sections.ts — 여기서 재정의하지 않는다.
//
// 순수 함수만 둘 것 — prisma·next 의존 금지(단위 테스트가 직접 import 한다).
// ============================================================================

import type { AnalysisReport, AnalysisSection } from "./schema";
import type { SectionKind } from "./section-prompts";
import type { ResilientCheckpoint } from "./resilient-generate";
import {
  FULL_ANALYSIS_SECTIONS,
  isSectionKind,
  missingSections,
  partialAnalysisCreditCost,
} from "@/lib/studio/module-sections";

export interface PartialAnalysisPlan {
  targets: SectionKind[];   // 요청 ∪ {"passage"} 를 FULL 순서로 정규화
  present: SectionKind[];   // 신선한 기존 리포트가 보유한 분석 섹션(FULL 순서)
  missing: SectionKind[];   // targets ∖ present (FULL 순서)
  creditCost: number;       // partialAnalysisCreditCost(missing.length)
}

/** 리포트가 실제 보유한 분석 섹션 kind 집합 — self-check 등 비분석 섹션은 제외. */
function heldAnalysisKinds(report: AnalysisReport | null): Set<SectionKind> {
  const held = new Set<SectionKind>();
  if (!report) return held;
  for (const s of report.sections) {
    if (isSectionKind(s.kind)) held.add(s.kind);
  }
  return held;
}

export function computePartialAnalysisPlan(input: {
  targetSections: readonly SectionKind[];
  freshReport: AnalysisReport | null; // 콘텐츠 해시 일치 리포트만. 스테일/부재/파싱실패 = null
}): PartialAnalysisPlan {
  // passage 는 생성기 REQUIRED — 어차피 채워지므로 가격에도 정직하게 포함한다.
  const want = new Set<SectionKind>(input.targetSections);
  want.add("passage");
  const targets = FULL_ANALYSIS_SECTIONS.filter((k) => want.has(k));
  const held = heldAnalysisKinds(input.freshReport);
  const present = FULL_ANALYSIS_SECTIONS.filter((k) => held.has(k));
  const missing = missingSections(targets, held);
  return {
    targets,
    present,
    missing,
    // 지문 누적 상한 — 보유분만큼 상한이 깎여 순차 총액 = 일괄 총액(스펙 §3.4 가격 정본).
    creditCost: partialAnalysisCreditCost(missing.length, present.length),
  };
}

/**
 * 부분 분석 저장 병합 — 원천은 **신선(콘텐츠 해시 일치) 리포트만**(스펙 §3.4.1-6).
 * 스테일 본은 어떤 섹션도 얹지 않는다 — 구본문 기준 문항이 새 본문 리포트에 병합돼
 * 학생에게 서빙되는 것을 금지(스펙 스테일 규칙, 검수 M6·L2-2).
 *
 * **부분 병합 전용** — 유일한 프로덕션 호출부는 fast 라우트의 `plan ? merge : report`
 * 분기(targetSections 지정 시에만 plan 이 생긴다). 전체 분석(비부분)은 이 함수를 타지
 * 않고 pages 를 통째 교체한다(E19-7 의미론) — 여기서 그 경로를 건드리지 않는다.
 *
 * 신선본 기준 4중 보존:
 *  (a) 비분석 섹션(self-check 등 isSectionKind 아님) — 기존 상대 순서 유지, 뒤에 append.
 *  (b) 생성기 산출에 없는 신선 보유 분석 섹션 되살림 — 시드 재검증 탈락·재생성 실패로
 *      돈 낸 섹션이 무통보 소실되는 창 봉쇄(검수 L5-4·L1-F7). FULL 순서로 재정렬.
 *  (c) 유료 실전 학습지(learning-worksheet) 통째 보존 — 26-08-21 '지문 논리 구조 분석'
 *      폐지로 이 섹션은 분석 섹션 목록(FULL_ANALYSIS_SECTIONS)에서 빠졌고, 그 결과 (a)의
 *      비분석 extras 로 원본 그대로 실려 온다(검수 M1 critical: 부분 분석 1회가 +5크레딧
 *      실전 학습지를 파괴하면 안 된다 — 보장 방식만 오버레이→통째 보존으로 바뀐 것).
 *  (d) 편집기 자산 캐리오버 — customBlocks·blockMeta·blockOrder·hiddenSections·
 *      vocabTestOnly 는 생성기가 만들지 않는 교사 편집 필드. `{ ...generated }` 조립이
 *      이들을 소거해 교사가 넣은 활동·웹툰 블록이 부분 분석 1회에 전멸하던 결함 봉쇄
 *      (E23 FX-MERGE). blockOrder 의 stale id 는 렌더 시 applyBlockOrder 가 자연 id
 *      대조로 걸러낸다(editor-mutations.ts) — 죽은 id 를 실어도 안전.
 */
export function mergeReportPreservingExtras(
  generated: AnalysisReport,
  previousFresh: AnalysisReport | null,
): AnalysisReport {
  if (!previousFresh) return generated;

  const prevByKind = new Map<string, AnalysisSection>();
  for (const s of previousFresh.sections) {
    if (isSectionKind(s.kind) && !prevByKind.has(s.kind)) prevByKind.set(s.kind, s);
  }

  // (b) + (c) — 분석 섹션을 FULL 순서로 재조립: 생성기 산출 우선, 없으면 신선 보유분 복원.
  // (learning-worksheet 실전 필드 오버레이는 26-08-21 섹션 폐지로 불필요 — 그 섹션은
  //  이제 부분 분석 대상이 아니라 유료 '실전 학습지' 생성물로만 존재하며 아래 (d)가 보존한다.)
  const analysisSections: AnalysisSection[] = [];
  for (const kind of FULL_ANALYSIS_SECTIONS) {
    const gen = generated.sections.find((s) => s.kind === kind);
    const prev = prevByKind.get(kind);
    if (gen) {
      analysisSections.push(gen);
    } else if (prev) {
      analysisSections.push(prev);
    }
  }

  // (a) 비분석 섹션 보존 — 실전 학습지가 만든 self-check 등. 유실되면 사용자가
  // 5크레딧을 다시 내야 한다.
  const extras = previousFresh.sections.filter((s) => !isSectionKind(s.kind));

  // (d) 편집기 자산 캐리오버 — previousFresh 값 우선, 부재 시 generated 값(spread 로
  // 이미 승계). undefined 키를 새로 심지 않도록 보유분만 조건부로 얹는다.
  const editorCarryover = {
    ...(previousFresh.customBlocks !== undefined ? { customBlocks: previousFresh.customBlocks } : {}),
    ...(previousFresh.blockMeta !== undefined ? { blockMeta: previousFresh.blockMeta } : {}),
    ...(previousFresh.blockOrder !== undefined ? { blockOrder: previousFresh.blockOrder } : {}),
    ...(previousFresh.hiddenSections !== undefined
      ? { hiddenSections: previousFresh.hiddenSections }
      : {}),
    ...(previousFresh.vocabTestOnly !== undefined
      ? { vocabTestOnly: previousFresh.vocabTestOnly }
      : {}),
  };
  return { ...generated, ...editorCarryover, sections: [...analysisSections, ...extras] };
}

/** 기존 리포트 섹션(+선행 실패 잡 체크포인트)을 생성기 시드로 변환 — report 가 우선 */
export function buildSeedCheckpoint(input: {
  freshReport: AnalysisReport | null;
  prior: ResilientCheckpoint | null;
  contentHash: string;
}): ResilientCheckpoint | null {
  // 체크포인트는 contentHash 일치 시에만 신뢰 — 본문이 바뀐 부분 결과를 잇지 않는다.
  const prior =
    input.prior && input.prior.contentHash === input.contentHash ? input.prior : null;
  if (!input.freshReport && !prior) return null;

  // 저장된 리포트가 체크포인트보다 최신 확정본이다 — 같은 kind 는 리포트가 이긴다.
  const fromReport: Partial<Record<SectionKind, AnalysisSection>> = {};
  if (input.freshReport) {
    for (const s of input.freshReport.sections) {
      if (isSectionKind(s.kind) && !fromReport[s.kind]) fromReport[s.kind] = s;
    }
  }
  const sections: Partial<Record<SectionKind, AnalysisSection>> = {
    ...(prior?.sections ?? {}),
    ...fromReport,
  };

  // 보유 섹션의 직전 실패 사유는 스테일 — 남기면 재생성 교정 지시로 오주입된다.
  const errors: Partial<Record<SectionKind, string>> = {};
  for (const [k, v] of Object.entries(prior?.errors ?? {})) {
    if (v && !(k in sections)) errors[k as SectionKind] = v;
  }

  return {
    contentHash: input.contentHash,
    meta: input.freshReport?.meta ?? prior?.meta ?? null,
    sections,
    errors,
    updatedAt: Date.now(),
  };
}
