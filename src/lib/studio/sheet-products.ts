// ============================================================================
// 학습지 3상품 정본 (docs/class-studio-spec.md §3.10.19 E19-1)
//
// 클래스 스튜디오의 생성 단위 = 「학습지 상품」 3종. 라벨·부제 문자열은 학습지
// 생성 페이지(passage-registration/passage-input/passage-input-stack.tsx:454-477)
// 정본을 **자구 그대로** 복제한다 — 두 표면이 갈리면 같은 상품이 다른 물건으로
// 보인다. 단가는 임의 숫자 금지: getPassageAnalysisCreditCost 조합으로만 만든다.
//
// 순수 TS(React 무의존) — 서버 액션·클라이언트 양쪽에서 import 가능.
// ============================================================================

import { getPassageAnalysisCreditCost } from "@/lib/passage-analysis-credit-costs";

export type StudioSheetVariant = "basic" | "practice" | "final";

export interface StudioSheetProduct {
  id: StudioSheetVariant;
  label: string;
  /** 카드 부제 — 무엇이 들어 있는지(자구 정본) */
  subtitle: string;
  /** 지문당 단가(크레딧) — 상수 조합 산출값 */
  unitCost: number;
  /** 국어(PRIME_KO) 지문에 쓸 수 있는가 — fast 라우트가 400 으로 막는 축 */
  koreanSupported: boolean;
}

/** 표시 순서 정본 — basic → practice → final(가격 오름차순이 아니라 학습 흐름 순) */
export const STUDIO_SHEET_PRODUCTS: readonly StudioSheetProduct[] = [
  {
    id: "basic",
    label: "기본 학습지",
    subtitle:
      "원문 필기 캔버스 · 요약 · 어법 · 출제 포인트 · 어휘 · 구문 분석",
    unitCost: getPassageAnalysisCreditCost({ includeWorksheet: false }),
    // 국어 지문은 PRIME_KO 경로로 흘러 기본 학습지가 정상 생성된다.
    koreanSupported: true,
  },
  {
    id: "practice",
    label: "실전 학습지 포함",
    subtitle:
      "기본 구성 + 어법 선택 워크북 · 어휘 빈칸 · 배열 영작 + 수능형 추론 5문항",
    unitCost: getPassageAnalysisCreditCost({ includeWorksheet: true }),
    // KO 게이트는 자기완결 블록이라 실전 학습지(영어 전용 파이프라인)로 흐르지
    // 않는다 — 국어 지문을 practice 로 발사하면 값만 내고 기본만 나온다.
    koreanSupported: false,
  },
  {
    id: "final",
    label: "파이널 원페이지",
    subtitle:
      "시험 직전 족집게 · 손필기 원문 분석 · 유형별 출제 포인트·함정 · A4 딱 1장",
    unitCost: getPassageAnalysisCreditCost({ includeWorksheet: false }),
    // fast/route.ts:324-329 — 국어 지문 + finalOnepage = 400.
    koreanSupported: false,
  },
] as const;

export const STUDIO_SHEET_PRODUCT_BY_ID: ReadonlyMap<
  StudioSheetVariant,
  StudioSheetProduct
> = new Map(STUDIO_SHEET_PRODUCTS.map((p) => [p.id, p]));

export function isStudioSheetVariant(v: unknown): v is StudioSheetVariant {
  return v === "basic" || v === "practice" || v === "final";
}

export function sheetProductLabel(v: StudioSheetVariant): string {
  return STUDIO_SHEET_PRODUCT_BY_ID.get(v)?.label ?? "학습지";
}

/**
 * 발사 요청에 실을 promptConfig 파편(§3.10.19 E19-4).
 * ⚠ `targetSections` 는 **절대** 넣지 않는다 — fast 라우트가 finalOnepage/
 * includeWorksheet 와의 조합을 400 으로 막는다(route.ts:284-303).
 * 부재 키는 스프레드가 비어 기존 정액 경로와 요청 바이트가 같다(§11 무회귀).
 */
export function sheetPromptFlags(v: StudioSheetVariant): {
  includeWorksheet?: boolean;
  finalOnepage?: boolean;
} {
  if (v === "practice") return { includeWorksheet: true };
  if (v === "final") return { finalOnepage: true };
  return {};
}

/** planMarker → 종류 배지 라벨(§3.10.16-d 환산 정본). 미지 마커는 원문 폴백. */
export const SHEET_PLAN_LABEL: ReadonlyMap<string, string> = new Map([
  ["PRIME", "기본 학습지"],
  ["PRIME_KO", "국어 워크북"],
  ["PRIME_FINAL", "파이널 원페이지"],
]);

/**
 * PassageReport.status → 상태 배지(§3.10.19 E19-5 정본).
 * 도시에 「학습지」 행(passage-dossier-pane.tsx)과 「학습지 조판」 뷰 병합 목록
 * (composer-list-pane.tsx)이 **같은 상수**를 읽는다 —
 * 값 복제본이 두 표면에 살면 같은 문서가 서로 다른 배지를 달게 된다
 * (적대 검수 minor 실적: 초판이 복제본을 신설했다). DB 컬럼은 String 이라
 * 미지값은 표시부가 원문으로 폴백한다.
 */
export const SHEET_STATUS_BADGE: ReadonlyMap<
  string,
  { label: string; cls: string }
> = new Map([
  ["DRAFT", { label: "초안", cls: "border-slate-200 bg-slate-50 text-slate-500" }],
  [
    "PUBLISHED",
    { label: "발행됨", cls: "border-emerald-200 bg-emerald-50 text-emerald-600" },
  ],
  [
    "ARCHIVED",
    { label: "보관됨", cls: "border-slate-200 bg-slate-100 text-slate-400" },
  ],
]);
