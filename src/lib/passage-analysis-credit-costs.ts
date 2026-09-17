import { CREDIT_COSTS } from "@/lib/credit-costs";

export const PASSAGE_ANALYSIS_BASE_CREDIT_COST =
  CREDIT_COSTS.PASSAGE_ANALYSIS;
export const PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST =
  CREDIT_COSTS.PASSAGE_ANALYSIS;

export function getPassageAnalysisCreditCost(options?: {
  includeWorksheet?: boolean;
}): number {
  return (
    PASSAGE_ANALYSIS_BASE_CREDIT_COST +
    (options?.includeWorksheet
      ? PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST
      : 0)
  );
}

export function getPassageAnalysisWorksheetCreditCost(
  includeWorksheet: boolean,
): number {
  return includeWorksheet ? PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST : 0;
}

/**
 * [E30 §3-1] 실전 학습지 1지문 단가.
 *
 * hasBasic=true  → 기존 PRIME 행 위에 **자식 문서만** 만든다(worksheet 라우트) = EXTRA 만.
 * hasBasic=false → 기본 + 실전을 **함께** 만든다(fast 라우트) = BASE + EXTRA.
 *
 * ⚠ 임의 숫자 금지 — 기존 두 상수 조합으로만 만든다(sheet-products.ts 머리주석 계약).
 * ⚠ **위 두 함수의 반환값은 절대 바꾸지 않는다.** 여기 있는 것은 신규 함수 **추가 1건**뿐이다.
 *   기본(basic)·파이널(final)·국어(KO)·부분분석·트리거 워커
 *   (trigger/workbench-passage-analysis.ts 가 두 함수를 직접 읽는다)가 전부 거기 매달려
 *   있어서, 산식을 갈아끼우면 실전과 무관한 4상품의 청구가 한꺼번에 흔들린다.
 *
 * 표기(모달)와 청구(라우트)가 같은 함수를 읽어야 어긋나지 않는다(E19-2 계약) —
 * 견적은 `getStudioSheetStates` 의 `practiceUnitCost`, 청구는 (c) 라우트가 이 함수를 쓴다.
 */
export function getPracticeSheetCreditCost(options: {
  hasBasic: boolean;
}): number {
  return options.hasBasic
    ? PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST
    : getPassageAnalysisCreditCost({ includeWorksheet: true });
}
